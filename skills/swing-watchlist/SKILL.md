# Skill: swing-watchlist

Routes S-tier and A-tier scanner results into the "Swing" TradingView watchlist (4 sections).

## Watchlist structure (discovered 2026-05-09)

- **Watchlist name:** Swing
- **Watchlist ID:** `330412486`
- **Section format:** `###SECTION-NAME` strings in the symbols array
- **Sections (exact names):**
  - `###S-TIER (LONG)`
  - `###S-TIER (SHORT)`
  - `###A-TIER (LONG)`
  - `###A-TIER (SHORT)`

## API endpoints

- `GET  /api/v1/symbols_list/custom/330412486/` → current state
- `POST /api/v1/symbols_list/custom/330412486/append/?source=web-tvd` → add symbols (appends to end)
- `POST /api/v1/symbols_list/custom/330412486/remove/?source=web-tvd` → remove symbols by value

No PUT/PATCH available — use remove-then-rebuild pattern (see Step 4).

## Steps

### 1. Switch active watchlist to "Watchlist" (STOCKS section)

The scanner reads whatever watchlist is visible in TradingView's right panel. Before calling `scanner_run_watchlist`, ensure the main **"Watchlist"** is active — not "Swing" or any other list. Switch via UI if needed.

### 2. Run the scanner

Call `scanner_run_watchlist`. Collect the full result including `signals` array and list of all scanned symbols.

### 3. Filter signals by tier

Route only S and A tier signals. Ignore W1, W2, B, C.

For each signal in `signals`:
```
tier === 'S', direction === 'LONG'  → S-tier long
tier === 'S', direction === 'SHORT' → S-tier short
tier === 'A', direction === 'LONG'  → A-tier long
tier === 'A', direction === 'SHORT' → A-tier short
```

All other tiers → not added to swing watchlist.

### 4. Rebuild the swing watchlist

Use `ui_evaluate` with synchronous XHR. The strategy: remove all existing content (separators + tickers), then re-append in section order.

```js
(function() {
  const id = 330412486;
  const base = `/api/v1/symbols_list/custom/${id}`;

  // Step A: get current symbols
  const g = new XMLHttpRequest();
  g.open('GET', `${base}/`, false);
  g.withCredentials = true;
  g.send();
  const current = JSON.parse(g.responseText).symbols || [];

  // Step B: remove everything
  if (current.length > 0) {
    const r = new XMLHttpRequest();
    r.open('POST', `${base}/remove/?source=web-tvd`, false);
    r.setRequestHeader('Content-Type', 'application/json');
    r.withCredentials = true;
    r.send(JSON.stringify(current));
  }

  // Step C: rebuild in order — separators interleaved with tickers
  const sLong  = [/* EXCHANGE:TICKER, ... */];
  const sShort = [/* EXCHANGE:TICKER, ... */];
  const aLong  = [/* EXCHANGE:TICKER, ... */];
  const aShort = [/* EXCHANGE:TICKER, ... */];

  const newSymbols = [
    "###S-TIER (LONG)",  ...sLong,
    "###S-TIER (SHORT)", ...sShort,
    "###A-TIER (LONG)",  ...aLong,
    "###A-TIER (SHORT)", ...aShort,
  ];

  const a = new XMLHttpRequest();
  a.open('POST', `${base}/append/?source=web-tvd`, false);
  a.setRequestHeader('Content-Type', 'application/json');
  a.withCredentials = true;
  a.send(JSON.stringify(newSymbols));

  return { removed: current.length, appended: newSymbols.length, result: JSON.parse(a.responseText) };
})()
```

### 5. Verify

Call GET and confirm each section has the expected tickers:

```js
(function() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/v1/symbols_list/custom/330412486/', false);
  xhr.withCredentials = true;
  xhr.send();
  return JSON.parse(xhr.responseText).symbols;
})()
```

### 6. Report

```
Swing watchlist updated:
  ###S-TIER (LONG)  (2): NVDA, AMD
  ###S-TIER (SHORT) (0): —
  ###A-TIER (LONG)  (1): TSLA
  ###A-TIER (SHORT) (0): —
```

## Notes

- Symbol format: `EXCHANGE:TICKER` (e.g. `NASDAQ:NVDA`) — scanner already returns this format.
- All XHR calls must be **synchronous** (`async=false`) — `ui_evaluate` cannot await Promises.
- The rebuild uses a single append call with the full ordered array — sections appear in TradingView in the order the separators appear in the array.
- If `scanner_run_watchlist` returns no S or A signals, still run the rebuild to clear stale entries (sections will be empty but separators preserved).
- Do not route W1/W2 signals here — those belong in the flag-watchlist skill (color flags).
- The scanner reads the **active watchlist** — confirm "Watchlist" (not "Swing") is showing before scanning.
