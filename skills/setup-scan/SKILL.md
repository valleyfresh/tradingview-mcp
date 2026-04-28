---
name: setup-scan
description: Scan the SMA watchlist for valid swing setups using the EMA 20 trendline breakout strategy. Use when looking for trade candidates on the 1h chart.
---

# Setup Scanner Workflow

## Prerequisites

The **"Swing Setup Scanner"** Pine Script indicator must be loaded and VISIBLE on the 1h chart.

If it is not loaded:
1. `pine_open` → open "Swing Setup Scanner" from saved scripts, OR
2. Inject from disk: `pine_set_source` (read `scripts/setup-scanner.pine`) → `pine_smart_compile`

The indicator auto-detects trendlines, EMA bounces, and breakouts. It outputs a machine-readable label when a valid setup is found.

## Step 1: Run the Scan

```
scanner_run_watchlist
```

- Checks SPY first to determine market bias (long/short/neutral)
- Iterates every symbol in your "SMA list" watchlist on the 1h chart
- Returns setups ranked: **Ideal > Strong > Moderate**, then by touch points

**Setup grades:**
- **Ideal** — volume spike + momentum candle (both)
- **Strong** — one of the two
- **Moderate** — valid setup but neither volume spike nor momentum candle

## Step 2: Review Results

For each top-ranked setup (start with Ideal):

1. `chart_set_symbol(symbol)` + `chart_set_timeframe("60")`
2. `capture_screenshot` — visually confirm the trendline looks clean
3. Verify: orange (pending) or green (broken) trendline drawn by the indicator matches your manual analysis

## Step 3: Calculate Entry & Stop

From the scanner output:
- **ATR** field = 4h ATR(14) value at time of signal
- **Stop loss** = trendline intersection price − ATR
- **Entry** = enter in last 10 minutes of the current 1h candle close

## Step 4: Position Sizing

Risk per trade based on grade and confidence:
- **Ideal** → 2–3% of account
- **Strong** → 1.5–2%
- **Moderate** → 1%

```
Shares = (Account × Risk%) / (Entry price − Stop price)
```

## Step 5: Earnings Check

Before entering any position:
```
earnings_get symbols=[top setup symbols] days_ahead=2
```
Avoid entering stocks with earnings in the next 2 days.

## Notes

- If market bias is neutral, the scanner returns both LONG and SHORT signals — exercise more discretion
- Touch points ≥ 3 = stronger trendline; prefer these over 2-touch setups when equal grade
- The indicator draws a visual trendline on the chart (orange = setup forming, green/red = breakout confirmed)
- Run this scan near the end of an hourly candle (e.g., 9:50am, 10:50am EST) for entry timing
