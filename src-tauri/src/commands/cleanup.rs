use std::path::{Path, PathBuf};
use tauri::ipc::Channel;

use crate::models::{CleanCategory, CleanItem, ScanProgress};
use crate::platform::{clean_dir_contents, dir_size, expand_env, remove_path};

/// 清理方式：清空目录内容，或删除指定文件
#[derive(Clone, Copy)]
enum ClearMode {
    Contents,
    Files,
}

/// 一个清理项可以覆盖多个真实路径（例如 Chrome 的多个用户配置目录），
/// 但对界面只暴露一个名字，避免列表被十几个缓存子目录淹没。
struct Target {
    name: String,
    paths: Vec<PathBuf>,
    mode: ClearMode,
}

impl Target {
    fn new(name: impl Into<String>, mode: ClearMode, paths: Vec<PathBuf>) -> Self {
        Self {
            name: name.into(),
            paths: dedup_paths(paths),
            mode,
        }
    }

    fn measure(&self) -> (u64, u64) {
        let mut size = 0u64;
        let mut count = 0u64;
        for path in &self.paths {
            match self.mode {
                ClearMode::Contents => {
                    let (path_size, path_count) = dir_size(path);
                    size = size.saturating_add(path_size);
                    count = count.saturating_add(path_count);
                }
                ClearMode::Files => {
                    if let Ok(meta) = std::fs::metadata(path) {
                        if meta.is_file() {
                            size = size.saturating_add(meta.len());
                            count = count.saturating_add(1);
                        }
                    }
                }
            }
        }
        (size, count)
    }

    fn clear(&self) -> u64 {
        let mut freed = 0u64;
        for path in &self.paths {
            let removed = match self.mode {
                ClearMode::Contents => clean_dir_contents(path),
                ClearMode::Files => remove_path(path),
            };
            freed = freed.saturating_add(removed);
        }
        freed
    }

    fn display_path(&self) -> String {
        self.paths
            .first()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    }
}

struct CategorySpec {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    icon: &'static str,
    risk: &'static str,
    targets: Vec<Target>,
}

fn dedup_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut unique: Vec<PathBuf> = Vec::with_capacity(paths.len());
    for path in paths {
        if !unique.iter().any(|existing| existing == &path) {
            unique.push(path);
        }
    }
    unique
}

/// Chromium 系浏览器（Edge / Chrome）的缓存目录。
/// 只取各用户配置下的缓存子目录，绝不触碰书签、密码、历史等数据文件。
fn chromium_cache_dirs(user_data: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let Ok(entries) = std::fs::read_dir(user_data) else {
        return dirs;
    };
    for entry in entries.flatten() {
        let profile_name = entry.file_name().to_string_lossy().to_string();
        if profile_name != "Default" && !profile_name.starts_with("Profile ") {
            continue;
        }
        let profile_dir = entry.path();
        if !profile_dir.is_dir() {
            continue;
        }
        for sub in ["Cache", "Code Cache", "GPUCache"] {
            let cache_dir = profile_dir.join(sub);
            if cache_dir.is_dir() {
                dirs.push(cache_dir);
            }
        }
    }
    dirs
}

/// Firefox 的缓存只存在于各配置目录下的 cache2 子目录。
/// 注意：`Profiles` 根目录同时存放书签与登录信息，绝不能整体清空。
fn firefox_cache_dirs() -> Vec<PathBuf> {
    let base = expand_env("%LOCALAPPDATA%\\Mozilla\\Firefox\\Profiles");
    let mut dirs = Vec::new();
    let Ok(entries) = std::fs::read_dir(&base) else {
        return dirs;
    };
    for entry in entries.flatten() {
        let cache_dir = entry.path().join("cache2");
        if cache_dir.is_dir() {
            dirs.push(cache_dir);
        }
    }
    dirs
}

/// 回收站按用户 SID 分目录存放。只清空 SID 目录内部，
/// 保留 SID 目录本身，否则资源管理器会重建并可能丢失回收站配置。
fn recycle_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for letter in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\$Recycle.Bin", letter as char));
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("S-1-") && entry.path().is_dir() {
                dirs.push(entry.path());
            }
        }
    }
    dirs
}

/// 缩略图与图标缓存是 Explorer 目录下的独立数据库文件，
/// 只删这些文件，目录里的其它内容保持不动。
fn thumbnail_cache_files() -> Vec<PathBuf> {
    let base = expand_env("%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer");
    let mut files = Vec::new();
    let Ok(entries) = std::fs::read_dir(&base) else {
        return files;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.starts_with("thumbcache_") || name.starts_with("iconcache_") {
            files.push(entry.path());
        }
    }
    files
}

fn browser_targets() -> Vec<Target> {
    vec![
        Target::new(
            "Microsoft Edge 缓存",
            ClearMode::Contents,
            chromium_cache_dirs(&expand_env(
                "%LOCALAPPDATA%\\Microsoft\\Edge\\User Data",
            )),
        ),
        Target::new(
            "Google Chrome 缓存",
            ClearMode::Contents,
            chromium_cache_dirs(&expand_env("%LOCALAPPDATA%\\Google\\Chrome\\User Data")),
        ),
        Target::new(
            "Firefox 缓存",
            ClearMode::Contents,
            firefox_cache_dirs(),
        ),
    ]
}

fn build_specs() -> Vec<CategorySpec> {
    vec![
        CategorySpec {
            id: "temp",
            name: "系统临时文件",
            description: "Windows 与应用程序产生的临时文件",
            icon: "temp",
            risk: "safe",
            targets: vec![Target::new(
                "临时文件目录",
                ClearMode::Contents,
                vec![
                    PathBuf::from("C:\\Windows\\Temp"),
                    expand_env("%TEMP%"),
                ],
            )],
        },
        CategorySpec {
            id: "browser",
            name: "浏览器缓存",
            description: "Edge / Chrome / Firefox 的网页缓存",
            icon: "browser",
            risk: "safe",
            targets: browser_targets(),
        },
        CategorySpec {
            id: "recycle",
            name: "回收站",
            description: "已删除但仍占用磁盘空间的文件",
            icon: "trash",
            risk: "safe",
            targets: vec![Target::new(
                "回收站内容",
                ClearMode::Contents,
                recycle_bin_dirs(),
            )],
        },
        CategorySpec {
            id: "logs",
            name: "日志与崩溃转储",
            description: "系统日志、崩溃报告与预取记录",
            icon: "log",
            risk: "notice",
            targets: vec![
                Target::new(
                    "系统日志",
                    ClearMode::Contents,
                    vec![PathBuf::from("C:\\Windows\\Logs")],
                ),
                Target::new(
                    "崩溃转储",
                    ClearMode::Contents,
                    vec![
                        expand_env("%LOCALAPPDATA%\\CrashDumps"),
                        PathBuf::from("C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportQueue"),
                        PathBuf::from("C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive"),
                    ],
                ),
                Target::new(
                    "预取记录",
                    ClearMode::Contents,
                    vec![PathBuf::from("C:\\Windows\\Prefetch")],
                ),
            ],
        },
        CategorySpec {
            id: "thumb",
            name: "缩略图缓存",
            description: "文件资源管理器的图片预览缓存",
            icon: "image",
            risk: "safe",
            targets: vec![Target::new(
                "缩略图数据库",
                ClearMode::Files,
                thumbnail_cache_files(),
            )],
        },
    ]
}

fn emit(channel: &Channel<ScanProgress>, phase: String, progress: u8, found: u64, size: u64) {
    let _ = channel.send(ScanProgress {
        phase,
        progress,
        found,
        size,
    });
}

fn scan_blocking(channel: Channel<ScanProgress>) -> Vec<CleanCategory> {
    let specs = build_specs();
    let total = specs.len().max(1) as f32;
    let mut categories = Vec::with_capacity(specs.len());
    let mut found_total = 0u64;
    let mut size_total = 0u64;

    for (idx, spec) in specs.iter().enumerate() {
        emit(
            &channel,
            format!("正在扫描{}…", spec.name),
            ((idx as f32 / total) * 100.0) as u8,
            found_total,
            size_total,
        );

        let mut items = Vec::with_capacity(spec.targets.len());
        let mut category_total = 0u64;

        for (item_idx, target) in spec.targets.iter().enumerate() {
            let (size, count) = target.measure();
            items.push(CleanItem {
                id: format!("{}-{}", spec.id, item_idx),
                name: target.name.clone(),
                path: target.display_path(),
                size,
                count,
                category_id: spec.id.to_string(),
            });
            category_total = category_total.saturating_add(size);
            found_total = found_total.saturating_add(count);
            size_total = size_total.saturating_add(size);
        }

        categories.push(CleanCategory {
            id: spec.id.to_string(),
            name: spec.name.to_string(),
            description: spec.description.to_string(),
            icon: spec.icon.to_string(),
            items,
            total_size: category_total,
            risk: spec.risk.to_string(),
        });

        emit(
            &channel,
            format!("正在扫描{}…", spec.name),
            (((idx + 1) as f32 / total) * 100.0).min(100.0) as u8,
            found_total,
            size_total,
        );
    }

    emit(&channel, "扫描完成".to_string(), 100, found_total, size_total);
    categories
}

/// 扫描在阻塞线程池中执行，避免目录遍历阻塞界面线程导致窗口卡死
#[tauri::command]
pub async fn scan_junk(channel: Channel<ScanProgress>) -> Result<Vec<CleanCategory>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_blocking(channel))
        .await
        .map_err(|e| format!("扫描任务异常中断：{}", e))
}

#[tauri::command]
pub async fn clean_junk(category_ids: Vec<String>) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let specs = build_specs();
        let mut freed = 0u64;
        for spec in &specs {
            if !category_ids.iter().any(|id| id == spec.id) {
                continue;
            }
            for target in &spec.targets {
                freed = freed.saturating_add(target.clear());
            }
        }
        freed
    })
    .await
    .map_err(|e| format!("清理任务异常中断：{}", e))
}

#[cfg(test)]
mod tests {
    use super::{chromium_cache_dirs, dedup_paths, Target, ClearMode};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("mole-win-clean-{}-{}-{}", tag, std::process::id(), unique))
    }

    #[test]
    fn chromium_caches_only_picks_cache_subdirs() {
        let root = temp_dir("chromium");
        let profile = root.join("Default");
        fs::create_dir_all(profile.join("Cache")).expect("create cache");
        fs::create_dir_all(profile.join("Code Cache")).expect("create code cache");
        fs::write(profile.join("Bookmarks"), b"keep me").expect("write bookmarks");
        fs::write(profile.join("Login Data"), b"keep me").expect("write login data");

        let dirs = chromium_cache_dirs(&root);
        assert!(dirs.contains(&profile.join("Cache")));
        assert!(dirs.contains(&profile.join("Code Cache")));
        assert!(!dirs.iter().any(|p| p.ends_with("Bookmarks")));
        assert!(!dirs.iter().any(|p| p.ends_with("Login Data")));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn files_mode_reports_size_without_touching_directory() {
        let root = temp_dir("files");
        fs::create_dir_all(&root).expect("create dir");
        let keep = root.join("keep.txt");
        let drop_me = root.join("thumbcache_32.db");
        fs::write(&keep, b"keep").expect("write keep");
        fs::write(&drop_me, b"123456").expect("write cache");

        let target = Target::new("缩略图", ClearMode::Files, vec![drop_me.clone()]);
        assert_eq!(target.measure(), (6, 1));
        assert_eq!(target.clear(), 6);
        assert!(!drop_me.exists());
        assert!(keep.exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn duplicate_paths_are_collapsed() {
        let paths = vec![
            PathBuf::from("C:\\Temp"),
            PathBuf::from("C:\\Temp"),
            PathBuf::from("D:\\Temp"),
        ];
        assert_eq!(dedup_paths(paths).len(), 2);
    }
}
