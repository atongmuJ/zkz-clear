use std::path::Path;

use crate::models::{CDriveItem, CleanOutcome};
use crate::platform::{
    clean_dir_contents, dir_size, expand_env, powershell, remove_path, run_program,
};

fn file_size(path: &str) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn parse_size_with_unit(text: &str) -> u64 {
    let parts: Vec<&str> = text.split_whitespace().collect();
    if parts.len() < 2 {
        return 0;
    }
    let value = parts[0].replace(',', "").parse::<f64>().unwrap_or(0.0);
    let factor = match parts[1].to_uppercase().as_str() {
        "KB" => 1024f64,
        "MB" => 1024f64 * 1024f64,
        "GB" => 1024f64 * 1024f64 * 1024f64,
        "TB" => 1024f64 * 1024f64 * 1024f64 * 1024f64,
        _ => 1f64,
    };
    (value * factor) as u64
}

/// 卷影副本占用。优先用 CIM 查询（与系统语言无关），
/// 失败时回退到 vssadmin 的英文输出。
fn shadow_storage_size() -> u64 {
    let cim = powershell(
        "$s = Get-CimInstance Win32_ShadowStorage -ErrorAction SilentlyContinue | Measure-Object -Property UsedSpace -Sum; [uint64]$s.Sum",
    )
    .unwrap_or_default();
    if let Ok(value) = cim.trim().parse::<u64>() {
        if value > 0 {
            return value;
        }
    }

    let output = run_program("vssadmin", &["list", "shadowstorage"]).unwrap_or_default();
    for line in output.lines() {
        if line.contains("Used shadow copy storage space") {
            if let Some(value) = line.split(':').nth(1) {
                return parse_size_with_unit(value.trim());
            }
        }
    }
    0
}

fn get_cdrive_items_blocking() -> Vec<CDriveItem> {
    let winupdate = dir_size(Path::new("C:\\Windows\\SoftwareDistribution\\Download")).0;
    let hiberfil = file_size("C:\\hiberfil.sys");
    let restore = shadow_storage_size();
    let defender = dir_size(Path::new(
        "C:\\ProgramData\\Microsoft\\Windows Defender\\Quarantine",
    ))
    .0;
    let temp = dir_size(Path::new("C:\\Windows\\Temp")).0 + dir_size(&expand_env("%TEMP%")).0;
    let old_windows = dir_size(Path::new("C:\\Windows.old")).0;

    vec![
        CDriveItem {
            id: "winupdate".to_string(),
            name: "Windows 更新缓存".to_string(),
            description: "旧版本更新安装文件与下载缓存".to_string(),
            size: winupdate,
            detail: "可安全清理，不影响系统运行".to_string(),
            selected: true,
        },
        CDriveItem {
            id: "hiberfil".to_string(),
            name: "休眠文件".to_string(),
            description: "hiberfil.sys，关闭休眠后可释放".to_string(),
            size: hiberfil,
            detail: "清理后将禁用休眠功能".to_string(),
            selected: false,
        },
        CDriveItem {
            id: "restore".to_string(),
            name: "系统还原点".to_string(),
            description: "清理旧的卷影副本，保留最近的还原点".to_string(),
            size: restore,
            detail: "建议保留至少一个还原点".to_string(),
            selected: false,
        },
        CDriveItem {
            id: "defender".to_string(),
            name: "Defender 隔离文件".to_string(),
            description: "Windows Defender 隔离区中的文件".to_string(),
            size: defender,
            detail: "清理后无法恢复隔离文件".to_string(),
            selected: false,
        },
        CDriveItem {
            id: "tempwin".to_string(),
            name: "C 盘临时文件".to_string(),
            description: "系统与应用产生的临时文件".to_string(),
            size: temp,
            detail: "可安全清理".to_string(),
            selected: true,
        },
        CDriveItem {
            id: "oldwindows".to_string(),
            name: "Windows.old".to_string(),
            description: "旧系统安装备份".to_string(),
            size: old_windows,
            detail: "清理后无法回退到旧版本".to_string(),
            selected: false,
        },
    ]
}

fn clean_cdrive_blocking(item_ids: Vec<String>) -> CleanOutcome {
    let mut freed = 0u64;
    let mut skipped: Vec<String> = Vec::new();

    for id in item_ids.iter() {
        let before = freed;
        match id.as_str() {
            "winupdate" => {
                let _ = run_program("net", &["stop", "wuauserv"]);
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\SoftwareDistribution\\Download",
                )));
                let _ = run_program("net", &["start", "wuauserv"]);
            }
            "hiberfil" => {
                // 只有 powercfg 真正成功时才计入释放量，普通用户会因权限不足而失败
                let size = file_size("C:\\hiberfil.sys");
                if size > 0 && run_program("powercfg", &["-h", "off"]).is_ok() {
                    freed = freed.saturating_add(size);
                }
            }
            "restore" => {
                let before = shadow_storage_size();
                let _ = run_program(
                    "vssadmin",
                    &["delete", "shadows", "/for=C:", "/oldest", "/quiet"],
                );
                let after = shadow_storage_size();
                freed = freed.saturating_add(before.saturating_sub(after));
            }
            "defender" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\ProgramData\\Microsoft\\Windows Defender\\Quarantine",
                )));
            }
            "tempwin" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new("C:\\Windows\\Temp")));
                freed = freed.saturating_add(clean_dir_contents(&expand_env("%TEMP%")));
            }
            "oldwindows" => {
                freed = freed.saturating_add(remove_path(Path::new("C:\\Windows.old")));
            }
            _ => {}
        }
        if freed == before {
            skipped.push(id.clone());
        }
    }

    CleanOutcome { freed, skipped }
}

#[tauri::command]
pub async fn get_cdrive_items() -> Result<Vec<CDriveItem>, String> {
    tauri::async_runtime::spawn_blocking(get_cdrive_items_blocking)
        .await
        .map_err(|e| format!("分析 C 盘异常中断：{}", e))
}

#[tauri::command]
pub async fn clean_cdrive(item_ids: Vec<String>) -> Result<CleanOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || clean_cdrive_blocking(item_ids))
        .await
        .map_err(|e| format!("C 盘清理异常中断：{}", e))
}
