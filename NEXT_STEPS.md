# Next Steps

Pick up here when starting a new conversation.

## Immediate — Test the Scanner Live

### 1. Load the indicator
Open TradingView → 1h chart → Pine Editor. If "Swing Setup Scanner" is not on the chart:
```
pine_open → "Swing Setup Scanner"
```
Confirm the blue EMA line and orange trendline appear on the chart.

### 2. Run the watchlist scan
```
scanner_run_watchlist
```
- "SMA list" watchlist must be open and visible in TradingView
- Expected output: market bias (SPY), ranked list of LONG/SHORT setups with grade/touches/ATR
- If 0 results: check indicator is loaded, watchlist is visible, try `filter_by_bias=false` to see all signals

### 3. Visual confirmation
For each signal returned, open the chart and screenshot to confirm the trendline looks right.

### 4. Test morning brief
Run the `morning-brief` skill end-to-end. Check all 4 data sources return:
- CNN Fear & Greed score
- SPY/QQQ EMA position
- Earnings for watchlist symbols (next 2 days)
- News headlines for top setup candidates

---

## Tuning the Pine Script (after live test)

Adjust inputs in TradingView indicator settings based on what you see:

| Problem | Fix |
|---------|-----|
| Too many weak signals | Increase Min Touch Points to 3 |
| Missing obvious setups | Increase Breakout Lookback Bars to 5 |
| Trendlines look wrong | Adjust Pivot Left/Right bars (try left=7, right=5) |
| Bounce not detected | Increase EMA Bounce Band % to 7% |
| Too many choppy stocks passing | Reduce cross_count tolerance (edit script: `<= 1`) |

After tuning inputs, re-save the indicator in TV, and update `scripts/setup-scanner.pine` to match.

---

## Up Next After Testing

- [ ] Backtest existing Pine strategies — use `data_get_strategy_results` + `data_get_equity`
- [ ] New indicator development based on scan findings
- [ ] openclaw server setup — TradingView Desktop + MCP as a service
- [ ] Automate morning brief on a schedule (e.g., 9am EST weekdays)
