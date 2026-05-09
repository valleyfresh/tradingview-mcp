# GOTCHAS — Domain-Specific Quirks

Reference this file before editing Pine Script, MCP config, or infrastructure code.

---

## Pine Script (v6)

### Reserved keywords — don't use as variable names
`ratios` is a reserved keyword in Pine Script v6 and will cause a compile error if used as a variable name. Other common traps: `time`, `source`, `series`, `label`, `line`, `box`, `table`.

### `q`-prefixed SHORT block variables
The SHORT trendline block uses `q1off`/`q2off` instead of `p1off`/`p2off` to avoid shadowing the LONG block variables — Pine Script shares scope within `if barstate.islast`, so reusing `p1off` would overwrite the LONG value and break both checks.

### `ta.pivothigh()` is delayed by `piv_right` bars
The pivot is confirmed `piv_right` bars after it occurs. Stored bar index is `bar_index - i_piv_right`, not `bar_index`. All span arithmetic (`ph1b - ph2b`) is correct only if both sides use this adjusted index — mixing raw `bar_index` with adjusted indices silently miscounts spans.

### `barstate.islast` variables are stale on non-last bars
`ph1b`, `ph2b`, `long_slope`, etc. are only assigned inside `if barstate.islast`. They hold their previous `var`-initialised values on all other bars. `long_setup` is gated on `barstate.islast`, so signals are correct — but don't use these variables in plots or conditions outside that block.

### EMA trend direction vs. bounce detection use different tolerances
Two separate uses of EMA proximity — they must stay separate:
- **Trend direction** (`in_uptrend`/`in_downtrend`): strict `close >= ema_val` with no band. A 5% band was tried and caused a false LONG on CHWY (stock 4% below EMA counted as "above EMA").
- **Bounce detection** (`long_bounce_ok`): `low within bounce_pct% of EMA` — intentionally permissive for candle-pattern check only.

### `request.security()` must use `lookahead=barmerge.lookahead_off`
Required on both the `gaps_off` (logic) and `gaps_on` (plot) calls. Omitting it introduces lookahead bias — the daily EMA value from tomorrow's close leaks into today's bar during historical replay.

### Slope adjustment can silently reject all pivot pairs
If any bar between two candidate pivot highs has a `high` above the older pivot (`p2`), the minimum required slope becomes positive — meaning no descending line can be drawn through that region without cutting candles. The algorithm skips the pair. If `long_piv_ok` stays false with a visually obvious pattern, the likely cause is an intermediate bar exceeding `p2`. Fix: reduce `piv_left` so the algorithm finds cleaner pairs, or check whether the "obvious" peak is truly a local maximum.

### Touch count deflates after slope adjustment
After lifting the trendline slope to clear intermediate highs, the line sits above the original pivot prices. The 1% touch-detection window (`math.abs(high[i] - tl) / tl <= 0.01`) compensates — without it, the pivots themselves would stop counting as touches. If touches = 1 on a visually valid pattern, the touch window is probably too tight; increase to 1.5%.

### `piv_left` controls signal quality vs. coverage
`piv_left=5` missed MARA's descending trendline because a bar within the 5-bar left window exceeded the peak at bar −24, disqualifying it as a pivot high. Default is 3. Increasing `piv_left` produces cleaner pivots but misses more patterns.

### `data_get_pine_lines` returns nothing for diagonal trendlines
This MCP tool reads only horizontal `line.new()` calls (price levels). Diagonal trendlines (`line.new(x1, y1, x2, y2)`) return `study_count=0` even when visible. Use `capture_screenshot` for visual verification, or `data_get_pine_labels` to read the machine-readable signal label.

### Pine indicator must be visible for graphics tools to work
`data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes` all read the live DOM — they return nothing if the indicator is hidden (eye icon off). Always confirm the indicator is visible before calling these tools.

### `max_labels_count` / `max_lines_count` / `max_boxes_count` are hard ceilings
Set in the `indicator()` declaration. Exceeding them silently drops the oldest drawings. The scanner uses `max_labels_count=10` — if more than 10 labels accumulate from different studies, earlier ones are dropped. Keep the limit in sync with how many labels the indicator can emit.

### `array.unshift` + `array.pop` for newest-first pivot history
`array.unshift` prepends to index 0 (newest), `array.pop` removes from the tail (oldest). Index 0 = most recent pivot. All pair-scanning loops (`for i = 0 to n-2`) assume this order — reversing push/pop direction breaks the descending-pair logic.

---

## MCP / Claude Code Config

### MCP server config lives at `~/.claude.json`, not `~/.claude/.mcp.json`
Both files exist on this machine, but Claude Code reads MCP server definitions from `~/.claude.json` (the root-level file). Editing `~/.claude/.mcp.json` has no effect. When adding or changing MCP servers, always edit `~/.claude.json`.

### Node binary path — npm is not in PATH
The Node.js binary used by this project is at `/home/dlee1/repo/bonz/node-dist/bin/node`. `npm` is not on the system PATH. Run tests with:
```
/home/dlee1/repo/bonz/node-dist/bin/node --test
```
Don't assume `npm test` or `npx` will work.

### `chart_manage_indicator` requires full built-in indicator names
Use the full TradingView name: `"Relative Strength Index"`, not `"RSI"`. `"Moving Average Exponential"`, not `"EMA"`. `"Bollinger Bands"`, not `"BB"`. Partial names silently fail to match.

### Entity IDs from `chart_get_state` are session-specific
Don't cache entity IDs across sessions or store them in memory. Always call `chart_get_state` at the start of a session to get current IDs.

### `scanner_run_watchlist` reads the currently visible watchlist
"SMA list" must be the active watchlist in the right panel when the scan runs. Switching watchlists mid-session without re-confirming breaks the scan silently.

---

## CDP / WSL2 Connection

### Run PowerShell scripts via temp copy, not UNC path
Running `.ps1` files directly from a WSL UNC path (`/mnt/c/...` mapped as `\\wsl$\...`) causes a Chromium network service crash that prevents CDP from starting. The workaround:
```sh
cp scripts/setup_tv_autostart.ps1 /mnt/c/Windows/Temp/
powershell.exe -File "C:\Windows\Temp\setup_tv_autostart.ps1"
```

### WSL2 mirrored networking — `localhost` works directly
With mirrored networking enabled, `localhost` in WSL resolves to the Windows loopback. No `CDP_HOST` env var is needed — the default `localhost:9222` connects to the Windows TradingView process.

### If CDP fails, prefer the desktop batch file over Task Scheduler
`TradingView-CDP.bat` on the Windows desktop kills any existing TV process and relaunches with CDP flags cleanly. Running `schtasks /run /tn "TradingView CDP"` also works but may conflict if TV is already running. Avoid re-running the PS1 autostart script — it's a one-time setup step.

---

## Infrastructure (Kind / openclaw migration)

### Kind clusters need storage class patches
When running a Kind cluster for local development, the default storage class does not provision PVCs automatically. Apply a `local-path-provisioner` or patch the storage class before deploying anything that requests persistent storage. Skipping this causes pods to hang in `Pending` state indefinitely with no obvious error in `kubectl describe pod`.

---

## Scanner Logic Quirks

### Bounce timing: bounce must occur AFTER ph1, not just anywhere in span
An earlier version of the code checked for any EMA bounce between the two pivot highs. The correct logic is: the structural EMA touch occurs AFTER `ph1` (the newer, lower pivot) — the pattern is trendline forms first, then price bounces at EMA, then breakout. `long_bounce_ok` is wrong if it accepts bounces before `ph1b`.

### Bounce bar must be below the trendline — check both `low` AND `close`
`pp < tl_at_pb` alone is not enough. A hammer candle has a low below the trendline but can close above it — the candle already broke resistance if `close > tl_at_pb`. Both filters are required:
```pine
if pp < tl_at_pb and close[op] < tl_at_pb
```
SHORT is the mirror: `pp > tl_at_pb and close[op] > tl_at_pb`.

### Bounce box spans full candle height — wick can visually cross the trendline
The bounce box is drawn `box.new(bar, high[off], bar+1, low[off])`. A hammer whose wick taps resistance will visually appear to intersect the trendline even though the close (and low) are below it. This is correct behavior — the wick touching the line is exactly the bounce pattern. Don't mistake the wick overlap for a filter bug.

### Breakout scan: two separate variables for bounce-window vs. grading
`long_any_cross_ago` tracks the oldest crossing of any candle color (used for `bo_bar_l` — the right-hand boundary of the bounce search window). `long_breakout_ago` tracks only the oldest *bullish* crossing (used for the BO box and vol/momentum grading). They must stay separate:
- If only `long_breakout_ago` were used for `bo_bar_l` and the breakout was all-red candles, `long_breakout_ago` stays `na` → `bar_index - na = na` → bounce scan finds nothing.
- If only `long_any_cross_ago` were used for grading, a red doji barely crossing the trendline would get graded instead of the big green candle.

### Breakout candle must be bullish (LONG) / bearish (SHORT)
A red candle closing above a descending resistance line is a crossing, but not a valid breakout signal. Only bullish candles (`close > open`) are recorded in `long_breakout_ago`. `long_breakout` (the bool) still fires on any crossing so the retest/holding path continues to work.

### `long_breakout_ago` becomes `na` when breakout is live (current bar)
When the live bar is itself the first bullish crossing, `long_breakout_ago` is assigned `i=0` (current bar). But on the very same tick, `barstate.islast` resets it to `na` before the scan runs. The BO box will not appear and grading shows `—`. This resolves on the next closed bar.

### Breakout scan direction: oldest bullish crossing wins (`last write wins`)
The scan iterates `i = 0` (current) to span end (oldest). Each bullish crossing overwrites `long_breakout_ago`. Final value = oldest bullish crossing in the span. This is intentional: we care about the initial clean breakout bar for volume/momentum grading, not the most recent re-cross.

### Volume and momentum are evaluated on the breakout candle, not current bar
`grade_vol` and `grade_mom` index into `volume[grade_ago]` and `high[grade_ago]`. Evaluating on the current bar would give misleading readings for setups that broke out several bars ago.

### Pine Editor must be closed for the chart indicator to reflect compiled changes
`pine_set_source` + `pine_smart_compile` saves to cloud but may not refresh the chart indicator if the Pine Editor panel is open. After compiling, close the editor (`ui_open_panel pine-editor close`) so TradingView reloads the indicator from the saved source. If B/BO boxes disappear after a compile cycle, this is the likely cause.

### Re-adding the indicator after injecting source
If `pine_smart_compile` returns `study_added: false` and the indicator visuals don't update, use `pine_open("Swing Setup Scanner")` followed by another `pine_smart_compile` to force a reload. The chart may still be running a cached prior version.
