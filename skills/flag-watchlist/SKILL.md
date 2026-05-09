# Skill: flag-watchlist

Auto-flags TradingView watchlist tickers after a scanner run based on setup scenario and tier.

## Color mapping

| Tier | Scenario | TV Flag Color | Meaning |
|------|----------|--------------|---------|
| W1 | WATCH | `orange` | Approaching trendline + quality bounce (hammer/engulf) — top priority |
| W2 | WATCH | `cyan` | Approaching trendline + basic bounce (swing low) |
| any | HOLD | `green` | Post-breakout retesting trendline — second entry opportunity |
| S or A | BO | `blue` | Fresh strong breakout — still actionable |
| B, C, or none | BO or — | clear | Already moved or weak setup — don't bother |

Red, purple, pink are reserved for manual use.

## Steps

### 1. Run the scanner

Call `scanner_run_watchlist`. Collect the full result including the `signals` array and the list of all scanned symbols.

### 2. Build the flag assignment map

For each signal in the result:
- Parse `tier` and `scenario` from the signal object (fields already parsed by scanner.js)
- Determine target color:
  ```
  tier=W1, scenario=WATCH → orange
  tier=W2, scenario=WATCH → cyan
  scenario=HOLD           → green  (any tier)
  scenario=BO, tier=S|A   → blue
  otherwise               → clear
  ```

For all watchlist symbols that had no signal, assign `clear`.

### 3. Clear existing flags

For each color in `[orange, cyan, green, blue]`, remove all watchlist symbols from that color list using synchronous XHR via `ui_evaluate`:

```js
// Clear all scanner-managed colors
const colors = ['orange', 'cyan', 'green', 'blue'];
const allSymbols = [/* full watchlist symbol list, e.g. "NASDAQ:AAPL" */];
for (const color of colors) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/v1/symbols_list/colored/${color}/remove/?source=web-tvd`, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.withCredentials = true;
  xhr.send(JSON.stringify(allSymbols));
}
```

### 4. Set new flags

Group tickers by target color. For each color with at least one ticker, call append:

```js
// Set flags for each color group
const toSet = { orange: [...], cyan: [...], green: [...], blue: [...] };
for (const [color, symbols] of Object.entries(toSet)) {
  if (symbols.length === 0) continue;
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/v1/symbols_list/colored/${color}/append/?source=web-tvd`, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.withCredentials = true;
  xhr.send(JSON.stringify(symbols));
}
```

### 5. Verify

Call `GET /api/v1/symbols_list/colored/` via synchronous XHR and confirm each color list has the expected symbols:

```js
const xhr = new XMLHttpRequest();
xhr.open('GET', '/api/v1/symbols_list/colored/', false);
xhr.withCredentials = true;
xhr.send();
const lists = JSON.parse(xhr.responseText);
```

### 6. Report

Print a summary:
```
Flag results:
  orange (W1 WATCH): NVDA, AMD
  cyan   (W2 WATCH): TSLA, PLTR
  green  (HOLD):     AAPL
  blue   (BO S/A):   CRWD, MU
  cleared:           UNH, ELV, AMZN, ... (N tickers)
```

## Notes

- Symbol format must be `EXCHANGE:TICKER` (e.g. `NASDAQ:AAPL`, `NYSE:UNH`). Scanner results already include the full exchange-prefixed symbol — use as-is.
- All XHR calls must be **synchronous** (`async=false` third argument) — async fetch returns a Promise that ui_evaluate cannot await.
- Do not touch `red`, `purple`, or `pink` flag colors — those are reserved for manual user tagging.
- The scanner must be run first. Do not call flag-watchlist without fresh scanner results.
- If `scanner_run_watchlist` returns no signals (e.g. market is closed and all tickers filtered out), still run the clear step to reset stale flags from a prior scan.
