@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deskpal-skin.ps1" -Mode restore %*
echo.
pause
