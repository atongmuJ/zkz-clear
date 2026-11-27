export type TabKey = "clean" | "optimize" | "analyze" | "cdrive" | "status" | "about";

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
