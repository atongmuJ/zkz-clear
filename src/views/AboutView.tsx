import { motion } from "framer-motion";
import { Icon, type IconName } from "../components/Icon";

interface AboutRow {
  icon: IconName;
  label: string;
  value: string;
  note?: string;
}

const ROWS: AboutRow[] = [
  {
    icon: "star",
    label: "作者",
    value: "hjj大王",
    note: "一个想把电脑打理干净的人",
  },
  {
    icon: "shield",
    label: "免责声明",
    value: "仅供个人学习使用",
    note: "请勿用于商业用途或任何非法场景",
  },
  {
    icon: "info",
    label: "当前版本",
    value: `v${__APP_VERSION__}`,
    note: "版本号与新版本发布保持一致",
  },
  {
    icon: "sparkle",
    label: "友情赞助",
    value: "长沙市长丰机电电动工具",
    note: "感谢一路的支持与陪伴",
  },
];

export function AboutView() {
  return (
    <div className="view standard-view about-view">
      <header className="view-header">
        <div>
          <h1>关于</h1>
          <p>关于这款软件，以及背后的人</p>
        </div>
      </header>

      <section className="panel about-hero">
        <motion.div
          className="about-logo"
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <img src="./assets/images/app-icon.png" alt="张开嘴清理图标" />
        </motion.div>
        <motion.div
          className="about-brand"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.4 }}
        >
          <h2>张开嘴清理</h2>
          <p>轻量 · 安静 · 把空间还给你</p>
        </motion.div>
      </section>

      <section className="panel about-list">
        {ROWS.map((row, i) => (
          <motion.div
            className="about-row"
            key={row.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.09, duration: 0.35 }}
          >
            <span className="about-row-icon"><Icon name={row.icon} size={19} /></span>
            <div className="about-row-body">
              <span className="about-row-label">{row.label}</span>
              <strong className="about-row-value">{row.value}</strong>
              {row.note && <span className="about-row-note">{row.note}</span>}
            </div>
          </motion.div>
        ))}
      </section>

      <p className="about-footer">张开嘴清理 · 让每一次清理都安心</p>
    </div>
  );
}
