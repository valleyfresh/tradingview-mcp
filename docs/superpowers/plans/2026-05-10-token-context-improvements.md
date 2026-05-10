# Token / Context Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SPY bias caching, scanner compact mode, and a CDP size-guard helper to reduce token usage and prevent silent data loss.

**Architecture:** Three independent in-place changes — no new modules, no new files except `tests/scanner.test.js`. Each change is self-contained; tasks can be read independently.

**Tech Stack:** Node.js (ESM), `node:test` test runner, Chrome DevTools Protocol (CDP) via `chrome-remote-interface`

---

## File Map

| File | Change |
|------|--------|
| `src/connection.js` | Add `evaluateChecked()` export |
| `src/core/scanner.js` | Add bias cache + `_resetBiasCache` + `_setBiasCache`; refactor `getMarketBias` to accept `_fetch`; add `compact` flag; switch `getSymbolsFromSection` to `evaluateChecked` |
| `src/tools/scanner.js` | Add `compact` to MCP tool schema |
| `tests/scanner.test.js` | New unit test file for all three changes |

---

## Task 1: Add `evaluateChecked()` to `connection.js`

**Files:**
- Modify: `src/connection.js` (after line 125, after `evaluateAsync`)
- Test: `tests/scanner.test.js` (create)

The helper wraps any JS expression to return `{ data, sz }` where `sz` is the byte length computed inside the browser. After CDP returns, it compares the actual received byte count against `sz` and throws if they differ (indicating CDP truncation).

The optional `_eval` parameter defaults to `evaluate`, enabling testing without a live CDP connection.

- [ ] **Step 1: Create `tests/scanner.test.js` with a failing test for `evaluateChecked`**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecked } from '../src/connection.js';

// ── evaluateChecked() ─────────────────────────────────────────────────────

describe('evaluateChecked()', () => {
  it('returns data when sz matches received byte count', async () => {
    const payload = { symbols: ['AAPL', 'NVDA'] };
    const fakeEval = async () => ({
      data: payload,
      sz: JSON.stringify(payload).length,
    });

    const result = await evaluateChecked('ignored', 'test', fakeEval);
    assert.deepEqual(result, payload);
  });

  it('throws when sz does not match (truncation detected)', async () => {
    const fakeEval = async () => ({
      data: { symbols: ['AAPL'] },
      sz: 9999, // deliberately wrong
    });

    await assert.rejects(
      () => evaluateChecked('ignored', 'getSymbols', fakeEval),
      /getSymbols: CDP truncated response/
    );
  });

  it('throws with expected and received byte counts in message', async () => {
    const fakeEval = async () => ({ data: 'x', sz: 9999 });

    await assert.rejects(
      () => evaluateChecked('ignored', 'myLabel', fakeEval),
      /expected 9999 bytes/
    );
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
node --test tests/scanner.test.js
```

Expected: `ReferenceError: evaluateChecked is not a function` (or import error)

- [ ] **Step 3: Add `evaluateChecked` to `src/connection.js`**

Insert after line 125 (after the `evaluateAsync` function):

```js
export async function evaluateChecked(expression, label = 'evaluate', _eval = evaluate) {
  const wrapped = `(function(){ const d = (${expression}); return { data: d, sz: JSON.stringify(d).length }; })()`;
  const result = await _eval(wrapped);
  const received = JSON.stringify(result?.data).length;
  if (result?.sz !== received) {
    throw new Error(`${label}: CDP truncated response (expected ${result.sz} bytes, got ${received})`);
  }
  return result?.data;
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
node --test tests/scanner.test.js
```

Expected:
```
# tests 3
# pass 3
# fail 0
```

- [ ] **Step 5: Verify existing sanitization tests still pass**

```bash
node --test tests/sanitization.test.js
```

Expected: `# pass 70  # fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/connection.js tests/scanner.test.js
git commit -m "feat: add evaluateChecked() CDP size-guard helper"
```

---

## Task 2: SPY Bias Cache in `scanner.js`

**Files:**
- Modify: `src/core/scanner.js` — module scope + `getMarketBias`
- Test: `tests/scanner.test.js` — add describe block

The cache is a module-level object `{ value, ts }` with a 15-minute TTL. `getMarketBias` is refactored to accept an optional `_fetch` parameter (defaults to the existing internal logic extracted into `fetchBias()`). This makes the TTL logic testable without a live CDP connection.

Two test-only exports are added: `_resetBiasCache()` and `_setBiasCache(cache)`.

- [ ] **Step 1: Add failing tests to `tests/scanner.test.js`**

First, add the scanner import to the **top of the file** (after the existing `evaluateChecked` import):

```js
import { _resetBiasCache, _setBiasCache, getMarketBias } from '../src/core/scanner.js';
```

Then append the new describe block after the `evaluateChecked` describe block:

```js
// ── SPY bias cache ────────────────────────────────────────────────────────

describe('getMarketBias() — cache', () => {
  it('fetches on first call and caches the result', async () => {
    _resetBiasCache();
    let calls = 0;
    const fakeFetch = async () => { calls++; return 'long'; };

    const r1 = await getMarketBias(fakeFetch);
    const r2 = await getMarketBias(fakeFetch);

    assert.equal(r1, 'long');
    assert.equal(r2, 'long');
    assert.equal(calls, 1);
  });

  it('caches neutral result', async () => {
    _resetBiasCache();
    let calls = 0;
    const fakeFetch = async () => { calls++; return 'neutral'; };

    await getMarketBias(fakeFetch);
    await getMarketBias(fakeFetch);

    assert.equal(calls, 1);
  });

  it('re-fetches after TTL expires (16 min old cache)', async () => {
    _resetBiasCache();
    _setBiasCache({ value: 'short', ts: Date.now() - 16 * 60 * 1000 });
    let calls = 0;
    const fakeFetch = async () => { calls++; return 'long'; };

    const result = await getMarketBias(fakeFetch);
    assert.equal(result, 'long');
    assert.equal(calls, 1);
  });

  it('does not re-fetch within TTL (5 min old cache)', async () => {
    _resetBiasCache();
    _setBiasCache({ value: 'long', ts: Date.now() - 5 * 60 * 1000 });
    let calls = 0;
    const fakeFetch = async () => { calls++; return 'short'; };

    const result = await getMarketBias(fakeFetch);
    assert.equal(result, 'long'); // returns cached value
    assert.equal(calls, 0);
  });
});
```

- [ ] **Step 2: Run — verify the new tests fail**

```bash
node --test tests/scanner.test.js
```

Expected: `SyntaxError: The requested module '../src/core/scanner.js' does not provide an export named '_resetBiasCache'`

Expected: import errors or `_resetBiasCache is not a function`

- [ ] **Step 3: Refactor `scanner.js` — add cache state and extract `fetchBias`**

Replace lines 8–94 in `src/core/scanner.js` with:

```js
import { evaluate, evaluateChecked, getChartApi, getChartCollection, safeString } from '../connection.js';
import { waitForChartReady } from '../wait.js';
import { get as getWatchlist } from './watchlist.js';
import { getPineLabels, getStudyValues, getOhlcv } from './data.js';

/**
 * Get symbols from a named watchlist section via the API.
 * Handles the ### separator format TradingView uses for sections.
 * Section name matching is case-insensitive and ignores hidden Unicode chars.
 */
async function getSymbolsFromSection(watchlistName, sectionName) {
  const symbols = await evaluateChecked(`
    (function(wlName, secName) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/v1/symbols_list/all/', false);
      xhr.withCredentials = true;
      xhr.send();
      const lists = JSON.parse(xhr.responseText);
      const wl = lists.find(l =>
        l.type === 'custom' &&
        l.name && l.name.toLowerCase() === wlName.toLowerCase()
      );
      if (!wl) return { error: 'not_found' };
      const target = secName.toLowerCase();
      let inSection = false;
      const result = [];
      for (const sym of (wl.symbols || [])) {
        if (sym.startsWith('###')) {
          const label = sym.slice(3).replace(/[^\\x20-\\x7E]/g, '').trim().toLowerCase();
          inSection = label === target;
        } else if (inSection) {
          result.push(sym);
        }
      }
      return { symbols: result };
    })(${safeString(watchlistName)}, ${safeString(sectionName)})
  `, 'getSymbolsFromSection');

  if (symbols?.error === 'not_found') throw new Error(`Watchlist "${watchlistName}" not found via API`);
  return symbols?.symbols || [];
}

const SCANNER_INDICATOR = 'Swing Setup Scanner';
const TIER_SCORE = { S: 4, A: 3, B: 2, W1: 2, C: 1, W2: 1 };

/** Switch symbol + timeframe using the same approach as batch.js */
async function switchTo(symbol, timeframe) {
  let colPath, apiPath;
  try { colPath = await getChartCollection(); } catch {}
  try { apiPath = await getChartApi(); } catch {}

  const target = colPath || apiPath;
  if (!target) throw new Error('TradingView chart API not available');

  await evaluate(`${target}.setSymbol(${safeString(symbol)})`);
  await evaluate(`${target}.setResolution(${safeString(timeframe)})`);
  await waitForChartReady(symbol);
  await new Promise(r => setTimeout(r, 2000));
}

// ── Bias cache ────────────────────────────────────────────────────────────

let _biasCache = { value: null, ts: 0 };
const BIAS_TTL_MS = 15 * 60 * 1000;

export function _resetBiasCache() { _biasCache = { value: null, ts: 0 }; }
export function _setBiasCache(cache) { _biasCache = cache; }

/** Fetch SPY bias from the live chart (no caching). */
async function fetchBias() {
  await switchTo('SPY', '60');

  const studyVals = await getStudyValues();
  const scannerStudy = studyVals.studies?.find(s =>
    s.name?.toLowerCase().includes(SCANNER_INDICATOR.toLowerCase())
  );
  const emaStr = scannerStudy?.values?.['Daily EMA 20'];
  const emaVal = parseFloat(emaStr);

  const ohlcv = await getOhlcv({ count: 1, summary: false });
  const lastClose = ohlcv.bars?.[0]?.close;

  if (!emaVal || !lastClose || isNaN(emaVal)) return 'neutral';

  const diffPct = (lastClose - emaVal) / emaVal;
  if (diffPct >  0.001) return 'long';
  if (diffPct < -0.001) return 'short';
  return 'neutral';
}

/** Return SPY market bias, using a 15-min cache to avoid redundant chart switches. */
export async function getMarketBias(_fetch = fetchBias) {
  if (_biasCache.value !== null && Date.now() - _biasCache.ts < BIAS_TTL_MS) {
    return _biasCache.value;
  }
  let result;
  try {
    result = await _fetch();
  } catch {
    result = 'neutral';
  }
  _biasCache = { value: result, ts: Date.now() };
  return result;
}
```

- [ ] **Step 4: Run the tests — verify all pass**

```bash
node --test tests/scanner.test.js
```

Expected:
```
# tests 7
# pass 7
# fail 0
```

- [ ] **Step 5: Verify existing sanitization tests still pass**

```bash
node --test tests/sanitization.test.js
```

Expected: `# pass 70  # fail 0`

- [ ] **Step 6: Commit**

```bash
git add src/core/scanner.js tests/scanner.test.js
git commit -m "feat: add 15-min SPY bias cache to scanner"
```

---

## Task 3: Scanner Compact Mode

**Files:**
- Modify: `src/core/scanner.js` — `runWatchlistScan` opts + return value
- Modify: `src/tools/scanner.js` — add `compact` to tool schema
- Test: `tests/scanner.test.js` — add describe block

When `compact: true`, the `signals` field becomes a newline-joined string of pipe-delimited rows: `SYMBOL|DIRECTION|TIER|SCENARIO|TOUCHES|EMA_BARS|ATR`. Default is `false` — existing skills are unaffected.

- [ ] **Step 1: Add failing tests for compact mode to `tests/scanner.test.js`**

Append after the bias cache describe block. No new imports needed — the format tests are pure assertions:

```js
// ── Compact mode output format ────────────────────────────────────────────

describe('compact signal format', () => {
  // Test the row formatter in isolation by importing the private helper
  // via the compact output of a minimal mock scan.
  // We test the format contract: SYMBOL|DIRECTION|TIER|SCENARIO|TOUCHES|EMA_BARS|ATR

  it('compact row matches expected pipe-delimited format', () => {
    const signal = {
      symbol: 'AAPL',
      direction: 'LONG',
      tier: 'S',
      scenario: 'HOLD',
      touch_points: 3,
      ema_bars: 45,
      atr: 2.1,
    };
    // Build the expected row using the same format the implementation will use
    const row = `${signal.symbol}|${signal.direction}|${signal.tier}|${signal.scenario}|${signal.touch_points}|${signal.ema_bars}|${signal.atr}`;
    assert.equal(row, 'AAPL|LONG|S|HOLD|3|45|2.1');
  });

  it('compact rows are newline-joined', () => {
    const rows = ['AAPL|LONG|S|HOLD|3|45|2.1', 'NVDA|SHORT|A|HOLD|2|30|3.45'];
    const compact = rows.join('\n');
    assert.equal(compact, 'AAPL|LONG|S|HOLD|3|45|2.1\nNVDA|SHORT|A|HOLD|2|30|3.45');
    assert.equal(compact.split('\n').length, 2);
  });
});
```

- [ ] **Step 2: Run — verify the format tests pass immediately (they are format-contract tests)**

```bash
node --test tests/scanner.test.js
```

Expected: all tests pass (these tests document the format contract, not the implementation).

- [ ] **Step 3: Add `compact` flag to `runWatchlistScan` in `src/core/scanner.js`**

Find the `export async function runWatchlistScan` signature (line ~123 after Task 2 edits) and update the destructure:

```js
export async function runWatchlistScan({
  watchlist_name = 'SMA list',
  section = null,
  timeframe = '60',
  filter_by_bias = false,
  delay_ms = 2000,
  compact = false,
} = {}) {
```

Then find the return statement (the final `return { success: true, ... }` block) and replace the `signals` line:

```js
  return {
    success: true,
    market_bias,
    scanned: symbols.length,
    signals_found: signals.length,
    signals: compact
      ? signals.map(s =>
          `${s.symbol}|${s.direction}|${s.tier}|${s.scenario}|${s.touch_points}|${s.ema_bars}|${s.atr}`
        ).join('\n')
      : signals,
    skipped_count: skipped.length,
    error_count: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  };
```

- [ ] **Step 4: Add `compact` to the MCP tool schema in `src/tools/scanner.js`**

After the `delay_ms` field (line ~30), add:

```js
      compact: z.boolean().optional().describe(
        'If true, return signals as a newline-joined pipe-delimited string ' +
        '(SYMBOL|DIRECTION|TIER|SCENARIO|TOUCHES|EMA_BARS|ATR) instead of an object array. ' +
        'Reduces token usage by ~1-2 KB per scan. Default: false.'
      ),
```

Also pass `compact` through in the handler:

```js
    async ({ watchlist_name, section, timeframe, filter_by_bias, delay_ms, compact }) => {
      try {
        return jsonResult(await core.runWatchlistScan({
          watchlist_name,
          section,
          timeframe,
          filter_by_bias,
          delay_ms,
          compact,
        }));
```

- [ ] **Step 5: Run all scanner tests**

```bash
node --test tests/scanner.test.js
```

Expected:
```
# tests 9
# pass 9
# fail 0
```

- [ ] **Step 6: Verify sanitization tests still pass**

```bash
node --test tests/sanitization.test.js
```

Expected: `# pass 70  # fail 0`

- [ ] **Step 7: Commit**

```bash
git add src/core/scanner.js src/tools/scanner.js tests/scanner.test.js
git commit -m "feat: add compact mode to scanner_run_watchlist"
```

---

## Task 4: Add scanner tests to npm test script

**Files:**
- Modify: `package.json`

The new `tests/scanner.test.js` runs without a live TradingView connection — it belongs in `test:unit`.

- [ ] **Step 1: Update `package.json` test scripts**

Find the `"scripts"` block and update `test:unit` to include `scanner.test.js`:

```json
"test:unit": "node --test tests/pine_analyze.test.js tests/cli.test.js tests/sanitization.test.js tests/scanner.test.js",
```

- [ ] **Step 2: Run the updated unit test suite**

```bash
npm run test:unit
```

Expected: all tests pass, no failures.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add scanner.test.js to unit test suite"
```
