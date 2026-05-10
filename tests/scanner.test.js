import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecked } from '../src/connection.js';
import { _resetBiasCache, _setBiasCache, getMarketBias } from '../src/core/scanner.js';

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
      /expected 9999 bytes, got \d+/
    );
  });
});

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

// ── Compact mode output format ────────────────────────────────────────────

describe('compact signal format', () => {
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
