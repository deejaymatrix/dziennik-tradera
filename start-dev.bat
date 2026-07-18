@echo off
REM Uruchamia podglad deweloperski (Vite + Tauri) przez start-dev.ps1.
powershell -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Skrypt zakonczyl sie bledem ^(kod %ERRORLEVEL%^).
)
echo.
pause
