import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { formatBytes } from "../lib/format";
import type { DeepWarning } from "../lib/types";

interface RiskConfirmDialogProps {
  open: boolean;
  title?: string;
  /** 本次将被删除的深度项及风险说明 */
  warnings: DeepWarning[];
  /** 预计释放的空间 */
  size: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 深度清理执行前的风险确认弹窗。
 * 用户必须逐条看到将删除的数据与受影响配置，并主动勾选确认，才能继续。
 */
export function RiskConfirmDialog({
  open,
  title = "深度清理风险须知",
  warnings,
  size,
  onConfirm,
  onCancel,
}: RiskConfirmDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // 每次重新打开都清空勾选，避免上一次的确认状态被沿用
  useEffect(() => {
    if (open) setAcknowledged(false);
  }, [open]);

  // 打开时锁定背景滚动，Esc 取消
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="risk-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div
            className="risk-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="risk-title"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="risk-head">
              <span className="risk-icon"><Icon name="warning" size={24} /></span>
              <div>
                <h2 id="risk-title">{title}</h2>
                <p>以下内容超出普通清理范围，请确认后再继续</p>
              </div>
            </div>

            <div className="risk-summary">
              <Icon name="trash" size={15} />
              本次将删除 <strong>{warnings.length}</strong> 类深度数据，预计释放 <strong>{formatBytes(size)}</strong>
            </div>

            <ul className="risk-list">
              {warnings.map((w) => (
                <motion.li
                  key={w.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="risk-list-name"><Icon name="warning" size={13} />{w.name}</span>
                  <p>{w.warning}</p>
                </motion.li>
              ))}
            </ul>

            <div className="risk-notice">
              <Icon name="shield" size={16} />
              <span>本软件不会删除桌面、文档、图片、下载等个人文件，也不会修改系统关键目录。深度项均为可再生的缓存或日志。</span>
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
              我已阅读并理解上述风险，确认删除这些内容
            </label>

            <div className="risk-actions">
              <button type="button" className="ghost-btn" onClick={onCancel}>取消</button>
              <button
                type="button"
                className="primary-btn danger"
                disabled={!acknowledged}
                onClick={() => { if (acknowledged) onConfirm(); }}
              >
                <Icon name="warning" size={16} />
                确认深度清理
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
