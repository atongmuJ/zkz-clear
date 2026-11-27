import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { CleanPulse } from "../components/CleanPulse";
import { Earth } from "../components/Earth";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon, type IconName } from "../components/Icon";
import { RiskConfirmDialog } from "../components/RiskConfirmDialog";
import { cleanJunk, scanJunk } from "../lib/api";
import { errorMessage, formatBytes } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import type { CleanCategory, DeepWarning, ScanProgress } from "../lib/types";

type Phase = "idle" | "scanning" | "result" | "cleaning" | "done";

const EMPTY_PROGRESS: ScanProgress = { phase: "", progress: 0, found: 0, size: 0 };

const CATEGORY_ICONS: Record<string, IconName> = {
  temp: "broom",
  browser: "browser",
  trash: "trash",
  log: "log",
  image: "image",
};

export function CleanView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<ScanProgress>(EMPTY_PROGRESS);
  const [categories, setCategories] = useState<CleanCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freed, setFreed] = useState(0);
  const [error, setError] = useState("");
  // 深度模式默认关闭：普通清理保持原有安全范围
  const [deepMode, setDeepMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleScan = useCallback(async () => {
    setPhase("scanning");
    setError("");
    setProgress(EMPTY_PROGRESS);
    try {
      const result = await scanJunk(setProgress, deepMode);
      setCategories(result);
      // 深度分类默认不勾选，避免用户误点一键清理时删除深度数据
      setSelected(new Set(result.filter((c) => !c.deep).map((c) => c.id)));
      setPhase("result");
    } catch (err) {
      setError(errorMessage(err, "扫描失败，请重试"));
      setPhase("idle");
    }
  }, [deepMode]);

  /** 真正执行清理 */
  const runClean = useCallback(async () => {
    setConfirmOpen(false);
    setPhase("cleaning");
    setError("");
    try {
      const bytes = await cleanJunk(Array.from(selected), deepMode);
      setFreed(bytes);
      setPhase("done");
    } catch (err) {
      setError(errorMessage(err, "清理失败，请重试"));
      setPhase("result");
    }
  }, [selected, deepMode]);

  const handleClean = useCallback(() => {
    if (selected.size === 0) return;
    // 只有选中了深度分类才需要风险确认
    const deepSelected = categories.filter((c) => c.deep && selected.has(c.id));
    if (deepMode && deepSelected.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void runClean();
  }, [categories, selected, deepMode, runClean]);

  const deepWarnings: DeepWarning[] = categories
    .filter((c) => c.deep && selected.has(c.id))
    .map((c) => ({
      name: c.name,
      warning: `${c.description}。该项仅可通过深度清理模式删除，删除后无法恢复，但不包含个人文档或系统关键文件。`,
    }));
  const deepSelectedSize = categories
    .filter((c) => c.deep && selected.has(c.id))
    .reduce((sum, c) => sum + c.totalSize, 0);

  const toggleCategory = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedSize = categories
    .filter((c) => selected.has(c.id))
    .reduce((sum, c) => sum + c.totalSize, 0);
  const totalItems = categories.reduce(
    (sum, c) => sum + c.items.reduce((n, i) => n + i.count, 0),
    0
  );
  const allSelected = categories.length > 0 && selected.size === categories.length;

  return (
    <div className="view clean-view">
      <ErrorBanner message={error} onClose={() => setError("")} />

      <AnimatePresence mode="wait">
        {(phase === "idle" || phase === "scanning") && (
          <motion.div
            key="hero"
            className="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.32 }}
          >
            <div className="hero-earth">
              <Earth scanning={phase === "scanning"} />
            </div>

            {phase === "idle" ? (
              <motion.div
                className="hero-content"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                <p className="hero-verse">山雨涤尘垢，潮退万象新</p>
                <button type="button" className="primary-btn scan-btn" onClick={handleScan}>
                  <Icon name="scan" size={17} />
                  {deepMode ? "深度扫描电脑" : "扫描电脑"}
                </button>
                <label className={`mode-switch ${deepMode ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={deepMode}
                    onChange={(e) => {
                      setDeepMode(e.target.checked);
                      setCategories([]);
                      setSelected(new Set());
                    }}
                  />
                  <span className="mode-switch-track"><span className="mode-switch-knob" /></span>
                  <Icon name="warning" size={14} />
                  <span>深度清理模式</span>
                  <em>{deepMode ? "已开启 · 含深度缓存" : "更安全，仅清理常规垃圾"}</em>
                </label>
                <p className="hero-hint">
                  {deepMode
                    ? "将额外扫描浏览器深度缓存、更新分发缓存与错误报告，清理前需确认风险"
                    : "扫描临时文件、缓存与回收站 · 拖动地球可以旋转"}
                </p>
              </motion.div>
            ) : (
              <motion.div
                className="hero-content scanning-content"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <p className="scan-phase">{progress.phase}</p>
                <div className="progress-track">
                  <motion.div
                    className="progress-fill"
                    animate={{ width: `${progress.progress}%` }}
                    transition={{ ease: "linear", duration: 0.15 }}
                  />
                </div>
                <div className="scan-stats">
                  <span>已发现 <strong>{progress.found.toLocaleString()}</strong> 项</span>
                  <span className="stat-divider" />
                  <span><strong>{formatBytes(progress.size)}</strong> 可清理</span>
                </div>
                <p className="scan-percent">{progress.progress}%</p>
              </motion.div>
            )}
          </motion.div>
        )}

        {phase === "result" && (
          <motion.div
            key="result"
            className="result-panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4 }}
          >
            <header className="result-header">
              <div>
                <h1>扫描完成</h1>
                <p>发现 <strong>{totalItems.toLocaleString()}</strong> 项可清理内容，共 <TotalBytes value={categories.reduce((s, c) => s + c.totalSize, 0)} /></p>
              </div>
              <button type="button" className="ghost-btn" onClick={handleScan}>
                <Icon name="refresh" size={15} />
                重新扫描
              </button>
            </header>

            <div className="result-toolbar">
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(categories.map((c) => c.id)))
                }
              >
                <Icon name="check" size={14} />
                {allSelected ? "取消全选" : "全选"}
              </button>
              <span className="toolbar-hint">选择要清理的分类</span>
            </div>

            <div className="category-list" role="list">
              {categories.map((category, idx) => {
                const isSelected = selected.has(category.id);
                return (
                  <motion.button
                    key={category.id}
                    type="button"
                    role="listitem"
                    className={`category-row ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleCategory(category.id)}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06, duration: 0.3 }}
                  >
                    <span className={`checkbox ${isSelected ? "checked" : ""}`}>
                      {isSelected && <Icon name="check" size={13} />}
                    </span>
                    <span className={`category-icon ${category.deep ? "deep" : category.risk === "notice" ? "notice" : ""}`}>
                      <Icon name={category.deep ? "warning" : CATEGORY_ICONS[category.icon] ?? "broom"} size={20} />
                    </span>
                    <span className="category-info">
                      <span className="category-name">
                        {category.name}
                        {category.deep && <span className="deep-tag">深度</span>}
                      </span>
                      <span className="category-desc">
                        {category.description} · {category.items.length} 个子项
                      </span>
                    </span>
                    <span className="category-size">{formatBytes(category.totalSize)}</span>
                  </motion.button>
                );
              })}
            </div>

            <footer className="result-footer">
              <div className="selected-summary">
                已选 <strong>{selected.size}</strong> 个分类
                <span className="summary-size">{formatBytes(selectedSize)}</span>
              </div>
              <button
                type="button"
                className="primary-btn"
                disabled={selected.size === 0}
                onClick={handleClean}
              >
                <Icon name="broom" size={17} />
                清理选中项
              </button>
            </footer>
          </motion.div>
        )}

        {phase === "cleaning" && (
          <motion.div
            key="cleaning"
            className="center-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CleanPulse />
            <h2>正在清理…</h2>
            <p>正在安全删除选中的垃圾文件</p>
          </motion.div>
        )}

        {phase === "done" && (
          <DoneState key="done" freed={freed} deep={deepMode} onRescan={handleScan} />
        )}
      </AnimatePresence>

      <RiskConfirmDialog
        open={confirmOpen}
        warnings={deepWarnings}
        size={deepSelectedSize}
        onConfirm={runClean}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/** 结果头部的总量从 0 滚上来，和下方列表的入场节奏对齐 */
function TotalBytes({ value }: { value: number }) {
  const shown = useCountUp(value, 700);
  return <strong>{formatBytes(shown)}</strong>;
}

/** 完成态：释放体积从 0 滚到实际值，配一次光晕扩散 */
function DoneState({ freed, deep, onRescan }: { freed: number; deep: boolean; onRescan: () => void }) {
  const shown = useCountUp(freed);

  return (
    <motion.div
      className="center-state"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      // 不留退场动画：紧接着就是首页淡入，先淡出会露出一瞬空白
      transition={{ type: "spring", stiffness: 180, damping: 20 }}
    >
      <div className="success-wrap">
        <motion.span
          className="done-burst"
          initial={{ scale: 0.5, opacity: 0.45 }}
          animate={{ scale: 2.3, opacity: 0 }}
          transition={{ duration: 1.15, ease: "easeOut", delay: 0.05 }}
        />
        <motion.span
          className="done-burst burst-2"
          initial={{ scale: 0.5, opacity: 0.3 }}
          animate={{ scale: 2.8, opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.22 }}
        />
        <motion.div
          className="success-mark"
          initial={{ scale: 0, rotate: -18 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
        >
          <Icon name="check" size={34} />
        </motion.div>
      </div>
      <h2>清理完成</h2>
      <p className="freed-text">
        已释放 <strong>{formatBytes(shown)}</strong> 空间
      </p>
      <p className="done-sub">
        {deep ? "深度清理已完成，缓存会在下次使用时自动重建" : "你的电脑又轻了一点"}
      </p>
      <button type="button" className="primary-btn" onClick={onRescan}>
        <Icon name="refresh" size={16} />
        再次扫描
      </button>
    </motion.div>
  );
}
