import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { Icon } from "../components/Icon";
import { getDisks, getFolderUsage, getLargeFiles } from "../lib/api";
import { errorMessage, formatBytes, formatPercent } from "../lib/format";
import type { DiskInfo, FolderUsage, LargeFile } from "../lib/types";

function Donut({ percent, size = 116, stroke = 9 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);
  const color = percent > 85 ? "#e8836b" : percent > 70 ? "#d9a55c" : "#6d9fd8";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.07)" strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  );
}

export function AnalyzeView() {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [folders, setFolders] = useState<FolderUsage[]>([]);
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [loadingDisks, setLoadingDisks] = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState("");
  const [selectedDisk, setSelectedDisk] = useState(0);

  // 三个请求互相独立：磁盘信息很快，先渲染出来；目录统计与全盘扫描可能较慢，
  // 各自显示占位，避免用户对着整页骨架干等。
  useEffect(() => {
    let active = true;

    getDisks()
      .then((d) => { if (active) setDisks(d); })
      .catch((err) => { if (active) setError(errorMessage(err, "读取磁盘信息失败")); })
      .finally(() => { if (active) setLoadingDisks(false); });

    getFolderUsage()
      .then((f) => { if (active) setFolders(f); })
      .catch((err) => { if (active) setError(errorMessage(err, "统计目录占用失败")); })
      .finally(() => { if (active) setLoadingFolders(false); });

    getLargeFiles()
      .then((l) => { if (active) setFiles(l); })
      .catch((err) => { if (active) setError(errorMessage(err, "扫描大文件失败")); })
      .finally(() => { if (active) setLoadingFiles(false); });

    return () => { active = false; };
  }, []);

  return (
    <div className="view standard-view">
      <header className="view-header">
        <div>
          <h1>磁盘分析</h1>
          <p>了解空间都被什么占用了</p>
        </div>
        <span className="header-badge">
          <Icon name="chart" size={15} />
          {loadingDisks ? "读取中" : `${disks.length} 个磁盘`}
        </span>
      </header>

      <ErrorBanner message={error} onClose={() => setError("")} />

      <section className="disk-grid">
        {loadingDisks
          ? [0, 1, 2].map((i) => <div className="skeleton-card" key={i} />)
          : disks.map((disk, idx) => {
              const usedPercent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;
              return (
                <motion.button
                  key={disk.name}
                  type="button"
                  className={`disk-card ${selectedDisk === idx ? "active" : ""}`}
                  onClick={() => setSelectedDisk(idx)}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07, duration: 0.35 }}
                >
                  <div className="disk-donut">
                    <Donut percent={usedPercent} />
                    <div className="donut-label">
                      <strong>{Math.round(usedPercent)}%</strong>
                      <span>已使用</span>
                    </div>
                  </div>
                  <div className="disk-meta">
                    <div className="disk-name"><Icon name="drive" size={16} />{disk.name}</div>
                    <div className="disk-capacity">{formatBytes(disk.used)} / {formatBytes(disk.total)}</div>
                    <div className="disk-free">可用 {formatBytes(disk.free)}</div>
                  </div>
                </motion.button>
              );
            })}
      </section>

      <div className="analysis-columns">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>空间占用分布</h2>
              <p>系统盘主要目录的占用</p>
            </div>
          </div>
          {loadingFolders ? (
            <>
              <p className="loading-hint">正在统计各目录占用，首次分析可能需要几十秒…</p>
              <ListSkeleton />
            </>
          ) : (
            <div className="folder-list">
              {folders.map((folder, idx) => (
                <div className="folder-row" key={folder.path}>
                  <div className="folder-top">
                    <span><Icon name="folder" size={14} />{folder.name}</span>
                    <span>{formatBytes(folder.size)} · {formatPercent(folder.percent)}</span>
                  </div>
                  <div className="folder-track">
                    <motion.div
                      className="folder-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${folder.percent}%` }}
                      transition={{ delay: idx * 0.08, duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>大文件</h2>
              <p>超过 100 MB 的文件，按大小排序</p>
            </div>
            <span className="panel-stat">{loadingFiles ? "扫描中" : `Top ${files.length}`}</span>
          </div>
          {loadingFiles ? (
            <>
              <p className="loading-hint">正在扫描常用目录与数据盘，可能需要几十秒…</p>
              <ListSkeleton rows={5} />
            </>
          ) : files.length === 0 ? (
            <p className="loading-hint">没有找到超过 100 MB 的文件。</p>
          ) : (
            <div className="large-file-list">
              {files.map((file, idx) => (
                <motion.div
                  className="large-file-row" key={file.path}
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                >
                  <span className="file-rank">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="file-info">
                    <span className="file-name">{file.name}</span>
                    <span className="file-path">{file.path}</span>
                  </span>
                  <span className="file-size">{formatBytes(file.size)}</span>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
