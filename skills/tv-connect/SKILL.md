---
name: tv-connect
description: Establish or restore the CDP connection between the MCP server and TradingView Desktop. Use when tv_health_check fails, when TradingView was restarted, or at the start of any trading session.
---

# TradingView CDP Connection Setup

Use this skill when `tv_health_check` returns a connection error, or at the start of any session.

---

## Quick Reconnect (normal case)

If TradingView Desktop was already configured once and you just need to reconnect:

```
tv_health_check()
```

If that fails, TradingView is either not running or not running with CDP enabled. Follow the full setup below.

---

## Environment: WSL2 + Windows TradingView Desktop

This setup runs the MCP server in WSL2 while TradingView Desktop runs on Windows. Two requirements:

1. TradingView must be launched with `--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0`
2. The MCP server must point to the Windows host IP, not `localhost`

### Step 1 — Find the Windows host IP from WSL

```bash
# In WSL terminal:
ip route show default | awk '{print $3}'
# Or check /etc/resolv.conf nameserver if on standard NAT networking
```

On standard WSL2 NAT the Windows host is typically the default gateway (e.g. `172.x.x.1`).
On WSL2 mirrored networking, `localhost` in WSL resolves to Windows localhost directly.

### Step 2 — Find TradingView Desktop executable

Run from Windows PowerShell (or use `!` prefix in Claude session):

```powershell
# Option A — common install path
dir "$env:LOCALAPPDATA\Programs\TradingView" /b

# Option B — search all drives
Get-ChildItem "C:\","D:\","E:\" -Recurse -Filter "TradingView.exe" -ErrorAction SilentlyContinue | Select-Object FullName
```

Typical path: `C:\Users\<username>\AppData\Local\Programs\TradingView\TradingView.exe`

### Step 3 — Kill existing TradingView, relaunch with CDP

From Windows PowerShell:

```powershell
# Kill existing
taskkill /IM TradingView.exe /F

# Relaunch with CDP on all interfaces
Start-Process "C:\Users\<username>\AppData\Local\Programs\TradingView\TradingView.exe" `
  -ArgumentList "--remote-debugging-port=9222","--remote-debugging-address=0.0.0.0"
```

**`--remote-debugging-address=0.0.0.0` is required** — without it Chrome/Electron only binds to Windows localhost (127.0.0.1) which is unreachable from WSL.

### Step 4 — Set CDP_HOST in the MCP server environment

The MCP server reads `CDP_HOST` from the environment (default: `localhost`).

```bash
# In WSL, set CDP_HOST to the Windows host IP before starting the MCP server
export CDP_HOST=<windows-host-ip>   # e.g. 172.28.0.1

# Or add to the MCP server's .env file:
echo "CDP_HOST=<windows-host-ip>" >> /home/dlee1/repo/tradingview-mcp/.env
```

Then restart the MCP server and run `tv_health_check()`.

### Step 5 — Verify

```
tv_health_check()
```

Expected response: `{ success: true, symbol: "...", timeframe: "..." }`

---

## Permanent Fix: Windows Port Forwarding

Instead of binding to `0.0.0.0` on Windows, you can forward the port from Windows to WSL's loopback:

```powershell
# Run once as Administrator on Windows:
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 `
  connectport=9222 connectaddress=127.0.0.1
```

This forwards TCP:9222 on all Windows interfaces to Windows localhost:9222. Combined with TradingView using `--remote-debugging-port=9222` (default address 127.0.0.1), WSL can then reach it via the Windows host IP.

---

## Linux-native TradingView (future)

If TradingView Desktop ever runs as a Linux process (e.g. via Wine or native package):

```bash
/path/to/tradingview --remote-debugging-port=9222
```

In that case `CDP_HOST=localhost` works and no port forwarding is needed.

---

## Session Checklist

Before any trading session:
1. Confirm TradingView Desktop is open on Windows with CDP enabled
2. Run `tv_health_check()` — if it fails, follow this skill
3. Confirm "SMA list" watchlist is visible in TV right panel
4. Confirm "Swing Setup Scanner" is loaded on 1h chart

---

## Saved CDP Launch Command (fill in after first setup)

```
TV_EXE=<path to TradingView.exe on Windows>
WINDOWS_HOST_IP=<ip>
```

Update this section once the path is confirmed so future sessions can reference it directly.
