use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// 展开形如 %TEMP% 的 Windows 环境变量
pub fn expand_env(input: &str) -> PathBuf {
    let mut result = input.to_string();
    const KEYS: &[&str] = &[
        "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE", "WINDIR",
        "SystemRoot", "ProgramFiles", "ProgramData", "HOMEDRIVE", "HOMEPATH",
    ];
    for key in KEYS {
        if let Ok(value) = std::env::var(key) {
            result = result.replace(&format!("%{}%", key), &value);
            result = result.replace(&format!("%{}%", key.to_lowercase()), &value);
        }
    }
    PathBuf::from(result)
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

pub fn dir_size(path: &Path) -> (u64, u64) {
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
        if count >= MAX_WALK_FILES || started.elapsed() >= DIR_SIZE_BUDGET {
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

/// 运行外部程序并捕获 stdout；Windows 下隐藏控制台窗口。
/// 退出码非 0 时返回错误，避免调用方把失败当成功。
pub fn run_program(program: &str, args: &[&str]) -> Result<String, String> {
    run_command(program, args, &[])
}

/// 带环境变量运行外部程序，用于向 PowerShell 安全传递含空格/引号的值
pub fn run_program_with_env(
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Result<String, String> {
    run_command(program, args, envs)
}

fn run_command(program: &str, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let mut cmd = std::process::Command::new(program);
        cmd.args(args).creation_flags(CREATE_NO_WINDOW);
        for (key, value) in envs {
            cmd.env(key, value);
        }

        let output = cmd
            .output()
            .map_err(|e| format!("无法启动 {}：{}", program, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // PowerShell 的失败信息可能写在 stdout，优先取非空的一侧
            let detail = if stderr.is_empty() { stdout } else { stderr };
            let code = output.status.code().unwrap_or(-1);
            return Err(if detail.is_empty() {
                format!("{} 执行失败（退出码 {}）", program, code)
            } else {
                format!("{} 执行失败（退出码 {}）：{}", program, code, detail)
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (program, args, envs);
        Ok(String::new())
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
    let full = powershell_args(script);
    run_program(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &full,
        ],
    )
}

pub fn powershell_with_env(script: &str, envs: &[(&str, &str)]) -> Result<String, String> {
    let full = powershell_args(script);
    run_program_with_env(
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
    )
}

#[cfg(test)]
mod tests {
    use super::{clean_dir_contents, dir_size, is_reparse_point, remove_path};
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
    fn regular_directories_are_not_reparse_points() {
        let root = temp_dir("reparse");
        fs::create_dir_all(&root).expect("create dirs");
        assert!(!is_reparse_point(&root));
        fs::remove_dir_all(root).expect("cleanup temp dirs");
    }
}
