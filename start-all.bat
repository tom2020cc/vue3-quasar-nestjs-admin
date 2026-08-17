@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo    One-Click Start  -  Backend ^& Frontend
echo ============================================================
echo.

if not exist "backend\node_modules" (
    echo    [WARNING] backend\node_modules not found.
    echo             Run install-all.bat first on a new machine.
    echo.
)
if not exist "frontend\node_modules" (
    echo    [WARNING] frontend\node_modules not found.
    echo             Run install-all.bat first on a new machine.
    echo.
)

echo    [1/2] Starting backend  (NestJS)   -^>  http://localhost:5001/api-docs
start "Backend" cmd /k "cd backend && pnpm start:dev"

echo    [2/2] Starting frontend (Vite)     -^>  http://localhost:5173
start "Frontend" cmd /k "cd frontend && pnpm dev"

echo.
echo    Both services are starting in their own windows.
echo    Keep those windows open while developing.
echo.
echo    To stop everything, run stop-all.bat.
echo.
pause
