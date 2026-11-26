import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon } from "../components/Icon";
import { cleanCDrive, getCDriveItems, getDisks } from "../lib/api";
import { errorMessage, formatBytes } from "../lib/format";
import type { CDriveItem, DiskInfo } from "../lib/types";

type Phase = "idle" | "cleaning" | "done";

export function CDriveView() {
  const [items, setItems] = useState<CDriveItem[]>([]);
  const [disk, setDisk] = useState<DiskInfo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [freed, setFreed] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getCDriveItems(), getDisks()])
      .then(([list, disks]) => {
        if (!active) return;
        setItems(list);
        setDisk(disks.find((d) => d.name === "C:") ?? disks[0]);
        setSelected(new Set(list.filter((i) => i.selected).map((i) => i.id)));
      })
      .catch((err) => { if (active) setError(errorMessage(err, "读取 C 盘信息失败")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggle = (id: string) => {
    setPhase("idle");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClean = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    setPhase("cleaning");
    setError("");
    try {
      const outcome = await cleanCDrive(ids);
      setFreed(outcome.freed);
      setSkipped(outcome.skipped.length);
      setPhase("done");
      // 只移除真正释放了空间的项目，未成功的保留在列表里，用户可重试
      const cleaned = new Set(ids.filter((id) => !outcome.skipped.includes(id)));
      setItems((prev) => prev.filter((i) => !cleaned.has(i.id)));
      setSelected(new Set(ids.filter((id) => outcome.skipped.includes(id))));
    } catch (err) {
      setError(errorMessage(err, "清理失败"));
      setPhase("idle");
    }
  };

  const selectedSize = items
    .filter((i) => selected.has(i.id))
    .reduce((sum, i) => sum + i.size, 0);
  const usedPercent = disk && disk.total > 0 ? (disk.used / disk.total) * 100 : 0;

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
            <strong>{Math.round(usedPercent)}%</strong>
            <span>已使用</span>
          </div>
        </div>
        <div className="cdrive-overview-info">
          <div className="overview-title">本地磁盘 (C:)</div>
          <div className="overview-numbers">
            <div><span>总容量</span><strong>{formatBytes(disk?.total ?? 0)}</strong></div>
            <div><span>已使用</span><strong>{formatBytes(disk?.used ?? 0)}</strong></div>
            <div><span>可用空间</span><strong className="accent">{formatBytes(disk?.free ?? 0)}</strong></div>
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
          {items.map((item, idx) => {
            const isSelected = selected.has(item.id);
            const isRisky = item.detail.includes("无法") || item.detail.includes("禁用");
            return (
              <motion.button
                type="button" key={item.id}
                className={`cdrive-row ${isSelected ? "selected" : ""}`}
                onClick={() => toggle(item.id)}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
              >
                <span className={`checkbox ${isSelected ? "checked" : ""}`}>
                  {isSelected && <Icon name="check" size={13} />}
                </span>
                <span className="cdrive-info">
                  <span className="cdrive-name">{item.name}</span>
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
          {items.length === 0 && (
            <div className="empty-state"><Icon name="check" size={28} /><p>没有可清理的项目了，C 盘很干净</p></div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {phase === "done" && (
          <motion.div className="inline-success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Icon name="check" size={17} />
            已为 C 盘释放 <strong>{formatBytes(freed)}</strong> 空间
            {skipped > 0 && (
              <em className="inline-note">
                另有 {skipped} 项未释放，可能需要以管理员身份运行
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
          disabled={selected.size === 0 || phase === "cleaning"}
          onClick={handleClean}
        >
          {phase === "cleaning" ? (
            <><motion.span className="mini-spinner" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />正在清理…</>
          ) : (
            <><Icon name="sparkle" size={17} />一键释放空间</>
          )}
        </button>
      </footer>
    </div>
  );
}
