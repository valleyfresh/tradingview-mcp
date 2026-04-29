# setup_tv_autostart.ps1
# Run once to configure TradingView to always launch with CDP enabled.
# Creates a Windows Task Scheduler task that auto-launches TV with CDP on every login.
# Works with both regular installs and Microsoft Store (MSIX) installs.
#
# Usage (from WSL - copy to Windows Temp first):
#   cp /path/to/setup_tv_autostart.ps1 /mnt/c/Windows/Temp/
#   ! powershell.exe -ExecutionPolicy Bypass -File "C:\Windows\Temp\setup_tv_autostart.ps1"
#
# Options:
#   -NoAutostart   skip creating the Task Scheduler entry (just relaunch now)
#   -Port 9222     CDP port (default 9222)

param(
    [int]$Port = 9222,
    [switch]$NoAutostart
)

# ── Find TradingView.exe ──────────────────────────────────────────────────────
$candidates = @(
    "$env:LOCALAPPDATA\TradingView\TradingView.exe",
    "$env:LOCALAPPDATA\Programs\TradingView\TradingView.exe",
    "$env:PROGRAMFILES\TradingView\TradingView.exe",
    "${env:PROGRAMFILES(x86)}\TradingView\TradingView.exe"
)

# MSIX / Microsoft Store install
$msixPkg = Get-AppxPackage | Where-Object { $_.Name -like "*TradingView*" } | Select-Object -First 1
if ($msixPkg) {
    $msixExe = Join-Path $msixPkg.InstallLocation "TradingView.exe"
    if (Test-Path $msixExe) { $candidates = @($msixExe) + $candidates }
}

# Search WindowsApps (fallback)
$storeExe = Get-ChildItem "$env:PROGRAMFILES\WindowsApps" -Filter "TradingView.exe" -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName
if ($storeExe) { $candidates += $storeExe }

# Try PATH
$whereCmd = Get-Command TradingView.exe -ErrorAction SilentlyContinue
if ($whereCmd) { $candidates += $whereCmd.Source }

$tvExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $tvExe) {
    Write-Error "TradingView.exe not found. Searched:`n$($candidates -join "`n")"
    Write-Host ""
    Write-Host "If installed elsewhere, add the path to the candidates list in this script."
    exit 1
}

Write-Host "Found TradingView at: $tvExe"

$cdpArgs = "--remote-debugging-port=$Port --remote-debugging-address=0.0.0.0"

# ── Create Task Scheduler entry ───────────────────────────────────────────────
if (-not $NoAutostart) {
    $action    = New-ScheduledTaskAction -Execute $tvExe -Argument $cdpArgs
    $trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Limited
    $settings  = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew

    Unregister-ScheduledTask -TaskName "TradingView CDP" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "TradingView CDP" -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings `
        -Description "Launch TradingView with CDP enabled for MCP server" | Out-Null

    Write-Host "Task Scheduler entry created: 'TradingView CDP'"
    Write-Host "TradingView will auto-launch with CDP on every Windows login."
}

# ── Kill existing TradingView and relaunch with CDP now ───────────────────────
Write-Host ""
Write-Host "Relaunching TradingView with CDP on port $Port..."
Stop-Process -Name "TradingView" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process -FilePath $tvExe -ArgumentList $cdpArgs

# ── Poll until CDP is ready ───────────────────────────────────────────────────
Write-Host "Waiting for CDP..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Write-Host "  ...($i/30)s"
}

if ($ready) {
    Write-Host ""
    Write-Host "CDP ready at http://localhost:$Port"
    Write-Host "Run tv_health_check() in Claude Code to verify."
} else {
    Write-Host "TradingView still loading - run tv_health_check() in Claude Code shortly."
}
