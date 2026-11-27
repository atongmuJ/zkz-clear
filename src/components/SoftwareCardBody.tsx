import { formatBytes } from "../lib/format";
import type { InstalledSoftware } from "../lib/types";
import { Icon } from "./Icon";
import { SoftwareIcon } from "./SoftwareIcon";

const SIZE_SOURCE_LABEL: Record<InstalledSoftware["sizeSource"], string> = {
  registry: "登记值",
  folder: "实测目录",
  unknown: "暂无数据",
};

interface SoftwareCardBodyProps {
  app: InstalledSoftware;
  iconUrl?: string;
  busy: boolean;
  onOpenDirectory: (app: InstalledSoftware) => void;
  onNormalUninstall: (app: InstalledSoftware) => void;
  onForceUninstall: (app: InstalledSoftware) => void;
}

/** 软件卡片内容。动画容器留在 SoftwareView，避免破坏 AnimatePresence 的退出动画。 */
export function SoftwareCardBody({
  app,
  iconUrl,
  busy,
  onOpenDirectory,
  onNormalUninstall,
  onForceUninstall,
}: SoftwareCardBodyProps) {
  return (
    <>
      <div className="software-card-head">
        <SoftwareIcon name={app.name} iconUrl={iconUrl} />
        <div className="software-title">
          <h3 title={app.name}>{app.name}</h3>
          <p>{app.publisher} · {app.source}</p>
        </div>
        <span className="software-size">{formatBytes(app.size)}</span>
      </div>

      <div className="software-meta">
        <div><span>版本</span><strong>{app.version || "—"}</strong></div>
        <div>
          <span>占用空间</span>
          <strong>
            {formatBytes(app.size)} <small>{SIZE_SOURCE_LABEL[app.sizeSource]}</small>
          </strong>
        </div>
      </div>

      <div className="software-path">
        <Icon name="folder" size={14} />
        <code title={app.installLocation}>{app.installLocation || "未登记安装目录"}</code>
        {!app.pathExists && <span className="missing-tag">路径不存在</span>}
      </div>

      <div className="software-actions">
        <button
          type="button"
          className="soft-btn"
          disabled={!app.pathExists}
          title={app.pathExists ? "在资源管理器中打开" : "安装目录不存在"}
          onClick={() => onOpenDirectory(app)}
        >
          <Icon name="external" size={14} />打开安装目录
        </button>
        <button
          type="button"
          className="soft-btn"
          disabled={!app.canUninstall || busy}
          title={app.canUninstall ? "调用软件自带卸载程序" : "未登记卸载命令"}
          onClick={() => onNormalUninstall(app)}
        >
          <Icon name="trash" size={14} />普通卸载
        </button>
        <button
          type="button"
          className="soft-btn danger"
          disabled={!app.canUninstall || busy}
          title={app.canUninstall ? "卸载后清理所选残留，需二次确认" : "未登记卸载命令"}
          onClick={() => onForceUninstall(app)}
        >
          <Icon name="warning" size={14} />强力卸载
        </button>
      </div>
    </>
  );
}
