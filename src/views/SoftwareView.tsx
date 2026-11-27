import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { ForceUninstallDialog } from "../components/ForceUninstallDialog";
import { Icon } from "../components/Icon";
import { SoftwareCardBody } from "../components/SoftwareCardBody";
import { SoftwareIcon } from "../components/SoftwareIcon";
import {
  clearApiCache,
  forceUninstallSoftware,
  getInstalledSoftware,
  getSoftwareIcons,
  openSoftwareLocation,
  previewForceUninstall,
  uninstallSoftware,
} from "../lib/api";
import { errorMessage, formatBytes } from "../lib/format";
import { useCountUp } from "../lib/useCountUp";
import {
  FORCE_CONFIRM_PHRASE,
  type InstalledSoftware,
  type SoftwareCleanupPlan,
  type SoftwareUninstallOutcome,
} from "../lib/types";

export function SoftwareView() {
  const [apps, setApps] = useState<InstalledSoftware[]>([]);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [normalTarget, setNormalTarget] = useState<InstalledSoftware | null>(null);
  const [forceTarget, setForceTarget] = useState<InstalledSoftware | null>(null);
  const [plan, setPlan] = useState<SoftwareCleanupPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SoftwareUninstallOutcome | null>(null);

  /** refresh=true 时绕过只读缓存，用于用户主动重新扫描或卸载后刷新 */
  const loadApps = useCallback(async (refresh = false) => {
    setScanning(true);
    setError("");
    try {
      const list = await getInstalledSoftware(refresh);
      setApps(list);
    } catch (err) {
      setError(errorMessage(err, "扫描已安装软件失败"));
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  // 图标是独立的一次性查询，失败不影响软件列表本身，只回退到通用图标。
  useEffect(() => {
    let cancelled = false;
    if (apps.length === 0) {
      setIcons({});
      return () => {
        cancelled = true;
      };
    }
    void getSoftwareIcons()
      .then((map) => {
        if (!cancelled) setIcons(map);
      })
      .catch(() => {
        if (!cancelled) setIcons({});
      });
    return () => {
      cancelled = true;
    };
  }, [apps]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    const list = keyword
      ? apps.filter((app) =>
          [app.name, app.publisher, app.installLocation]
            .join(" ")
            .toLocaleLowerCase()
            .includes(keyword)
        )
      : apps;
    return [...list].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  }, [apps, query]);

  const totalSize = apps.reduce((sum, app) => sum + app.size, 0);
  const existingCount = apps.filter((app) => app.pathExists).length;
  const shownTotal = useCountUp(totalSize, 900);
  // TOP 8 固定反映全部已安装应用，不受搜索过滤影响
  const topApps = useMemo(
    () => [...apps].sort((a, b) => b.size - a.size).slice(0, 8),
    [apps]
  );
  const maxTopSize = Math.max(1, ...topApps.map((app) => app.size));

  // 普通卸载弹窗支持 Esc 关闭，与强力卸载弹窗保持一致
  useEffect(() => {
    if (!normalTarget || busy) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNormalTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [normalTarget, busy]);

  const openDirectory = async (app: InstalledSoftware) => {
    setError("");
    try {
      await openSoftwareLocation(app.registryKey);
    } catch (err) {
      setError(errorMessage(err, `无法打开「${app.name}」的安装目录`));
    }
  };

  const runNormalUninstall = async () => {
    if (!normalTarget || busy) return;
    const target = normalTarget;
    setBusy(true);
    setNormalTarget(null);
    try {
      const result = await uninstallSoftware(target);
      setOutcome(result);
      // 卸载向导结束后列表可能已变化，清掉缓存并重新扫描
      if (result.success) {
        clearApiCache();
        void loadApps(true);
      }
    } catch (err) {
      setError(errorMessage(err, "启动卸载程序失败"));
    } finally {
      setBusy(false);
    }
  };

  const openForceDialog = async (app: InstalledSoftware) => {
    setError("");
    setOutcome(null);
    setForceTarget(app);
    setPlan(null);
    setPlanError("");
    setPlanLoading(true);
    try {
      const result = await previewForceUninstall(app);
      setPlan(result);
    } catch (err) {
      setPlanError(errorMessage(err, "无法生成清理范围"));
    } finally {
      setPlanLoading(false);
    }
  };

  const runForceUninstall = async (selectedIds: string[]) => {
    if (!forceTarget || busy) return;
    const target = forceTarget;
    setBusy(true);
    try {
      const result = await forceUninstallSoftware(target, FORCE_CONFIRM_PHRASE, selectedIds);
      setOutcome(result);
      if (result.success) {
        setApps((prev) => prev.filter((app) => app.registryKey !== target.registryKey));
        setForceTarget(null);
        setPlan(null);
        // 缓存里仍有这条记录，必须失效后再刷新，否则重新进入页面会看到已卸载的软件
        clearApiCache();
        void loadApps(true);
      }
    } catch (err) {
      setPlanError(errorMessage(err, "强力卸载失败"));
    } finally {
      setBusy(false);
    }
  };

  const closeForceDialog = () => {
    if (busy) return;
    setForceTarget(null);
    setPlan(null);
    setPlanError("");
  };

  if (loading) {
    return (
      <div className="view standard-view">
        <header className="view-header"><div><h1>电脑软件管理</h1><p>正在读取已安装应用…</p></div></header>
        <div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /></div>
      </div>
    );
  }

  return (
    <div className="view standard-view software-view">
      <header className="view-header">
        <div>
          <h1>电脑软件管理</h1>
          <p>查看已安装应用、占用空间与安装目录，按需选择普通或强力卸载</p>
        </div>
        <button type="button" className="ghost-btn" disabled={scanning} onClick={() => void loadApps(true)}>
          <motion.span
            className="refresh-icon"
            animate={scanning ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 0.9, repeat: scanning ? Infinity : 0, ease: "linear" }}
          >
            <Icon name="refresh" size={15} />
          </motion.span>
          {scanning ? "扫描中…" : "重新扫描"}
        </button>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <AnimatePresence>
        {outcome && (
          <motion.div
            className={`software-outcome ${outcome.success ? "success" : "failed"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="software-outcome-icon">
              <Icon name={outcome.success ? "check" : "warning"} size={18} />
            </span>
            <div className="software-outcome-body">
              <strong>{outcome.appName} · {outcome.mode === "force" ? "强力卸载" : "普通卸载"}</strong>
              <p>{outcome.message}</p>
              {outcome.freed > 0 && <span className="software-outcome-size">本次清理 {formatBytes(outcome.freed)}</span>}
              {outcome.needsRestart && <span className="admin-tag">需重启完成清理</span>}
              {outcome.results.length > 0 && (
                <ul className="software-result-list">
                  {outcome.results.map((result) => (
                    <li key={result.id} className={`result-${result.status}`}>
                      <span>{result.name}</span>
                      <em>{result.message}</em>
                      {result.freed > 0 && <strong>{formatBytes(result.freed)}</strong>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="icon-btn" aria-label="关闭结果提示" onClick={() => setOutcome(null)}>
              <Icon name="close" size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="software-stats">
        <div className="software-stat-card">
          <span className="software-stat-icon"><Icon name="software" size={18} /></span>
          <div><span>已安装应用</span><strong>{apps.length}</strong></div>
        </div>
        <div className="software-stat-card">
          <span className="software-stat-icon"><Icon name="drive" size={18} /></span>
          <div><span>登记/实测占用</span><strong>{formatBytes(shownTotal)}</strong></div>
        </div>
        <div className="software-stat-card">
          <span className="software-stat-icon"><Icon name="folder" size={18} /></span>
          <div><span>目录仍存在</span><strong>{existingCount}</strong></div>
        </div>
      </section>

      <section className="panel software-chart-panel">
        <div className="panel-header">
          <div><h2>空间占用 TOP 8</h2><p>快速定位最占空间的应用</p></div>
          <span className="panel-stat">按登记值或实测目录估算</span>
        </div>
        <div className="software-bars">
          {topApps.map((app, idx) => (
            <div className="software-bar-row" key={app.id}>
              <span className="software-bar-index">{String(idx + 1).padStart(2, "0")}</span>
              <SoftwareIcon name={app.name} iconUrl={icons[app.registryKey]} size={18} />
              <span className="software-bar-name" title={app.name}>{app.name}</span>
              <div className="software-bar-track">
                <motion.div
                  className="software-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, (app.size / maxTopSize) * 100)}%` }}
                  transition={{ duration: 0.8, delay: idx * 0.04, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
              <span className="software-bar-size">{formatBytes(app.size)}</span>
            </div>
          ))}
          {topApps.length === 0 && <div className="empty-state">没有可展示的软件数据</div>}
        </div>
      </section>

      <section className="panel software-list-panel">
        <div className="panel-header">
          <div><h2>已安装应用</h2><p>展示名称、版本、安装位置与占用空间</p></div>
          <label className="software-search">
            <Icon name="search" size={15} />
            <input
              type="text"
              value={query}
              placeholder="搜索软件、发布者或路径"
              aria-label="搜索已安装软件"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="software-grid">
          <AnimatePresence>
            {filtered.map((app, idx) => (
              <motion.article
                key={app.id}
                className="software-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, delay: Math.min(idx, 8) * 0.035 }}
              >
                <SoftwareCardBody
                  app={app}
                  iconUrl={icons[app.registryKey]}
                  busy={busy}
                  onOpenDirectory={(item) => void openDirectory(item)}
                  onNormalUninstall={setNormalTarget}
                  onForceUninstall={(item) => void openForceDialog(item)}
                />
              </motion.article>
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="empty-state"><Icon name="search" size={28} /><p>没有匹配的软件</p></div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {normalTarget && (
          <motion.div
            className="risk-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNormalTarget(null)}
          >
            <motion.div
              className="risk-dialog normal-uninstall-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="normal-uninstall-title"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="risk-head">
                <span className="risk-icon"><Icon name="trash" size={22} /></span>
                <div>
                  <h2 id="normal-uninstall-title">普通卸载</h2>
                  <p>{normalTarget.name}</p>
                </div>
              </div>
              <div className="risk-notice">
                <Icon name="shield" size={16} />
                <span>将调用软件自带的卸载程序，本工具不会删除任何额外目录或配置。卸载结果由软件向导决定。</span>
              </div>
              {normalTarget.uninstallString && (
                <div className="force-command"><span>卸载命令</span><code>{normalTarget.uninstallString}</code></div>
              )}
              <div className="risk-actions">
                <button type="button" className="ghost-btn" onClick={() => setNormalTarget(null)}>取消</button>
                <button type="button" className="primary-btn" onClick={() => void runNormalUninstall()}>
                  <Icon name="trash" size={16} />启动卸载向导
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ForceUninstallDialog
        open={forceTarget !== null}
        app={forceTarget}
        plan={plan}
        loading={planLoading}
        executing={busy}
        error={planError}
        onCancel={closeForceDialog}
        onConfirm={(ids) => void runForceUninstall(ids)}
      />
    </div>
  );
}
