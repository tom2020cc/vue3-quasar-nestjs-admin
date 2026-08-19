@echo off
setlocal
title Install All Dependencies

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [x] pnpm is not installed.
    echo     Install it first with: npm install -g pnpm
    pause
    exit /b 1
)

echo ================================================
echo   Installing dependencies (backend + frontend)
echo ================================================

echo.
echo [1/2] Installing backend dependencies...
cd /d "%~dp0backend"
call pnpm install
if errorlevel 1 goto :failed

echo.
echo [2/2] Installing frontend dependencies...
cd /d "%~dp0frontend"
call pnpm install
if errorlevel 1 goto :failed

echo.
echo ================================================
echo   All dependencies installed successfully!
echo ================================================
pause
exit /b 0

:failed
echo.
echo [x] Installation failed. Check the error above.
pause
exit /b 1
