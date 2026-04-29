---
name: tv-connect
description: Establish or restore the CDP connection between the MCP server and TradingView Desktop. Use when tv_health_check fails, when TradingView was restarted, or at the start of any trading session.
---

# TradingView CDP Connection Setup

Use this skill when `tv_health_check` returns a connection error, or at the start of any session.

---

## Quick Reconnect (normal case)

```
tv_health_check()
```

If it returns `success: true` → done. If it fails → TradingView isn't running with CDP. Continue below.

---

## Permanent Setup (run once)

This script creates a Windows Startup folder shortcut so TradingView **always launches with CDP on login** — no manual steps needed in future sessions.

Run from WSL (use `!` prefix):

```bash
! powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w /home/dlee1/repo/tradingview-mcp/scripts/setup_tv_autostart.ps1)"
```

What it does:
1. Finds TradingView.exe automatically
2. Creates a shortcut in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` with `--remote-debugging-port=9222 --remote-debugging-address=0.0.0.0`
3. Kills any existing TradingView instance and relaunches immediately with CDP
4. Polls until CDP is ready, then reports success

After this runs once, TradingView will auto-start with CDP on every Windows login.

---

## Manual Reconnect (if autostart shortcut isn't set up)

If TradingView was closed and needs to be relaunched:

```bash
! powershell.exe -ExecutionPolicy Bypass -File "$(wslpath -w /home/dlee1/repo/tradingview-mcp/scripts/setup_tv_autostart.ps1)" -NoAutostart
```

The `-NoAutostart` flag skips creating the startup shortcut and just relaunches TV with CDP now.

---

## WSL2 Networking Note

This machine uses **WSL2 mirrored networking** (confirmed: WSL is at `192.168.0.76` on the LAN, no separate Windows host IP in ARP table). This means:

- `localhost` in WSL = Windows localhost ✓
- `CDP_HOST` env var does **not** need to be set
- TradingView must bind to `0.0.0.0` (the `--remote-debugging-address=0.0.0.0` flag), not just `127.0.0.1`

If networking ever changes (e.g. after openclaw migration), set `CDP_HOST` in `~/.claude/.mcp.json`:
```json
"env": { "CDP_HOST": "<host-ip>" }
```

---

## Session Checklist

Before any trading session:
1. Run `tv_health_check()` — if it fails, run the manual reconnect command above
2. Confirm "SMA list" watchlist is visible in TV right panel
3. Confirm "Swing Setup Scanner" is loaded on 1h chart (`pine_open("Swing Setup Scanner")` if not)
