import { motion } from "framer-motion";
import type { KeyboardEvent } from "react";
import type { TabKey } from "../lib/types";
import { Icon, type IconName } from "./Icon";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "clean", label: "清理", icon: "broom" },
  { key: "optimize", label: "优化", icon: "gear" },
  { key: "analyze", label: "分析", icon: "chart" },
  { key: "cdrive", label: "C盘", icon: "drive" },
  { key: "software", label: "软件", icon: "software" },
  { key: "status", label: "状态", icon: "pulse" },
  { key: "about", label: "关于", icon: "info" },
];

interface NavBarProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

export function NavBar({ active, onChange }: NavBarProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    onChange(TABS[next].key);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
  };

  return (
    <nav className="navbar" aria-label="主导航">
      <div className="nav-mark"><img src="./assets/images/app-icon.png" alt="" /></div>
      <div className="nav-pills" role="tablist">
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            aria-controls={`panel-${tab.key}`}
            tabIndex={active === tab.key ? 0 : -1}
            className={`nav-pill ${active === tab.key ? "is-active" : ""}`}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
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
