@echo off
:: Self-elevate to Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to start MySQL...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo ========================================================
echo       O3 CAR SPAA - REPAIRING MYSQL SERVICE
echo ========================================================
echo.

powershell -ExecutionPolicy Bypass -Command "$f = 'C:\ProgramData\MySQL\MySQL Server 8.0\my.ini'; if (Test-Path $f) { $c = Get-Content $f | Where-Object { $_ -notmatch 'init-file' }; [System.IO.File]::WriteAllLines($f, $c); Write-Host '[OK] Cleaned my.ini' -ForegroundColor Green }"

echo.
echo Starting MySQL80 service...
net start MySQL80

echo.
echo ========================================================
echo   SUCCESS! MySQL80 is now RUNNING on your computer!
echo ========================================================
echo.
pause
