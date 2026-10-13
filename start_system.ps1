# AuraFace One-Click Launcher for PowerShell
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   Starting AuraFace AI Face Recognition Attendance System" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

$env:PYTHONIOENCODING = "utf-8"
$env:TF_ENABLE_ONEDNN_OPTS = "0"
$env:TF_CPP_MIN_LOG_LEVEL = "2"

$rootPath = $PSScriptRoot

Write-Host "[1/2] Starting Django REST Backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootPath\backend'; & '..\venv\Scripts\python.exe' manage.py runserver 127.0.0.1:8000"

Start-Sleep -Seconds 2

Write-Host "[2/2] Starting React Vite Frontend on http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootPath\frontend'; npm run dev"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Both services successfully started!" -ForegroundColor Green
Write-Host "  - Frontend Portal: http://localhost:3000/" -ForegroundColor White
Write-Host "  - Backend REST API: http://127.0.0.1:8000/api/" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Cyan
