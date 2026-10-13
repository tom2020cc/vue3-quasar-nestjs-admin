@echo off
setlocal
title Backend with local proxy (5001)
rem Reads the saved backend/.env, including proxy settings. Requires Node.js 24+.
cd /d "%~dp0backend"
node scripts/start-configured.cjs
pause
