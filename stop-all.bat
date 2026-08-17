@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo    One-Click Stop  -  Backend ^& Frontend
echo ============================================================
echo.

echo    [1/2] Closing the Backend / Frontend windows ...
taskkill /FI "WINDOWTITLE eq Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend*" /T /F >nul 2>&1

echo    [2/2] Freeing ports 5001 (backend) and 5173 (frontend) ...
call :KillPort 5001
call :KillPort 5173

echo.
echo    Done. Backend and frontend have been stopped.
echo.
pause
exit /b

:KillPort
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%1 " ^| findstr "LISTENING"') do (
    echo        Killing process %%a on port %1 ...
    taskkill /PID %%a /T /F >nul 2>&1
)
exit /b
