#[cfg(windows)]
use std::path::Path;

use crate::commands::analyze::get_disks_blocking;
use crate::models::SystemStatus;
use crate::platform::powershell;

fn get_system_status_blocking() -> SystemStatus {
    let script = r#"
        $os = Get-CimInstance Win32_OperatingSystem
        $cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        $total = [math]::Round($os.TotalVisibleMemorySize / 1024)
        $free = [math]::Round($os.FreePhysicalMemory / 1024)
        $uptime = (Get-Date) - $os.LastBootUpTime
        "CPU=$cpu;TOTAL=$total;FREE=$free;CAPTION=$($os.Caption);DAYS=$([int]$uptime.TotalDays);HOURS=$($uptime.Hours)"
    "#;

    let output = powershell(script).unwrap_or_default();
    let mut cpu = 0u32;
    let mut total_mb = 0u64;
    let mut free_mb = 0u64;
    let mut caption = "Windows".to_string();
    let mut days = 0u64;
    let mut hours = 0u64;

    for part in output.split(';') {
        let mut kv = part.trim().splitn(2, '=');
        let key = kv.next().unwrap_or("").trim();
        let value = kv.next().unwrap_or("").trim();
        match key {
            "CPU" => cpu = value.parse::<f64>().unwrap_or(0.0) as u32,
            "TOTAL" => total_mb = value.parse::<u64>().unwrap_or(0),
            "FREE" => free_mb = value.parse::<u64>().unwrap_or(0),
            "CAPTION" => {
                if !value.is_empty() {
                    caption = value.to_string();
                }
            }
            "DAYS" => days = value.parse::<u64>().unwrap_or(0),
            "HOURS" => hours = value.parse::<u64>().unwrap_or(0),
            _ => {}
        }
    }

    let memory_total = total_mb.saturating_mul(1024 * 1024);
    let memory_free = free_mb.min(total_mb).saturating_mul(1024 * 1024);
    let memory_used = memory_total.saturating_sub(memory_free);

    let disks = get_disks_blocking();
    let c_drive = disks.iter().find(|d| d.name.to_uppercase().starts_with("C:"));

    SystemStatus {
        cpu_usage: cpu.min(100),
        memory_used,
        memory_total,
        disk_used: c_drive.map(|d| d.used).unwrap_or(0),
        disk_total: c_drive.map(|d| d.total).unwrap_or(0),
        uptime: format!("{} 天 {} 小时", days, hours),
        os_version: caption,
    }
}

#[tauri::command]
pub async fn get_system_status() -> Result<SystemStatus, String> {
    tauri::async_runtime::spawn_blocking(get_system_status_blocking)
        .await
        .map_err(|e| format!("读取系统状态异常中断：{}", e))
}

#[tauri::command]
pub async fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let is_dir = Path::new(&path).is_dir();
        let mut cmd = std::process::Command::new("explorer");
        if is_dir {
            cmd.arg(&path);
        } else {
            // 对文件使用 /select 只定位不执行，避免误运行可执行文件
            cmd.arg(format!("/select,{}", path));
        }
        cmd.creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("无法打开所在位置：{}", e))?;
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
    Ok(())
}
