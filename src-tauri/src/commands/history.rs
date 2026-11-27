//! 上次清理记录：只保存时间与释放量，写入应用数据目录，纯本地、不联网。

use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCleanup {
    /// Unix 秒时间戳
    pub timestamp: u64,
    pub freed: u64,
    pub deep: bool,
}

fn record_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录：{}", e))?;
    Ok(dir.join("last-cleanup.json"))
}

#[tauri::command]
pub fn get_last_cleanup(app: AppHandle) -> Result<Option<LastCleanup>, String> {
    let path = record_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("读取清理记录失败：{}", e))?;
    // 记录损坏不应让界面报错，按"无记录"处理即可
    match serde_json::from_str(&text) {
        Ok(record) => Ok(Some(record)),
        Err(e) => {
            eprintln!("清理记录解析失败，已忽略：{}", e);
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn record_cleanup(app: AppHandle, freed: u64, deep: bool) -> Result<(), String> {
    let path = record_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建数据目录失败：{}", e))?;
    }
    let record = LastCleanup {
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        freed,
        deep,
    };
    let text = serde_json::to_string(&record).map_err(|e| format!("序列化清理记录失败：{}", e))?;
    fs::write(&path, text).map_err(|e| format!("写入清理记录失败：{}", e))
}
