@echo off
cd /d "%~dp0"
title ZhangZuiCleaner
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0app.ps1"
if errorlevel 1 pause
