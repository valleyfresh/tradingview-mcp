import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/market.js';

export function registerMarketTools(server) {
  server.tool(
    'market_sentiment_get',
    'Get the current CNN Fear & Greed Index score and rating. ' +
    'Returns score (0=Extreme Fear, 100=Extreme Greed), rating label, and week-over-week change. ' +
    'Use as a market context signal in the morning brief.',
    {},
    async () => {
      try {
        return jsonResult(await core.getSentiment());
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    }
  );

  server.tool(
    'earnings_get',
    'Get upcoming earnings announcements from NASDAQ for the next N trading days, ' +
    'filtered to symbols you provide (e.g., your watchlist). ' +
    'Returns date, report time (BMO/AMC), and EPS estimate.',
    {
      symbols: z.array(z.string()).optional().describe(
        'Symbols to filter results to (e.g., ["AAPL", "NVDA"]). ' +
        'Pass your watchlist symbols to see only relevant earnings. ' +
        'If omitted, returns all earnings (may be large).'
      ),
      days_ahead: z.coerce.number().optional().describe(
        'Number of trading days to look ahead (default: 2, max recommended: 5)'
      ),
    },
    async ({ symbols, days_ahead }) => {
      try {
        return jsonResult(await core.getEarnings({ symbols, days_ahead }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    }
  );

  server.tool(
    'news_get',
    'Fetch recent news headlines for up to 5 symbols via Yahoo Finance RSS. ' +
    'Use to check for adverse news on top setup candidates before entering. ' +
    'Returns up to 3 headlines per symbol.',
    {
      symbols: z.array(z.string()).min(1).describe(
        'Symbols to fetch news for (max 5, e.g., ["AAPL", "NVDA"])'
      ),
      max_per_symbol: z.coerce.number().optional().describe(
        'Max headlines per symbol (default: 3)'
      ),
    },
    async ({ symbols, max_per_symbol }) => {
      try {
        return jsonResult(await core.getNews({ symbols, max_per_symbol }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    }
  );
}
