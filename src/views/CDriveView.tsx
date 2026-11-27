import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon } from "../components/Icon";
import { RiskConfirmDialog } from "../components/RiskConfirmDialog";
import { cleanCDrive, clearApiCache, getCDriveItems, getDisks, recordCleanup } from "../lib/api";
import { errorMessage, formatBytes } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import type { CDriveItem, DeepWarning, DiskInfo } from "../lib/types";

type Phase = "idle" | "cleaning" | "done";

export function CDriveView() {
  const [items, setItems] = useState<CDriveItem[]>([]);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [freed, setFreed] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [skippedNames, setSkippedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deepMode, setDeepMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getCDriveItems(deepMode), getDisks()])
      .then(([list, disks]) => {
        if (!active) return;
        setItems(list);
        setDisk(disks.find((d) => d.name === "C:") ?? disks[0]);
        // 深度项默认不勾选，防止误删
        setSelected(new Set(list.filter((i) => i.selected && !i.deep).map((i) => i.id)));
      })
      .catch((err) => { if (active) setError(errorMessage(err, "读取 C 盘信息失败")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deepMode]);

  const toggle = (id: string) => {
    if (phase === "cleaning" || loading) return;
    setPhase("idle");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runClean = async () => {
    if (phase === "cleaning") return;
    setConfirmOpen(false);
    const ids = Array.from(selected);
    setPhase("cleaning");
    setError("");
    try {
      const outcome = await cleanCDrive(ids, deepMode);
      // 磁盘占用与 C 盘项目已变化，让只读缓存失效，避免切页后看到旧数据
      clearApiCache();
      setFreed(outcome.freed);
      const includedDeep = outcome.details.some((detail) => detail.deep);
      void recordCleanup(outcome.freed, includedDeep).catch(() => { /* 记录失败不影响结果 */ });
      setSkipped(outcome.skipped.length);
      setSkippedNames(items.filter((i) => outcome.skipped.includes(i.id)).map((i) => i.name));
      setPhase("done");
      // 真正的清理完成后让仪表盘跟着回落，而不是停在清理前的读数
      if (outcome.freed > 0) {
        setDisk((prev) =>
          prev
            ? {
                ...prev,
                used: Math.max(0, prev.used - outcome.freed),
                free: Math.min(prev.total, prev.free + outcome.freed),
              }
            : prev
        );
      }
      // 只移除真正释放了空间的项目，未成功的保留在列表里，用户可重试
      const cleaned = new Set(ids.filter((id) => !outcome.skipped.includes(id)));
      setItems((prev) => prev.filter((i) => !cleaned.has(i.id)));
      setSelected(new Set(ids.filter((id) => outcome.skipped.includes(id))));
    } catch (err) {
      setError(errorMessage(err, "清理失败，请检查权限后重试"));
      setPhase("idle");
    }
  };

  // warning 非空 = 该项有明确的数据/配置影响，执行前必须确认
  const riskySelected = items.filter((i) => selected.has(i.id) && i.warning.trim().length > 0);

  const handleClean = () => {
    if (selected.size === 0 || phase === "cleaning") return;
    if (riskySelected.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void runClean();
  };

  const deepWarnings: DeepWarning[] = riskySelected.map((i) => ({
    name: i.name,
    warning: i.warning,
  }));
  const deepSelectedSize = riskySelected.reduce((sum, i) => sum + i.size, 0);

  const selectedSize = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + i.size, 0);
  const total = disk?.total ?? 0;
  const usedPercent = total > 0 ? ((disk?.used ?? 0) / total) * 100 : 0;

  // 数字与弧线同步：清理后已用空间从原值滚到新值，可用空间反向增加
  const shownUsed = useCountUp(disk?.used ?? 0, 800);
  const shownFree = useCountUp(disk?.free ?? 0, 800);
  const shownFreed = useCountUp(freed, 900);
  const shownPercent = total > 0 ? (shownUsed / total) * 100 : 0;

  if (loading) {
    return (
      <div className="view standard-view">
        <header className="view-header"><div><h1>C 盘清理</h1><p>为系统盘专项瘦身</p></div></header>
        <div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /></div>
      </div>
    );
  }

  return (
    <div className="view standard-view">
      <header className="view-header">
        <div>
          <h1>C 盘清理</h1>
          <p>为系统盘专项瘦身，安全释放宝贵空间</p>
        </div>
        <span className="header-badge warning"><Icon name="drive" size={15} />系统盘</span>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <label className={`cdrive-mode-switch ${deepMode ? "on" : ""}`}>
        <input
          type="checkbox"
          checked={deepMode}
          disabled={phase === "cleaning" || loading}
          onChange={(e) => {
            if (phase === "cleaning" || loading) return;
            setDeepMode(e.target.checked);
            setPhase("idle");
          }}
        />
        <span className="mode-switch-track"><span className="mode-switch-knob" /></span>
        <Icon name="warning" size={15} />
        <span className="cdrive-mode-title">深度清理模式</span>
        <span className="cdrive-mode-desc">
          {deepMode
            ? "已加入更新分发缓存、错误报告、安装日志等深度项，删除前将逐项确认"
            : "仅清理更新缓存与临时文件；开启后可释放更多空间，但需确认风险"}
        </span>
      </label>

      <section className="cdrive-overview">
        <div className="cdrive-gauge">
          <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
            <circle cx="75" cy="75" r="62" stroke="rgba(255,255,255,.07)" strokeWidth="11" fill="none" />
            <motion.circle
              cx="75" cy="75" r="62" stroke="#6d9fd8" strokeWidth="11" fill="none"
              strokeLinecap="round" strokeDasharray={2 * Math.PI * 62}
              initial={{ strokeDashoffset: 2 * Math.PI * 62 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 62 * (1 - usedPercent / 100) }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              transform="rotate(-90 75 75)"
            />
          </svg>
          <div className="gauge-label">
            <strong>{Math.round(shownPercent)}%</strong>
            <span>已使用</span>
          </div>
        </div>
        <div className="cdrive-overview-info">
          <div className="overview-title">本地磁盘 (C:)</div>
          <div className="overview-numbers">
            <div><span>总容量</span><strong>{formatBytes(disk?.total ?? 0)}</strong></div>
            <div><span>已使用</span><strong>{formatBytes(shownUsed)}</strong></div>
            <div><span>可用空间</span><strong className="accent">{formatBytes(shownFree)}</strong></div>
          </div>
          <div className="overview-bar">
            <motion.div initial={{ width: 0 }} animate={{ width: `${usedPercent}%` }} transition={{ duration: 1 }} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div><h2>可清理项目</h2><p>勾选后立即释放对应空间</p></div>
          <span className="panel-stat">{items.length} 项 · 最多可释放 {formatBytes(items.reduce((s, i) => s + i.size, 0))}</span>
        </div>
        <div className="cdrive-list">
          <AnimatePresence>
            {items.map((item, idx) => {
              const isSelected = selected.has(item.id);
              const isRisky = item.warning.trim().length > 0;
              return (
                <motion.button
                  type="button" key={item.id}
                  layout
                  className={`cdrive-row ${isSelected ? "selected" : ""}${phase === "cleaning" && isSelected ? " is-busy" : ""}`}
                  disabled={phase === "cleaning" || loading}
                  onClick={() => toggle(item.id)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 16, transition: { duration: 0.22 } }}
                  transition={{
                    duration: 0.3,
                    delay: Math.min(idx, 8) * 0.04,
                    layout: { duration: 0.26, delay: 0 },
                  }}
                >
                  <span className={`checkbox ${isSelected ? "checked" : ""}`}>
                    {isSelected && <Icon name="check" size={13} />}
                  </span>
                  <span className="cdrive-info">
                    <span className="cdrive-name">
                      {item.name}
                      {item.deep && <span className="deep-tag">深度</span>}
                      {item.needsAdmin && <span className="admin-tag">需管理员</span>}
                    </span>
                    <span className="cdrive-desc">{item.description}</span>
                    <span className={`cdrive-detail ${isRisky ? "risky" : ""}`}>
                      <Icon name={isRisky ? "warning" : "info"} size={12} />
                      {item.detail}
                    </span>
                  </span>
                  <span className="cdrive-size">{formatBytes(item.size)}</span>
                </motion.button>
              );
            })}
          </AnimatePresence>
          {items.length === 0 && (
            <div className="empty-state"><Icon name="check" size={28} /><p>没有可清理的项目了，C 盘很干净</p></div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {phase === "done" && (
          <motion.div className="inline-success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Icon name="check" size={17} />
            已为 C 盘释放 <strong>{formatBytes(shownFreed)}</strong> 空间
            {skipped > 0 && (
              <em className="inline-note">
                {skippedNames.length > 0
                  ? `${skippedNames.join("、")} 未释放，请右键「以管理员身份运行」后重试`
                  : `另有 ${skipped} 项未释放，可能需要以管理员身份运行`}
              </em>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="result-footer sticky-footer">
        <div className="selected-summary">
          已选 <strong>{selected.size}</strong> 项
          <span className="summary-size">{formatBytes(selectedSize)}</span>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={selected.size === 0 || phase === "cleaning" || loading}
          onClick={handleClean}
        >
          {phase === "cleaning" ? (
            <><motion.span className="mini-spinner" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />正在清理…</>
          ) : (
            <><Icon name="sparkle" size={17} />一键释放空间</>
          )}
        </button>
      </footer>

      <RiskConfirmDialog
        open={confirmOpen}
        scope="cdrive"
        title="清除风险须知"
        warnings={deepWarnings}
        size={deepSelectedSize}
        onConfirm={runClean}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
