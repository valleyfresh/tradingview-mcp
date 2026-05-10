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
      /expected 9999 bytes, got \d+/
    );
  });
});
