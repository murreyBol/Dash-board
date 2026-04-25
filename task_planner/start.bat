@echo off
echo ========================================
echo Task Planner Dashboard - Quick Start
echo ========================================
echo.

echo [1/3] Starting Backend...
cd backend
start cmd /k "python main.py"
timeout /t 3 /nobreak >nul

echo [2/3] Starting Frontend...
cd ..\frontend
start cmd /k "python -m http.server 8080"
timeout /t 2 /nobreak >nul

echo [3/3] Opening Browser...
start http://localhost:8080

echo.
echo ========================================
echo Task Planner is running!
echo ========================================
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:8080
echo API Docs: http://localhost:8000/docs
echo.
echo Press any key to exit...
pause >nul
