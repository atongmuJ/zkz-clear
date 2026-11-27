use serde::Deserialize;
use std::collections::{HashMap, HashSet};
#[cfg(windows)]
use std::process::Command;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use crate::models::{
    CleanupTarget, CleanupTargetResult, InstalledSoftware, SoftwareCleanupPlan,
    SoftwareUninstallOutcome,
};
use crate::platform::{
    dir_size_with_budget, expand_env, powershell, powershell_with_env, powershell_with_env_timeout,
    powershell_with_timeout, remove_path,
};

/// 只接受 Windows 标准的四个卸载登记位置，防止前端传入任意注册表键。
const UNINSTALL_PREFIXES: &[&str] = &[
    r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\",
    r"HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\",
    r"HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\",
    r"HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\",
];

/// 强力卸载必须由前端显式传入这个确认短语；只点一个按钮不够。
pub const FORCE_CONFIRM_PHRASE: &str = "我确认永久卸载并清理所选内容";

const SCAN_SIZE_BUDGET: Duration = Duration::from_millis(1200);
const SCAN_SIZE_MAX_FILES: u64 = 50_000;
const SCAN_FALLBACK_LIMIT: usize = 25;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RegEntry {
    #[serde(default)]
    key: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    publisher: String,
    #[serde(default)]
    install_location: String,
    #[serde(default)]
    estimated_size: u64,
    #[serde(default)]
    uninstall_string: String,
    #[serde(default)]
    quiet_uninstall_string: String,
    #[serde(default)]
    source: String,
}

#[derive(Debug)]
struct UninstallRun {
    status: String,
    exit_code: i64,
    message: String,
}

const SOFTWARE_LIST_SCRIPT: &str = r#"
$roots = @(
  @{ path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; source = '系统' },
  @{ path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; source = '系统(32位)' },
  @{ path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; source = '当前用户' },
  @{ path = 'HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; source = '当前用户(32位)' }
)
$rows = @()
foreach ($root in $roots) {
  if (-not (Test-Path -LiteralPath $root.path)) { continue }
  foreach ($key in (Get-ChildItem -LiteralPath $root.path -ErrorAction SilentlyContinue)) {
    $name = [string]$key.GetValue('DisplayName', '')
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    if ([int]$key.GetValue('SystemComponent', 0) -eq 1) { continue }
    if (-not [string]::IsNullOrWhiteSpace([string]$key.GetValue('ParentKeyName', ''))) { continue }
    $release = [string]$key.GetValue('ReleaseType', '')
    if (@('Security Update', 'Update', 'Hotfix') -contains $release) { continue }
    if ($name -match '^KB\d+') { continue }
    $rows += [pscustomobject]@{
      key                  = ($root.path + '\' + $key.PSChildName)
      name                 = $name
      version              = [string]$key.GetValue('DisplayVersion', '')
      publisher            = [string]$key.GetValue('Publisher', '')
      install_location     = [string]$key.GetValue('InstallLocation', '')
      estimated_size       = [long]$key.GetValue('EstimatedSize', 0)
      uninstall_string     = [string]$key.GetValue('UninstallString', '')
      quiet_uninstall_string = [string]$key.GetValue('QuietUninstallString', '')
      system_component     = [int]$key.GetValue('SystemComponent', 0)
      parent_key_name      = [string]$key.GetValue('ParentKeyName', '')
      release_type         = $release
      source               = $root.source
    }
  }
}
ConvertTo-Json -InputObject @($rows) -Compress -Depth 4
"#;

const SOFTWARE_DETAIL_SCRIPT: &str = r#"
try {
  $key = Get-Item -LiteralPath $env:ZKQ_KEY -ErrorAction Stop
  [pscustomobject]@{
    key                    = $env:ZKQ_KEY
    name                   = [string]$key.GetValue('DisplayName', '')
    version                = [string]$key.GetValue('DisplayVersion', '')
    publisher              = [string]$key.GetValue('Publisher', '')
    install_location       = [string]$key.GetValue('InstallLocation', '')
    estimated_size         = [long]$key.GetValue('EstimatedSize', 0)
    uninstall_string       = [string]$key.GetValue('UninstallString', '')
    quiet_uninstall_string = [string]$key.GetValue('QuietUninstallString', '')
    system_component       = [int]$key.GetValue('SystemComponent', 0)
    parent_key_name        = [string]$key.GetValue('ParentKeyName', '')
    release_type           = [string]$key.GetValue('ReleaseType', '')
    source                 = '注册表'
  } | ConvertTo-Json -Compress -Depth 4
} catch {
  Write-Output ('ERROR=' + $_.Exception.Message)
}
"#;

/// 一次性批量提取软件图标：一个 PowerShell 进程完成所有图标，避免每张卡片都启动一次进程。
/// 图标统一缩放到 48x48 PNG，并以 data URL 返回；失败时直接跳过，前端回退到通用图标。
const SOFTWARE_ICONS_SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$source = @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class ZkzIconExtractor
{
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr handle);

    public static string ToPngBase64(string file, int index, int size)
    {
        IntPtr[] icons = new IntPtr[1];
        try
        {
            uint found = ExtractIconEx(file, index, icons, null, 1);
            if (found == 0 || found == uint.MaxValue || icons[0] == IntPtr.Zero) return "";
            using (Icon icon = Icon.FromHandle(icons[0]))
            using (Bitmap bitmap = icon.ToBitmap())
            using (Bitmap scaled = new Bitmap(size, size, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(scaled))
                {
                    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    graphics.DrawImage(bitmap, 0, 0, size, size);
                }
                using (MemoryStream stream = new MemoryStream())
                {
                    scaled.Save(stream, ImageFormat.Png);
                    return Convert.ToBase64String(stream.ToArray());
                }
            }
        }
        catch { return ""; }
        finally
        {
            if (icons[0] != IntPtr.Zero) DestroyIcon(icons[0]);
        }
    }
}
'@
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing -ErrorAction SilentlyContinue

$roots = @(
  @{ path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; source = '系统' },
  @{ path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; source = '系统(32位)' },
  @{ path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; source = '当前用户' },
  @{ path = 'HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; source = '当前用户(32位)' }
)
$icons = @{}
$processed = 0
$iconLimit = 200
$processLimit = 300
foreach ($root in $roots) {
  if ($processed -ge $processLimit -or $icons.Count -ge $iconLimit) { break }
  if (-not (Test-Path -LiteralPath $root.path)) { continue }
  foreach ($key in (Get-ChildItem -LiteralPath $root.path -ErrorAction SilentlyContinue)) {
    if ($processed -ge $processLimit -or $icons.Count -ge $iconLimit) { break }
    $processed++
    $name = [string]$key.GetValue('DisplayName', '')
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    if ([int]$key.GetValue('SystemComponent', 0) -eq 1) { continue }
    if (-not [string]::IsNullOrWhiteSpace([string]$key.GetValue('ParentKeyName', ''))) { continue }
    $release = [string]$key.GetValue('ReleaseType', '')
    if (@('Security Update', 'Update', 'Hotfix') -contains $release) { continue }
    if ($name -match '^KB\d+') { continue }

    $keyName = $root.path + '\' + $key.PSChildName
    $candidate = ''
    $index = 0
    $displayIcon = [string]$key.GetValue('DisplayIcon', '')
    if (-not [string]::IsNullOrWhiteSpace($displayIcon)) {
      $spec = $displayIcon.Trim()
      if ($spec -match '^(.*?),\s*(-?\d+)\s*$') {
        $candidate = $matches[1].Trim().Trim([char]34)
        $index = [int]$matches[2]
      } else {
        $candidate = $spec.Trim([char]34)
      }
      $candidate = [Environment]::ExpandEnvironmentVariables($candidate)
    }

    if ([string]::IsNullOrWhiteSpace($candidate) -or -not [IO.File]::Exists($candidate)) {
      $uninstall = [string]$key.GetValue('UninstallString', '')
      if ($uninstall -match '^"([^"]+)"') {
        $candidate = $matches[1]
      } elseif (-not [string]::IsNullOrWhiteSpace($uninstall)) {
        $candidate = ($uninstall -split '\s+')[0]
      }
      if (-not [string]::IsNullOrWhiteSpace($candidate)) {
        $candidate = [Environment]::ExpandEnvironmentVariables($candidate)
        $exeName = [IO.Path]::GetFileName($candidate).ToLowerInvariant()
        if (@('msiexec', 'msiexec.exe', 'rundll32', 'rundll32.exe', 'cmd', 'cmd.exe') -contains $exeName) {
          $candidate = ''
        }
        $index = 0
      }
    }

    if ([string]::IsNullOrWhiteSpace($candidate) -or -not [IO.File]::Exists($candidate)) {
      $installRaw = [string]$key.GetValue('InstallLocation', '')
      if (-not [string]::IsNullOrWhiteSpace($installRaw)) {
        $installDir = [Environment]::ExpandEnvironmentVariables($installRaw)
        if (Test-Path -LiteralPath $installDir) {
          $firstExe = Get-ChildItem -LiteralPath $installDir -Filter '*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($firstExe) {
            $candidate = $firstExe.FullName
            $index = 0
          }
        }
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($candidate) -and [IO.File]::Exists($candidate)) {
      $base64 = [ZkzIconExtractor]::ToPngBase64($candidate, $index, 48)
      if (-not [string]::IsNullOrWhiteSpace($base64)) {
        $icons[$keyName] = 'data:image/png;base64,' + $base64
      }
    }
  }
}
if ($icons.Count -eq 0) { '{}' } else { $icons | ConvertTo-Json -Compress -Depth 3 }
"#;

const DELETE_REGISTRY_SCRIPT: &str = r#"
try {
  if (Test-Path -LiteralPath $env:ZKQ_KEY) {
    Remove-Item -LiteralPath $env:ZKQ_KEY -Recurse -Force -ErrorAction Stop
  }
  Write-Output 'OK'
} catch {
  Write-Output ('ERROR=' + $_.Exception.Message)
}
"#;

const WAIT_UNINSTALL_SCRIPT: &str = r#"
try {
  $proc = Start-Process -FilePath $env:ZKQ_EXE -ArgumentList $env:ZKQ_ARGS -PassThru -ErrorAction Stop
  if (-not $proc.WaitForExit(120000)) {
    Write-Output ('STATUS=timeout;EXIT=-1;MESSAGE=卸载程序在 120 秒内未结束，已停止清理以免误删仍在使用的文件')
  } else {
    Write-Output ('STATUS=exited;EXIT=' + $proc.ExitCode + ';MESSAGE=卸载程序已结束')
  }
} catch {
  Write-Output ('STATUS=error;EXIT=-1;MESSAGE=' + $_.Exception.Message)
}
"#;

fn validate_registry_key(key: &str) -> Result<(), String> {
    if key.contains('\0') || key.contains('"') || key.contains('\'') {
        return Err("卸载登记路径包含非法字符".to_string());
    }
    let lower = key.to_ascii_lowercase();
    let matched = UNINSTALL_PREFIXES.iter().any(|prefix| {
        lower.starts_with(&prefix.to_ascii_lowercase()) && key[prefix.len()..].trim().len() > 0
    });
    if !matched {
        return Err("卸载登记路径不在允许的注册表范围内".to_string());
    }
    if key.split('\\').any(|part| part == "..") {
        return Err("卸载登记路径包含非法层级".to_string());
    }
    Ok(())
}

fn query_entries() -> Result<Vec<RegEntry>, String> {
    let output = powershell(SOFTWARE_LIST_SCRIPT)
        .map_err(|e| format!("读取卸载登记失败：{}", e))?;
    let trimmed = output.trim();
    if trimmed.is_empty() || trimmed == "[]" {
        return Ok(Vec::new());
    }
    serde_json::from_str::<Vec<RegEntry>>(trimmed)
        .map_err(|e| format!("卸载登记解析失败：{}", e))
}

fn query_entry(registry_key: &str) -> Result<RegEntry, String> {
    validate_registry_key(registry_key)?;
    let output = powershell_with_env(SOFTWARE_DETAIL_SCRIPT, &[("ZKQ_KEY", registry_key)])?;
    let trimmed = output.trim();
    if let Some(message) = trimmed.strip_prefix("ERROR=") {
        return Err(format!("读取软件信息失败：{}", message));
    }
    serde_json::from_str::<RegEntry>(trimmed)
        .map_err(|e| format!("软件信息解析失败：{}", e))
}

fn normalized_name(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

fn is_generic_token(token: &str) -> bool {
    const GENERIC: &[&str] = &[
        "microsoft", "google", "adobe", "corporation", "corp", "inc", "limited", "ltd",
        "software", "application", "setup", "installer", "公司", "软件", "应用",
    ];
    GENERIC.contains(&token)
}

fn name_tokens(name: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    for token in name.split(|c: char| !c.is_alphanumeric()) {
        let token: String = token.chars().flat_map(|c| c.to_lowercase()).collect();
        if token.chars().count() >= 3 && !is_generic_token(&token) {
            tokens.push(token);
        }
    }
    let full = normalized_name(name);
    if full.chars().count() >= 3 && !tokens.contains(&full) {
        tokens.push(full);
    }
    tokens.sort();
    tokens.dedup();
    tokens.truncate(6);
    tokens
}

fn folder_matches(name: &str, tokens: &[String]) -> bool {
    let folder = normalized_name(name);
    if folder.is_empty() {
        return false;
    }
    tokens.iter().any(|token| {
        if folder == *token {
            return true;
        }
        token.chars().count() >= 4 && folder.contains(token)
    })
}

/// 词法规范化：手动消去 `.` / `..`，用于目标不存在、无法 canonicalize 的情况。
fn lexical_normalize(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}

/// 统一路径文本：优先解析真实路径（同时消掉 `..` 与 junction），
/// Windows 的 canonicalize 会返回 `\\?\` 前缀，需要去掉后再做前缀比较。
fn normalized_path_text(path: &Path) -> String {
    let resolved = std::fs::canonicalize(path).unwrap_or_else(|_| lexical_normalize(path));
    let text = resolved.to_string_lossy().replace('/', "\\").to_lowercase();
    let text = text.strip_prefix(r"\\?\").unwrap_or(&text);
    text.trim_end_matches('\\').to_string()
}

/// 判断 target 是否等于 root 或位于 root 之下。
/// 使用逐段前缀判断，避免用 `contains` 造成 `C:\Windows` 误伤 `D:\MyWindows` 之类路径。
fn is_same_or_child(target: &str, root: &str) -> bool {
    if root.is_empty() || target.is_empty() {
        return false;
    }
    if target == root {
        return true;
    }
    target
        .strip_prefix(root)
        .map(|rest| rest.starts_with('\\'))
        .unwrap_or(false)
}

fn is_safe_cleanup_path(path: &Path) -> bool {
    if path.components().count() < 3 {
        return false;
    }

    let target = normalized_path_text(path);

    // 这些目录本身不能被当作应用残留整体删除，但其下的应用子目录是合法目标。
    let exact_protected = [
        expand_env("%ProgramFiles%"),
        expand_env("%ProgramFiles(x86)%"),
        expand_env("%ProgramW6432%"),
        expand_env("%PROGRAMDATA%"),
        expand_env("%USERPROFILE%"),
        expand_env("%LOCALAPPDATA%"),
        expand_env("%APPDATA%"),
        expand_env("%LOCALAPPDATA%\\Temp"),
        expand_env("%TEMP%"),
    ];
    if exact_protected
        .iter()
        .map(|p| normalized_path_text(p))
        .filter(|root| !root.is_empty())
        .any(|root| target == root)
    {
        return false;
    }

    // 系统关键目录与个人文件夹及其所有子目录都不允许删除。
    let forbidden_roots = [
        expand_env("%WINDIR%"),
        expand_env("%WINDIR%\\System32"),
        expand_env("%WINDIR%\\WinSxS"),
        expand_env("%WINDIR%\\Servicing"),
        expand_env("%USERPROFILE%\\Desktop"),
        expand_env("%USERPROFILE%\\Documents"),
        expand_env("%USERPROFILE%\\Downloads"),
        expand_env("%USERPROFILE%\\Pictures"),
        expand_env("%PUBLIC%"),
        expand_env("%PUBLIC%\\Desktop"),
        expand_env("%PUBLIC%\\Documents"),
        expand_env("%PUBLIC%\\Downloads"),
        expand_env("%PUBLIC%\\Pictures"),
    ];
    if forbidden_roots
        .iter()
        .map(|p| normalized_path_text(p))
        .filter(|root| !root.is_empty())
        .any(|root| is_same_or_child(&target, &root))
    {
        return false;
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let app_dir = normalized_path_text(parent);
            // 不允许删除本程序目录、其内部文件，也不允许删除包含本程序目录的父目录。
            if is_same_or_child(&target, &app_dir) || is_same_or_child(&app_dir, &target) {
                return false;
            }
        }
    }
    true
}

/// 把卸载字符串拆成可执行文件和参数。
/// 正常情况注册表会加引号，但少数软件会写未加引号且带空格的绝对路径，
/// 这里用「最长且真实存在的路径前缀」兜底，避免把路径中的空格误当参数分隔符。
fn split_uninstall_command(text: &str) -> Option<(&str, &str)> {
    if let Some(rest) = text.strip_prefix('"') {
        let end = rest.find('"')?;
        return Some((&rest[..end], rest[end + 1..].trim()));
    }

    for (index, ch) in text.char_indices() {
        if ch.is_whitespace() && Path::new(&text[..index]).exists() {
            return Some((&text[..index], text[index..].trim()));
        }
    }

    let mut parts = text.splitn(2, char::is_whitespace);
    let exe = parts.next()?;
    Some((exe, parts.next().unwrap_or("").trim()))
}

fn parse_uninstall_command(raw: &str) -> Option<(String, String)> {
    let text = raw.trim();
    if text.is_empty() {
        return None;
    }
    let (exe, args) = split_uninstall_command(text)?;
    let expanded = expand_env(exe).to_string_lossy().trim_matches('"').to_string();
    if expanded.is_empty() {
        return None;
    }
    Some((expanded, args.to_string()))
}

#[cfg_attr(not(windows), allow(dead_code))]
fn split_args(input: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_value = false;
    for ch in input.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                has_value = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_value {
                    result.push(std::mem::take(&mut current));
                    has_value = false;
                }
            }
            c => {
                current.push(c);
                has_value = true;
            }
        }
    }
    if has_value {
        result.push(current);
    }
    result
}

fn resolve_program(exe: &str) -> Result<String, String> {
    let path = PathBuf::from(exe);
    if path.is_absolute() {
        if !path.exists() {
            return Err(format!("卸载程序不存在或无法访问：{}", path.display()));
        }
        return Ok(exe.to_string());
    }
    let name = path
        .file_name()
        .map(|v| v.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if matches!(name.as_str(), "msiexec" | "msiexec.exe" | "rundll32.exe" | "cmd.exe") {
        Ok(exe.to_string())
    } else {
        Err(format!("卸载命令不是受支持的可执行文件：{}", exe))
    }
}

fn is_msiexec(exe: &str) -> bool {
    Path::new(exe)
        .file_name()
        .map(|v| {
            let name = v.to_string_lossy().to_ascii_lowercase();
            name == "msiexec" || name == "msiexec.exe"
        })
        .unwrap_or(false)
}

fn rewrite_msi_arg(part: &str) -> String {
    let lower = part.to_ascii_lowercase();
    if lower == "/i" || lower == "-i" {
        "/X".to_string()
    } else if lower.starts_with("/i") || lower.starts_with("-i") {
        // `/I{GUID}` / `-i{GUID}` 是 MSI 的安装参数，卸载必须改成 `/X{GUID}`。
        format!("/X{}", &part[2..])
    } else {
        part.to_string()
    }
}

fn replace_msi_install_flag(args: &str) -> String {
    args.split_whitespace()
        .map(rewrite_msi_arg)
        .collect::<Vec<_>>()
        .join(" ")
}

fn prepare_uninstall_command(entry: &RegEntry, force: bool) -> Result<(String, String, String), String> {
    let raw = if force && !entry.quiet_uninstall_string.trim().is_empty() {
        entry.quiet_uninstall_string.as_str()
    } else {
        entry.uninstall_string.as_str()
    };
    if raw.trim().is_empty() {
        return Err("该软件没有登记卸载命令，无法自动卸载；请在系统设置中手动卸载".to_string());
    }
    let (exe, mut args) = parse_uninstall_command(raw)
        .ok_or_else(|| "卸载命令格式无法解析".to_string())?;
    let exe = resolve_program(&exe)?;

    let mut silent_switch = String::new();
    if is_msiexec(&exe) {
        args = replace_msi_install_flag(&args);
        if force {
            let lower = args.to_ascii_lowercase();
            if !lower.contains("/qn") && !lower.contains("/qb") {
                args.push_str(" /qn");
                silent_switch = "/qn".to_string();
            }
            if !lower.contains("/norestart") {
                args.push_str(" /norestart");
            }
        }
    }
    Ok((exe, args.trim().to_string(), silent_switch))
}

fn run_uninstaller_wait(exe: &str, args: &str) -> Result<UninstallRun, String> {
    // 脚本内最多等待 120 秒，外层留 10 秒余量覆盖 Start-Process 与 UAC 交互。
    let output = powershell_with_env_timeout(
        WAIT_UNINSTALL_SCRIPT,
        &[("ZKQ_EXE", exe), ("ZKQ_ARGS", args)],
        Duration::from_secs(130),
    )?;
    let line = output
        .lines()
        .find(|line| line.trim_start().starts_with("STATUS="))
        .unwrap_or("STATUS=error;EXIT=-1;MESSAGE=卸载程序没有返回状态");
    let mut parts = line.trim().splitn(3, ';');
    let status = parts
        .next()
        .unwrap_or("")
        .strip_prefix("STATUS=")
        .unwrap_or("error")
        .to_string();
    let exit_code = parts
        .next()
        .unwrap_or("EXIT=-1")
        .strip_prefix("EXIT=")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(-1);
    let message = parts
        .next()
        .unwrap_or("MESSAGE=未知错误")
        .strip_prefix("MESSAGE=")
        .unwrap_or("未知错误")
        .to_string();
    Ok(UninstallRun {
        status,
        exit_code,
        message,
    })
}

fn launch_uninstaller(exe: &str, args: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new(exe)
            .args(split_args(args))
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("无法启动卸载程序：{}", e))
    }
    #[cfg(not(windows))]
    {
        let _ = (exe, args);
        Ok(())
    }
}

fn classify_residual(path: &Path) -> (&'static str, &'static str, bool) {
    let normalized = normalized_path_text(path);
    let leaf = path
        .file_name()
        .map(|v| v.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let temp_roots = [
        normalized_path_text(&expand_env("%TEMP%")),
        normalized_path_text(&expand_env("%LOCALAPPDATA%\\Temp")),
    ];
    // 只有明确位于临时目录或末段就是缓存目录时才默认勾选，避免误删名为 MyCache 的用户数据。
    let safe_cache = temp_roots
        .iter()
        .any(|root| is_same_or_child(&normalized, root))
        || matches!(leaf.as_str(), "cache" | "code cache" | "gpucache" | "temp");
    if safe_cache {
        ("cache", "low", true)
    } else if normalized.contains("locallow") || normalized.contains("roaming") {
        ("config", "high", false)
    } else {
        ("data", "high", false)
    }
}

fn build_plan_from_entry(entry: &RegEntry) -> SoftwareCleanupPlan {
    let install_location = if entry.install_location.trim().is_empty() {
        String::new()
    } else {
        expand_env(entry.install_location.trim())
            .to_string_lossy()
            .trim_end_matches(['\\', '/'])
            .to_string()
    };
    let (uninstall_command, _, silent_switch) = prepare_uninstall_command(entry, true)
        .unwrap_or_else(|_| (entry.uninstall_string.clone(), String::new(), String::new()));

    let mut targets: Vec<CleanupTarget> = Vec::new();

    if !install_location.is_empty() {
        let path = PathBuf::from(&install_location);
        targets.push(CleanupTarget {
            id: "install".to_string(),
            name: "安装目录".to_string(),
            path: install_location.clone(),
            kind: "install".to_string(),
            risk: "high".to_string(),
            required: true,
            selected: true,
            exists: path.is_dir(),
            size: dir_size_with_budget(&path, SCAN_SIZE_BUDGET, SCAN_SIZE_MAX_FILES).0,
            reason: "卸载程序结束后删除仍残留的应用文件".to_string(),
        });
    }

    targets.push(CleanupTarget {
        id: "registry".to_string(),
        name: "卸载登记".to_string(),
        path: entry.key.clone(),
        kind: "registry".to_string(),
        risk: "medium".to_string(),
        required: true,
        selected: true,
        exists: true,
        size: 0,
        reason: "删除该软件在注册表卸载列表中的登记项".to_string(),
    });

    let tokens = name_tokens(&entry.name);
    if !tokens.is_empty() {
        let roots = [
            expand_env("%LOCALAPPDATA%"),
            expand_env("%APPDATA%"),
            expand_env("%LOCALAPPDATA%\\Temp"),
            expand_env("%TEMP%"),
            expand_env("%USERPROFILE%\\AppData\\LocalLow"),
        ];
        let mut seen: HashSet<String> = HashSet::new();
        'outer: for root in roots {
            let Ok(entries) = std::fs::read_dir(&root) else {
                continue;
            };
            for item in entries.flatten() {
                if !item.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    continue;
                }
                let file_name = item.file_name().to_string_lossy().to_string();
                if !folder_matches(&file_name, &tokens) {
                    continue;
                }
                let path = item.path();
                if !is_safe_cleanup_path(&path) {
                    continue;
                }
                let path_text = path.to_string_lossy().to_string();
                if !seen.insert(path_text.to_ascii_lowercase()) {
                    continue;
                }
                let (kind, risk, selected) = classify_residual(&path);
                let reason = match kind {
                    "cache" => "应用缓存或临时目录，删除后下次运行会重新生成".to_string(),
                    "config" => "可能包含账号配置、许可证或个人数据，删除后无法恢复".to_string(),
                    _ => "应用留下的残留目录，可能包含用户数据，删除后无法恢复".to_string(),
                };
                targets.push(CleanupTarget {
                    id: format!("path:{}", path_text.to_ascii_lowercase()),
                    name: file_name,
                    path: path_text,
                    kind: kind.to_string(),
                    risk: risk.to_string(),
                    required: false,
                    selected,
                    exists: true,
                    size: dir_size_with_budget(&path, SCAN_SIZE_BUDGET, SCAN_SIZE_MAX_FILES).0,
                    reason,
                });
                if targets.len() >= 16 {
                    break 'outer;
                }
            }
        }
    }

    SoftwareCleanupPlan {
        app_name: entry.name.clone(),
        install_location,
        uninstall_command,
        silent_switch,
        warnings: vec![
            "将先调用软件自带的卸载程序；卸载失败或超时时，本工具不会继续删除任何文件。".to_string(),
            "安装目录与注册表登记会被删除；勾选的高风险目录可能包含账号数据、许可证、数据库或配置文件，删除后无法恢复。".to_string(),
            "强力卸载不会删除桌面、文档、图片、下载等个人文件夹，也不会触碰系统关键目录。".to_string(),
        ],
        targets,
    }
}

fn get_installed_software_blocking() -> Result<Vec<InstalledSoftware>, String> {
    let entries = query_entries()?;
    let mut seen: HashSet<String> = HashSet::new();
    let mut apps: Vec<InstalledSoftware> = Vec::new();
    let mut fallback_sizes = 0usize;

    for entry in entries {
        if entry.name.trim().is_empty() {
            continue;
        }
        let key = normalized_name(&entry.name);
        let location_key = normalized_name(&entry.install_location);
        let dedupe_key = format!("{}|{}", key, location_key);
        if !seen.insert(dedupe_key) {
            continue;
        }

        let path = expand_env(entry.install_location.trim());
        let path_exists = !entry.install_location.trim().is_empty() && path.is_dir();
        let mut size = entry.estimated_size.saturating_mul(1024);
        let mut size_source = if size > 0 {
            "registry".to_string()
        } else {
            "unknown".to_string()
        };
        if size == 0 && path_exists && fallback_sizes < SCAN_FALLBACK_LIMIT {
            fallback_sizes += 1;
            size = dir_size_with_budget(&path, SCAN_SIZE_BUDGET, SCAN_SIZE_MAX_FILES).0;
            if size > 0 {
                size_source = "folder".to_string();
            }
        }

        apps.push(InstalledSoftware {
            id: entry.key.clone(),
            name: entry.name.clone(),
            version: entry.version.clone(),
            publisher: if entry.publisher.trim().is_empty() {
                "未知发布者".to_string()
            } else {
                entry.publisher.clone()
            },
            install_location: entry.install_location.trim().to_string(),
            size,
            size_source,
            path_exists,
            registry_key: entry.key.clone(),
            uninstall_string: entry.uninstall_string.clone(),
            quiet_uninstall_string: entry.quiet_uninstall_string.clone(),
            can_uninstall: !entry.uninstall_string.trim().is_empty()
                || !entry.quiet_uninstall_string.trim().is_empty(),
            source: if entry.source.trim().is_empty() {
                "注册表".to_string()
            } else {
                entry.source.clone()
            },
        });
    }

    apps.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(apps)
}

fn delete_registry_key(registry_key: &str) -> Result<(), String> {
    validate_registry_key(registry_key)?;
    let output = powershell_with_env(DELETE_REGISTRY_SCRIPT, &[("ZKQ_KEY", registry_key)])?;
    match output.trim() {
        "OK" => Ok(()),
        other => Err(other.strip_prefix("ERROR=").unwrap_or(other).to_string()),
    }
}

fn self_protection_check(entry: &RegEntry) -> Result<(), String> {
    let name = normalized_name(&entry.name);
    if ["张开嘴清理", "molewin", "zhangzui"]
        .iter()
        .any(|own| name.contains(&normalized_name(own)))
    {
        return Err("不能卸载本工具自身".to_string());
    }
    if entry.install_location.trim().is_empty() {
        return Ok(());
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let target = normalized_path_text(&expand_env(entry.install_location.trim()));
            let app_dir = normalized_path_text(parent);
            if is_same_or_child(&app_dir, &target) {
                return Err("不能卸载本工具所在的目录或其父目录".to_string());
            }
        }
    }
    Ok(())
}

fn validate_required_selection(
    plan: &SoftwareCleanupPlan,
    selected: &HashSet<&str>,
) -> Result<(), String> {
    if let Some(missing) = plan
        .targets
        .iter()
        .find(|t| t.required && !selected.contains(t.id.as_str()))
    {
        return Err(format!("必选清理目标 {} 未被选中，已取消", missing.name));
    }
    Ok(())
}

fn force_uninstall_blocking(
    registry_key: &str,
    confirmation: &str,
    selected_ids: &[String],
) -> Result<SoftwareUninstallOutcome, String> {
    if confirmation != FORCE_CONFIRM_PHRASE {
        return Err("未完成二次确认，强力卸载已取消".to_string());
    }
    validate_registry_key(registry_key)?;
    let entry = query_entry(registry_key)?;
    self_protection_check(&entry)?;
    let plan = build_plan_from_entry(&entry);

    let allowed: HashSet<&str> = plan.targets.iter().map(|t| t.id.as_str()).collect();
    if let Some(unknown) = selected_ids.iter().find(|id| !allowed.contains(id.as_str())) {
        return Err(format!("清理范围已变化（未知目标 {}），请重新预览", unknown));
    }
    let selected: HashSet<&str> = selected_ids.iter().map(|s| s.as_str()).collect();
    validate_required_selection(&plan, &selected)?;

    let (exe, args, _) = prepare_uninstall_command(&entry, true)?;
    let run = run_uninstaller_wait(&exe, &args)?;
    let mut results: Vec<CleanupTargetResult> = Vec::new();
    let needs_restart = run.exit_code == 3010;

    let can_continue = run.status == "exited" && (run.exit_code == 0 || needs_restart);
    if !can_continue {
        return Ok(SoftwareUninstallOutcome {
            app_name: entry.name.clone(),
            mode: "force".to_string(),
            success: false,
            message: format!("卸载程序未成功结束，已停止后续清理：{}", run.message),
            freed: 0,
            results,
            needs_restart: false,
        });
    }

    let mut freed = 0u64;
    for target in plan.targets.iter() {
        if !target.required && !selected.contains(target.id.as_str()) {
            continue;
        }
        if !target.exists {
            results.push(CleanupTargetResult {
                id: target.id.clone(),
                name: target.name.clone(),
                status: "skipped".to_string(),
                freed: 0,
                message: "路径不存在，已跳过".to_string(),
            });
            continue;
        }
        if target.kind == "registry" {
            match delete_registry_key(&target.path) {
                Ok(()) => results.push(CleanupTargetResult {
                    id: target.id.clone(),
                    name: target.name.clone(),
                    status: "removed".to_string(),
                    freed: 0,
                    message: "卸载登记已删除".to_string(),
                }),
                Err(err) => results.push(CleanupTargetResult {
                    id: target.id.clone(),
                    name: target.name.clone(),
                    status: "failed".to_string(),
                    freed: 0,
                    message: err,
                }),
            }
            continue;
        }

        let path = PathBuf::from(&target.path);
        if !is_safe_cleanup_path(&path) {
            results.push(CleanupTargetResult {
                id: target.id.clone(),
                name: target.name.clone(),
                status: "skipped".to_string(),
                freed: 0,
                message: "该路径受保护，已跳过".to_string(),
            });
            continue;
        }
        let removed = remove_path(&path);
        freed = freed.saturating_add(removed);
        if removed > 0 || !path.exists() {
            results.push(CleanupTargetResult {
                id: target.id.clone(),
                name: target.name.clone(),
                status: "removed".to_string(),
                freed: removed,
                message: if removed > 0 {
                    "已清理".to_string()
                } else {
                    "路径已不存在".to_string()
                },
            });
        } else {
            results.push(CleanupTargetResult {
                id: target.id.clone(),
                name: target.name.clone(),
                status: "failed".to_string(),
                freed: 0,
                message: "无法删除，可能没有权限或文件仍被占用".to_string(),
            });
        }
    }

    let failed = results.iter().filter(|r| r.status == "failed").count();
    let skipped = results.iter().filter(|r| r.status == "skipped").count();
    let message = if failed == 0 && skipped == 0 {
        "软件已卸载，登记与所选残留均已清理".to_string()
    } else {
        format!(
            "软件卸载流程已结束；{} 项清理失败，{} 项跳过。请查看下方明细，必要时以管理员身份运行后重试",
            failed, skipped
        )
    };

    Ok(SoftwareUninstallOutcome {
        app_name: entry.name.clone(),
        mode: "force".to_string(),
        success: true,
        message,
        freed,
        results,
        needs_restart,
    })
}

fn get_software_icons_blocking() -> HashMap<String, String> {
    let output = match powershell_with_timeout(SOFTWARE_ICONS_SCRIPT, Duration::from_secs(60)) {
        Ok(output) => output,
        Err(err) => {
            eprintln!("提取软件图标失败：{}", err);
            return HashMap::new();
        }
    };
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return HashMap::new();
    }
    serde_json::from_str::<HashMap<String, String>>(trimmed).unwrap_or_default()
}

#[tauri::command]
pub async fn get_software_icons() -> HashMap<String, String> {
    tauri::async_runtime::spawn_blocking(get_software_icons_blocking)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_installed_software() -> Result<Vec<InstalledSoftware>, String> {
    tauri::async_runtime::spawn_blocking(get_installed_software_blocking)
        .await
        .map_err(|e| format!("扫描已安装软件异常中断：{}", e))?
}

#[tauri::command]
pub async fn open_software_location(registry_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_registry_key(&registry_key)?;
        let entry = query_entry(&registry_key)?;
        let location = expand_env(entry.install_location.trim());
        if entry.install_location.trim().is_empty() {
            return Err("该软件没有登记安装目录".to_string());
        }
        if !location.is_dir() {
            return Err(format!("安装目录不存在：{}", location.display()));
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            Command::new("explorer")
                .arg(&location)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("无法打开安装目录：{}", e))?;
        }
        #[cfg(not(windows))]
        {
            let _ = location;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("打开安装目录异常中断：{}", e))?
}

#[tauri::command]
pub async fn preview_force_uninstall(registry_key: String) -> Result<SoftwareCleanupPlan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = query_entry(&registry_key)?;
        self_protection_check(&entry)?;
        Ok(build_plan_from_entry(&entry))
    })
    .await
    .map_err(|e| format!("生成清理范围异常中断：{}", e))?
}

#[tauri::command]
pub async fn uninstall_software(registry_key: String) -> Result<SoftwareUninstallOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_registry_key(&registry_key)?;
        let entry = query_entry(&registry_key)?;
        self_protection_check(&entry)?;
        let (exe, args, _) = prepare_uninstall_command(&entry, false)?;
        launch_uninstaller(&exe, &args)?;
        Ok(SoftwareUninstallOutcome {
            app_name: entry.name.clone(),
            mode: "normal".to_string(),
            success: true,
            message: "已启动软件自带的卸载向导，请按提示完成；结束后可重新扫描确认结果".to_string(),
            freed: 0,
            results: Vec::new(),
            needs_restart: false,
        })
    })
    .await
    .map_err(|e| format!("启动卸载异常中断：{}", e))?
}

#[tauri::command]
pub async fn force_uninstall_software(
    registry_key: String,
    confirmation: String,
    selected_ids: Vec<String>,
) -> Result<SoftwareUninstallOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        force_uninstall_blocking(&registry_key, &confirmation, &selected_ids)
    })
    .await
    .map_err(|e| format!("强力卸载异常中断：{}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn parse_icon_spec(spec: &str) -> (String, i32) {
        let text = spec.trim().trim_matches('"');
        if let Some(comma) = text.rfind(',') {
            if let Ok(index) = text[comma + 1..].trim().parse::<i32>() {
                return (
                    text[..comma].trim().trim_matches('"').to_string(),
                    index,
                );
            }
        }
        (text.to_string(), 0)
    }

    #[test]
    fn icon_spec_parser_handles_index_and_quotes() {
        assert_eq!(
            parse_icon_spec(r#""C:\Program Files\App\app.exe,2""#),
            (r"C:\Program Files\App\app.exe".to_string(), 2)
        );
        assert_eq!(
            parse_icon_spec(r"C:\App\icons.ico,-12"),
            (r"C:\App\icons.ico".to_string(), -12)
        );
        assert_eq!(
            parse_icon_spec(r#""C:\App\app.exe""#),
            (r"C:\App\app.exe".to_string(), 0)
        );
    }

    #[test]
    fn icon_extraction_script_reads_display_icon() {
        assert!(SOFTWARE_ICONS_SCRIPT.contains("DisplayIcon"));
        assert!(SOFTWARE_ICONS_SCRIPT.contains("ExtractIconEx"));
    }

    #[test]
    fn registry_key_validation_allows_only_uninstall_roots() {
        assert!(validate_registry_key(
            r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Example"
        )
        .is_ok());
        assert!(validate_registry_key(r"HKCU:\Software\Run").is_err());
        assert!(validate_registry_key(
            r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\..\Run"
        )
        .is_err());
    }

    #[test]
    fn parse_uninstall_command_handles_quoted_paths() {
        let (exe, args) = parse_uninstall_command(r#""C:\Program Files\App\uninst.exe" /S"#)
            .expect("parse quoted command");
        assert!(exe.to_lowercase().contains("uninst.exe"));
        assert_eq!(args, "/S");
        assert_eq!(split_args(&args), vec!["/S"]);
    }

    #[test]
    fn parse_uninstall_command_handles_unquoted_path_with_spaces() {
        let dir = std::env::temp_dir().join(format!("zkz software test {}", std::process::id()));
        fs::create_dir_all(&dir).expect("create temp dir with space");
        let exe = dir.join("uninstall.exe");
        fs::write(&exe, b"").expect("create fake uninstaller");

        let command = format!("{} /S", exe.display());
        let (parsed, args) = parse_uninstall_command(&command).expect("parse command");
        assert_eq!(parsed, exe.to_string_lossy().to_string());
        assert_eq!(args, "/S");

        fs::remove_dir_all(dir).expect("remove temp dir");
    }

    #[test]
    fn msi_install_flag_is_converted_to_uninstall_flag() {
        assert_eq!(replace_msi_install_flag("/I{ABC123} /qb"), "/X{ABC123} /qb");
        assert_eq!(replace_msi_install_flag("/i {ABC123}"), "/X {ABC123}");
    }

    #[test]
    fn path_child_check_does_not_match_sibling_prefixes() {
        assert!(is_same_or_child(r"c:\windows\system32", r"c:\windows"));
        assert!(!is_same_or_child(r"d:\mywindows", r"c:\windows"));
        assert!(!is_same_or_child(r"c:\windows-old", r"c:\windows"));
    }

    #[test]
    fn protected_paths_are_not_cleanup_targets() {
        let windows = expand_env("%WINDIR%");
        if !windows.as_os_str().is_empty() {
            assert!(!is_safe_cleanup_path(&windows));
            assert!(!is_safe_cleanup_path(&windows.join("System32").join("drivers")));
        }
        assert!(!is_safe_cleanup_path(Path::new("/tmp")));
        assert!(is_safe_cleanup_path(Path::new("/tmp/ZhangZui/AppData/Cache")));
    }

    #[test]
    fn lexical_normalize_removes_parent_segments() {
        let path = lexical_normalize(Path::new("C:/Users/A/AppData/Local/../../Documents/Backup"));
        assert_eq!(
            path.to_string_lossy().replace('/', "\\"),
            r"C:\Users\A\Documents\Backup"
        );
    }

    #[test]
    fn residual_classification_is_conservative() {
        assert_eq!(classify_residual(Path::new("/tmp/Cache")).0, "cache");
        assert_eq!(classify_residual(Path::new("/tmp/MyCache")).0, "data");
    }

    #[test]
    fn required_cleanup_targets_must_be_selected() {
        let plan = SoftwareCleanupPlan {
            app_name: "Demo".to_string(),
            install_location: r"C:\Apps\Demo".to_string(),
            uninstall_command: String::new(),
            silent_switch: String::new(),
            warnings: Vec::new(),
            targets: vec![CleanupTarget {
                id: "install".to_string(),
                name: "安装目录".to_string(),
                path: r"C:\Apps\Demo".to_string(),
                kind: "install".to_string(),
                risk: "high".to_string(),
                required: true,
                selected: true,
                exists: true,
                size: 0,
                reason: String::new(),
            }],
        };
        assert!(validate_required_selection(&plan, &HashSet::new()).is_err());
        let selected: HashSet<&str> = ["install"].into_iter().collect();
        assert!(validate_required_selection(&plan, &selected).is_ok());
    }

    #[test]
    fn force_confirmation_phrase_is_required() {
        let entry = RegEntry {
            key: r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Example".to_string(),
            name: "Example".to_string(),
            version: "1.0".to_string(),
            publisher: "Demo".to_string(),
            install_location: String::new(),
            estimated_size: 0,
            uninstall_string: String::new(),
            quiet_uninstall_string: String::new(),
            source: String::new(),
        };
        let outcome = force_uninstall_blocking(&entry.key, "随便确认", &[]);
        assert!(outcome.is_err());
    }
}
