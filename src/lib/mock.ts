import type {
  CDriveItem,
  CleanCategory,
  DiskInfo,
  FolderUsage,
  InstalledSoftware,
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
    deep: false,
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
    deep: false,
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
    deep: false,
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
    deep: false,
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
    deep: false,
    totalSize: 218 * MB,
    items: [
      { id: "th1", name: "缩略图数据库", path: "AppData\\Local\\Microsoft\\Windows\\Explorer", size: 218 * MB, count: 4, categoryId: "thumb" },
    ],
  },
];

export const MOCK_DEEP_CATEGORIES: CleanCategory[] = [
  {
    id: "deep-browser",
    name: "浏览器深度缓存",
    description: "Service Worker 与着色器缓存，下次上网会重新生成",
    icon: "browser",
    risk: "deep",
    deep: true,
    totalSize: 1.42 * GB,
    items: [
      { id: "db1", name: "Edge 渲染缓存", path: "AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Service Worker", size: 812 * MB, count: 3204, categoryId: "deep-browser" },
      { id: "db2", name: "Chrome 渲染缓存", path: "AppData\\Local\\Google\\Chrome\\User Data\\Default\\Service Worker", size: 486 * MB, count: 1875, categoryId: "deep-browser" },
      { id: "db3", name: "Firefox 启动缓存", path: "AppData\\Local\\Mozilla\\Firefox\\Profiles", size: 148 * MB, count: 396, categoryId: "deep-browser" },
    ],
  },
  {
    id: "deep-update",
    name: "更新分发缓存",
    description: "Windows 更新的传递优化缓存，删除后更新需重新下载",
    icon: "log",
    risk: "deep",
    deep: true,
    totalSize: 3.16 * GB,
    items: [
      { id: "du1", name: "传递优化缓存", path: "C:\\Windows\\SoftwareDistribution\\DeliveryOptimization", size: 3.16 * GB, count: 92, categoryId: "deep-update" },
    ],
  },
  {
    id: "deep-report",
    name: "应用错误报告",
    description: "应用与内核的崩溃转储报告，删除后无法用于排障",
    icon: "log",
    risk: "deep",
    deep: true,
    totalSize: 736 * MB,
    items: [
      { id: "dr1", name: "错误报告与转储", path: "C:\\Windows\\LiveKernelReports", size: 736 * MB, count: 28, categoryId: "deep-report" },
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

// 安全项无风险须知，前端据此判断是否需要弹确认弹窗
const SAFE_WARNING = "";

const ADMIN_IDS = new Set([
  "winupdate", "hiberfil", "restore", "defender", "oldwindows",
  "deep-delivery", "deep-reports", "deep-logs", "deep-setup",
]);
const withAdmin = (items: CDriveItem[]): CDriveItem[] =>
  items.map((i) => ({ ...i, needsAdmin: ADMIN_IDS.has(i.id) }));

export const MOCK_CDRIVE: CDriveItem[] = withAdmin([
  { id: "winupdate", name: "Windows 更新缓存", description: "旧版本更新安装文件与下载缓存", size: 8.42 * GB, detail: "可安全清理，不影响系统运行", selected: true, deep: false, warning: SAFE_WARNING, needsAdmin: false },
  { id: "hiberfil", name: "休眠文件", description: "hiberfil.sys，关闭休眠后可释放", size: 12.8 * GB, detail: "清理后将禁用休眠功能", selected: false, deep: false, warning: "将关闭系统休眠功能并删除 hiberfil.sys。快速启动可能失效；休眠中的会话无法恢复。个人文档不受影响。", needsAdmin: false },
  { id: "restore", name: "系统还原点", description: "保留最近一个还原点，清理其余", size: 5.6 * GB, detail: "建议保留至少一个还原点", selected: false, deep: false, warning: "将删除较早的系统还原点。一旦删除，无法再通过这些还原点回退系统设置与部分程序安装。", needsAdmin: false },
  { id: "defender", name: "Defender 隔离文件", description: "Windows Defender 隔离区中的文件", size: 1.2 * GB, detail: "清理后无法恢复隔离文件", selected: false, deep: false, warning: "将永久删除被 Defender 隔离的可疑文件，无法从隔离区恢复。若其中有误判文件也会一并丢失。", needsAdmin: false },
  { id: "tempwin", name: "C 盘临时文件", description: "系统与应用临时文件", size: 1.84 * GB, detail: "可安全清理", selected: true, deep: false, warning: SAFE_WARNING, needsAdmin: false },
  { id: "oldwindows", name: "Windows.old", description: "旧系统安装备份", size: 24.6 * GB, detail: "清理后无法回退到旧版本", selected: false, deep: false, warning: "将永久删除旧版本 Windows 的完整备份，包括旧系统中的用户配置文件。删除后无法回退到升级前的系统。", needsAdmin: false },
]);

export const MOCK_DEEP_CDRIVE: CDriveItem[] = withAdmin([
  { id: "deep-delivery", name: "更新分发缓存", description: "传递优化下载的安装源", size: 3.16 * GB, detail: "删除后更新会重新下载", selected: false, deep: true, warning: "将删除 Windows 更新的 P2P 分发缓存。不会卸载已安装的更新，但在带宽受限时后续更新可能变慢。", needsAdmin: false },
  { id: "deep-reports", name: "内核与错误报告", description: "崩溃转储与 WER 报告存档", size: 1.84 * GB, detail: "删除后无法用于故障排查", selected: false, deep: true, warning: "将删除内核崩溃转储与错误报告存档。这不包含个人文件，但一旦删除，过往蓝屏或应用崩溃的诊断记录将无法恢复。", needsAdmin: false },
  { id: "deep-logs", name: "安装维护日志", description: "CBS / DISM 组件安装日志", size: 628 * MB, detail: "删除后无法追溯更新失败原因", selected: false, deep: true, warning: "将删除组件安装与维护日志。不影响系统运行，但之后若更新失败，将缺少可用于定位问题的历史记录。", needsAdmin: false },
  { id: "deep-setup", name: "系统安装临时文件", description: "Windows 安装过程留下的临时目录", size: 2.08 * GB, detail: "删除后无法回退本次安装过程", selected: false, deep: true, warning: "将删除 C:\\Windows\\Panther 中的安装日志与临时文件。不会影响当前系统，但会丢失本次升级/安装的排查材料。", needsAdmin: false },
]);

export const MOCK_STATUS: SystemStatus = {
  cpuUsage: 18,
  memoryUsed: 9.4 * GB,
  memoryTotal: 16 * GB,
  diskUsed: 183 * GB,
  diskTotal: 256 * GB,
  uptime: "3 天 7 小时",
  osVersion: "Windows 11 专业版 24H2",
};

export const MOCK_SOFTWARE: InstalledSoftware[] = [
  {
    id: "mock:adobe-acrobat",
    name: "Adobe Acrobat (64-bit)",
    version: "24.001.20604",
    publisher: "Adobe Inc.",
    installLocation: "C:\\Program Files\\Adobe\\Acrobat DC",
    size: 2.84 * GB,
    sizeSource: "registry",
    pathExists: true,
    registryKey: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Adobe Acrobat",
    uninstallString: "MsiExec.exe /I{AC76BA86-1033-0000-7760-000000000001}",
    quietUninstallString: "MsiExec.exe /X{AC76BA86-1033-0000-7760-000000000001} /qn",
    canUninstall: true,
    source: "系统",
  },
  {
    id: "mock:vscode",
    name: "Microsoft Visual Studio Code",
    version: "1.96.2",
    publisher: "Microsoft Corporation",
    installLocation: "C:\\Program Files\\Microsoft VS Code",
    size: 486 * MB,
    sizeSource: "folder",
    pathExists: true,
    registryKey: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Microsoft VS Code",
    uninstallString: "\"C:\\Program Files\\Microsoft VS Code\\unins000.exe\"",
    quietUninstallString: "",
    canUninstall: true,
    source: "系统",
  },
  {
    id: "mock:steam",
    name: "Steam",
    version: "latest",
    publisher: "Valve Corporation",
    installLocation: "D:\\Games\\Steam",
    size: 4.12 * GB,
    sizeSource: "registry",
    pathExists: true,
    registryKey: "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam",
    uninstallString: "\"D:\\Games\\Steam\\uninstall.exe\"",
    quietUninstallString: "",
    canUninstall: true,
    source: "当前用户",
  },
  {
    id: "mock:spotify",
    name: "Spotify",
    version: "1.2.71",
    publisher: "Spotify AB",
    installLocation: "C:\\Users\\Demo\\AppData\\Roaming\\Spotify",
    size: 318 * MB,
    sizeSource: "registry",
    pathExists: true,
    registryKey: "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Spotify",
    uninstallString: "\"C:\\Users\\Demo\\AppData\\Roaming\\Spotify\\Uninstall.exe\" /S",
    quietUninstallString: "",
    canUninstall: true,
    source: "当前用户",
  },
  {
    id: "mock:7zip",
    name: "7-Zip 24.09 (x64 edition)",
    version: "24.09",
    publisher: "Igor Pavlov",
    installLocation: "C:\\Program Files\\7-Zip",
    size: 12.6 * MB,
    sizeSource: "registry",
    pathExists: true,
    registryKey: "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\7-Zip",
    uninstallString: "MsiExec.exe /I{23170F69-40C1-2702-2409-000001000000}",
    quietUninstallString: "",
    canUninstall: true,
    source: "系统(32位)",
  },
  {
    id: "mock:old-tool",
    name: "Old Photo Studio",
    version: "3.1.0",
    publisher: "Example Studio",
    installLocation: "D:\\Apps\\OldPhotoStudio",
    size: 0,
    sizeSource: "unknown",
    pathExists: false,
    registryKey: "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OldPhotoStudio",
    uninstallString: "\"D:\\Apps\\OldPhotoStudio\\uninstall.exe\"",
    quietUninstallString: "",
    canUninstall: true,
    source: "系统(32位)",
  },
];

/** 浏览器预览没有真实 exe 可提取图标，用首字母彩色图标模拟“每个软件不同”的效果。 */
const MOCK_ICON_COLORS = [
  ["#6d9fd8", "#3a5f8f"],
  ["#e9915a", "#a94f35"],
  ["#4fb8a8", "#2c746d"],
  ["#b888dc", "#6b4b9a"],
  ["#e4b95b", "#a17c2c"],
  ["#7cc36b", "#3f7d42"],
];

function mockSoftwareIcon(name: string, index: number): string {
  const initials =
    name.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, "").slice(0, 2).toUpperCase() || "AP";
  const [from, to] = MOCK_ICON_COLORS[index % MOCK_ICON_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="48" height="48" rx="11" fill="url(#g)"/><text x="24" y="31" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="18" font-weight="700" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOCK_SOFTWARE_ICONS: Record<string, string> = Object.fromEntries(
  MOCK_SOFTWARE.map((app, index) => [app.registryKey, mockSoftwareIcon(app.name, index)])
);
