@echo off
echo ========================================================
echo   Siya Bill POS - Push to GitHub
echo   Target: https://github.com/Pos483/Restaurants-Pos.git
echo ========================================================
echo.

git status --porcelain > "%TEMP%\git_status.tmp"
set /p HAS_CHANGES=<"%TEMP%\git_status.tmp"
del "%TEMP%\git_status.tmp" >nul 2>&1

if not "%HAS_CHANGES%"=="" (
    echo Changes detected. Staging and committing...
    git add .
    git commit -m "Update POS System"
) else (
    echo Working tree clean. Ready to push.
)

echo.
echo Pushing commits to GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo   SUCCESS! All code has been pushed to GitHub.
    echo ========================================================
) else (
    echo.
    echo ========================================================
    echo   FAILED! Could not push to GitHub. Check errors above.
    echo ========================================================
)
echo.
pause
