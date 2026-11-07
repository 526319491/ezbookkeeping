@echo off
setlocal

cd /d "%~dp0"

where go >nul 2>nul
if errorlevel 1 (
    echo [ERROR] "go" not found in PATH. Please install Go 1.27.1 or add it to PATH.
    pause
    exit /b 1
)

rem First run needs these directories, they are ignored by .gitignore
if not exist "data" mkdir "data"
if not exist "storage" mkdir "storage"
if not exist "log" mkdir "log"

echo Starting ezBookkeeping backend: http://localhost:8080
echo Config: %cd%\conf\ezbookkeeping.ini
echo Press Ctrl+C to stop.
echo.

go run . server run

pause
