import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Tauri 使用 file:// 协议加载前端，base 必须为相对路径
  base: "./",
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
