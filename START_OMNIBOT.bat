@echo off
setlocal
cd /d "%~dp0"
title OmniBot - Kick to OmniVoice
echo.
echo Starting OmniBot...
echo Keep this window open while streaming.
echo Close it when you want OmniBot to stop.
echo.
node src\index.js
echo.
echo OmniBot stopped.
pause
