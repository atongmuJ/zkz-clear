# 张开嘴清理 · Windows 版

一个轻量的 Windows 清理工具。深蓝界面、3D 地球、胶囊导航，五个页面：
垃圾清理 / 系统优化 / 磁盘分析 / C 盘清理 / 系统状态。

- 前端 React 19 + TypeScript + Vite
- 后端 Rust（Tauri 2），复用系统 WebView2，安装包只有几 MB
- 所有清理逻辑在本地执行，不联网、不上报

---

## 一、用 GitHub 打包出 exe（推荐，不需要 Windows 电脑）

仓库里已经配好 `.github/workflows/build-windows.yml`，在 GitHub 的 Windows 机器上编译，
产出两个文件，直接下载就能发人：

| 产物 | 用途 |
| --- | --- |
| `ZhangZuiCleaner-Setup-0.1.0-x64.exe` | 安装版。装完桌面和开始菜单出现「张开嘴清理」，图标是定制图标 |
| `ZhangZuiCleaner-Portable-0.1.0-x64.exe` | 免安装版。双击直接运行，可放 U 盘 |

### 第 1 步：新建仓库并上传代码

在 GitHub 新建一个空仓库（Private 也完全够用，Actions 免费额度对私有仓库同样可用），
然后把 **`mole-win` 目录里的全部内容**上传上去。

用命令行最省事（在 `mole-win` 目录下执行）：

```bash
git init
git add .
git commit -m "张开嘴清理"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

用网页上传的话：仓库页 → **Add file → Upload files**，把文件拖进去。
`node_modules`、`dist`、`src-tauri/target` 这三个目录**不要上传**（体积大且能自动重建），
`.gitignore` 已经帮你排除了，用 git 命令提交时不会带上。

> 上传后确认仓库根目录能看到 `.github` 文件夹和 `package.json`。
> `.github` 是隐藏目录，网页上传时要单独进到里面把 `workflows/build-windows.yml` 拖对位置：
> 最终路径必须是 `.github/workflows/build-windows.yml`。

### 第 2 步：点一下构建

仓库页面 → **Actions** 标签 → 左侧选 **build-windows** → 右侧 **Run workflow** → 绿色按钮确认。

等 6–10 分钟（首次要下载 Rust 依赖和 NSIS 打包工具，之后有缓存会快很多）。
构建过程会依次做：装 Node 依赖 → 编译前端 → 编译 Rust → 打 NSIS 安装包 → 校验产物是否存在。

### 第 3 步：拿 exe

构建成功后有两种拿法，任选：

1. **Release（推荐，直接下载 exe）**：仓库首页右侧 **Releases** → 最新一条 →
   在 **Assets** 里点 `ZhangZuiCleaner-Setup-0.1.0-x64.exe`，浏览器直接下 exe，不用解压。
2. **Artifacts（打包成 zip）**：Actions 里那次运行的页面底部 → **Artifacts** →
   下载 `ZhangZuiCleaner-windows-x64.zip`，解压后是同样两个 exe。

> 如果只想自己留着、不想每次生成 Release，在 Run workflow 时把 `publish` 开关关掉即可，
> 那样只上传 Artifacts。

### 第 4 步：发给朋友

微信直接传 `ZhangZuiCleaner-Setup-0.1.0-x64.exe` 过去，附上这段话：

> 双击安装，装完桌面会有「张开嘴清理」。
> 第一次打开如果 Windows 弹「已保护你的电脑」，点「更多信息」→「仍要运行」（程序没买签名证书，属于正常现象）。
> 打开后点中间白色的「扫描电脑」，扫完点「清理选中项」就行。
> 「C 盘清理」里删休眠文件、还原点那些，要右键选「以管理员身份运行」才生效。

---

## 二、在 Windows 上本地构建（备用）

适合想改代码、或 GitHub 不方便的情况。

1. 把项目拷到 Windows（路径尽量不带空格）。
2. 双击根目录的 **`build-windows.bat`**，它会自动检测并安装 Node.js、MSVC 生成工具、Rust。
3. 完成后产物在 `src-tauri\target\release\`：
   - `ZhangZuiCleaner.exe` —— 免安装版
   - `bundle\nsis\张开嘴清理_0.1.0_x64-setup.exe` —— 安装版

手动构建（环境齐全时）：

```bat
npm install
npm run tauri build
```

---

## 三、程序里的五个页面

| 页面 | 做什么 | 需要管理员 |
| --- | --- | --- |
| 清理 | 扫描并清理：临时文件、Edge/Chrome/Firefox 缓存、回收站、系统日志与崩溃转储、预取记录、缩略图与图标缓存 | 部分需要 |
| 优化 | 列出注册表 Run（当前用户 + 系统）与启动文件夹里的开机启动项，可一键禁用/恢复 | 系统级项需要 |
| 分析 | 各磁盘容量环图、系统盘各目录占用、超过 100 MB 的大文件 Top 10 | 否 |
| C 盘 | Windows 更新缓存、休眠文件、系统还原点、Defender 隔离区、临时文件、Windows.old | 是（深度项） |
| 状态 | CPU 占用、内存用量、系统盘占用、运行时间、系统版本 | 否 |

普通权限就能用清理、优化、分析、状态。C 盘里的深度项目（休眠文件、还原点、
Windows.old、Defender 隔离区、更新缓存）要管理员权限，没权限时界面会明确提示
「另有 N 项未释放，可能需要以管理员身份运行」，不会假装成功。

**安全边界**（代码里刻意做的限制）：

- 浏览器缓存只删 `Cache`、`Code Cache`、`GPUCache`、Firefox 的 `cache2`，
  不碰书签、密码、历史记录
- 缩略图只删 `thumbcache_*.db` / `iconcache_*.db` 文件，不清空整个 Explorer 目录
- 回收站只清空各用户 SID 目录内部，保留目录本身
- 遍历时跳过 junction / 符号链接，避免 `C:\Users\*\AppData\Local\Application Data`
  这类自指链接造成无限递归
- 启动项禁用是「移动」不是「删除」：原值备份到
  `HKCU\Software\Microsoft\Windows\CurrentVersion\RunZkqBackup`，点回来即可恢复

---

## 四、这次构建前做了什么自检

代码层面已经跑过（在 macOS 上完成，交叉检查了 Windows 目标）：

| 检查 | 结果 |
| --- | --- |
| `npm run build`（tsc 类型检查 + Vite 打包） | 通过，451 个模块，JS gzip 127 KB |
| `cargo test` | 12 项全过（清理字节统计、缓存目录筛选、注册表解析、日期格式化等） |
| `cargo check --target x86_64-pc-windows-msvc` | 0 错误 0 警告，Windows 专属分支（隐藏控制台、reparse point、explorer 调用）均编译通过 |
| 图标 | 32/128/256/512 PNG + 256 ICO 全部 RGBA，无 alpha 异常 |
| 配置 | `tauri.conf.json` 通过 tauri-build 编译期解析；NSIS 语言锁定简体中文，安装模式为当前用户（不需要管理员） |

**你构建完成后可以这样验证**（3 分钟）：

1. 双击 exe，窗口 1120×760 出现，标题栏显示「张开嘴清理」，图标是人物头像。
2. 进「状态」页，CPU / 内存 / 磁盘数字与你机器实际相符（不是固定假数据）。
3. 进「分析」页，磁盘分区数量与你实际分区一致。
4. 回「清理」页点「扫描电脑」，进度条会走动、分类有具体大小；
   点「清理选中项」后显示「已释放 x GB」，再看 `%TEMP%` 目录确实少了东西。
5. 进「优化」页，能看到真实的开机启动项（名称是中文且不乱码）。

---

## 五、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击没反应 / 白屏 | 系统缺 WebView2 运行时 | 装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。Win11 和 Win10 1803+ 一般自带；用 Setup 版安装会自动补装 |
| 首次打开被 SmartScreen 拦 | 未做代码签名 | 「更多信息」→「仍要运行」 |
| 杀软报毒 | 未签名 + 程序会删文件 | 加信任。源码全在仓库里可审查 |
| C 盘清理提示部分未释放 | 非管理员 | 右键 exe →「以管理员身份运行」 |
| 清理后空间没变多少 | 浏览器/程序正在占用缓存文件 | 关掉浏览器再清理 |
| Actions 构建失败在某一步 | 看日志红字 | 常见是 `npm ci` 报 lock 文件不一致，本地跑一次 `npm install` 后提交新的 `package-lock.json` |
| 下载的 zip 里文件名乱码 | 用第三方解压工具 | 换 Windows 自带解压，或直接下 Release 里的 exe |

---

## 六、卸载与数据位置

- 安装版：设置 → 应用 →「张开嘴清理」→ 卸载。
- 免安装版：删掉 exe 即可。不写注册表、无后台服务、无计划任务。
- 被禁用过的启动项备份在 `HKCU\Software\Microsoft\Windows\CurrentVersion\RunZkqBackup`，
  卸载前建议先在「优化」页把需要的东西点回启用。

---

## 七、技术参数

- 目标平台：Windows 10 1803+ / Windows 11，x64
- 运行时依赖：系统自带 WebView2
- 前端：React 19 + TypeScript，产物 JS gzip ≈ 127 KB、CSS gzip ≈ 4.6 KB
- 后端：Rust `x86_64-pc-windows-msvc`，无额外运行库
- 安装包：NSIS，当前用户安装模式，简体中文界面
