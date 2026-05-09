#!/usr/bin/env node
/**
 * Pine Visual Test Evaluator
 *
 * Usage:
 *   node tests/pine-visual/evaluate.js --case <id> --data '<json>'
 *
 * <json> shape:
 *   {
 *     "labels": ["LONG|Ideal|3|45|0.87"],   // raw pine label strings
 *     "boxes":  [{"high": 195.2, "low": 194.1}],  // bounce boxes
 *     "ema":    210.5                         // current EMA value
 *   }
 *
 * Exits 0 if all data assertions pass (visual assertions are marked pending).
 * Exits 1 if any data assertion fails.
 * Writes results to tests/pine-visual/.last-results.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const RESULTS_FILE = resolve(__dir, '.last-results.json');
const CASES_DIR    = resolve(__dir, 'cases');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log([
    'Usage: node evaluate.js --case <id> --data <json>',
    '',
    'Options:',
    '  --case <id>    Test case id (matches cases/<id>.json)',
    '  --data <json>  JSON with { labels, boxes, ema }',
    '  --help         Show this help',
  ].join('\n'));
  process.exit(0);
}

function arg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const caseId  = arg('--case');
const dataRaw = arg('--data');

if (!caseId || !dataRaw) {
  console.error('Error: --case and --data are required');
  process.exit(2);
}

// ── Load case ─────────────────────────────────────────────────────────────────

let testCase;
try {
  testCase = JSON.parse(readFileSync(resolve(CASES_DIR, `${caseId}.json`), 'utf8'));
} catch (e) {
  console.error(`Cannot load case "${caseId}": ${e.message}`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(dataRaw);
} catch (e) {
  console.error(`Invalid --data JSON: ${e.message}`);
  process.exit(2);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseLabel(raw) {
  // "LONG|Ideal|3|45|0.87" → { direction, grade, touches, ema_bars, atr }
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length < 5) return null;
  return {
    direction: parts[0],
    grade:     parts[1],
    touches:   parseInt(parts[2], 10),
    ema_bars:  parseInt(parts[3], 10),
    atr:       parseFloat(parts[4]),
  };
}

function detectDirection(labels) {
  for (const raw of (labels || [])) {
    const l = parseLabel(raw);
    if (l) return l.direction;  // LONG or SHORT
  }
  return null;
}

// ── Assertion evaluator ───────────────────────────────────────────────────────

function evaluateAssertion(assertion, ctx) {
  const { type } = assertion;

  if (type === 'visual') {
    return { pass: null, status: 'visual_pending', reason: assertion.description };
  }

  if (type === 'if_long_setup') {
    const dir = detectDirection(ctx.labels);
    if (dir !== 'LONG') {
      return { pass: true, status: 'skipped', reason: 'No LONG setup present — vacuously pass' };
    }
    return evaluateAll(assertion.then, ctx);
  }

  if (type === 'if_short_setup') {
    const dir = detectDirection(ctx.labels);
    if (dir !== 'SHORT') {
      return { pass: true, status: 'skipped', reason: 'No SHORT setup present — vacuously pass' };
    }
    return evaluateAll(assertion.then, ctx);
  }

  if (type === 'has_bounce_box') {
    const ok = Array.isArray(ctx.boxes) && ctx.boxes.length > 0;
    return {
      pass: ok,
      status: ok ? 'pass' : 'fail',
      reason: ok ? `${ctx.boxes.length} bounce box(es) found` : 'No bounce boxes drawn',
    };
  }

  if (type === 'bounce_box_near_ema') {
    if (!Array.isArray(ctx.boxes) || ctx.boxes.length === 0) {
      return { pass: false, status: 'fail', reason: 'No bounce boxes to check' };
    }
    const box = ctx.boxes[0];
    const ema = ctx.ema;
    if (!ema || ema <= 0) {
      return { pass: null, status: 'visual_pending', reason: 'EMA value unavailable — check screenshot' };
    }
    const mid = (box.high + box.low) / 2;
    const pct = Math.abs(mid - ema) / ema * 100;
    const tol = assertion.tolerance_pct ?? 10;
    const ok  = pct <= tol;
    return {
      pass: ok,
      status: ok ? 'pass' : 'fail',
      reason: ok
        ? `Box mid ${mid.toFixed(2)} within ${pct.toFixed(1)}% of EMA ${ema.toFixed(2)} (tol ${tol}%)`
        : `Box mid ${mid.toFixed(2)} is ${pct.toFixed(1)}% from EMA ${ema.toFixed(2)} — exceeds ${tol}% tolerance`,
    };
  }

  if (type === 'pine_source_contains') {
    // Checks that a pattern appears in the Pine Script source, optionally near a context string.
    // Reads the file relative to process.cwd() (repo root).
    const filePath = resolve(process.cwd(), assertion.file);
    let src;
    try {
      src = readFileSync(filePath, 'utf8');
    } catch (e) {
      return { pass: false, status: 'fail', reason: `Cannot read ${assertion.file}: ${e.message}` };
    }
    const patternFound = src.includes(assertion.pattern);
    if (!patternFound) {
      return {
        pass: false, status: 'fail',
        reason: `Pattern not found in ${assertion.file}: "${assertion.pattern}"`,
      };
    }
    // If context_near specified, check the pattern appears within 30 lines of ANY occurrence of the context string
    if (assertion.context_near) {
      const lines = src.split('\n');
      const patternLine = lines.findIndex(l => l.includes(assertion.pattern));
      const window = assertion.window ?? 30;
      const nearMatch = lines.some((l, i) => l.includes(assertion.context_near) && Math.abs(i - patternLine) <= window);
      if (patternLine === -1 || !nearMatch) {
        return {
          pass: false, status: 'fail',
          reason: `"${assertion.pattern}" not found within ${window} lines of "${assertion.context_near}" in ${assertion.file}`,
        };
      }
    }
    return { pass: true, status: 'pass', reason: `Pattern found: "${assertion.pattern}"` };
  }

  if (type === 'label_field') {
    const labels = (ctx.labels || []).map(parseLabel).filter(Boolean);
    if (labels.length === 0) {
      return { pass: false, status: 'fail', reason: 'No parseable setup labels found' };
    }
    const label = labels[0];
    const actual = label[assertion.field];
    const expected = assertion.value;
    const oneOf = assertion.oneOf;
    const ok = oneOf ? oneOf.includes(actual) : actual == expected;
    return {
      pass: ok,
      status: ok ? 'pass' : 'fail',
      reason: ok
        ? `label.${assertion.field} = "${actual}"`
        : `label.${assertion.field} = "${actual}", expected ${oneOf ? JSON.stringify(oneOf) : `"${expected}"`}`,
    };
  }

  return { pass: null, status: 'unknown', reason: `Unknown assertion type: ${type}` };
}

function evaluateAll(assertions, ctx) {
  const results = assertions.map(a => ({ assertion: a.type, ...evaluateAssertion(a, ctx) }));
  const anyFail = results.some(r => r.pass === false);
  const anyPending = results.some(r => r.pass === null);
  return {
    pass: anyFail ? false : anyPending ? null : true,
    status: anyFail ? 'fail' : anyPending ? 'partial' : 'pass',
    results,
  };
}

// ── Run ───────────────────────────────────────────────────────────────────────

const ctx = {
  labels: data.labels || [],
  boxes:  data.boxes  || [],
  ema:    data.ema    || 0,
};

const overall = evaluateAll(testCase.assertions, ctx);

const output = {
  case_id:     testCase.id,
  description: testCase.description,
  ticker:      testCase.ticker,
  timeframe:   testCase.timeframe,
  pass:        overall.pass,
  status:      overall.status,
  results:     overall.results,
  timestamp:   new Date().toISOString(),
};

// Persist for Stop hook
try {
  let existing = [];
  try { existing = JSON.parse(readFileSync(RESULTS_FILE, 'utf8')); } catch {}
  const updated = existing.filter(r => r.case_id !== output.case_id);
  updated.push(output);
  writeFileSync(RESULTS_FILE, JSON.stringify(updated, null, 2));
} catch (e) {
  // non-fatal
}

console.log(JSON.stringify(output, null, 2));
process.exit(overall.pass === false ? 1 : 0);
