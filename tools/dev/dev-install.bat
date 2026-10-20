@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-install.ps1" %*
pause
