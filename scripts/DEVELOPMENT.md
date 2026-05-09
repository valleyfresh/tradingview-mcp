# Swing Setup Scanner — Development Notes

## Algorithm Overview

### Pivot Detection
`ta.pivothigh(high, left, right)` — confirms a pivot `right` bars after it occurs.
Stored as absolute `bar_index - right` so span arithmetic is consistent.
Array stores newest-first (`array.unshift`), so index 0 = most recent pivot.

**Defaults:** `piv_left=3, piv_right=3`
- Lower `piv_left` catches more pivots (e.g., piv_left=5 missed MARA's descending highs
  because the peak at bar -24 had higher bars within the 5-bar left window)

### Trendline Pair Selection
Scans all (i, j) pivot pairs, newest-first, accepts the first valid descending (LONG) or
ascending (SHORT) pair.

**Validity checks:**
1. `p1 < p2` (newer lower than older) — descending for LONG
2. `(b1 - b2) >= i_min_tl_bars` — minimum span (draw threshold)
3. Slope adjustment: scan all bars between the two pivots and lift the slope to the minimum
   needed to stay above them all. If adjusted slope goes positive → pair is rejected (no
   descending line is possible without cutting through intermediate candles)
4. `cand_slope <= 0` — final accept check

**Why slope adjustment fails sometimes (MARA lesson):**
If any bar between p1 and p2 has a high ABOVE p2 (the older, higher anchor), the required
slope becomes positive — meaning a descending line anchored at p2 physically cannot clear
that bar. This forces the algorithm to skip to the next candidate pair. The fix is to ensure
p2 is the TRUE local maximum for that range, or reduce `piv_left` so the algorithm finds
pairs where no intermediate bar exceeds p2.

### Two-Threshold Span Design
- `i_min_tl_bars` (default 8) — minimum span to **draw** the line at all
- `i_min_sig_bars` (default 21) — minimum span for a valid **signal** (breakout label)

Line color encodes state:
- **Blue** — developing pattern, span < signal threshold (KIV / keep in view)
- **Orange** — valid span, no breakout yet (watching)
- **Green/Red** — breakout detected (actionable signal)

### EMA Trend Filter
Two separate uses of EMA proximity:
- **Trend direction**: strict `close >= ema_val` — no tolerance band
  (5% band caused CHWY false LONG: stock was 4% below EMA but counted as "above")
- **Bounce detection**: `low within bounce_pct% of EMA` — only for candle-pattern check

### Touch Counting
Bars within 1% of the trendline value count as touches.
Tolerance is 1% (not tighter) because slope adjustment often moves the line slightly above
the original pivots — if tolerance is too tight, those pivots stop counting as touches.

---

## Debugging Checklist

### "Indicator fires on a stock that shouldn't qualify"
1. Check EMA side: `in_uptrend` requires `consec_above >= 21 AND cross_count <= 2`
   - False positive on CHWY was traced to EMA band allowing 5%-below stocks
2. Check trendline span: signal requires `ph1b - ph2b >= i_min_sig_bars`

### "Valid pattern visible but no trendline drawn"
Add this debug label inside `if barstate.islast` temporarily:
```pine
label.new(bar_index, low * 0.98,
     "piv=" + str.tostring(long_piv_ok) +
     " wick=" + str.tostring(long_no_wick) +
     " t=" + str.tostring(long_touches) +
     " span=" + str.tostring(ph1b - ph2b) +
     " ph2=" + str.tostring(ph2, "#.##") +
     " ph1=" + str.tostring(ph1, "#.##") +
     " n=" + str.tostring(array.size(ph_prices)),
     style=label.style_label_up, size=size.small,
     color=color.gray, textcolor=color.white)
```
Read it via MCP: `data_get_pine_labels(study_filter="Swing Setup Scanner")`

**Triage from label output:**
| Symptom | Cause | Fix |
|---------|-------|-----|
| `piv=false, n=0` | No pivots detected | Reduce `piv_left` or `piv_right` |
| `piv=false, n>0` | All pairs rejected by slope or span | Check if intermediate bars exceed p2; reduce `i_min_tl_bars` |
| `piv=true, wick=false` | Wick tolerance too tight | Increase `wick_tol_pct` |
| `piv=true, wick=true, t<2` | Touch count below threshold | Increase touch tolerance (currently 1%) or reduce `i_min_touches` |
| `span < 21` | Below signal threshold | Line should be blue (KIV); wait for pattern to mature |

### "Trendline drawn but no breakout signal"
Signal requires ALL of: `in_uptrend AND long_span_ok AND long_no_wick AND touches >= min
AND long_bounce_ok AND long_breakout`

Check each:
- `in_uptrend`: 21+ bars above EMA, choppy test passes
- `long_span_ok`: span >= 21
- `long_bounce_ok`: EMA bounce candle must have occurred AFTER ph1 (the newer pivot)
- `long_breakout`: close above trendline within last 3 bars

### "No pivots found (n=0 in debug label)"
- `piv_right=3` means pivot is confirmed 3 bars after it forms. On a very recent pattern,
  the most recent pivots may not be confirmed yet.
- Try reducing `piv_left` first (impacts pattern quality less than `piv_right`).

---

## Known Gotchas

1. **Slope adjustment can clear all pairs** — if the recent price history has no clean
   descending structure (i.e., every candidate older pivot p2 has been exceeded by an
   intermediate bar), `long_piv_ok` stays false. The pattern simply doesn't qualify.

2. **Touch count deflation after slope lift** — after adjusting the slope upward, the
   line moves above the original pivot highs. The 1% tolerance window compensates for this.
   If touches = 1 on a valid-looking pattern, try increasing touch tolerance to 1.5%.

3. **`data_get_pine_lines` returns no data for diagonal trendlines** — this MCP tool only
   reads horizontal `line.new()` levels. Diagonal trendlines (our case) return `study_count=0`
   even when drawn. Use `capture_screenshot` to visually verify, or `data_get_pine_labels`
   to read the signal label text.

4. **`barstate.islast` variables are stale on non-last bars** — `ph1b`, `ph2b` etc. are
   only updated inside `if barstate.islast`. `long_span_ok` is computed outside that block
   but `long_setup` gates on `barstate.islast`, so signals only fire on the correct bar.

---

## Scanner Integration

The machine-readable label format: `"DIRECTION|GRADE|TOUCHES|EMA_BARS|ATR"`
Parsed by `src/core/scanner.js` → `scanner_run_watchlist` MCP tool.

Only fires when ALL signal conditions pass (including `long_span_ok` with 21-bar minimum).
Blue/developing trendlines are visual only — they do not appear in scanner output.
