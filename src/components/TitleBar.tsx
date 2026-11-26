import { windowAction } from "../lib/api";
import { Icon } from "./Icon";

export function TitleBar() {
  const run = (action: "minimize" | "maximize" | "close") => {
    // 窗口操作失败时保持静默，避免未处理的 Promise 拒绝干扰界面。
    void windowAction(action).catch(() => {});
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-app" data-tauri-drag-region>
        <span className="titlebar-mark"><img src="./assets/images/app-icon.png" alt="" /></span>
        <span data-tauri-drag-region>张开嘴清理</span>
      </div>
      <div className="titlebar-controls">
        <button type="button" aria-label="最小化" onClick={() => run("minimize")}>
          <Icon name="minus" size={14} />
        </button>
        <button type="button" aria-label="最大化" onClick={() => run("maximize")}>
          <Icon name="square" size={12} />
        </button>
        <button type="button" aria-label="关闭" className="tb-close" onClick={() => run("close")}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
