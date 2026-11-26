export type TabKey = "clean" | "optimize" | "analyze" | "cdrive" | "status";

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
  risk: "safe" | "notice";
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

/** C 盘清理结果：skipped 为未释放任何空间的项目（权限不足或已被清理） */
export interface CleanOutcome {
  freed: number;
  skipped: string[];
}
