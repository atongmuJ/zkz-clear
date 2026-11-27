import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { formatBytes } from "../lib/format";
import {
  FORCE_CONFIRM_PHRASE,
  type CleanupRisk,
  type InstalledSoftware,
  type SoftwareCleanupPlan,
} from "../lib/types";
import { Icon } from "./Icon";

interface ForceUninstallDialogProps {
  open: boolean;
  app: InstalledSoftware | null;
  plan: SoftwareCleanupPlan | null;
  loading: boolean;
  executing?: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

const RISK_LABEL: Record<CleanupRisk, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

const KIND_LABEL: Record<string, string> = {
  install: "安装目录",
  registry: "卸载登记",
  cache: "缓存/临时",
  config: "配置/数据",
  data: "残留目录",
};

/** 强力卸载专用二次确认：逐项展示路径、风险与清理范围，必须主动勾选后才可执行。 */
export function ForceUninstallDialog({
  open,
  app,
  plan,
  loading,
  executing = false,
  error,
  onCancel,
  onConfirm,
}: ForceUninstallDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) {
      setAcknowledged(false);
      return;
    }
    setAcknowledged(false);
    setSelected(
      new Set((plan?.targets ?? []).filter((t) => t.required || t.selected).map((t) => t.id))
    );
  }, [open, plan]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !executing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, executing]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedSize = (plan?.targets ?? [])
    .filter((t) => selected.has(t.id))
    .reduce((sum, t) => sum + t.size, 0);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="risk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => { if (!executing) onCancel(); }}
        >
          <motion.div
            className="risk-dialog force-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="force-title"
            initial={{ opacity: 0, scale: 0.95, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 250, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="risk-head">
              <span className="risk-icon danger"><Icon name="warning" size={24} /></span>
              <div>
                <h2 id="force-title">强力卸载 · 二次确认</h2>
                <p>{app?.name ?? "正在读取软件信息…"}</p>
              </div>
            </div>

            {loading && (
              <div className="force-loading">
                <motion.span
                  className="mini-spinner"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                />
                {executing ? "正在卸载并清理所选内容…" : "正在生成实际清理范围…"}
              </div>
            )}

            {error && <div className="force-error"><Icon name="warning" size={15} />{error}</div>}

            {plan && !loading && (
              <>
                <div className="risk-summary">
                  <Icon name="trash" size={15} />
                  将先执行卸载程序，再清理 <strong>{selected.size}</strong> 个项目，
                  预计释放 <strong>{formatBytes(selectedSize)}</strong>
                </div>

                <div className="force-command">
                  <span>卸载命令</span>
                  <code>{plan.uninstallCommand || "未登记卸载命令"}</code>
                  {plan.silentSwitch && <span className="silent-tag">{plan.silentSwitch} 静默参数</span>}
                </div>

                <ul className="force-targets">
                  {plan.targets.map((target) => {
                    const checked = selected.has(target.id) || target.required;
                    return (
                      <li key={target.id} className={`force-target risk-${target.risk}`}>
                        <button
                          type="button"
                          className="force-check"
                          disabled={target.required}
                          aria-label={target.required ? "必选清理目标" : `选择清理 ${target.name}`}
                          onClick={() => !target.required && toggle(target.id)}
                        >
                          <span className={`checkbox ${checked ? "checked" : ""}`}>
                            {checked && <Icon name="check" size={12} />}
                          </span>
                        </button>
                        <div className="force-target-body">
                          <div className="force-target-title">
                            <strong>{target.name}</strong>
                            <span className={`force-kind kind-${target.kind}`}>{KIND_LABEL[target.kind] ?? target.kind}</span>
                            <span className={`risk-badge risk-${target.risk}`}>{RISK_LABEL[target.risk]}</span>
                            {target.required && <span className="required-tag">必选</span>}
                            {!target.exists && <span className="missing-tag">路径不存在</span>}
                          </div>
                          <code>{target.path}</code>
                          <p>{target.reason}</p>
                          {target.size > 0 && <span className="force-size">{formatBytes(target.size)}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="force-warnings">
                  {(plan.warnings.length > 0
                    ? plan.warnings
                    : [
                        "已勾选的数据、配置与数据库目录将被永久删除，可能包含账号记录、许可证或项目文件。",
                        "本工具不会删除桌面、文档、图片、下载等个人文件夹。",
                      ]
                  ).map((warning) => (
                    <div className="risk-notice danger-notice" key={warning}>
                      <Icon name="shield" size={16} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>

                <label className="risk-ack">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />
                  <span className={`checkbox ${acknowledged ? "checked" : ""}`}>
                    {acknowledged && <Icon name="check" size={13} />}
                  </span>
                  我已阅读路径与清理范围，确认执行「{FORCE_CONFIRM_PHRASE}」
                </label>
              </>
            )}

            <div className="risk-actions">
              <button type="button" className="ghost-btn" disabled={executing} onClick={onCancel}>取消</button>
              <button
                type="button"
                className="primary-btn danger"
                disabled={loading || executing || !plan || !acknowledged || selected.size === 0}
                onClick={() => {
                  if (acknowledged && plan) {
                    onConfirm(
                      plan.targets
                        .filter((t) => t.required || selected.has(t.id))
                        .map((t) => t.id)
                    );
                  }
                }}
              >
                <Icon name="warning" size={16} />
                确认强力卸载
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
