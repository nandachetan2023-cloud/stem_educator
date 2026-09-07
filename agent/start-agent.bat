@echo off
title StemEducatorApp Hardware Agent
cd /d "%~dp0"
if not exist node_modules (
    echo Installing dependencies - this only happens once, please wait...
    call npm install
)
echo.
echo Starting the hardware agent...
echo Keep this window open while using hardware features on the web app.
echo.
node src/index.js
pause
