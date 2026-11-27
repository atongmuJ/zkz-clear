mod commands;
mod models;
mod platform;

use commands::{
    analyze::{get_disks, get_folder_usage, get_large_files},
    cdrive::{clean_cdrive, get_cdrive_items},
    cleanup::{clean_junk, scan_junk},
    history::{get_last_cleanup, record_cleanup},
    optimize::{get_startup_items, set_startup_enabled},
    system::{get_system_status, open_path},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_junk,
            clean_junk,
            get_last_cleanup,
            record_cleanup,
            get_startup_items,
            set_startup_enabled,
            get_disks,
            get_large_files,
            get_folder_usage,
            get_cdrive_items,
            clean_cdrive,
            get_system_status,
            open_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running 张开嘴清理 application");
}
