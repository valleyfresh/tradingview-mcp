import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChecked } from '../src/connection.js';
import { _resetBiasCache, _setBiasCache, getMarketBias, formatSignalRow } from '../src/core/scanner.js';

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
  it('formatSignalRow returns correct pipe-delimited format', () => {
    const signal = {
      symbol: 'AAPL', direction: 'LONG', tier: 'S', scenario: 'HOLD',
      touch_points: 3, ema_bars: 45, atr: 2.1,
    };
    assert.equal(formatSignalRow(signal), 'AAPL|LONG|S|HOLD|3|45|2.10');
  });

  it('formatSignalRow formats ATR to 2 decimal places', () => {
    const signal = {
      symbol: 'NVDA', direction: 'SHORT', tier: 'A', scenario: 'HOLD',
      touch_points: 2, ema_bars: 30, atr: 3.456789,
    };
    assert.equal(formatSignalRow(signal), 'NVDA|SHORT|A|HOLD|2|30|3.46');
  });

  it('multiple rows are newline-joined', () => {
    const signals = [
      { symbol: 'AAPL', direction: 'LONG', tier: 'S', scenario: 'HOLD', touch_points: 3, ema_bars: 45, atr: 2.1 },
      { symbol: 'NVDA', direction: 'SHORT', tier: 'A', scenario: 'HOLD', touch_points: 2, ema_bars: 30, atr: 3.45 },
    ];
    const compact = signals.map(formatSignalRow).join('\n');
    assert.equal(compact.split('\n').length, 2);
    assert.ok(compact.startsWith('AAPL|LONG|S|HOLD|3|45|2.10'));
  });
});
