---
name: morning-brief
description: Generate a full morning market briefing — market sentiment, SPY/QQQ trend, earnings risk, ranked setups, and key news. Run before market open or at session start (9–9:30am EST).
---

# Morning Brief Workflow

Run these steps in order. Each feeds into the next.

## Step 1: Market Sentiment (CNN Fear & Greed)

```
market_sentiment_get
```

Records score (0–100) and rating. Note week-over-week direction.

## Step 2: SPY & QQQ Trend

```
chart_set_symbol  symbol="SPY"
chart_set_timeframe  timeframe="D"
data_get_study_values
```

Look for "Daily EMA 20" value in the Swing Setup Scanner study. Compare to SPY price.

Repeat for QQQ.

**Bias rules:**
- Both above EMA 20 → **LONG bias** (favor long setups)
- Both below EMA 20 → **SHORT bias** (favor short setups)
- Mixed → **NEUTRAL** (be selective, reduce size)

## Step 3: Earnings Risk

```
earnings_get  days_ahead=2
```

(The tool automatically filters to your watchlist symbols.)

Flag any watchlist symbols reporting earnings in the next 2 days — avoid new entries on those.

## Step 4: Setup Scan

```
scanner_run_watchlist
```

Prerequisite: "Swing Setup Scanner" must be loaded on the 1h chart.

Take the top 3–5 ranked results.

## Step 5: News Check

```
news_get  symbols=[top 3 setup symbols]
```

Scan for adverse headlines. If a setup candidate has negative news (guidance cut, lawsuit, FDA rejection), remove it from consideration.

## Step 6: Format the Brief

Use this template exactly:

---
## Morning Brief — [DATE] [TIME EST]

### Market Pulse
- **Fear & Greed:** [score]/100 — [rating] (vs last week: [score], [rating])
- **SPY:** $[price] | [above/below] daily EMA 20 → **[BULLISH/BEARISH]**
- **QQQ:** $[price] | [above/below] daily EMA 20 → **[BULLISH/BEARISH]**
- **Overall bias:** [LONG / SHORT / NEUTRAL — be selective]

---

### ⚠ Earnings Risk (next 2 days)
| Symbol | Date | Time | EPS Est |
|--------|------|------|---------|
| [SYM]  | [date] | [BMO/AMC] | $[X] |

*Avoid new positions in the above.*

---

### Top Setups Today
| Rank | Symbol | Direction | Grade | Touches | ATR Stop | Risk % |
|------|--------|-----------|-------|---------|----------|--------|
| 1 | [SYM] | LONG | Ideal | 3★ | $[X] | 2–3% |
| 2 | [SYM] | LONG | Strong | 2 | $[X] | 1.5% |

*Entry: last 10 min of the current 1h candle close.*

---

### Key News
- **[SYM]:** "[headline]" — [date]

---

### Notes
[Brief observations: e.g., "Market in Fear zone — reduce size", "NVDA has earnings tomorrow — skip", "Only 2 setups today, both LONG, aligns with SPY uptrend"]

---

## Timing

- Run at **9:00–9:15am EST** for pre-market overview
- Re-run `scanner_run_watchlist` at **9:50am** for the first 1h candle close setup check
- Position entries in the **last 10 minutes** of each 1h candle (9:50, 10:50, etc.)
