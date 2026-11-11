# Self-elevate if not running as Administrator
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting Administrator privileges to start MySQL service..." -ForegroundColor Yellow
    Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " O3 Car Spaa - MySQL Service Self-Repair  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$myIni = "C:\ProgramData\MySQL\MySQL Server 8.0\my.ini"

if (Test-Path $myIni) {
    Write-Host "[1/3] Inspecting my.ini configuration..." -ForegroundColor White
    $content = Get-Content $myIni
    $hasInit = $content | Where-Object { $_ -match "init-file" }
    if ($hasInit) {
        Write-Host "      Found leftover init-file directive. Removing it now..." -ForegroundColor Yellow
        $cleaned = $content | Where-Object { $_ -notmatch "init-file" }
        [System.IO.File]::WriteAllLines($myIni, $cleaned)
        Write-Host "      [OK] my.ini cleaned and saved." -ForegroundColor Green
    } else {
        Write-Host "      [OK] my.ini has no conflicting directives." -ForegroundColor Green
    }
}

Write-Host "[2/3] Starting MySQL80 service..." -ForegroundColor White
try {
    Restart-Service MySQL80 -Force -ErrorAction Stop
    Write-Host "      [OK] MySQL80 service started successfully." -ForegroundColor Green
} catch {
    Write-Host "      Restart failed, attempting Start-Service..." -ForegroundColor Yellow
    Start-Service MySQL80 -ErrorAction SilentlyContinue
}

Write-Host "[3/3] Verifying database connectivity..." -ForegroundColor White
Start-Sleep -Seconds 2

$svc = Get-Service MySQL80
if ($svc.Status -eq "Running") {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " SUCCESS: MySQL80 is RUNNING and ready for O3 Car Spaa! " -ForegroundColor Green
    Write-Host "========================================================`n" -ForegroundColor Green
} else {
    Write-Host "`nWARNING: MySQL80 status is $($svc.Status)." -ForegroundColor Red
}

Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
