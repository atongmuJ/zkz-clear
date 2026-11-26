@echo off
chcp 936 >nul
setlocal
title 张开嘴清理 - Windows 一键构建
cd /d "%~dp0"

set "EXE_NAME=ZhangZuiCleaner.exe"
set "PORTABLE_DIR=%~dp0张开嘴清理-便携版"

echo.
echo ============================================================
echo            张开嘴清理  -  Windows 一键构建
echo   自动检测环境 - 安装缺失依赖 - 构建 - 产出可运行程序
echo ============================================================
echo.

call :ensure_node
if errorlevel 1 goto :fail

call :ensure_msvc
if errorlevel 1 goto :fail

call :ensure_rust
if errorlevel 1 goto :fail

call :config_cargo_mirror

echo.
echo [4/6] 安装前端依赖（使用 npmmirror 镜像）...
call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo [5/6] 编译（首次 3-10 分钟，请勿关闭窗口）...
call npm run tauri -- build --no-bundle
if errorlevel 1 goto :fail

echo.
echo [6/6] 生成便携版目录...
if not exist "%PORTABLE_DIR%" mkdir "%PORTABLE_DIR%"
set "BUILT_EXE="
if exist "src-tauri\target\release\%EXE_NAME%" set "BUILT_EXE=src-tauri\target\release\%EXE_NAME%"
if not defined BUILT_EXE if exist "src-tauri\target\release\mole-win.exe" set "BUILT_EXE=src-tauri\target\release\mole-win.exe"
if not defined BUILT_EXE (
    echo       未找到编译产物，请把上面最后 20 行日志发给开发者。
    goto :fail
)
copy /y "%BUILT_EXE%" "%PORTABLE_DIR%\张开嘴清理.exe" >nul
if errorlevel 1 goto :fail
copy /y "src-tauri\icons\icon.ico" "%PORTABLE_DIR%\icon.ico" >nul 2>nul
copy /y "运行说明.txt" "%PORTABLE_DIR%\运行说明.txt" >nul 2>nul

echo.
echo ============================================================
echo   构建完成
echo ------------------------------------------------------------
echo   便携版（双击即用，免安装）：
echo     %PORTABLE_DIR%\张开嘴清理.exe
echo.
echo   如需安装包，运行： npm run tauri -- build
echo ============================================================
echo.
choice /c YN /n /m "是否现在打开便携版目录？(Y/N) "
if errorlevel 2 goto :end
start "" "%PORTABLE_DIR%"
goto :end

REM ============================================================
REM  子过程：Node.js
REM ============================================================
:ensure_node
echo [1/6] 检测 Node.js...
where node >nul 2>nul
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('node -v') do echo       已安装 Node.js %%v
    exit /b 0
)
echo       未检测到 Node.js，尝试自动安装...
where winget >nul 2>nul
if errorlevel 1 goto :node_manual
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
call :refresh_path
where node >nul 2>nul
if not errorlevel 1 exit /b 0
:node_manual
echo.
echo       [需要手动安装] Node.js LTS：
echo         https://npmmirror.com/mirrors/node/
echo       安装后重新运行本脚本。
exit /b 1

REM ============================================================
REM  子过程：MSVC 生成工具（Rust 链接 Windows 程序必需）
REM ============================================================
:ensure_msvc
echo [2/6] 检测 MSVC 生成工具...
call :check_msvc
if not errorlevel 1 (
    echo       已安装 VC 工具集
    exit /b 0
)
echo       未检测到，尝试自动安装（约 2 GB，需管理员权限，可能耗时 10 分钟）...
where winget >nul 2>nul
if errorlevel 1 goto :msvc_manual
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
call :check_msvc
if not errorlevel 1 (
    echo       VC 工具集安装成功
    exit /b 0
)
echo       自动安装未生效（可能仍在后台安装，或需要重启电脑）。
:msvc_manual
echo.
echo       [需要手动安装] Visual Studio 生成工具：
echo         https://visualstudio.microsoft.com/zh-hans/visual-cpp-build-tools/
echo       安装时务必勾选「使用 C++ 的桌面开发」。
echo       若刚装完，请重启电脑后重新运行本脚本。
exit /b 1

:check_msvc
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" exit /b 1
"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath > "%TEMP%\zz_vs_path.txt" 2>nul
set "VCINSTALL="
set /p VCINSTALL=<"%TEMP%\zz_vs_path.txt"
del "%TEMP%\zz_vs_path.txt" >nul 2>nul
if "%VCINSTALL%"=="" exit /b 1
exit /b 0

REM ============================================================
REM  子过程：Rust
REM ============================================================
:ensure_rust
echo [3/6] 检测 Rust...
where cargo >nul 2>nul
if not errorlevel 1 goto :rust_ok
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
    goto :rust_ok
)
echo       未检测到 Rust，开始下载安装程序...
set "RUSTUP_DIST_SERVER=https://rsproxy.cn"
set "RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup"
set "RUSTUP_INIT=%TEMP%\rustup-init.exe"
if exist "%RUSTUP_INIT%" del /f /q "%RUSTUP_INIT%" >nul 2>nul

echo       下载源 1/3：rsproxy 镜像
where curl.exe >nul 2>nul
if not errorlevel 1 curl.exe -L --fail --retry 2 --connect-timeout 20 -o "%RUSTUP_INIT%" https://rsproxy.cn/rustup-init.exe
if not exist "%RUSTUP_INIT%" (
    echo       下载源 2/3：Rust 官方源
    curl.exe -L --fail --retry 2 --connect-timeout 20 -o "%RUSTUP_INIT%" https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
)
if not exist "%RUSTUP_INIT%" (
    echo       下载源 3/3：PowerShell（强制 TLS 1.2）
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://rsproxy.cn/rustup-init.exe' -OutFile '%RUSTUP_INIT%' -UseBasicParsing"
)
if not exist "%RUSTUP_INIT%" goto :rust_manual

"%RUSTUP_INIT%" -y --profile minimal --default-toolchain stable
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
call :refresh_path
where cargo >nul 2>nul
if errorlevel 1 if not exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_manual
:rust_ok
for /f "tokens=*" %%v in ('rustc --version') do echo       已就绪 %%v
exit /b 0

:rust_manual
echo.
echo       [需要手动安装] Rust 下载失败，请访问：
echo         https://rsproxy.cn/#getStarted
echo       下载 rustup-init.exe 运行（一路回车用默认选项），完成后重新运行本脚本。
exit /b 1

REM ============================================================
REM  子过程：cargo 国内镜像（仅当尚未配置）
REM ============================================================
:config_cargo_mirror
if exist "%USERPROFILE%\.cargo\config.toml" exit /b 0
if exist "%USERPROFILE%\.cargo\config" exit /b 0
echo       配置 cargo 国内镜像（rsproxy）以加速依赖下载...
if not exist "%USERPROFILE%\.cargo" mkdir "%USERPROFILE%\.cargo"
> "%USERPROFILE%\.cargo\config.toml" (
    echo [source.crates-io]
    echo replace-with = 'rsproxy-sparse'
    echo.
    echo [source.rsproxy-sparse]
    echo registry = "sparse+https://rsproxy.cn/index/"
    echo.
    echo [registries.rsproxy]
    echo index = "https://rsproxy.cn/crates.io-index"
    echo.
    echo [net]
    echo git-fetch-with-cli = true
)
exit /b 0

REM ============================================================
REM  子过程：刷新当前窗口的 PATH（安装后免重启）
REM ============================================================
:refresh_path
for /f "tokens=*" %%p in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"') do set "PATH=%%p"
set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
exit /b 0

:fail
echo.
echo ------------------------------------------------------------
echo   构建中止。请根据上方提示处理后重新运行。
echo   提示：也可改用「张开嘴清理-免安装版」，无需以上任何环境。
echo ------------------------------------------------------------
echo.
pause
exit /b 1

:end
echo.
pause
endlocal
exit /b 0
