use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use crate::models::{DiskInfo, FolderUsage, LargeFile};
use crate::platform::{dir_size, expand_env, powershell, run_program};

fn parse_disk_line(line: &str) -> Option<DiskInfo> {
    let parts: Vec<&str> = line.trim().split('|').collect();
    if parts.len() != 3 {
        return None;
    }
    let total = parts[1].parse::<u64>().ok()?;
    let free = parts[2].parse::<u64>().ok()?;
    Some(DiskInfo {
        name: parts[0].to_string(),
        total,
        used: total.saturating_sub(free),
        free,
    })
}

fn disks_via_fsutil() -> Vec<DiskInfo> {
    let mut disks = Vec::new();
    for letter in b'C'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if !PathBuf::from(&root).exists() {
            continue;
        }
        let output =
            run_program("fsutil", &["volume", "diskfree", root.as_str()]).unwrap_or_default();
        let mut total = 0u64;
        let mut free = 0u64;
        for line in output.lines() {
            let mut parts = line.splitn(2, ':');
            let label = parts.next().unwrap_or("").to_lowercase();
            let value = parts
                .next()
                .unwrap_or("")
                .trim()
                .replace(',', "")
                .parse::<u64>()
                .unwrap_or(0);
            if label.contains("total # of bytes") && !label.contains("free") {
                total = value;
            }
            if label.contains("free bytes") {
                free = value;
            }
        }
        if total > 0 {
            disks.push(DiskInfo {
                name: root,
                total,
                used: total.saturating_sub(free),
                free,
            });
        }
    }
    disks
}

/// 供系统状态等内部调用复用，避免嵌套异步命令
pub(crate) fn get_disks_blocking() -> Vec<DiskInfo> {
    let script = "Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DriveType -eq 3} | ForEach-Object { \"$($_.DeviceID)|$($_.Size)|$($_.FreeSpace)\" }";
    let output = powershell(script).unwrap_or_default();
    let disks: Vec<DiskInfo> = output.lines().filter_map(parse_disk_line).collect();
    if disks.is_empty() {
        disks_via_fsutil()
    } else {
        disks
    }
}

#[tauri::command]
pub async fn get_disks() -> Result<Vec<DiskInfo>, String> {
    tauri::async_runtime::spawn_blocking(get_disks_blocking)
        .await
        .map_err(|e| format!("读取磁盘信息异常中断：{}", e))
}

fn format_date(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    if month <= 2 {
        year += 1;
    }
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn large_files_in(root: &Path, threshold: u64) -> Vec<LargeFile> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .max_depth(5)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !crate::platform::is_reparse_point(e.path()))
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() < threshold {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| format_date(d.as_secs()))
            .unwrap_or_default();
        files.push(LargeFile {
            path: entry.path().to_string_lossy().to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            size: meta.len(),
            modified,
        });
    }
    files
}

fn get_large_files_blocking() -> Vec<LargeFile> {
    let profile = expand_env("%USERPROFILE%");
    let mut roots: Vec<PathBuf> = ["Downloads", "Desktop", "Documents", "Videos", "Pictures"]
        .iter()
        .map(|sub| profile.join(sub))
        .collect();

    for letter in b'D'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\", letter as char));
        if root.exists() {
            roots.push(root);
            break;
        }
    }

    let threshold = 100u64 * 1024 * 1024;
    let collected: Mutex<Vec<LargeFile>> = Mutex::new(Vec::new());

    // 各扫描根目录互不依赖，并发遍历可显著缩短多盘扫描耗时。
    std::thread::scope(|scope| {
        for root in &roots {
            let collected = &collected;
            scope.spawn(move || {
                let found = large_files_in(root, threshold);
                if let Ok(mut all) = collected.lock() {
                    all.extend(found);
                }
            });
        }
    });

    let mut files = collected.into_inner().unwrap_or_default();
    files.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.path.cmp(&b.path)));
    files.truncate(10);
    files
}

#[tauri::command]
pub async fn get_large_files() -> Result<Vec<LargeFile>, String> {
    tauri::async_runtime::spawn_blocking(get_large_files_blocking)
        .await
        .map_err(|e| format!("扫描大文件异常中断：{}", e))
}

fn get_folder_usage_blocking() -> Vec<FolderUsage> {
    let specs: [(&str, &str); 4] = [
        ("C:\\Users", "用户文件"),
        ("C:\\Program Files", "程序文件"),
        ("C:\\Windows", "Windows 系统"),
        ("C:\\ProgramData", "程序数据"),
    ];

    let sizes: Mutex<Vec<(usize, u64)>> = Mutex::new(Vec::new());
    std::thread::scope(|scope| {
        for (idx, (path, _)) in specs.iter().enumerate() {
            let sizes = &sizes;
            scope.spawn(move || {
                let (size, _) = dir_size(Path::new(*path));
                if let Ok(mut results) = sizes.lock() {
                    results.push((idx, size));
                }
            });
        }
    });

    let mut measured = vec![0u64; specs.len()];
    if let Ok(results) = sizes.into_inner() {
        for (idx, size) in results {
            if idx < measured.len() {
                measured[idx] = size;
            }
        }
    }

    let mut raw: Vec<(&str, &str, u64)> = Vec::new();
    let mut total = 0u64;
    for ((path, name), size) in specs.iter().zip(measured.iter().copied()) {
        total = total.saturating_add(size);
        raw.push((*path, *name, size));
    }

    raw.into_iter()
        .map(|(path, name, size)| FolderUsage {
            path: path.to_string(),
            name: name.to_string(),
            size,
            percent: if total > 0 {
                size as f64 / total as f64 * 100.0
            } else {
                0.0
            },
        })
        .collect()
}

#[tauri::command]
pub async fn get_folder_usage() -> Result<Vec<FolderUsage>, String> {
    tauri::async_runtime::spawn_blocking(get_folder_usage_blocking)
        .await
        .map_err(|e| format!("统计目录占用异常中断：{}", e))
}

#[cfg(test)]
mod tests {
    use super::{format_date, parse_disk_line};

    #[test]
    fn formats_known_epoch_days() {
        assert_eq!(format_date(0), "1970-01-01");
        assert_eq!(format_date(19_782 * 86_400), "2024-02-29");
    }

    #[test]
    fn parses_disk_line_with_pipes() {
        let disk = parse_disk_line("C:|500107862016|123456789012").expect("valid line");
        assert_eq!(disk.name, "C:");
        assert_eq!(disk.total, 500_107_862_016);
        assert_eq!(disk.used, 500_107_862_016 - 123_456_789_012);
        assert!(parse_disk_line("garbage").is_none());
    }
}
