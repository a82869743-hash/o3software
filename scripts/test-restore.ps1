$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RestoreScript = Join-Path $ScriptDir 'test_restore.js'

Write-Host '🧪 Running automated backup restore test...'
node $RestoreScript
if ($LASTEXITCODE -eq 0) {
    Write-Host '🏁 Restore test passed successfully.'
} else {
    throw 'Restore test failed'
}
