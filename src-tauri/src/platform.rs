use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Stdio;
use std::time::{Duration, Instant};

/// 展开形如 %TEMP% 的 Windows 环境变量。
/// Windows 环境变量名不区分大小写，注册表里的路径也可能写成 `%temp%` / `%Temp%`，
/// 因此这里逐字符做 ASCII 大小写无关匹配，而不是只替换两种固定写法。
const ENV_KEYS: &[&str] = &[
    "TEMP",
    "TMP",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE",
    "WINDIR",
    "SystemRoot",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "ProgramW6432",
    "ProgramData",
    "PUBLIC",
    "HOMEDRIVE",
    "HOMEPATH",
];

fn expand_env_var(input: &str, key: &str, value: &str) -> String {
    let needle = format!("%{}%", key);
    let lower_needle = needle.to_ascii_lowercase();
    let lowered = input.to_ascii_lowercase();
    let mut lower_rest: &str = &lowered;
    let mut rest = input;
    let mut output = String::with_capacity(input.len() + value.len());

    while let Some(index) = lower_rest.find(&lower_needle) {
        output.push_str(&rest[..index]);
        output.push_str(value);
        rest = &rest[index + needle.len()..];
        lower_rest = &lower_rest[index + needle.len()..];
    }
    output.push_str(rest);
    output
}

pub fn expand_env(input: &str) -> PathBuf {
    let mut result = input.to_string();
    for key in ENV_KEYS {
        if let Ok(value) = std::env::var(key) {
            result = expand_env_var(&result, key, &value);
        }
    }
    PathBuf::from(result)
}

/// 返回可信的用户临时目录。环境变量被改成用户根目录或盘符根时返回 None，
/// 防止“清理临时文件”变成递归删除个人或系统目录。
pub fn safe_temp_dir() -> Option<PathBuf> {
    let path = expand_env("%TEMP%");
    let text = path
        .to_string_lossy()
        .to_lowercase()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_string();
    let is_temp = text.ends_with("\\appdata\\local\\temp") || text.ends_with("\\windows\\temp");
    if is_temp && path.is_dir() {
        Some(path)
    } else {
        None
    }
}

/// 遍历深度上限：Windows 目录层级有限，超过此值一定是异常情况
const MAX_WALK_DEPTH: usize = 32;
/// 单次统计的文件数上限，避免个别超大目录让界面长时间无响应
const MAX_WALK_FILES: u64 = 300_000;

/// 判断路径是否为重解析点（junction / 符号链接 / OneDrive 占位符）。
/// 统计大小时必须跳过，否则 `C:\Users\*\AppData\Local\Application Data`
/// 这类指向自身的 junction 会造成无限递归。
#[cfg(windows)]
pub fn is_reparse_point(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    std::fs::symlink_metadata(path)
        .map(|meta| meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn is_reparse_point(path: &Path) -> bool {
    std::fs::symlink_metadata(path)
        .map(|meta| meta.file_type().is_symlink())
        .unwrap_or(false)
}

/// 递归统计目录大小（字节）与文件数量，忽略无法访问的路径。
/// 带时间预算：超时或达到文件数上限时返回已统计的部分，保证界面一定会出结果，
/// 不会因为某个巨型目录把所有线程拖死。
const DIR_SIZE_BUDGET: Duration = Duration::from_secs(20);

/// `dir_size` 使用默认的 20 秒预算；软件列表扫描会传入更短的预算，
/// 防止几十个应用没有注册表 EstimatedSize 时把整个界面拖慢。
pub fn dir_size(path: &Path) -> (u64, u64) {
    dir_size_with_budget(path, DIR_SIZE_BUDGET, MAX_WALK_FILES)
}

pub fn dir_size_with_budget(path: &Path, budget: Duration, max_files: u64) -> (u64, u64) {
    if !path.exists() {
        return (0, 0);
    }
    let started = Instant::now();
    let mut size = 0u64;
    let mut count = 0u64;
    let walker = walkdir::WalkDir::new(path)
        .max_depth(MAX_WALK_DEPTH)
        .follow_links(false)
        .into_iter()
        // 关键性能修复：只对「目录」判断重解析点。文件不可能是 junction，
        // 旧版对几十万个文件逐个做 symlink_metadata，是「空间占用分布」一直
        // 转圈的根因；walkdir 的 file_type 来自目录项，不产生额外系统调用。
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            let kind = entry.file_type();
            if kind.is_dir() {
                !is_reparse_point(entry.path())
            } else {
                true
            }
        });

    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        if count >= max_files || started.elapsed() >= budget {
            break;
        }
        if let Ok(meta) = entry.metadata() {
            size = size.saturating_add(meta.len());
            count = count.saturating_add(1);
        }
    }
    (size, count)
}

/// 清空目录内容（保留目录本身），返回实际成功删除的字节数。
/// 逐个条目删除，被占用或无权限的条目会被跳过且不计入已释放空间，
/// 因此比 `remove_dir_all` 更宽容，部分成功时也能给出真实数字。
pub fn clean_dir_contents(path: &Path) -> u64 {
    let mut freed = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            if is_reparse_point(&p) {
                // 只删除链接本身，绝不进入目标目录，避免误删真实数据
                let _ = std::fs::remove_dir(&p);
                continue;
            }
            freed = freed.saturating_add(clean_dir_contents(&p));
            let _ = std::fs::remove_dir(&p);
        } else {
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            if std::fs::remove_file(&p).is_ok() {
                freed = freed.saturating_add(size);
            }
        }
    }
    freed
}

/// 删除单个文件或整个目录，成功时返回实际释放的字节数
pub fn remove_path(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    if path.is_dir() {
        let freed = clean_dir_contents(path);
        // 目录可能仍被占用而无法删除，但内部文件已清空，已释放的空间照常返回
        let _ = std::fs::remove_dir(path);
        freed
    } else {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if std::fs::remove_file(path).is_ok() {
            size
        } else {
            0
        }
    }
}

/// 默认外部命令预算。普通查询应在 30 秒内结束，避免阻塞 Tauri 线程池。
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(windows)]
const COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(50);

/// 运行外部程序并捕获 stdout；Windows 下隐藏控制台窗口。
/// 退出码非 0 或超时都会返回错误，避免调用方把失败当成功。
pub fn run_program(program: &str, args: &[&str]) -> Result<String, String> {
    run_command(program, args, &[], COMMAND_TIMEOUT)
}

/// 允许调用方为已知耗时命令（如等待卸载程序）指定更长的预算。
pub fn run_program_with_timeout(
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
    timeout: Duration,
) -> Result<String, String> {
    run_command(program, args, envs, timeout)
}

#[cfg(windows)]
fn command_output(
    program: &str,
    status: std::process::ExitStatus,
    stdout: &[u8],
    stderr: &[u8],
) -> Result<String, String> {
    if status.success() {
        return Ok(String::from_utf8_lossy(stdout).to_string());
    }
    let stderr = String::from_utf8_lossy(stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(stdout).trim().to_string();
    // PowerShell 的失败信息可能写在 stdout，优先取非空的一侧
    let detail = if stderr.is_empty() { stdout } else { stderr };
    let code = status.code().unwrap_or(-1);
    Err(if detail.is_empty() {
        format!("{} 执行失败（退出码 {}）", program, code)
    } else {
        format!("{} 执行失败（退出码 {}）：{}", program, code, detail)
    })
}

fn run_command(
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
    timeout: Duration,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::io::Read;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let mut cmd = std::process::Command::new(program);
        cmd.args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (key, value) in envs {
            cmd.env(key, value);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("无法启动 {}：{}", program, e))?;

        // 必须并发读取管道：软件列表/图标 JSON 可能远超管道缓冲区（64KB），
        // 顺序 wait 会让子进程卡在写入上，被误判成超时。
        let stdout_thread = {
            let pipe = child.stdout.take();
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(mut pipe) = pipe {
                    let _ = pipe.read_to_end(&mut buf);
                }
                buf
            })
        };
        let stderr_thread = {
            let pipe = child.stderr.take();
            std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(mut pipe) = pipe {
                    let _ = pipe.read_to_end(&mut buf);
                }
                buf
            })
        };

        let deadline = Instant::now() + timeout;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let stdout = stdout_thread.join().unwrap_or_default();
                    let stderr = stderr_thread.join().unwrap_or_default();
                    return command_output(program, status, &stdout, &stderr);
                }
                Ok(None) if Instant::now() >= deadline => {
                    let _ = child.kill();
                    let _ = child.wait();
                    // 子进程结束后管道关闭，读取线程随即退出
                    let _ = stdout_thread.join();
                    let _ = stderr_thread.join();
                    return Err(format!(
                        "{} 执行超时（{} 秒），已终止以免界面卡住",
                        program,
                        timeout.as_secs()
                    ));
                }
                Ok(None) => std::thread::sleep(COMMAND_POLL_INTERVAL),
                Err(e) => {
                    let _ = child.kill();
                    return Err(format!("等待 {} 结束失败：{}", program, e));
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (program, args, envs, timeout);
        Err(format!("{} 仅在 Windows 上可用", program))
    }
}

/// 执行 PowerShell 脚本并以 UTF-8 返回输出。
/// 默认输出编码是系统 OEM 代码页（中文系统为 GBK），直接按 UTF-8 解码会乱码，
/// 因此先统一切到 UTF-8 再运行脚本。
const PS_PRELUDE: &str =
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$ProgressPreference='SilentlyContinue';";

fn powershell_args(script: &str) -> String {
    format!("{}{}", PS_PRELUDE, script)
}

pub fn powershell(script: &str) -> Result<String, String> {
    powershell_with_timeout(script, COMMAND_TIMEOUT)
}

pub fn powershell_with_timeout(script: &str, timeout: Duration) -> Result<String, String> {
    let full = powershell_args(script);
    run_program_with_timeout(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &full,
        ],
        &[],
        timeout,
    )
}

pub fn powershell_with_env(script: &str, envs: &[(&str, &str)]) -> Result<String, String> {
    powershell_with_env_timeout(script, envs, COMMAND_TIMEOUT)
}

pub fn powershell_with_env_timeout(
    script: &str,
    envs: &[(&str, &str)],
    timeout: Duration,
) -> Result<String, String> {
    let full = powershell_args(script);
    run_program_with_timeout(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &full,
        ],
        envs,
        timeout,
    )
}

#[cfg(test)]
mod tests {
    use super::{clean_dir_contents, dir_size, expand_env_var, is_reparse_point, remove_path};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mole-win-test-{}-{}-{}", tag, std::process::id(), unique))
    }

    #[test]
    fn clean_dir_contents_returns_actual_removed_bytes() {
        let root = temp_dir("clean");
        fs::create_dir_all(root.join("sub")).expect("create temp dirs");
        fs::write(root.join("a.txt"), b"1234").expect("write a.txt");
        fs::write(root.join("sub/b.txt"), b"123456").expect("write b.txt");

        assert_eq!(dir_size(&root).0, 10);
        assert_eq!(clean_dir_contents(&root), 10);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);

        fs::remove_dir_all(root).expect("cleanup temp dirs");
    }

    #[test]
    fn clean_dir_contents_removes_readonly_file_bytes_once() {
        let root = temp_dir("nested");
        fs::create_dir_all(root.join("a/b/c")).expect("create dirs");
        fs::write(root.join("a/b/c/deep.bin"), vec![7u8; 512]).expect("write deep file");
        fs::write(root.join("top.bin"), vec![7u8; 256]).expect("write top file");

        let (size, count) = dir_size(&root);
        assert_eq!(size, 768);
        assert_eq!(count, 2);

        assert_eq!(clean_dir_contents(&root), 768);
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);

        fs::remove_dir_all(root).expect("cleanup temp dirs");
    }

    #[test]
    fn remove_path_handles_files_and_dirs() {
        let root = temp_dir("remove");
        fs::create_dir_all(root.join("sub")).expect("create dirs");
        fs::write(root.join("sub/x.bin"), vec![1u8; 100]).expect("write file");
        fs::write(root.join("single.bin"), vec![1u8; 40]).expect("write file");

        assert_eq!(remove_path(&root.join("single.bin")), 40);
        assert!(!root.join("single.bin").exists());
        assert_eq!(remove_path(&root.join("sub")), 100);
        assert!(!root.join("sub").exists());

        fs::remove_dir_all(root).expect("cleanup temp dirs");
    }

    #[test]
    fn expand_env_var_is_case_insensitive_and_replaces_all_occurrences() {
        let expanded = expand_env_var(
            r"%Temp%\a\%TEMP%\b\%temp%\c",
            "TEMP",
            r"C:\Users\Demo\AppData\Local\Temp",
        );
        assert_eq!(
            expanded,
            r"C:\Users\Demo\AppData\Local\Temp\a\C:\Users\Demo\AppData\Local\Temp\b\C:\Users\Demo\AppData\Local\Temp\c"
        );
    }

    #[test]
    fn regular_directories_are_not_reparse_points() {
        let root = temp_dir("reparse");
        fs::create_dir_all(&root).expect("create dirs");
        assert!(!is_reparse_point(&root));
        fs::remove_dir_all(root).expect("cleanup temp dirs");
    }
}
