import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon, type IconName } from "../components/Icon";
import { getSystemStatus } from "../lib/api";
import { errorMessage, formatBytes, formatDuration, formatPercent } from "../lib/format";
import type { SystemStatus } from "../lib/types";

function MetricCard({
  icon, title, value, detail, percent, delay,
}: {
  icon: IconName; title: string; value: string; detail: string; percent: number; delay: number;
}) {
  return (
    <motion.div
      className="metric-card"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="metric-top">
        <span className="metric-icon"><Icon name={icon} size={19} /></span>
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-track">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${Math.min(percent, 100)}%` }}
          transition={{ delay: delay + 0.15, duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <div className="metric-detail">{detail}</div>
    </motion.div>
  );
}

export function StatusView() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (shouldApply: () => boolean = () => true) => {
    try {
      const data = await getSystemStatus();
      if (shouldApply()) {
        setStatus(data);
        setError("");
      }
    } catch (err) {
      if (shouldApply()) setError(errorMessage(err, "读取系统状态失败"));
    } finally {
      if (shouldApply()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  if (loading || !status) {
    return (
      <div className="view standard-view">
        <header className="view-header"><div><h1>系统状态</h1><p>实时了解电脑运行状况</p></div></header>
        <div className="skeleton-grid"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>
      </div>
    );
  }

  const memPercent = status.memoryTotal > 0 ? (status.memoryUsed / status.memoryTotal) * 100 : 0;
  const diskPercent = status.diskTotal > 0 ? (status.diskUsed / status.diskTotal) * 100 : 0;

  return (
    <div className="view standard-view">
      <header className="view-header">
        <div>
          <h1>系统状态</h1>
          <p>实时了解电脑运行状况</p>
        </div>
        <button type="button" className="ghost-btn" onClick={refresh} disabled={refreshing}>
          <motion.span animate={refreshing ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.8, repeat: refreshing ? Infinity : 0, ease: "linear" }}>
            <Icon name="refresh" size={15} />
          </motion.span>
          刷新
        </button>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <section className="metric-grid">
        <MetricCard
          icon="cpu" title="处理器" value={formatPercent(status.cpuUsage)}
          detail={`当前负载 · ${status.cpuUsage < 40 ? "状态良好" : status.cpuUsage < 75 ? "中等负载" : "负载较高"}`}
          percent={status.cpuUsage} delay={0}
        />
        <MetricCard
          icon="memory" title="内存" value={`${formatBytes(status.memoryUsed)} / ${formatBytes(status.memoryTotal)}`}
          detail={`已使用 ${formatPercent(memPercent)}`} percent={memPercent} delay={0.07}
        />
        <MetricCard
          icon="drive" title="系统盘" value={`${formatBytes(status.diskUsed)} / ${formatBytes(status.diskTotal)}`}
          detail={`可用 ${formatBytes(status.diskTotal - status.diskUsed)}`} percent={diskPercent} delay={0.14}
        />
      </section>

      <section className="panel system-info-panel">
        <div className="panel-header"><div><h2>系统信息</h2><p>当前设备概况</p></div></div>
        <div className="info-grid">
          <div className="info-item"><span>操作系统</span><strong>{status.osVersion}</strong></div>
          <div className="info-item"><span>运行时间</span><strong>{formatDuration(parseDuration(status.uptime))}</strong></div>
          <div className="info-item"><span>处理器架构</span><strong>x64</strong></div>
          <div className="info-item"><span>应用版本</span><strong>张开嘴清理 0.1.0</strong></div>
        </div>
      </section>

      <section className="advice-grid">
        <div className="advice-card">
          <span className="advice-icon"><Icon name="pulse" size={20} /></span>
          <div>
            <h3>{status.cpuUsage >= 75 || memPercent >= 85 ? "负载偏高" : "运行良好"}</h3>
            <p>
              {status.cpuUsage >= 75 || memPercent >= 85
                ? "当前 CPU 或内存占用较高，可关闭不用的程序，或先做一次清理再观察。"
                : "当前 CPU 与内存占用处于正常范围。定期使用「清理」功能可保持系统流畅。"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** 把 mock 中的 "3 天 7 小时" 粗解析为秒，仅用于展示格式化 */
function parseDuration(text: string): number {
  const days = Number(text.match(/(\d+)\s*天/)?.[1] ?? 0);
  const hours = Number(text.match(/(\d+)\s*小时/)?.[1] ?? 0);
  return days * 86400 + hours * 3600;
}
