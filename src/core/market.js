/**
 * External market data — CNN Fear & Greed, NASDAQ earnings calendar, Yahoo Finance news.
 * All requests use the standard fetch() API with no additional dependencies.
 */

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; TradingViewMCP/1.0)' };

// ─── CNN FEAR & GREED ────────────────────────────────────────────────────────

export async function getSentiment() {
  const res = await fetch(
    'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
    { headers: { ...HEADERS, Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`CNN Fear & Greed API returned ${res.status}`);
  const data = await res.json();

  const current = data.fear_and_greed;
  if (!current) throw new Error('Unexpected CNN F&G response format');

  // Most recent historical point for week-over-week comparison
  const history = data.fear_and_greed_historical?.data || [];
  const weekAgo = history.length >= 8 ? history[history.length - 8] : null;

  return {
    success: true,
    score: Math.round(current.score),
    rating: current.rating,
    previous_close: current.previous_close ? Math.round(current.previous_close) : null,
    week_ago: weekAgo
      ? { score: Math.round(weekAgo.y), rating: weekAgo.rating }
      : null,
    timestamp: current.timestamp,
  };
}

// ─── EARNINGS CALENDAR ───────────────────────────────────────────────────────

/**
 * Get upcoming earnings from NASDAQ for the given symbols.
 * Checks today + days_ahead trading days.
 */
export async function getEarnings({ symbols = [], days_ahead = 2 } = {}) {
  const results = [];
  const watchSymbols = symbols.map(s => s.replace(/^[A-Z]+:/, '').replace('!', '').toUpperCase());

  const today = new Date();
  for (let d = 0; d <= days_ahead; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    // Skip weekends
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue;

    const dateStr = date.toISOString().split('T')[0];

    try {
      const res = await fetch(
        `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`,
        { headers: { ...HEADERS, Accept: 'application/json', Referer: 'https://www.nasdaq.com/' } }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const rows = data?.data?.rows || [];

      for (const row of rows) {
        const sym = (row.symbol || '').replace(/^[A-Z]+:/, '').replace('!', '').toUpperCase();
        if (!sym) continue;
        // Only include symbols from the watchlist (if provided)
        if (watchSymbols.length > 0 && !watchSymbols.includes(sym)) continue;

        results.push({
          symbol: sym,
          name: row.name || null,
          date: dateStr,
          report_time: row.time || 'unknown',
          eps_estimate: row.epsForecast || null,
          last_year_eps: row.lastYearEPS || null,
        });
      }
    } catch {
      // Continue if a particular date fetch fails
    }
  }

  return {
    success: true,
    count: results.length,
    earnings: results,
  };
}

// ─── NEWS (Yahoo Finance RSS) ────────────────────────────────────────────────

/**
 * Fetch recent headlines for the given symbols via Yahoo Finance RSS.
 * Caps at 5 symbols and 3 headlines each to keep output lean.
 */
export async function getNews({ symbols = [], max_per_symbol = 3 } = {}) {
  const results = [];
  const tickers = symbols
    .slice(0, 5)
    .map(s => s.replace(/^[A-Z]+:/, '').replace('!', ''));

  for (const ticker of tickers) {
    try {
      const res = await fetch(
        `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
        { headers: HEADERS }
      );
      if (!res.ok) continue;

      const xml = await res.text();
      const headlines = [];

      // Simple regex RSS parser — avoids needing a DOM or XML library in Node.js
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m;
      while ((m = itemRe.exec(xml)) !== null && headlines.length < max_per_symbol) {
        const item = m[1];
        const title = extractCdata(item, 'title') || extractTag(item, 'title');
        const pubDate = extractTag(item, 'pubDate');
        if (title) headlines.push({ title, published: pubDate || null });
      }

      if (headlines.length > 0) results.push({ symbol: ticker, headlines });
    } catch {
      // Skip silently — news is best-effort
    }
  }

  return {
    success: true,
    count: results.length,
    news: results,
  };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function extractCdata(xml, tag) {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  return re.exec(xml)?.[1]?.trim() || null;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  return re.exec(xml)?.[1]?.trim() || null;
}
