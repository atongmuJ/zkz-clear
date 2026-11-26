import { Channel, invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import * as mock from "./mock";
import type {
  CDriveItem,
  CleanCategory,
  CleanOutcome,
  DiskInfo,
  FolderUsage,
  LargeFile,
  ScanProgress,
  StartupItem,
  SystemStatus,
} from "./types";

/** 浏览器预览环境（无 Tauri 注入）时自动降级为模拟数据 */
const DESKTOP = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isDesktop = (): boolean => DESKTOP;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function scanJunk(
  onProgress: (p: ScanProgress) => void
): Promise<CleanCategory[]> {
  if (!isDesktop()) {
    const phases = [
      "正在扫描系统临时文件…",
      "正在扫描浏览器缓存…",
      "正在扫描回收站…",
      "正在扫描日志与转储…",
      "正在扫描缩略图缓存…",
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
    return mock.MOCK_CATEGORIES;
  }

  const channel = new Channel<ScanProgress>();
  channel.onmessage = (msg) => onProgress(msg);
  return invoke<CleanCategory[]>("scan_junk", { channel });
}

export async function cleanJunk(categoryIds: string[]): Promise<number> {
  if (!isDesktop()) {
    await delay(700);
    return mock.MOCK_CATEGORIES
      .filter((c) => categoryIds.includes(c.id))
      .reduce((sum, c) => sum + c.totalSize, 0);
  }
  return invoke<number>("clean_junk", { categoryIds });
}

export async function getStartupItems(): Promise<StartupItem[]> {
  if (!isDesktop()) return mock.MOCK_STARTUP;
  return invoke<StartupItem[]>("get_startup_items");
}

export async function setStartupEnabled(name: string, enabled: boolean): Promise<boolean> {
  if (!isDesktop()) {
    await delay(250);
    return true;
  }
  return invoke<boolean>("set_startup_enabled", { name, enabled });
}

export async function getDisks(): Promise<DiskInfo[]> {
  if (!isDesktop()) return mock.MOCK_DISKS;
  return invoke<DiskInfo[]>("get_disks");
}

export async function getLargeFiles(): Promise<LargeFile[]> {
  if (!isDesktop()) return mock.MOCK_LARGE_FILES;
  return invoke<LargeFile[]>("get_large_files");
}

export async function getFolderUsage(): Promise<FolderUsage[]> {
  if (!isDesktop()) return mock.MOCK_FOLDERS;
  return invoke<FolderUsage[]>("get_folder_usage");
}

export async function getCDriveItems(): Promise<CDriveItem[]> {
  if (!isDesktop()) return mock.MOCK_CDRIVE;
  return invoke<CDriveItem[]>("get_cdrive_items");
}

export async function cleanCDrive(itemIds: string[]): Promise<CleanOutcome> {
  if (!isDesktop()) {
    await delay(900);
    const freed = mock.MOCK_CDRIVE
      .filter((i) => itemIds.includes(i.id))
      .reduce((sum, i) => sum + i.size, 0);
    return { freed, skipped: [] };
  }
  return invoke<CleanOutcome>("clean_cdrive", { itemIds });
}

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!isDesktop()) return mock.MOCK_STATUS;
  return invoke<SystemStatus>("get_system_status");
}

export async function openPath(path: string): Promise<void> {
  if (!isDesktop()) return;
  await invoke("open_path", { path });
}

export async function windowAction(action: "minimize" | "maximize" | "close"): Promise<void> {
  if (!isDesktop()) return;
  const win = getCurrentWebviewWindow();
  if (action === "minimize") await win.minimize();
  if (action === "maximize") await win.toggleMaximize();
  if (action === "close") await win.close();
}
