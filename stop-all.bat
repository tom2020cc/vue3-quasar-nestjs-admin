@echo off
setlocal enabledelayedexpansion
title Stop All Servers

echo ================================================
echo   Stopping backend (5001) and frontend (5173)
echo ================================================

call :killport 5001 Backend
call :killport 5173 Frontend

echo.
echo Done. All project ports are closed.
echo You can also close the two server windows.
pause
exit /b 0

:killport
set "PORT=%~1"
set "NAME=%~2"
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do (
    echo [-] %NAME% - killing process %%P on port %PORT%
    taskkill /F /PID %%P >nul 2>&1
    set "FOUND=1"
)
if not defined FOUND echo [i] %NAME% - port %PORT% is not running.
exit /b 0
