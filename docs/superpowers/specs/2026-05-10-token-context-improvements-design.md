# Token / Context Improvements — Design Spec

**Date:** 2026-05-10  
**Scope:** Three targeted, in-place improvements to reduce token usage and prevent silent data loss.  
**Approach:** Option A — minimal changes, no new utility modules.

---

## Change 1 — SPY Bias Cache (15-min TTL)

**File:** `src/core/scanner.js`  
**Effort:** ~15 min  
**Impact:** Saves ~5s + 2 tool calls per scan (switchTo SPY, read indicators, switch back)

### What changes

Add a module-level cache object and a TTL constant. In `getMarketBias()`, return the cached value if it is younger than 15 minutes; otherwise fetch fresh and update the cache.

```js
// module scope (top of file, after imports)
let _biasCache = { value: null, ts: 0 };
const BIAS_TTL_MS = 15 * 60 * 1000;
```

In `getMarketBias()`, before the `try` block:

```js
if (_biasCache.value !== null && Date.now() - _biasCache.ts < BIAS_TTL_MS) {
  return _biasCache.value;
}
```

At the end of the `try` block, before returning:

```js
_biasCache = { value: <result>, ts: Date.now() };
```

### Behaviour notes

- `'neutral'` is a valid cached value — no special-casing.
- TTL of 15 min covers a full scan (~80 symbols × 2s = 160s) with headroom.
- Cache is process-scoped: it persists across repeated `runWatchlistScan` calls within one MCP server session, resets on server restart.

---

## Change 2 — Scanner Compact Mode

**File:** `src/core/scanner.js` + MCP tool definition for `scanner_run_watchlist`  
**Effort:** ~30 min  
**Impact:** ~1-2 KB smaller tool result per scan (fewer bytes landing in Claude's context)

### What changes

Add `compact?: boolean` (default `false`) to the `runWatchlistScan` opts destructure.

When `compact: true`, replace the `signals` array of objects with a newline-joined string of pipe-delimited rows:

```
SYMBOL|DIRECTION|TIER|SCENARIO|TOUCHES|EMA_BARS|ATR
```

Example output:

```
AAPL|LONG|S|HOLD|3|45|2.10
NVDA|SHORT|A|HOLD|2|30|3.45
```

Field order matches the Pine label format. `signals_found` count is still returned.

When `compact: false` (default), behaviour is unchanged — `signals` remains an array of parsed objects.

### Compatibility

- Default is `false` — existing skills (`setup-scan`, `swing-watchlist`) are unaffected.
- The MCP tool definition exposes `compact` as an optional boolean input.
- Skills that opt into compact mode must parse the pipe-delimited string themselves.

---

## Change 3 — `evaluate()` Size Guard

**File:** `src/connection.js` (new export) + `src/core/scanner.js` (one call site switched over)  
**Effort:** ~20 min  
**Impact:** Prevents silent CDP truncation from producing corrupt scan results

### What changes

Add `evaluateChecked(expression, label?)` to `connection.js`. It wraps the JS expression to return `{ data, sz }`, then compares `sz` (byte length computed inside the browser) against the actual received payload size.

```js
export async function evaluateChecked(expression, label = 'evaluate') {
  const wrapped = `(function(){ const d = (${expression}); return { data: d, sz: JSON.stringify(d).length }; })()`;
  const result = await evaluate(wrapped);
  const received = JSON.stringify(result?.data).length;
  if (result?.sz !== received) {
    throw new Error(`${label}: CDP truncated response (expected ${result.sz} bytes, got ${received})`);
  }
  return result?.data;
}
```

### Call sites to migrate

- `getSymbolsFromSection` in `scanner.js` — the one place currently most at risk (fetches full watchlist JSON before section filtering).

### Compatibility

- `evaluate()` is unchanged — all other call sites are unaffected.
- `evaluateChecked` is additive; callers opt in explicitly.

---

## Out of Scope (deferred)

| # | Idea | Reason deferred |
|---|------|----------------|
| 4 | Scan result persistence (JSON cache with TTL) | Higher effort (~1 hr), lower urgency |
| 5 | `session-end` skill | Independent of scanner; separate session |
| 6 | Pine inject skip-if-current | Independent of scanner; separate session |
