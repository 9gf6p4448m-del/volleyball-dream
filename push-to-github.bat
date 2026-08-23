@echo off
cd /d "%~dp0"
echo ============================================
echo   Volleyball Dream - push main to GitHub
echo ============================================
echo.
echo Repo: %CD%
echo.
echo [1/3] Trying direct push...
git push origin main
if %errorlevel%==0 goto done
echo.
echo [2/3] Push failed. Need GitHub login.
echo       A browser will open - just approve it.
echo.
gh auth login -h github.com -p https -w
if not %errorlevel%==0 goto failed
echo.
echo [3/3] Wiring git to use gh credentials, retrying push...
git config --global --unset-all credential.https://github.com.helper
git config --global --add credential.https://github.com.helper "!gh auth git-credential"
git push origin main
if not %errorlevel%==0 goto failed
:done
echo.
echo ==== PUSH OK ====
git log origin/main --oneline -3
echo.
pause
exit /b 0
:failed
echo.
echo ==== STILL FAILING - copy the messages above back to Claude ====
echo.
pause
exit /b 1
