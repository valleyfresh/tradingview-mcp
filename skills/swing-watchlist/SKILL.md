# Skill: swing-watchlist

Routes S-tier and A-tier scanner results into a named TradingView watchlist with sections.

## Watchlist Discovery

All custom watchlists are accessible via:
```
GET /api/v1/symbols_list/all/
```
Returns an array of all lists (custom + colored). Filter by `type === 'custom'` and `name` to find any watchlist.

```js
(function() {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/v1/symbols_list/all/', false);
  xhr.withCredentials = true;
  xhr.send();
  const all = JSON.parse(xhr.responseText);
  return all.filter(l => l.type === 'custom').map(l => ({ id: l.id, name: l.name, symbols: l.symbols }));
})()
```

Use this any time you need to find a watchlist ID, inspect its section layout, or add a new watchlist to a skill.

### Known watchlists (as of 2026-05-09)

| Name | ID | Notes |
|------|----|-------|
| Watchlist | 64693096 | Main scan source — "SMA list" equivalent, STOCKS section |
| Swing | 330412486 | 4-section output watchlist for S/A tier signals |
| SMA Strat | 153475213 | 22 symbols |
| Small / Mid Cap | 131731934 | 35 symbols |
| Day | 129007157 | 22 symbols |

## API endpoints (custom lists)

- `GET  /api/v1/symbols_list/custom/{id}/` → current symbols array
- `POST /api/v1/symbols_list/custom/{id}/append/?source=web-tvd` → append symbols (JSON array)
- `POST /api/v1/symbols_list/custom/{id}/remove/?source=web-tvd` → remove symbols (JSON array)

PUT/PATCH are not allowed. Use remove-then-rebuild with append.

## Swing watchlist structure

- **ID:** `330412486`
- **Sections (exact strings):**
  - `###S-TIER (LONG)`
  - `###S-TIER (SHORT)`
  - `###A-TIER (LONG)`
  - `###A-TIER (SHORT)`

Sections are stored as `###`-prefixed strings in the symbols array. Tickers appear after their section separator.

## Steps

### 1. Switch active watchlist to "Watchlist"

The scanner needs "Watchlist" visible in the right panel so it can switch to each symbol on the chart. Click the watchlist name dropdown and select "Watchlist" if not already active.

### 2. Run the scanner (STOCKS section only)

Call `scanner_run_watchlist` with `watchlist_name="Watchlist"` and `section="STOCKS"`. The `section` parameter reads symbols from the API and filters to only the STOCKS section — MARKETS (indices, ETFs) is excluded automatically.

```
scanner_run_watchlist(watchlist_name="Watchlist", section="STOCKS", filter_by_bias=true)
```

Collect the `signals` array — each entry has `symbol`, `direction`, `tier`, `scenario`.

### 3. Filter by tier

| Tier | Direction | → Section |
|------|-----------|-----------|
| S | LONG | S-TIER (LONG) |
| S | SHORT | S-TIER (SHORT) |
| A | LONG | A-TIER (LONG) |
| A | SHORT | A-TIER (SHORT) |
| W1, W2, B, C | — | skip |

### 4. Rebuild the Swing watchlist

Remove everything (separators + tickers), then append the full ordered array in one call:

```js
(function(sLong, sShort, aLong, aShort) {
  const id = 330412486;
  const base = `/api/v1/symbols_list/custom/${id}`;

  // Get current content
  const g = new XMLHttpRequest();
  g.open('GET', `${base}/`, false);
  g.withCredentials = true;
  g.send();
  const current = JSON.parse(g.responseText).symbols || [];

  // Clear everything
  if (current.length > 0) {
    const r = new XMLHttpRequest();
    r.open('POST', `${base}/remove/?source=web-tvd`, false);
    r.setRequestHeader('Content-Type', 'application/json');
    r.withCredentials = true;
    r.send(JSON.stringify(current));
  }

  // Rebuild with sections interleaved
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

  return JSON.parse(a.responseText);
})(
  [/* S LONG symbols */],
  [/* S SHORT symbols */],
  [/* A LONG symbols */],
  [/* A SHORT symbols */]
)
```

### 5. Verify

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
  S-TIER LONG  (2): NVDA, AMD
  S-TIER SHORT (0): —
  A-TIER LONG  (1): TSLA
  A-TIER SHORT (0): —
```

## Notes

- Symbol format: `EXCHANGE:TICKER` (e.g. `NASDAQ:NVDA`) — scanner returns this already.
- All XHR must be **synchronous** (`async=false`) — `ui_evaluate` cannot await Promises.
- If no S/A signals, still run the rebuild — clears stale entries, preserves empty sections.
- For a new watchlist: run discovery GET, note the id and section strings, update the skill.
