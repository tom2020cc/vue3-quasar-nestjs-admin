@echo off
setlocal
title Start Video Workspace
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is required. Install Node.js first.
    pause
    exit /b 1
)
if not exist "%~dp0frontend\node_modules\vite\bin\vite.js" (
    echo Dependencies are missing. Run install-all.bat first.
    pause
    exit /b 1
)
netstat -ano | findstr /C:":5001 " | findstr LISTENING >nul
if errorlevel 1 start "Backend (5001)" /D "%~dp0backend" cmd /k "node scripts/start-configured.cjs --watch"
netstat -ano | findstr /C:":5173 " | findstr LISTENING >nul
if errorlevel 1 start "Frontend (5173)" /D "%~dp0frontend" cmd /k "node node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort"
echo Waiting for the servers to boot...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"
echo App: http://localhost:5173
echo To stop the services, run stop-all.bat.
pause
