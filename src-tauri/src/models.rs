use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanItem {
    pub id: String,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub count: u64,
    pub category_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub items: Vec<CleanItem>,
    pub total_size: u64,
    pub risk: String,
    /// 仅在深度清理模式下出现的分类，需要用户确认风险后才能清理
    pub deep: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub progress: u8,
    pub found: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    pub name: String,
    pub command: String,
    pub location: String,
    pub enabled: bool,
    pub publisher: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub total: u64,
    pub used: u64,
    pub free: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderUsage {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CDriveItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size: u64,
    pub detail: String,
    pub selected: bool,
    /// 深度清理项：需用户确认风险后方可执行
    pub deep: bool,
    /// 该项删除后可能受影响的数据或配置，用于确认弹窗逐条展示
    pub warning: String,
    /// 该项是否需要管理员权限才能清理成功（如 powercfg / vssadmin / Windows.old）
    pub needs_admin: bool,
}

/// 单个清理分类/项目的实际释放量，用于完成态展示分项明细。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanDetail {
    pub name: String,
    pub freed: u64,
    pub deep: bool,
}

/// 清理结果。`skipped` 记录未释放任何空间的项目，
/// 通常是权限不足或文件正被占用，前端据此提示而不是谎报成功。
/// `details` 逐分类记录实际释放量，让完成反馈可核对。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanOutcome {
    pub freed: u64,
    pub skipped: Vec<String>,
    pub details: Vec<CleanDetail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub cpu_usage: u32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    pub uptime: String,
    pub os_version: String,
}

/// 注册表中登记的一个 Win32 已安装应用。
/// `size_source` 说明占用空间的来源，避免把注册表估算值伪装成实测值。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSoftware {
    pub id: String,
    pub name: String,
    pub version: String,
    pub publisher: String,
    pub install_location: String,
    pub size: u64,
    pub size_source: String,
    pub path_exists: bool,
    pub registry_key: String,
    pub uninstall_string: String,
    pub quiet_uninstall_string: String,
    pub can_uninstall: bool,
    pub source: String,
}

/// 强力卸载前展示给用户确认的单个清理目标。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTarget {
    pub id: String,
    pub name: String,
    pub path: String,
    pub kind: String,
    pub risk: String,
    pub required: bool,
    pub selected: bool,
    pub exists: bool,
    pub size: u64,
    pub reason: String,
}

/// 强力卸载的预览计划：用户必须看到路径与清理范围后才能确认。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareCleanupPlan {
    pub app_name: String,
    pub install_location: String,
    pub uninstall_command: String,
    pub silent_switch: String,
    pub targets: Vec<CleanupTarget>,
    pub warnings: Vec<String>,
}

/// 单个清理目标的执行结果，用于把无权限、路径不存在、卸载失败明确反馈给用户。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupTargetResult {
    pub id: String,
    pub name: String,
    pub status: String,
    pub freed: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftwareUninstallOutcome {
    pub app_name: String,
    pub mode: String,
    pub success: bool,
    pub message: String,
    pub freed: u64,
    pub results: Vec<CleanupTargetResult>,
    pub needs_restart: bool,
}
