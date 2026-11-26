import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon } from "../components/Icon";
import { getStartupItems, setStartupEnabled } from "../lib/api";
import { errorMessage } from "../lib/format";
import type { StartupItem } from "../lib/types";

export function OptimizeView() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStartupItems()
      .then((data) => { if (active) setItems(data); })
      .catch((err) => { if (active) setError(errorMessage(err, "读取启动项失败")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const toggle = async (item: StartupItem) => {
    setBusy(item.name);
    setError("");
    try {
      const ok = await setStartupEnabled(item.name, !item.enabled);
      if (ok) {
        setItems((prev) =>
          prev.map((i) => (i.name === item.name ? { ...i, enabled: !i.enabled } : i))
        );
      }
    } catch (err) {
      setError(errorMessage(err, "操作失败"));
    } finally {
      setBusy(null);
    }
  };

  const enabledCount = items.filter((i) => i.enabled).length;
  const loadRatio = items.length > 0 ? (enabledCount / items.length) * 100 : 0;

  return (
    <div className="view standard-view">
      <header className="view-header">
        <div>
          <h1>系统优化</h1>
          <p>管理开机启动项，让 Windows 启动更快</p>
        </div>
        <span className="header-badge"><Icon name="gear" size={15} />启动项</span>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>开机启动项</h2>
            <p>禁用不必要的程序，可显著缩短开机时间</p>
          </div>
          <span className="panel-stat">共 {items.length} 项 · 已启用 {enabledCount} 项</span>
        </div>

        {loading ? (
          <div className="skeleton-list">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-row" />)}
          </div>
        ) : (
          <>
            {/* 每关掉一项，这条负载就短一截，比单纯改文字更直观 */}
            <div className="startup-meter">
              <div className="startup-meter-top">
                <span>开机启动负载</span>
                <motion.span key={enabledCount} initial={{ opacity: 0.4, y: -3 }} animate={{ opacity: 1, y: 0 }}>
                  {enabledCount} / {items.length} 项启用
                </motion.span>
              </div>
              <div className="startup-meter-track">
                <motion.div
                  className={`startup-meter-fill ${loadRatio <= 40 ? "light" : ""}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${loadRatio}%` }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            <div className="startup-list">
              {items.map((item, idx) => (
                <motion.div
                  key={item.name}
                  className={`startup-row${busy === item.name ? " is-busy" : ""}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                >
                  <span className={`startup-icon ${item.enabled ? "" : "off"}`}>
                    <Icon name="gear" size={18} />
                  </span>
                  <motion.span
                    className="startup-info"
                    animate={{ opacity: item.enabled ? 1 : 0.58 }}
                    transition={{ duration: 0.28 }}
                  >
                    <span className="startup-name">{item.name}</span>
                    <span className="startup-meta">{item.publisher} · {item.location}</span>
                    <span className="startup-command">{item.command}</span>
                  </motion.span>
                  <span className={`status-tag ${item.enabled ? "on" : ""}`}>
                    {item.enabled ? "已启用" : "已禁用"}
                  </span>
                  <button
                    type="button"
                    className={`toggle ${item.enabled ? "on" : ""}${busy === item.name ? " is-busy" : ""}`}
                    disabled={busy === item.name}
                    onClick={() => toggle(item)}
                    aria-label={`${item.enabled ? "禁用" : "启用"} ${item.name}`}
                    aria-pressed={item.enabled}
                  >
                    <span className="toggle-knob" />
                  </button>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="advice-grid">
        <div className="advice-card">
          <span className="advice-icon"><Icon name="sparkle" size={20} /></span>
          <div>
            <h3>启动优化建议</h3>
            <p>网盘同步、游戏平台、软件更新助手这类程序通常无需开机自启，禁用后可缩短启动时间。</p>
          </div>
        </div>
        <div className="advice-card">
          <span className="advice-icon"><Icon name="shield" size={20} /></span>
          <div>
            <h3>安全提示</h3>
            <p>仅禁用你确认不需要的程序。系统组件与驱动相关启动项请保持启用，以免影响硬件功能。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
