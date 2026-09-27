@echo off
setlocal
cd /d "%~dp0"
title OmniBot First-Time Setup
echo.
echo ========================================
echo          OMNIBOT FIRST SETUP
echo ========================================
echo.
echo This setup will do the boring stuff for you.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo OmniBot will try to install the official Node.js LTS package now.
  echo.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo Windows Package Manager was not found.
    echo Opening the official Node.js download page.
    start https://nodejs.org/
    echo.
    echo Install the LTS version, then double-click RUN_ME_FIRST.bat again.
    pause
    exit /b 1
  )
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo.
    echo Automatic Node.js installation did not complete.
    echo Opening the official download page instead.
    start https://nodejs.org/
    pause
    exit /b 1
  )
  echo.
  echo Node.js was installed. Windows may need this window restarted.
  echo Close this window, then double-click RUN_ME_FIRST.bat one more time.
  pause
  exit /b 0
)

echo [1/3] Installing OmniBot's small dependency...
call npm install --omit=dev
if errorlevel 1 (
  echo.
  echo ERROR: OmniBot could not install its dependency.
  echo Check the internet connection and try this file again.
  pause
  exit /b 1
)

echo.
echo [2/3] Setting your Kick channel...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure.ps1"
if errorlevel 1 (
  echo.
  echo ERROR: Configuration was not saved.
  pause
  exit /b 1
)

echo.
echo [3/3] Setup complete.
echo.
echo NEXT:
echo   1. Start OmniVoice.
echo   2. Double-click TEST_OMNIVOICE.bat.
echo   3. If you hear the test sentence, double-click START_OMNIBOT.bat.
echo.
pause
