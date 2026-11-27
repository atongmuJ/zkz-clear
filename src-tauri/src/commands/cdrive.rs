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

/// 安全项无需风险确认，warning 留空；前端据此判断是否需要弹确认弹窗。
const SAFE_WARNING: &str = "";

fn item(
    id: &str,
    name: &str,
    description: &str,
    size: u64,
    detail: &str,
    selected: bool,
    deep: bool,
    warning: &str,
) -> CDriveItem {
    CDriveItem {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        size,
        detail: detail.to_string(),
        selected,
        deep,
        warning: warning.to_string(),
    }
}

/// 深度模式才出现的 C 盘专项：每项都写明会丢失什么，供确认弹窗逐条展示。
fn deep_cdrive_items() -> Vec<CDriveItem> {
    let delivery = dir_size(Path::new(
        "C:\\Windows\\SoftwareDistribution\\DeliveryOptimization",
    ))
    .0;
    let delivery_service = dir_size(Path::new(
        "C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization",
    ))
    .0;
    let reports = dir_size(Path::new("C:\\Windows\\LiveKernelReports")).0
        + dir_size(Path::new("C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportStore")).0;
    let logs = dir_size(Path::new("C:\\Windows\\Logs\\CBS")).0
        + dir_size(Path::new("C:\\Windows\\Logs\\DISM")).0;
    let setup = dir_size(Path::new("C:\\Windows\\Panther")).0;

    vec![
        item(
            "deep-delivery",
            "更新分发缓存",
            "传递优化下载的安装源",
            delivery + delivery_service,
            "删除后更新会重新下载",
            false,
            true,
            "将删除 Windows 更新的 P2P 分发缓存。不会卸载已安装的更新，但在带宽受限时后续更新可能变慢。",
        ),
        item(
            "deep-reports",
            "内核与错误报告",
            "崩溃转储与 WER 报告存档",
            reports,
            "删除后无法用于故障排查",
            false,
            true,
            "将删除内核崩溃转储与错误报告存档。这不包含个人文件，但一旦删除，过往蓝屏或应用崩溃的诊断记录将无法恢复。",
        ),
        item(
            "deep-logs",
            "安装维护日志",
            "CBS / DISM 组件安装日志",
            logs,
            "删除后无法追溯更新失败原因",
            false,
            true,
            "将删除组件安装与维护日志。不影响系统运行，但之后若更新失败，将缺少可用于定位问题的历史记录。",
        ),
        item(
            "deep-setup",
            "系统安装临时文件",
            "Windows 安装过程留下的临时目录",
            setup,
            "删除后无法回退本次安装过程",
            false,
            true,
            "将删除 C:\\Windows\\Panther 中的安装日志与临时文件。不会影响当前系统，但会丢失本次升级/安装的排查材料。",
        ),
    ]
}

fn get_cdrive_items_blocking(deep: bool) -> Vec<CDriveItem> {
    let winupdate = dir_size(Path::new("C:\\Windows\\SoftwareDistribution\\Download")).0;
    let hiberfil = file_size("C:\\hiberfil.sys");
    let restore = shadow_storage_size();
    let defender = dir_size(Path::new(
        "C:\\ProgramData\\Microsoft\\Windows Defender\\Quarantine",
    ))
    .0;
    let temp = dir_size(Path::new("C:\\Windows\\Temp")).0 + dir_size(&expand_env("%TEMP%")).0;
    let old_windows = dir_size(Path::new("C:\\Windows.old")).0;

    let mut result = vec![
        item("winupdate", "Windows 更新缓存", "旧版本更新安装文件与下载缓存", winupdate,
             "可安全清理，不影响系统运行", true, false, SAFE_WARNING),
        item("hiberfil", "休眠文件", "hiberfil.sys，关闭休眠后可释放", hiberfil,
             "清理后将禁用休眠功能", false, false,
             "将关闭系统休眠功能并删除 hiberfil.sys。快速启动可能失效；休眠中的会话无法恢复。个人文档不受影响。"),
        item("restore", "系统还原点", "清理旧的卷影副本，保留最近的还原点", restore,
             "建议保留至少一个还原点", false, false,
             "将删除较早的系统还原点。一旦删除，无法再通过这些还原点回退系统设置与部分程序安装。"),
        item("defender", "Defender 隔离文件", "Windows Defender 隔离区中的文件", defender,
             "清理后无法恢复隔离文件", false, false,
             "将永久删除被 Defender 隔离的可疑文件，无法从隔离区恢复。若其中有误判文件也会一并丢失。"),
        item("tempwin", "C 盘临时文件", "系统与应用产生的临时文件", temp,
             "可安全清理", true, false, SAFE_WARNING),
        item("oldwindows", "Windows.old", "旧系统安装备份", old_windows,
             "清理后无法回退到旧版本", false, false,
             "将永久删除旧版本 Windows 的完整备份，包括旧系统中的用户配置文件。删除后无法回退到升级前的系统。"),
    ];

    if deep {
        result.extend(deep_cdrive_items());
    }
    result
}

fn clean_cdrive_blocking(item_ids: Vec<String>, deep: bool) -> CleanOutcome {
    let mut freed = 0u64;
    let mut skipped: Vec<String> = Vec::new();

    // 安全护栏：深度项只在 deep=true 时执行，避免绕过确认弹窗直接调用命令
    let allowed: Vec<CDriveItem> = get_cdrive_items_blocking(deep)
        .into_iter()
        .filter(|i| !i.deep || deep)
        .collect();

    for id in item_ids.iter() {
        if !allowed.iter().any(|i| &i.id == id) {
            skipped.push(id.clone());
            continue;
        }
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
            // 深度项：全部是可再生缓存 / 日志 / 报告，不涉及用户文档
            "deep-delivery" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\SoftwareDistribution\\DeliveryOptimization",
                )));
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization",
                )));
            }
            "deep-reports" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\LiveKernelReports",
                )));
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportStore",
                )));
            }
            "deep-logs" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\Logs\\CBS",
                )));
                freed = freed.saturating_add(clean_dir_contents(Path::new(
                    "C:\\Windows\\Logs\\DISM",
                )));
            }
            "deep-setup" => {
                freed = freed.saturating_add(clean_dir_contents(Path::new("C:\\Windows\\Panther")));
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
pub async fn get_cdrive_items(deep: bool) -> Result<Vec<CDriveItem>, String> {
    tauri::async_runtime::spawn_blocking(move || get_cdrive_items_blocking(deep))
        .await
        .map_err(|e| format!("分析 C 盘异常中断：{}", e))
}

#[tauri::command]
pub async fn clean_cdrive(item_ids: Vec<String>, deep: bool) -> Result<CleanOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || clean_cdrive_blocking(item_ids, deep))
        .await
        .map_err(|e| format!("C 盘清理异常中断：{}", e))
}

#[cfg(test)]
mod tests {
    use super::deep_cdrive_items;

    #[test]
    fn deep_items_declare_explicit_warnings() {
        let items = deep_cdrive_items();
        assert!(!items.is_empty());
        for item in items {
            assert!(item.deep, "深度项必须标记 deep");
            assert!(
                item.warning.len() >= 20,
                "深度项 '{}' 缺少明确的风险须知",
                item.id
            );
            assert!(
                !item.warning.contains("个人文档不受影响")
                    || item.id == "deep-delivery",
                "风险须知必须如实说明影响"
            );
        }
    }
}
