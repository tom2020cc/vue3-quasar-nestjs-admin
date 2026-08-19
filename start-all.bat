@echo off
setlocal
title Start Backend + Frontend

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [x] pnpm is not installed.
    echo     Install it first with: npm install -g pnpm
    pause
    exit /b 1
)

echo ================================================
echo   Starting backend (port 5001) and
echo   frontend (port 5173) in new windows...
echo ================================================

start "Backend (5001)" /D "%~dp0backend" cmd /k "pnpm start:dev"
start "Frontend (5173)" /D "%~dp0frontend" cmd /k "pnpm dev"

echo.
echo Waiting for the servers to boot...
timeout /t 6 /nobreak >nul

echo Opening the app in your browser...
start "" "http://localhost:5173"

echo.
echo Done. Two new windows are now running the servers.
echo To stop them, double-click stop-all.bat.
pause
exit /b 0
