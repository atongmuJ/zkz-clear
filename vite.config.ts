import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  // Tauri 使用 file:// 协议加载前端，base 必须为相对路径
  base: "./",
  define: {
    // 版本号只在 package.json 里维护，避免界面上写死的版本跟发布版本对不上
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: true,
    // 允许本机以外的 Tauri dev 环境访问
    host: "127.0.0.1",
  },
  build: {
    target: "chrome110",
    outDir: "dist",
    emptyOutDir: true,
  },
});
