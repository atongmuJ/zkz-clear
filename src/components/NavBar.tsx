import { motion } from "framer-motion";
import type { TabKey } from "../lib/types";
import { Icon, type IconName } from "./Icon";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "clean", label: "清理", icon: "broom" },
  { key: "optimize", label: "优化", icon: "gear" },
  { key: "analyze", label: "分析", icon: "chart" },
  { key: "cdrive", label: "C盘", icon: "drive" },
  { key: "status", label: "状态", icon: "pulse" },
];

interface NavBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export function NavBar({ active, onChange }: NavBarProps) {
  return (
    <nav className="navbar" aria-label="主导航">
      <div className="nav-mark"><img src="./assets/images/app-icon.png" alt="" /></div>
      <div className="nav-pills" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            className={`nav-pill ${active === tab.key ? "is-active" : ""}`}
            onClick={() => onChange(tab.key)}
          >
            {active === tab.key && (
              <motion.span
                layoutId="nav-active-pill"
                className="nav-pill-bg"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="nav-pill-label">
              <Icon name={tab.icon} size={14} />
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div className="nav-license"><span className="dot" />张开嘴清理 专业版</div>
    </nav>
  );
}
