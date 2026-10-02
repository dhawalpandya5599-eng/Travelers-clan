@echo off
REM OYE one-click installer for Windows: gets the latest mind, integrates it into the travelersclan site
REM source on this PC, builds the deploy zip, and starts the local server (the growing loop).
setlocal
where node >nul 2>nul || (echo Node.js is required. Install it from https://nodejs.org and run this again. & pause & exit /b 1)
set REPO=%USERPROFILE%\Travelers-clan
if exist "%REPO%\.git" (
  cd /d "%REPO%" && git pull --ff-only
) else (
  git clone -b claude/clever-maxwell-aclt88 https://github.com/dhawalpandya5599-eng/Travelers-clan "%REPO%" || (echo git is required. Install it from https://git-scm.com & pause & exit /b 1)
  cd /d "%REPO%"
)
echo.
echo === Integrating the latest OYE into your website source and making the upload zip ===
node scripts\integrate-site.js --zip --force
echo.
echo === Starting the local OYE server (the growing loop). Keep this window open. ===
echo Open http://localhost:3000 in your browser.
start "" http://localhost:3000
node server.js
