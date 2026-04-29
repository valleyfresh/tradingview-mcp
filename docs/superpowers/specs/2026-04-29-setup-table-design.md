# Setup Conditions Table — Design Spec

**Date:** 2026-04-29
**Feature:** Always-visible Pine Script table showing signal conditions + setup grade for the active direction

---

## Goal

Add a 3-column diagnostic table to `scripts/setup-scanner.pine` that shows the 4 signal conditions (Bounce EMA, Breakout, Volume, Momentum) plus an A/B grade for the current EMA side. The table is always visible so traders can KIV (Keep In View) stocks that are close to triggering a full setup.

---

## Table Layout

```
┌──────────────────────────────┐
│  ▲ LONG  /  ▼ SHORT   [ A ]  │  ← header, green or red bg; grade right-aligned
├────────────────┬──────┬──────┤
│ Bounce EMA     │  ✓   │hammer│
│ Breakout       │  ✓   │1 bar │
│ Volume         │  ✗   │ -3%  │
│ Momentum       │  ✗   │ 58%  │
└────────────────┴──────┴──────┘
```

- **Position:** top-right corner (`position.top_right`)
- **Always on:** rendered every bar via `barstate.islast`
- **3 columns:** Condition label | ✓/✗ status | Detail value

---

## Direction Logic

- Header shows **▲ LONG** when `consec_above >= 1` (price above EMA)
- Header shows **▼ SHORT** when `consec_below >= 1` (price below EMA)
- All 4 rows reflect the active direction's conditions

---

## Row Definitions

### Row 1 — Bounce EMA
- **Condition met:** `bull_bounce` (LONG) or `bear_bounce` (SHORT)
- **Detail if met:** `"hammer"` if `is_hammer` (LONG) / `"star"` (SHORT), `"engulf"` if engulfing pattern
- **Detail if not met:** `"—"`
- **Implementation note:** need `var string last_bounce_pattern` updated on each bar when bounce fires, since `bull_bounce` is bar-by-bar but the table renders only at `barstate.islast`

### Row 2 — Breakout
- **Condition met:** `long_breakout` or `short_breakout` (computed inside `barstate.islast` block)
- **Detail if met:** `"N bar(s)"` where N = which `i` in the breakout loop first triggered (0 = current bar, 1 = 1 bar ago, etc.)
- **Detail if not met:** `"—"`
- **Implementation note:** add `var int long_breakout_ago` / `var int short_breakout_ago`, set inside the existing breakout `for` loop at the point where `long_breakout := true`

### Row 3 — Volume
- **Condition met:** `vol_spike` (volume > avg × 1.2)
- **Detail:** always show `"+X%"` or `"-X%"` relative to `avg_vol` (e.g. `"+18%"`, `"-3%"`)
- **Formula:** `math.round((volume / avg_vol - 1) * 100)`

### Row 4 — Momentum Candle
- **Condition met:** `mom_candle` (body/range >= 60%)
- **Detail:** always show body% (e.g. `"68%"`)
- **Formula:** `math.round(math.abs(close - open) / (high - low) * 100)`

---

## Setup Grade (A/B/—)

The grade appears right-aligned in the header row.

### LONG grading logic
| Grade | Criteria |
|-------|----------|
| **A** | `bull_bounce` confirmed in history AND (`long_breakout` is true AND close ≥ trendline) OR (close within 2% below current trendline price) |
| **B** | `bull_bounce` confirmed but price has not yet approached or broken the trendline |
| **—** | No `bull_bounce` in history — C omitted; stock not ready to KIV |

### SHORT grading logic (mirror)
| Grade | Criteria |
|-------|----------|
| **A** | `bear_bounce` confirmed AND (`short_breakout` true AND close ≤ trendline) OR (close within 2% above current trendline price) |
| **B** | `bear_bounce` confirmed but price not yet approaching trendline |
| **—** | No `bear_bounce` |

### "Approaching trendline" definition
- LONG: `(tl_current - close) / tl_current <= 0.02` where `tl_current` is the projected trendline price at `bar_index`
- SHORT: `(close - tl_current) / tl_current <= 0.02`
- Only evaluated when a valid trendline exists (`long_piv_ok` / `short_piv_ok`)
- If no trendline exists, grade is **—**

### "Holding after breakout" definition
- LONG: `long_breakout` is true AND `close >= tl_current * (1 - 0.005)` (within 0.5% tolerance — allows minor pullback)
- SHORT: `short_breakout` is true AND `close <= tl_current * (1 + 0.005)`

### Grade cell styling
| Grade | Background | Text |
|-------|-----------|------|
| A | `color.new(color.green, 10)` | white, bold |
| B | `color.new(color.orange, 10)` | white |
| — | header bg (no grade cell) | — |

---

## Cell Styling

| State | Background | Text |
|-------|-----------|------|
| Condition met | `color.new(color.green, 20)` | white |
| Condition not met | `color.new(color.red, 20)` | white |
| Detail cell | `color.new(color.gray, 70)` | white |
| Header (LONG) | `color.new(color.green, 10)` | white |
| Header (SHORT) | `color.new(color.red, 10)` | white |

---

## Scope Boundaries

- The table shows **only the 4 signal conditions** — not the gate conditions (trendline span, no-wick, touch count, EMA trend streak). Those remain implicit in the existing setup logic.
- The table does **not** replace the existing machine-readable label output (`LONG|Ideal|3|45|0.87`) — that stays unchanged for `scanner_run_watchlist`.
- No new inputs added — table is always on, position is hardcoded to top-right.

---

## Files Changed

- `scripts/setup-scanner.pine` — add table rendering block after the existing PLOTS section; add `var` state vars for `last_bounce_pattern`, `long_breakout_ago`, `short_breakout_ago`; compute `tl_current` and grade logic inside `barstate.islast` block; update `max_tables_count` to 1 in the `indicator()` call.
