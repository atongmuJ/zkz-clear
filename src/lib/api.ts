import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as mock from "./mock";
import type {
  CDriveItem,
  CleanCategory,
  CleanOutcome,
  DiskInfo,
  FolderUsage,
  InstalledSoftware,
  LargeFile,
  LastCleanup,
  ScanProgress,
  SoftwareCleanupPlan,
  SoftwareUninstallOutcome,
  StartupItem,
  SystemStatus,
} from "./types";
import { FORCE_CONFIRM_PHRASE } from "./types";

/** 浏览器预览环境（无 Tauri 注入）时自动降级为模拟数据 */
const DESKTOP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isDesktop = (): boolean => DESKTOP;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 只读查询的短时缓存：避免页面来回切换时反复触发重型扫描。 */
const CACHE_TTL = 30_000;
const readCache = new Map<string, { value: unknown; at: number }>();

async function cached<T>(key: string, load: () => Promise<T>, refresh = false): Promise<T> {
  const now = Date.now();
  const hit = readCache.get(key);
  if (!refresh && hit && now - hit.at < CACHE_TTL) return hit.value as T;
  const value = await load();
  readCache.set(key, { value, at: Date.now() });
  return value;
}

/** 清理、卸载或用户主动重新扫描后调用，确保下次读取到最新数据。
 *  传入 key 时只失效对应缓存，不传则全部失效。 */
export function clearApiCache(key?: string): void {
  if (key) readCache.delete(key);
  else readCache.clear();
}

export async function scanJunk(
  onProgress: (p: ScanProgress) => void,
  deep = false
): Promise<CleanCategory[]> {
  if (!isDesktop()) {
    const phases = [
      "正在扫描系统临时文件…",
      "正在扫描浏览器缓存…",
      "正在扫描回收站…",
      "正在扫描日志与转储…",
      "正在扫描缩略图缓存…",
      ...(deep
        ? ["正在扫描浏览器深度缓存…", "正在扫描更新分发缓存…", "正在扫描错误报告…"]
        : []),
      "正在汇总扫描结果…",
    ];
    for (let i = 0; i <= 100; i += 2) {
      const idx = Math.min(Math.floor((i / 100) * phases.length), phases.length - 1);
      const found = Math.round((i / 100) * 8346);
      onProgress({
        phase: phases[idx],
        progress: i,
        found,
        size: Math.round((i / 100) * 5.98 * 1024 ** 3),
      });
      await delay(24);
    }
    return deep ? [...mock.MOCK_CATEGORIES, ...mock.MOCK_DEEP_CATEGORIES] : mock.MOCK_CATEGORIES;
  }

  const channel = new Channel<ScanProgress>();
  channel.onmessage = (msg) => onProgress(msg);
  return invoke<CleanCategory[]>("scan_junk", { channel, deep });
}

export async function cleanJunk(categoryIds: string[], deep = false): Promise<CleanOutcome> {
  if (!isDesktop()) {
    await delay(700);
    const picked = [...mock.MOCK_CATEGORIES, ...mock.MOCK_DEEP_CATEGORIES]
      .filter((c) => categoryIds.includes(c.id));
    const details = picked.map((c) => ({
      name: c.name,
      freed: Math.round(c.totalSize),
      deep: c.deep,
    }));
    return {
      freed: details.reduce((sum, d) => sum + d.freed, 0),
      skipped: [],
      details,
    };
  }
  return invoke<CleanOutcome>("clean_junk", { categoryIds, deep });
}

export async function getStartupItems(refresh = false): Promise<StartupItem[]> {
  return cached("startup", async () => {
    if (!isDesktop()) return mock.MOCK_STARTUP;
    return invoke<StartupItem[]>("get_startup_items");
  }, refresh);
}

export async function setStartupEnabled(name: string, enabled: boolean): Promise<boolean> {
  if (!isDesktop()) {
    await delay(250);
    return true;
  }
  return invoke<boolean>("set_startup_enabled", { name, enabled });
}

export async function getDisks(refresh = false): Promise<DiskInfo[]> {
  return cached("disks", async () => {
    if (!isDesktop()) return mock.MOCK_DISKS;
    return invoke<DiskInfo[]>("get_disks");
  }, refresh);
}

export async function getLargeFiles(refresh = false): Promise<LargeFile[]> {
  return cached("large-files", async () => {
    if (!isDesktop()) return mock.MOCK_LARGE_FILES;
    return invoke<LargeFile[]>("get_large_files");
  }, refresh);
}

export async function getFolderUsage(refresh = false): Promise<FolderUsage[]> {
  return cached("folder-usage", async () => {
    if (!isDesktop()) return mock.MOCK_FOLDERS;
    return invoke<FolderUsage[]>("get_folder_usage");
  }, refresh);
}

export async function getCDriveItems(deep = false, refresh = false): Promise<CDriveItem[]> {
  return cached(`cdrive-${deep}`, async () => {
    if (!isDesktop()) return deep ? [...mock.MOCK_CDRIVE, ...mock.MOCK_DEEP_CDRIVE] : mock.MOCK_CDRIVE;
    return invoke<CDriveItem[]>("get_cdrive_items", { deep });
  }, refresh);
}

export async function cleanCDrive(itemIds: string[], deep = false): Promise<CleanOutcome> {
  if (!isDesktop()) {
    await delay(900);
    const picked = [...mock.MOCK_CDRIVE, ...mock.MOCK_DEEP_CDRIVE]
      .filter((i) => itemIds.includes(i.id));
    const details = picked.map((i) => ({
      name: i.name,
      freed: Math.round(i.size),
      deep: i.deep,
    }));
    return {
      freed: details.reduce((sum, d) => sum + d.freed, 0),
      skipped: [],
      details,
    };
  }
  return invoke<CleanOutcome>("clean_cdrive", { itemIds, deep });
}

const LAST_CLEANUP_KEY = "zkz-last-cleanup";

export async function getLastCleanup(): Promise<LastCleanup | null> {
  if (!isDesktop()) {
    try {
      const raw = localStorage.getItem(LAST_CLEANUP_KEY);
      return raw ? (JSON.parse(raw) as LastCleanup) : null;
    } catch {
      return null;
    }
  }
  return invoke<LastCleanup | null>("get_last_cleanup");
}

export async function recordCleanup(freed: number, deep: boolean): Promise<void> {
  if (!isDesktop()) {
    try {
      const record: LastCleanup = { timestamp: Date.now(), freed, deep };
      localStorage.setItem(LAST_CLEANUP_KEY, JSON.stringify(record));
    } catch {
      // 隐私模式下 localStorage 可能不可写，忽略即可
    }
    return;
  }
  await invoke("record_cleanup", { freed, deep });
}

export async function getSystemStatus(refresh = false): Promise<SystemStatus> {
  return cached("system-status", async () => {
    if (!isDesktop()) return mock.MOCK_STATUS;
    return invoke<SystemStatus>("get_system_status");
  }, refresh);
}

export async function openPath(path: string): Promise<void> {
  if (!isDesktop()) throw new Error("浏览器预览不支持打开系统路径");
  await invoke("open_path", { path });
}

/** 预览环境专用：记录已"卸载"的软件，刷新列表时不再返回 */
const mockRemoved = new Set<string>();

function mockCleanupPlan(app: InstalledSoftware): SoftwareCleanupPlan {
  const targets: SoftwareCleanupPlan["targets"] = [
    {
      id: "install",
      name: "安装目录",
      path: app.installLocation || "（未登记安装目录）",
      kind: "install",
      risk: "high",
      required: true,
      selected: true,
      exists: app.pathExists,
      size: app.size,
      reason: "卸载程序结束后删除仍残留的应用文件",
    },
    {
      id: "registry",
      name: "卸载登记",
      path: app.registryKey,
      kind: "registry",
      risk: "medium",
      required: true,
      selected: true,
      exists: true,
      size: 0,
      reason: "删除该软件在注册表卸载列表中的登记项",
    },
  ];

  if (app.pathExists && app.installLocation) {
    targets.push({
      id: `path:${app.name.toLowerCase()}-cache`,
      name: `${app.name} Cache`,
      path: `${app.installLocation}\\Cache`,
      kind: "cache",
      risk: "low",
      required: false,
      selected: true,
      exists: true,
      size: Math.round(app.size * 0.08),
      reason: "应用缓存或临时目录，删除后下次运行会重新生成",
    });
    targets.push({
      id: `path:${app.name.toLowerCase()}-data`,
      name: `${app.name} User Data`,
      path: `C:\\Users\\Demo\\AppData\\Roaming\\${app.name.replace(/[^A-Za-z0-9]/g, "")}`,
      kind: "data",
      risk: "high",
      required: false,
      selected: false,
      exists: true,
      size: Math.round(app.size * 0.12),
      reason: "可能包含账号、数据库或配置文件，删除后无法恢复",
    });
  }

  return {
    appName: app.name,
    installLocation: app.installLocation,
    uninstallCommand: app.quietUninstallString || app.uninstallString || "（无卸载命令）",
    silentSwitch: app.uninstallString.toLowerCase().startsWith("msiexec") ? "/qn" : "",
    targets,
    warnings: [
      "将先调用软件自带的卸载程序；卸载失败或超时时，本工具不会继续删除任何文件。",
      "安装目录与注册表登记会被删除；勾选的高风险目录可能包含账号数据、许可证、数据库或配置文件，删除后无法恢复。",
      "强力卸载不会删除桌面、文档、图片、下载等个人文件夹，也不会触碰系统关键目录。",
    ],
  };
}

export async function getInstalledSoftware(refresh = false): Promise<InstalledSoftware[]> {
  return cached("installed-software", async () => {
    if (!isDesktop()) {
      await delay(650);
      // 预览环境下已"卸载"的软件不再出现，避免卸载后刷新又冒出来
      return mock.MOCK_SOFTWARE.filter((app) => !mockRemoved.has(app.registryKey));
    }
    return invoke<InstalledSoftware[]>("get_installed_software");
  }, refresh);
}

/** 读取软件图标 data URL；失败时返回空表，界面会回退到通用图标。 */
export async function getSoftwareIcons(): Promise<Record<string, string>> {
  if (!isDesktop()) return mock.MOCK_SOFTWARE_ICONS;
  try {
    return await invoke<Record<string, string>>("get_software_icons");
  } catch {
    return {};
  }
}

export async function openSoftwareLocation(registryKey: string): Promise<void> {
  if (!isDesktop()) throw new Error("浏览器预览不支持打开安装目录，请在桌面版使用");
  await invoke("open_software_location", { registryKey });
}

export async function previewForceUninstall(app: InstalledSoftware): Promise<SoftwareCleanupPlan> {
  if (!isDesktop()) {
    await delay(320);
    return mockCleanupPlan(app);
  }
  return invoke<SoftwareCleanupPlan>("preview_force_uninstall", { registryKey: app.registryKey });
}

export async function uninstallSoftware(app: InstalledSoftware): Promise<SoftwareUninstallOutcome> {
  if (!isDesktop()) {
    await delay(700);
    mockRemoved.add(app.registryKey);
    return {
      appName: app.name,
      mode: "normal",
      success: true,
      message: "已模拟启动卸载向导；桌面版会调用软件自带的卸载程序，请按提示完成。",
      freed: 0,
      results: [],
      needsRestart: false,
    };
  }
  return invoke<SoftwareUninstallOutcome>("uninstall_software", { registryKey: app.registryKey });
}

export async function forceUninstallSoftware(
  app: InstalledSoftware,
  confirmation: string,
  selectedIds: string[]
): Promise<SoftwareUninstallOutcome> {
  if (!isDesktop()) {
    if (confirmation !== FORCE_CONFIRM_PHRASE) {
      throw new Error("未完成二次确认，强力卸载已取消");
    }
    await delay(900);
    mockRemoved.add(app.registryKey);
    const plan = mockCleanupPlan(app);
    const results = plan.targets
      .filter((t) => t.required || selectedIds.includes(t.id))
      .map((target) => ({
        id: target.id,
        name: target.name,
        status: target.exists ? ("removed" as const) : ("skipped" as const),
        freed: target.exists ? target.size : 0,
        message: target.exists ? "模拟清理完成" : "路径不存在，已跳过",
      }));
    return {
      appName: app.name,
      mode: "force",
      success: true,
      message: "模拟强力卸载完成；桌面版会先执行官方卸载程序，再清理所选目标。",
      freed: results.reduce((sum, r) => sum + r.freed, 0),
      results,
      needsRestart: false,
    };
  }
  return invoke<SoftwareUninstallOutcome>("force_uninstall_software", {
    registryKey: app.registryKey,
    confirmation,
    selectedIds,
  });
}

export async function windowAction(action: "minimize" | "maximize" | "close"): Promise<void> {
  if (!isDesktop()) return;
  const win = getCurrentWebviewWindow();
  if (action === "minimize") await win.minimize();
  if (action === "maximize") await win.toggleMaximize();
  if (action === "close") await win.close();
}
