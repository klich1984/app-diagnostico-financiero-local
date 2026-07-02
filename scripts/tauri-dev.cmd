@echo off
REM Wrapper: ensures cargo on PATH before running pnpm tauri dev
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
pnpm tauri dev %*
