@echo off
rem Launcher for the desktop icon. Starts the autopilot runner unless a runner.py is
rem already running, so a second double-click cannot start a second runner.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'python*' -and $_.CommandLine -like '*runner.py*' }) { exit 7 } else { exit 0 }"
if %errorlevel%==7 (
  echo The runner is already running. This window closes in 5 seconds.
  timeout /t 5 /nobreak >nul
  exit /b
)
title Autopilot runner
:loop
"C:\AI model\venv\Scripts\python.exe" runner.py
if %errorlevel%==3 goto loop
pause
