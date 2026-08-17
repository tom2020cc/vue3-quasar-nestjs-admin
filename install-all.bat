@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo    One-Click Install  -  All Dependencies (pnpm)
echo ============================================================
echo.

REM --- Prerequisites -------------------------------------------------
where pnpm >nul 2>&1
if errorlevel 1 (
    echo    [ERROR] pnpm was not found in PATH.
    echo            Install it first with:  npm install -g pnpm
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo    [ERROR] Node.js was not found in PATH.
    echo            Install it first from:  https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f %%v in ('pnpm --version 2^>nul') do set "PNPM_VER=%%v"
for /f %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
echo    pnpm v%PNPM_VER%  /  node %NODE_VER%  -  OK
echo.

REM --- Backend --------------------------------------------------------
echo    [1/2] Installing backend dependencies ...
cd backend
call pnpm install
if errorlevel 1 (
    echo    [ERROR] Backend dependency install failed.
    cd ..
    echo.
    pause
    exit /b 1
)
cd ..

echo.
REM --- Frontend -------------------------------------------------------
echo    [2/2] Installing frontend dependencies ...
cd frontend
call pnpm install
if errorlevel 1 (
    echo    [ERROR] Frontend dependency install failed.
    cd ..
    echo.
    pause
    exit /b 1
)
cd ..

echo.
echo ============================================================
echo    Success! All dependencies are installed.
echo    You can now run start-all.bat to launch the app.
echo ============================================================
echo.
pause
