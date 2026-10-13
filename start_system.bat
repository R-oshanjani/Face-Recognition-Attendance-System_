@echo off
title AuraFace AI Attendance System Launcher
echo ================================================================
echo    Starting AuraFace AI Face Recognition Attendance System
echo ================================================================
echo.

set PYTHONIOENCODING=utf-8
set TF_ENABLE_ONEDNN_OPTS=0
set TF_CPP_MIN_LOG_LEVEL=2

echo [1/2] Launching Django REST Backend on http://127.0.0.1:8000 ...
start "AuraFace Backend Server" cmd /k "cd /d "%~dp0backend" && ..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000"

timeout /t 2 /nobreak >nul

echo [2/2] Launching React Vite Frontend on http://localhost:3000 ...
start "AuraFace Frontend Dashboard" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ================================================================
echo   System services successfully launched!
echo   - Frontend Portal: http://localhost:3000/
echo   - Backend REST API: http://127.0.0.1:8000/api/
echo ================================================================
