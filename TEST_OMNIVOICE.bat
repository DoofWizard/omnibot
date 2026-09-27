@echo off
setlocal
cd /d "%~dp0"
title OmniBot - Test OmniVoice
echo.
echo OmniBot is checking OmniVoice...
echo If this works, you will hear:
echo "OmniBot self test successful."
echo.
node src\index.js --self-test
if errorlevel 1 (
  echo.
  echo TEST FAILED.
  echo Make sure OmniVoice is running, then try again.
) else (
  echo.
  echo TEST PASSED. OmniVoice is ready.
)
echo.
pause
