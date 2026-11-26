import type {
  CDriveItem,
  CleanCategory,
  DiskInfo,
  FolderUsage,
  LargeFile,
  StartupItem,
  SystemStatus,
} from "./types";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const MOCK_CATEGORIES: CleanCategory[] = [
  {
    id: "temp",
    name: "系统临时文件",
    description: "Windows 与应用程序产生的临时文件",
    icon: "temp",
    risk: "safe",
    totalSize: 1.84 * GB,
    items: [
      { id: "t1", name: "临时文件目录", path: "C:\\Windows\\Temp", size: 1.84 * GB, count: 2140, categoryId: "temp" },
    ],
  },
  {
    id: "browser",
    name: "浏览器缓存",
    description: "Edge / Chrome / Firefox 的网页缓存",
    icon: "browser",
    risk: "safe",
    totalSize: 926 * MB,
    items: [
      { id: "b1", name: "Microsoft Edge 缓存", path: "AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache", size: 512 * MB, count: 3421, categoryId: "browser" },
      { id: "b2", name: "Google Chrome 缓存", path: "AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache", size: 298 * MB, count: 2104, categoryId: "browser" },
      { id: "b3", name: "Firefox 缓存", path: "AppData\\Local\\Mozilla\\Firefox\\Profiles", size: 116 * MB, count: 618, categoryId: "browser" },
    ],
  },
  {
    id: "recycle",
    name: "回收站",
    description: "已删除但仍占用磁盘空间的文件",
    icon: "trash",
    risk: "safe",
    totalSize: 2.31 * GB,
    items: [
      { id: "r1", name: "回收站内容", path: "C:\\$Recycle.Bin", size: 2.31 * GB, count: 110, categoryId: "recycle" },
    ],
  },
  {
    id: "logs",
    name: "日志与崩溃转储",
    description: "系统日志、崩溃报告与预取记录",
    icon: "log",
    risk: "notice",
    totalSize: 684 * MB,
    items: [
      { id: "l1", name: "系统日志", path: "C:\\Windows\\Logs", size: 312 * MB, count: 156, categoryId: "logs" },
      { id: "l2", name: "崩溃转储", path: "AppData\\Local\\CrashDumps", size: 294 * MB, count: 14, categoryId: "logs" },
      { id: "l3", name: "预取记录", path: "C:\\Windows\\Prefetch", size: 78 * MB, count: 316, categoryId: "logs" },
    ],
  },
  {
    id: "thumb",
    name: "缩略图缓存",
    description: "文件资源管理器的图片预览缓存",
    icon: "image",
    risk: "safe",
    totalSize: 218 * MB,
    items: [
      { id: "th1", name: "缩略图数据库", path: "AppData\\Local\\Microsoft\\Windows\\Explorer", size: 218 * MB, count: 4, categoryId: "thumb" },
    ],
  },
];

export const MOCK_STARTUP: StartupItem[] = [
  { name: "Microsoft Teams", command: "Teams.exe /startminimized", location: "注册表 Run", enabled: true, publisher: "Microsoft Corporation" },
  { name: "Adobe Acrobat", command: "AcroTray.exe", location: "注册表 Run", enabled: true, publisher: "Adobe Inc." },
  { name: "Spotify", command: "Spotify.exe /autostart", location: "启动文件夹", enabled: false, publisher: "Spotify AB" },
  { name: "Discord", command: "Discord.exe --start-minimized", location: "注册表 Run", enabled: true, publisher: "Discord Inc." },
  { name: "OneDrive", command: "OneDrive.exe /background", location: "注册表 Run", enabled: true, publisher: "Microsoft Corporation" },
  { name: "Steam", command: "steam.exe -silent", location: "启动文件夹", enabled: false, publisher: "Valve Corporation" },
];

export const MOCK_DISKS: DiskInfo[] = [
  { name: "C:", total: 256 * GB, used: 183 * GB, free: 73 * GB },
  { name: "D:", total: 1024 * GB, used: 412 * GB, free: 612 * GB },
  { name: "E:", total: 512 * GB, used: 128 * GB, free: 384 * GB },
];

export const MOCK_LARGE_FILES: LargeFile[] = [
  { path: "D:\\Games\\Cyberpunk2077\\content\\archive.pc", name: "archive.pc", size: 68.4 * GB, modified: "2026-09-12" },
  { path: "D:\\Videos\\4K\\project-final.mp4", name: "project-final.mp4", size: 12.8 * GB, modified: "2026-10-03" },
  { path: "C:\\Users\\Public\\Downloads\\dataset.zip", name: "dataset.zip", size: 8.2 * GB, modified: "2026-08-21" },
  { path: "D:\\Backup\\system-image-2026.wim", name: "system-image-2026.wim", size: 6.7 * GB, modified: "2026-07-15" },
  { path: "E:\\Media\\Movies\\collection.mkv", name: "collection.mkv", size: 4.3 * GB, modified: "2026-06-30" },
  { path: "C:\\ProgramData\\cache\\model.bin", name: "model.bin", size: 2.9 * GB, modified: "2026-11-02" },
];

export const MOCK_FOLDERS: FolderUsage[] = [
  { path: "C:\\Users", name: "用户文件", size: 68.2 * GB, percent: 40.6 },
  { path: "C:\\Program Files", name: "程序文件", size: 42.6 * GB, percent: 25.4 },
  { path: "C:\\Windows", name: "Windows 系统", size: 38.4 * GB, percent: 22.9 },
  { path: "C:\\ProgramData", name: "程序数据", size: 18.7 * GB, percent: 11.1 },
];

export const MOCK_CDRIVE: CDriveItem[] = [
  { id: "winupdate", name: "Windows 更新缓存", description: "旧版本更新安装文件与下载缓存", size: 8.42 * GB, detail: "可安全清理，不影响系统运行", selected: true },
  { id: "hiberfil", name: "休眠文件", description: "hiberfil.sys，关闭休眠后可释放", size: 12.8 * GB, detail: "清理后将禁用休眠功能", selected: false },
  { id: "restore", name: "系统还原点", description: "保留最近一个还原点，清理其余", size: 5.6 * GB, detail: "建议保留至少一个还原点", selected: false },
  { id: "defender", name: "Defender 隔离文件", description: "Windows Defender 隔离区中的文件", size: 1.2 * GB, detail: "清理后无法恢复隔离文件", selected: false },
  { id: "tempwin", name: "C 盘临时文件", description: "系统与应用临时文件", size: 1.84 * GB, detail: "可安全清理", selected: true },
  { id: "oldwindows", name: "Windows.old", description: "旧系统安装备份", size: 24.6 * GB, detail: "清理后无法回退到旧版本", selected: false },
];

export const MOCK_STATUS: SystemStatus = {
  cpuUsage: 18,
  memoryUsed: 9.4 * GB,
  memoryTotal: 16 * GB,
  diskUsed: 183 * GB,
  diskTotal: 256 * GB,
  uptime: "3 天 7 小时",
  osVersion: "Windows 11 专业版 24H2",
};
