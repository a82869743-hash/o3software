$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupScript = Join-Path $ScriptDir 'backup.js'

Write-Host '📦 Invoking O3 Car Spaa database backup engine...'
node $BackupScript
if ($LASTEXITCODE -eq 0) {
    Write-Host '🏁 Backup operation completed successfully.'
} else {
    throw 'Backup operation failed'
}
