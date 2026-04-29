# setup_tv_autostart.ps1
# Run once to configure TradingView to always launch with CDP enabled.
# Creates a shortcut in the Windows Startup folder so it auto-starts on login.
#
# Usage (from WSL):
#   ! powershell.exe -ExecutionPolicy Bypass -File /path/to/setup_tv_autostart.ps1
#
# Usage (from Windows PowerShell):
#   powershell.exe -ExecutionPolicy Bypass -File .\setup_tv_autostart.ps1

param(
    [int]$Port = 9222,
    [switch]$NoAutostart   # pass -NoAutostart to skip adding to Startup folder
)

# ── Find TradingView.exe ──────────────────────────────────────────────────────
$candidates = @(
    "$env:LOCALAPPDATA\TradingView\TradingView.exe",
    "$env:LOCALAPPDATA\Programs\TradingView\TradingView.exe",
    "$env:PROGRAMFILES\TradingView\TradingView.exe",
    "${env:PROGRAMFILES(x86)}\TradingView\TradingView.exe"
)

# Also search WindowsApps (MSIX store installs)
$storeExe = Get-ChildItem "$env:PROGRAMFILES\WindowsApps" -Filter "TradingView.exe" -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty FullName

if ($storeExe) { $candidates += $storeExe }

# Try PATH
$whereExe = (Get-Command TradingView.exe -ErrorAction SilentlyContinue)?.Source
if ($whereExe) { $candidates += $whereExe }

$tvExe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $tvExe) {
    Write-Error "TradingView.exe not found. Searched: $($candidates -join ', ')"
    Write-Host ""
    Write-Host "If installed elsewhere, edit this script and add the path to `$candidates."
    exit 1
}

Write-Host "Found TradingView at: $tvExe"

$args = "--remote-debugging-port=$Port --remote-debugging-address=0.0.0.0"

# ── Create Startup folder shortcut ───────────────────────────────────────────
if (-not $NoAutostart) {
    $startupDir = [System.Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupDir "TradingView (CDP).lnk"

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $tvExe
    $shortcut.Arguments = $args
    $shortcut.WorkingDirectory = Split-Path $tvExe
    $shortcut.Description = "TradingView with CDP enabled for MCP"
    $shortcut.Save()

    Write-Host "Startup shortcut created: $shortcutPath"
    Write-Host "TradingView will now auto-launch with CDP on every Windows login."
}

# ── Kill existing TradingView and relaunch with CDP now ───────────────────────
Write-Host ""
Write-Host "Relaunching TradingView with CDP..."
Stop-Process -Name "TradingView" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process -FilePath $tvExe -ArgumentList $args

# ── Wait for CDP to become available ─────────────────────────────────────────
Write-Host "Waiting for CDP on port $Port..."
$timeout = 30
$elapsed = 0
$ready = $false
while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
    Write-Host "  ...waiting ($elapsed/$timeout)s"
}

if ($ready) {
    Write-Host ""
    Write-Host "CDP is ready at http://localhost:$Port"
    Write-Host "MCP server can now connect."
} else {
    Write-Warning "CDP did not become available within $timeout seconds."
    Write-Host "TradingView may still be loading — try tv_health_check() in Claude Code."
}
