---
name: setup-scanner-qa
description: QA, debug, and enhance the Swing Setup Scanner Pine Script indicator. Use when a valid setup isn't firing, when tuning thresholds, or before adding new logic.
---

# Swing Setup Scanner — QA & Enhancement Guide

Use this skill when:
- A chart looks like a valid setup but the indicator isn't labeling it
- You want to add a new filter or relax an existing one
- You need to tune thresholds after live testing

---

## Logic Gate Map

Every `long_setup` requires ALL of these to be true. When debugging a miss, work down this list in order — each gate is cheaper to check than the next.

```
long_setup =
  barstate.islast          ← always true on current bar
  AND in_uptrend           ← consec_above ≥ 21 AND not_choppy
  AND long_piv_ok          ← two descending pivot highs ≥ 21 bars apart
  AND long_no_wick         ← no high exceeded trendline by > wick_tol% between pivots
  AND long_touches ≥ 2     ← at least 2 candle highs within 0.3% of trendline
  AND long_bounce_ok       ← a bull bounce candle appeared AFTER ph1
  AND long_breakout        ← close crossed above trendline within last 3 bars
```

Mirror for `short_setup`: swap highs↔lows, ph→pl, above↔below, bull→bear.

---

## Key Variable Definitions

| Variable | Meaning |
|---|---|
| `ph1` / `ph1b` | Most recent pivot high price / bar index |
| `ph2` / `ph2b` | Second most recent pivot high price / bar index |
| `p1off` | Bars ago ph1 occurred (`bar_index - ph1b`) |
| `consec_above` | Consecutive bars where `close ≥ EMA × (1 - bounce_pct)` |
| `bsince_bull` | Bars since last bull_bounce candle |
| `long_bounce_ok` | `bsince_bull < p1off` — bounce is more recent than ph1 |
| `long_breakout` | Close crossed above trendline within `i_breakout_bars` |

---

## Debug Workflow: "Valid Setup Not Firing"

### Step 1 — Load APPS on chart, open Pine editor

```
pine_open("Swing Setup Scanner")
chart_set_symbol("APPS")   // or whichever symbol
chart_set_timeframe("60")
```

### Step 2 — Add debug labels to the script

Temporarily add this block just before the `// ─── SETUP SIGNALS` section to expose each gate:

```pine
// DEBUG — remove before saving to production
if barstate.islast and long_piv_ok
    int p1off_dbg = bar_index - ph1b
    string dbg = "uptrend=" + str.tostring(in_uptrend)
               + " consec=" + str.tostring(consec_above)
               + " piv_ok=" + str.tostring(long_piv_ok)
               + " no_wick=" + str.tostring(long_no_wick)
               + " touches=" + str.tostring(long_touches)
               + " bounce_ok=" + str.tostring(long_bounce_ok)
               + " bsince=" + str.tostring(bsince_bull)
               + " p1off=" + str.tostring(p1off_dbg)
               + " breakout=" + str.tostring(long_breakout)
    label.new(bar_index, low * 0.99, dbg,
         style=label.style_label_up, size=size.small,
         color=color.yellow, textcolor=color.black)
```

### Step 3 — Compile and read the debug label

```
pine_smart_compile()
capture_screenshot("chart")
```

The yellow label at the current bar shows which gate is `false`. Fix the gate that's blocking.

### Step 4 — Remove debug block, save

```
pine_save()
```

---

## Common Failure Modes & Fixes

### `in_uptrend = false` — consec_above too low
**Cause**: Price dipped more than `bounce_pct`% below EMA during the pullback, resetting the counter.
**Check**: `consec_above` value in debug label. If < 21, the pullback was deeper than the tolerance.
**Fix options**:
- Increase `EMA Bounce Band %` input (default 5%) to widen the near-EMA zone
- Decrease `Min Bars Same Side` input (default 21) if a shorter uptrend confirmation is acceptable

### `in_uptrend = false` — not_choppy (cross_count > 2)
**Cause**: Price crossed in/out of the EMA bounce zone more than twice in the lookback window.
**Fix**: This is usually correct — genuinely choppy action. If overriding, increase `Min Bars Same Side` to narrow the window.

### `long_piv_ok = false`
**Cause**: Either fewer than 2 pivot highs found, the two highs aren't descending (`ph1 < ph2` required), or span between them is < 21 bars.
**Check**: Are there clear lower highs visible on the chart? Count bars between them.
**Fix**: Decrease `Min Trendline Span` or `Pivot Left/Right Bars` inputs.

### `long_no_wick = false`
**Cause**: At least one candle high between the two pivots exceeded the trendline by more than `wick_tol`%.
**Fix**: Increase `Wick Tolerance %` input (default 0.3%). Try 0.5–1.0% for volatile names.

### `long_touches < 2`
**Cause**: Not enough candle highs within 0.3% of the trendline between the pivots.
**Note**: The pivot bars themselves count. If the trendline is only defined by exactly 2 pivots with nothing between them, touches = 2 (the pivots themselves). If it still shows < 2, the 0.3% touch window may be too tight for the price level.
**Fix**: Touch tolerance is hardcoded at `0.003` (0.3%). To loosen it, change that constant in the source.

### `long_bounce_ok = false`
**Cause**: No bull bounce candle (hammer or bull engulf within 5% of EMA) found after ph1.
**Check**: `bsince_bull` vs `p1off` in debug label. `bsince_bull` must be < `p1off`.
**Sub-cases**:
- `bsince_bull` is na → no bull bounce candle found at all. The low may not have come within 5% of EMA, or the candle didn't qualify as hammer/engulf.
- `bsince_bull ≥ p1off` → bounce happened before ph1 was formed (old code bug — fixed 2026-04-28)

### `long_breakout = false`
**Cause**: No close crossed above the trendline in the last `i_breakout_bars` bars (default 3).
**Fix**: Increase `Breakout Lookback Bars` input. Or the setup is not yet breaking out — valid non-signal.

---

## Enhancement Checklist

Before adding a new filter:
1. Write the gate condition in plain English first
2. Add it as a named `bool` variable (not inline in `long_setup`)
3. Add it to the debug label block
4. Test on 3–5 known-good setups before enabling in `long_setup`
5. Test on 3–5 known-bad setups to check false-positive rate

Before relaxing an existing filter:
1. Identify which gate is blocking using the debug workflow above
2. Check how many false positives the relaxed version introduces on 5+ non-setup charts
3. Document the change and reason in a code comment

---

## Input Tuning Reference

| Input | Default | Tighten (fewer signals) | Loosen (more signals) |
|---|---|---|---|
| EMA Bounce Band % | 5% | 3% | 7–8% |
| Min Bars Same Side | 21 | 30 | 10–15 |
| Min Trendline Span | 21 bars | 30 bars | 10–15 bars |
| Pivot Left Bars | 5 | 7–10 | 3 |
| Pivot Right Bars | 3 | 5 | 2 |
| Wick Tolerance % | 0.3% | 0.1% | 0.5–1.0% |
| Min Touch Points | 2 | 3 | 2 (minimum) |
| Breakout Lookback Bars | 3 | 2 | 5–10 |

---

## File Locations

| File | Purpose |
|---|---|
| `scripts/setup-scanner.pine` | Canonical source — always edit this, then push to TV |
| `src/core/scanner.js` | MCP tool that reads the label output and scores setups |
| `skills/setup-scan/SKILL.md` | Scanner workflow (how to run a scan session) |

**Workflow**: edit `.pine` locally → `pine_set_source` → `pine_smart_compile` → verify → `pine_save`

---

## Label Output Format

The indicator emits a machine-readable label parsed by `scanner_run_watchlist`:

```
LONG|Ideal|3|45|0.87
     ^     ^ ^  ^
     grade | | ATR value
           | consec_above (EMA bars)
           touch count
```

If the label is missing on a chart that looks like a setup, run the debug workflow above.
