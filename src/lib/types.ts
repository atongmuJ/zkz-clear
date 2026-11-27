export type TabKey =
  | "clean" | "optimize" | "analyze" | "cdrive" | "software" | "status" | "about";

export interface CleanItem {
  id: string;
  name: string;
  path: string;
  size: number;
  count: number;
  categoryId: string;
}

export interface CleanCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  items: CleanItem[];
  totalSize: number;
  risk: "safe" | "notice" | "deep";
  /** 深度清理模式专属分类 */
  deep: boolean;
}

export interface ScanProgress {
  phase: string;
  progress: number;
  found: number;
  size: number;
}

export interface StartupItem {
  name: string;
  command: string;
  location: string;
  enabled: boolean;
  publisher: string;
}

export interface DiskInfo {
  name: string;
  total: number;
  used: number;
  free: number;
}

export interface LargeFile {
  path: string;
  name: string;
  size: number;
  modified: string;
}

export interface FolderUsage {
  path: string;
  name: string;
  size: number;
  percent: number;
}

export interface CDriveItem {
  id: string;
  name: string;
  description: string;
  size: number;
  detail: string;
  selected: boolean;
  /** 深度清理项 */
  deep: boolean;
  /** 该删除项的风险须知 */
  warning: string;
  /** 是否需要管理员权限才能清理成功 */
  needsAdmin: boolean;
}

/** 深度清理风险须知条目 */
export interface DeepWarning {
  name: string;
  warning: string;
}

export interface SystemStatus {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  uptime: string;
  osVersion: string;
}

/** 上次清理的本地记录 */
export interface LastCleanup {
  timestamp: number;
  freed: number;
  deep: boolean;
}

/** 清理结果中单个分类/项目的实际释放量 */
export interface CleanDetail {
  name: string;
  freed: number;
  deep: boolean;
}

/** 清理结果：skipped 为未释放任何空间的项目（权限不足或已被清理），details 为逐项明细 */
export interface CleanOutcome {
  freed: number;
  skipped: string[];
  details: CleanDetail[];
}

/** 注册表中登记的一个已安装软件 */
export interface InstalledSoftware {
  id: string;
  name: string;
  version: string;
  publisher: string;
  installLocation: string;
  size: number;
  /** registry=注册表估算，folder=目录实测，unknown=暂无可靠数据 */
  sizeSource: "registry" | "folder" | "unknown";
  pathExists: boolean;
  registryKey: string;
  uninstallString: string;
  quietUninstallString: string;
  canUninstall: boolean;
  source: string;
}

export type CleanupRisk = "low" | "medium" | "high";

/** 强力卸载的单个清理目标 */
export interface CleanupTarget {
  id: string;
  name: string;
  path: string;
  kind: "install" | "registry" | "cache" | "config" | "data";
  risk: CleanupRisk;
  required: boolean;
  selected: boolean;
  exists: boolean;
  size: number;
  reason: string;
}

export interface SoftwareCleanupPlan {
  appName: string;
  installLocation: string;
  uninstallCommand: string;
  silentSwitch: string;
  targets: CleanupTarget[];
  warnings: string[];
}

export interface CleanupTargetResult {
  id: string;
  name: string;
  status: "removed" | "skipped" | "failed";
  freed: number;
  message: string;
}

export interface SoftwareUninstallOutcome {
  appName: string;
  mode: "normal" | "force";
  success: boolean;
  message: string;
  freed: number;
  results: CleanupTargetResult[];
  needsRestart: boolean;
}

export const FORCE_CONFIRM_PHRASE = "我确认永久卸载并清理所选内容";
