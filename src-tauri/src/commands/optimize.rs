use serde::Deserialize;

use crate::models::StartupItem;
use crate::platform::{expand_env, powershell, powershell_with_env};

const RUN_KEYS: &[(&str, &str)] = &[
    (
        r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
        "注册表 Run (当前用户)",
    ),
    (
        r"HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        "注册表 Run (系统)",
    ),
];
const BACKUP_KEY: &str = r"HKCU:\Software\Microsoft\Windows\CurrentVersion\RunZkqBackup";
const HKCU_INDEX: usize = 0;
const HKLM_INDEX: usize = 1;

/// 注册表值。备份项在 `value` 前缀中记录来源分支（`HKCU|...` / `HKLM|...`），
/// 恢复时才能写回原来的位置；注册表类型字段只能是合法的 RegistryValueKind，
/// 不能像旧版那样把 `HKLM` 塞进 `kind`（那会直接导致写入失败）。
#[derive(Debug, Deserialize)]
struct RegValue {
    name: String,
    #[serde(default)]
    value: String,
    #[serde(default)]
    kind: String,
}

#[derive(Debug, Default, Deserialize)]
struct RegSnapshot {
    #[serde(rename = "currentUser", default)]
    current_user: Vec<RegValue>,
    #[serde(default)]
    system: Vec<RegValue>,
    #[serde(default)]
    backup: Vec<RegValue>,
}

/// 一次 PowerShell 调用读回全部启动项，避免三次进程启动带来的延迟与编码差异。
fn query_snapshot() -> RegSnapshot {
    let script = r#"
function Get-RunValues($path) {
  $items = @()
  if (Test-Path $path) {
    $key = Get-Item $path
    foreach ($n in $key.GetValueNames()) {
      $items += [pscustomobject]@{ name = $n; value = [string]$key.GetValue($n); kind = [string]$key.GetValueKind($n) }
    }
  }
  return @($items)
}
[pscustomobject]@{
  currentUser = @(Get-RunValues 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run')
  system      = @(Get-RunValues 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run')
  backup      = @(Get-RunValues 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunZkqBackup')
} | ConvertTo-Json -Compress -Depth 5
"#;

    let Ok(output) = powershell(script) else {
        return RegSnapshot::default();
    };
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return RegSnapshot::default();
    }
    serde_json::from_str(trimmed).unwrap_or_default()
}

fn value_kind(value: &str, original: &str) -> &'static str {
    // 含 % 的值必须保留为 REG_EXPAND_SZ，否则恢复后会变成字面路径而失效
    if original.eq_ignore_ascii_case("ExpandString") || value.contains('%') {
        "ExpandString"
    } else {
        "String"
    }
}

/// 把来源分支编码进备份项的 value 前缀。类型字段保持纯 RegistryValueKind。
fn encode_backup_value(hive: &str, value: &str) -> String {
    format!("{}|{}", hive, value)
}

/// 返回 (hive, 原始值)。兼容旧备份（hive 存在 kind 里的格式）。
fn decode_backup_value(encoded: &str) -> (&str, &str) {
    if let Some((hive, value)) = encoded.split_once('|') {
        if hive.eq_ignore_ascii_case("HKCU") || hive.eq_ignore_ascii_case("HKLM") {
            return (hive, value);
        }
    }
    ("HKCU", encoded)
}

/// 通过环境变量传值，名称或命令里出现引号、`&`、`$` 也不会被 PowerShell 解释。
/// 使用 .NET Registry API 并显式把类型字符串解析成 RegistryValueKind 枚举：
/// Windows PowerShell 5.1 的 `Set-ItemProperty -Type $字符串变量` 无法完成
/// String→枚举的运行时绑定，会报「无法绑定参数 Type」，必须显式 Parse。
fn set_value(key: &str, name: &str, value: &str, kind: &str) -> Result<(), String> {
    let script = r#"
try {
  $kind = [Microsoft.Win32.RegistryValueKind][Enum]::Parse([Microsoft.Win32.RegistryValueKind], $env:ZKQ_TYPE, $true)
  $keyPath = $env:ZKQ_KEY
  if ($keyPath -match '^HKCU:\\(.*)$') {
    $root = [Microsoft.Win32.Registry]::CurrentUser
    $sub  = $Matches[1]
  } elseif ($keyPath -match '^HKLM:\\(.*)$') {
    $root = [Microsoft.Win32.Registry]::LocalMachine
    $sub  = $Matches[1]
  } else {
    throw "不支持的注册表位置：$keyPath"
  }
  $regKey = $root.CreateSubKey($sub, [Microsoft.Win32.RegistryKeyPermissionCheck]::ReadWriteSubTree)
  if ($null -eq $regKey) { throw "无法打开注册表项：$keyPath" }
  try { $regKey.SetValue($env:ZKQ_NAME, $env:ZKQ_VALUE, $kind) }
  finally { $regKey.Close() }
} catch {
  Write-Output "写入注册表失败：$($_.Exception.Message)"
  exit 1
}
"#;
    powershell_with_env(
        script,
        &[
            ("ZKQ_KEY", key),
            ("ZKQ_NAME", name),
            ("ZKQ_VALUE", value),
            ("ZKQ_TYPE", kind),
        ],
    )
    .map(|_| ())
}

fn delete_value(key: &str, name: &str) -> Result<(), String> {
    let script = r#"
try {
  if (Test-Path $env:ZKQ_KEY) {
    $item = Get-Item $env:ZKQ_KEY
    if ($item.GetValueNames() -contains $env:ZKQ_NAME) {
      Remove-ItemProperty -Path $env:ZKQ_KEY -Name $env:ZKQ_NAME -Force -ErrorAction Stop
    }
  }
} catch {
  Write-Output "删除注册表值失败：$($_.Exception.Message)"
  exit 1
}
"#;
    powershell_with_env(script, &[("ZKQ_KEY", key), ("ZKQ_NAME", name)]).map(|_| ())
}

fn guess_publisher(command: &str) -> String {
    let lower = command.to_lowercase();
    if lower.contains("teams") || lower.contains("onedrive") || lower.contains("msedge") {
        "Microsoft Corporation".to_string()
    } else if lower.contains("adobe") || lower.contains("acro") {
        "Adobe Inc.".to_string()
    } else if lower.contains("spotify") {
        "Spotify AB".to_string()
    } else if lower.contains("discord") {
        "Discord Inc.".to_string()
    } else if lower.contains("steam") {
        "Valve Corporation".to_string()
    } else if lower.contains("wechat") || lower.contains("weixin") {
        "腾讯".to_string()
    } else {
        "未知发布者".to_string()
    }
}

fn get_startup_items_blocking() -> Vec<StartupItem> {
    let snapshot = query_snapshot();
    let mut items: Vec<StartupItem> = Vec::new();

    for value in snapshot.current_user.iter() {
        items.push(StartupItem {
            name: value.name.clone(),
            command: value.value.clone(),
            location: RUN_KEYS[HKCU_INDEX].1.to_string(),
            enabled: true,
            publisher: guess_publisher(&value.value),
        });
    }
    for value in snapshot.system.iter() {
        items.push(StartupItem {
            name: value.name.clone(),
            command: value.value.clone(),
            location: RUN_KEYS[HKLM_INDEX].1.to_string(),
            enabled: true,
            publisher: guess_publisher(&value.value),
        });
    }

    for item in items.iter_mut() {
        if snapshot.backup.iter().any(|v| v.name == item.name) {
            item.enabled = false;
        }
    }

    for value in snapshot.backup.iter() {
        if !items.iter().any(|item| item.name == value.name) {
            let (_, original) = decode_backup_value(&value.value);
            items.push(StartupItem {
                name: value.name.clone(),
                command: original.to_string(),
                location: "注册表 Run (已禁用)".to_string(),
                enabled: false,
                publisher: guess_publisher(original),
            });
        }
    }

    let startup_dir = expand_env("%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup");
    if let Ok(entries) = std::fs::read_dir(&startup_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let parsed = if let Some(name) = file_name.strip_suffix(".lnk.zkqdisabled") {
                Some((name.to_string(), false))
            } else {
                file_name
                    .strip_suffix(".lnk")
                    .map(|name| (name.to_string(), true))
            };
            if let Some((name, enabled)) = parsed {
                items.push(StartupItem {
                    name,
                    command: file_name,
                    location: "启动文件夹".to_string(),
                    enabled,
                    publisher: "未知发布者".to_string(),
                });
            }
        }
    }

    items
}

fn set_startup_enabled_blocking(name: &str, enabled: bool) -> Result<bool, String> {
    let snapshot = query_snapshot();

    // 1. 项仍处于启用状态：备份后删除
    if !enabled {
        let sources: [(usize, &Vec<RegValue>); 2] = [
            (HKCU_INDEX, &snapshot.current_user),
            (HKLM_INDEX, &snapshot.system),
        ];
        for (idx, values) in sources {
            if let Some(current) = values.iter().find(|v| v.name == name) {
                let hive = if idx == HKCU_INDEX { "HKCU" } else { "HKLM" };
                let kind = value_kind(&current.value, &current.kind);
                set_value(
                    BACKUP_KEY,
                    name,
                    &encode_backup_value(hive, &current.value),
                    kind,
                )?;
                delete_value(RUN_KEYS[idx].0, name)?;
                return Ok(true);
            }
        }
    } else {
        // 2. 从备份恢复
        if let Some(backup) = snapshot.backup.iter().find(|v| v.name == name) {
            let (hive, original) = decode_backup_value(&backup.value);
            let key = if hive.eq_ignore_ascii_case("HKLM") {
                RUN_KEYS[HKLM_INDEX].0
            } else {
                RUN_KEYS[HKCU_INDEX].0
            };
            // 兼容旧备份：hive 曾写在 kind 里（格式 `String|HKLM`），
            // 那时 value 是纯命令，需从 kind 尾部补出目标分支。
            let (effective_hive, effective_value) =
                if let Some((_, old_hive)) = backup.kind.split_once('|') {
                    let target = if old_hive.eq_ignore_ascii_case("HKLM") {
                        RUN_KEYS[HKLM_INDEX].0
                    } else {
                        RUN_KEYS[HKCU_INDEX].0
                    };
                    (target, backup.value.as_str())
                } else {
                    (key, original)
                };
            let kind = value_kind(
                effective_value,
                backup.kind.split_once('|').map(|(k, _)| k).unwrap_or(&backup.kind),
            );
            set_value(effective_hive, name, effective_value, kind)?;
            delete_value(BACKUP_KEY, name)?;
            return Ok(true);
        }
        // 启用一个本来就启用的项，视为成功
        if snapshot
            .current_user
            .iter()
            .chain(snapshot.system.iter())
            .any(|v| v.name == name)
        {
            return Ok(true);
        }
    }

    // 3. 启动文件夹内的快捷方式
    let startup_dir = expand_env("%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup");
    let active = startup_dir.join(format!("{}.lnk", name));
    let inactive = startup_dir.join(format!("{}.lnk.zkqdisabled", name));
    if enabled && inactive.exists() {
        return std::fs::rename(&inactive, &active)
            .map(|_| true)
            .map_err(|e| format!("无法启用启动项：{}", e));
    }
    if !enabled && active.exists() {
        return std::fs::rename(&active, &inactive)
            .map(|_| true)
            .map_err(|e| format!("无法禁用启动项：{}", e));
    }

    Ok(false)
}

#[tauri::command]
pub async fn get_startup_items() -> Result<Vec<StartupItem>, String> {
    tauri::async_runtime::spawn_blocking(get_startup_items_blocking)
        .await
        .map_err(|e| format!("读取启动项异常中断：{}", e))
}

#[tauri::command]
pub async fn set_startup_enabled(name: String, enabled: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || set_startup_enabled_blocking(&name, enabled))
        .await
        .map_err(|e| format!("修改启动项异常中断：{}", e))?
}

#[cfg(test)]
mod tests {
    use super::{decode_backup_value, encode_backup_value, value_kind};

    #[test]
    fn expand_string_is_preserved_for_percent_paths() {
        assert_eq!(value_kind("%LOCALAPPDATA%\\App.exe", "String"), "ExpandString");
        assert_eq!(
            value_kind("C:\\App\\run.exe", "ExpandString"),
            "ExpandString"
        );
        assert_eq!(value_kind("C:\\App\\run.exe", "String"), "String");
    }

    #[test]
    fn backup_value_round_trips_hive_and_command() {
        let encoded = encode_backup_value("HKLM", "C:\\App\\run.exe --flag");
        let (hive, value) = decode_backup_value(&encoded);
        assert_eq!(hive, "HKLM");
        assert_eq!(value, "C:\\App\\run.exe --flag");
    }

    #[test]
    fn legacy_backup_without_hive_defaults_to_current_user() {
        assert_eq!(decode_backup_value("C:\\App\\run.exe"), ("HKCU", "C:\\App\\run.exe"));
    }

    #[test]
    fn value_containing_pipe_is_not_mistaken_for_hive_prefix() {
        assert_eq!(decode_backup_value("C:\\a|b.exe"), ("HKCU", "C:\\a|b.exe"));
    }
}
