import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { NavBar } from "./components/NavBar";
import { TitleBar } from "./components/TitleBar";
import type { TabKey } from "./lib/types";
import { AnalyzeView } from "./views/AnalyzeView";
import { CDriveView } from "./views/CDriveView";
import { CleanView } from "./views/CleanView";
import { OptimizeView } from "./views/OptimizeView";
import { StatusView } from "./views/StatusView";

export default function App() {
  const [tab, setTab] = useState<TabKey>("clean");

  return (
    <div className="app-shell">
      <div className="ambient-glow" aria-hidden="true" />
      <TitleBar />
      <NavBar active={tab} onChange={setTab} />
      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className="view-wrapper"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === "clean" && <CleanView />}
            {tab === "optimize" && <OptimizeView />}
            {tab === "analyze" && <AnalyzeView />}
            {tab === "cdrive" && <CDriveView />}
            {tab === "status" && <StatusView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
