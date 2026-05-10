/**
 * Swing setup scanner — iterates the user's TradingView watchlist, reads
 * "Swing Setup Scanner" Pine Script labels, and returns ranked setups.
 *
 * Prerequisites: the "Swing Setup Scanner" indicator must be loaded and visible
 * on the 1h chart before calling runWatchlistScan().
 */
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
  try {
    const result = await _fetch();
    _biasCache = { value: result, ts: Date.now() };
    return result;
  } catch (err) {
    console.warn('[scanner] getMarketBias failed, defaulting to neutral:', err.message);
    return 'neutral';
  }
}

/** Parse a scanner label string into a structured object */
function parseLabel(text, symbol) {
  const parts = text.split('|');
  if (parts.length < 6) return null;
  const [direction, tier, scenario, touchStr, emaBarsStr, atrStr] = parts;
  if (direction !== 'LONG' && direction !== 'SHORT') return null;
  return {
    symbol,
    direction,
    tier,
    scenario,
    tier_score: TIER_SCORE[tier] ?? 0,
    touch_points: parseInt(touchStr, 10) || 0,
    ema_bars: parseInt(emaBarsStr, 10) || 0,
    atr: parseFloat(atrStr) || 0,
  };
}

/** Format a parsed signal as a compact pipe-delimited row. */
export function formatSignalRow(s) {
  return `${s.symbol}|${s.direction}|${s.tier}|${s.scenario}|${s.touch_points}|${s.ema_bars}|${s.atr.toFixed(2)}`;
}

/**
 * Scan the named watchlist for valid setups.
 *
 * @param {object} opts
 * @param {string} [opts.watchlist_name]   Name of the TradingView watchlist (default "SMA list")
 * @param {string} [opts.timeframe]        Chart timeframe (default "60" = 1h)
 * @param {boolean} [opts.filter_by_bias]  If true, only return signals matching SPY direction
 * @param {number}  [opts.delay_ms]        Per-symbol delay in ms (default 2000)
 * @param {boolean} [opts.compact]         If true, return signals as newline-joined pipe-delimited string
 */
export async function runWatchlistScan({
  watchlist_name = 'SMA list',
  section = null,
  timeframe = '60',
  filter_by_bias = false,
  delay_ms = 2000,
  compact = false,
} = {}) {
  // 1. Get watchlist symbols — via API section filter or DOM fallback
  let symbols;
  if (section) {
    symbols = await getSymbolsFromSection(watchlist_name, section);
    if (symbols.length === 0) {
      throw new Error(`No symbols found in section "${section}" of watchlist "${watchlist_name}".`);
    }
  } else {
    const wl = await getWatchlist();
    symbols = wl.symbols?.map(s => s.symbol).filter(Boolean) || [];
    if (symbols.length === 0) {
      throw new Error(`No symbols found in watchlist. Make sure "${watchlist_name}" is open in TradingView.`);
    }
  }

  // 2. Market bias (SPY)
  const market_bias = await getMarketBias();

  // 3. Scan each symbol
  const signals = [];
  const skipped = [];
  const errors = [];

  for (const symbol of symbols) {
    try {
      await switchTo(symbol, timeframe);
      if (delay_ms > 2000) await new Promise(r => setTimeout(r, delay_ms - 2000));

      const result = await getPineLabels({
        study_filter: SCANNER_INDICATOR,
        max_labels: 3,
      });

      const allLabels = result.studies?.flatMap(s => s.labels || []) || [];

      for (const lbl of allLabels) {
        const parsed = parseLabel(lbl.text || '', symbol);
        if (!parsed) continue;

        // Market bias filter
        if (filter_by_bias && market_bias !== 'neutral') {
          const expected = market_bias === 'long' ? 'LONG' : 'SHORT';
          if (parsed.direction !== expected) {
            skipped.push({ symbol, reason: `bias_mismatch (market=${market_bias}, signal=${parsed.direction})` });
            continue;
          }
        }

        signals.push(parsed);
      }
    } catch (err) {
      errors.push({ symbol, error: err.message });
    }
  }

  // 4. Rank: tier score → touch points → ema bars
  signals.sort((a, b) => {
    if (b.tier_score !== a.tier_score) return b.tier_score - a.tier_score;
    if (b.touch_points !== a.touch_points) return b.touch_points - a.touch_points;
    return b.ema_bars - a.ema_bars;
  });

  return {
    success: true,
    market_bias,
    scanned: symbols.length,
    signals_found: signals.length,
    signals: compact
      ? signals.map(formatSignalRow).join('\n')
      : signals,
    skipped_count: skipped.length,
    error_count: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  };
}
