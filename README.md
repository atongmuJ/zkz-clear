# 张开嘴清理 · zkz-clear

轻量、免登录、无广告的 Windows 清理工具。深蓝星空界面，一个白色按钮扫完一键清干净。

![Tauri](https://img.shields.io/badge/Tauri-2.12-24C8DB) ![React](https://img.shields.io/badge/React-19-61DAFB) ![Rust](https://img.shields.io/badge/Rust-stable-CE422B) ![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4)

## 直接下载

到 [Releases](../../releases) 页面下载 exe，**不用解压、不用装环境**：

| 文件 | 安装方式 | 适合谁 |
| --- | --- | --- |
| `ZhangZuiCleaner-Setup-*-x64.exe` | 安装包：双击安装，自动创建桌面与开始菜单快捷方式 | 想长期固定在这台电脑上用 |
| `ZhangZuiCleaner-Green-*-x64.zip` | 绿色版：解压后双击文件夹里的「张开嘴清理.exe」；删除文件夹即卸载 | 想免安装、拷 U 盘、换电脑用 |

两种方式功能完全一致、数据各自独立，按需选一个即可。绿色包内附「使用说明.txt」。

系统要求：Windows 10 1803+ / Windows 11。首次运行若被 SmartScreen 拦截，点「更多信息」→「仍要运行」（程序未做代码签名）。

## 功能

- **垃圾清理** — 系统/用户临时文件、各浏览器缓存、回收站、崩溃转储、缩略图缓存，按风险分级勾选；可选「深度清理」扩展可再生缓存
- **系统优化** — 开机启动项启停，改动前自动备份注册表值，可还原
- **磁盘分析** — 目录占用排行 + 大文件定位（跳过 junction，不会死循环）
- **C 盘清理** — 更新缓存、临时文件、休眠文件、系统还原点、Windows.old 等，需管理员权限的会明确标注
- **系统状态** — CPU / 内存 / 磁盘实时概览
- **关于** — 作者、免责声明、版本信息与友情赞助

## 安全说明

清理只触碰缓存子项，不动个人数据：

- 浏览器只删 `cache2` 等缓存目录，**书签、密码、历史记录不受影响**
- 缩略图只删 `thumbcache_*.db`，不整目录清空
- 回收站只清空目录内容，保留 SID 目录本身
- 启动项优化写入注册表备份键 `ZhangZuiBackup`，可随时恢复

## 本地开发

```bash
npm install
npm run dev          # 浏览器预览（自动使用模拟数据）
npm run tauri dev    # 桌面端调试
```

在浏览器里打开时前端会检测不到 Tauri 环境，自动切到 mock 数据，可以直接调界面。

## 构建 Windows 安装包

三种方式，任选：

1. **GitHub Actions（推荐）** — 推 `v*` 标签或手动触发 `build-windows` workflow，产物自动挂到 Release
2. **本地一键脚本** — Windows 上双击 `build-windows.bat`，自动装依赖并出包
3. **手动** — `npm install && npm run tauri build`，产物在 `src-tauri/target/release/bundle/nsis`

详细的 Windows 构建与排错见 [README-Windows.md](README-Windows.md)。

## 项目结构

```
src/                  React 前端（views / components / lib）
src-tauri/src/
  commands/           cleanup / optimize / analyze / cdrive / system
  platform.rs         Windows 平台层：安全删目录、注册表、进程调用
portable/             纯 PowerShell 免安装版（无 Tauri 依赖的备用方案）
```

所有耗时命令走 `spawn_blocking`，扫描上万文件时界面不会假死。

## 许可

MIT
