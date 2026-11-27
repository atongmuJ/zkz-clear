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
