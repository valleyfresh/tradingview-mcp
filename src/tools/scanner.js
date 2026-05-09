import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/scanner.js';

export function registerScannerTools(server) {
  server.tool(
    'scanner_run_watchlist',
    'Scan your TradingView watchlist for valid swing setups using the Swing Setup Scanner indicator. ' +
    'Checks SPY for market bias, iterates each symbol on the 1h chart, reads Pine Script labels, ' +
    'and returns setups ranked by grade (Ideal > Strong > Moderate) then touch points. ' +
    'PREREQUISITE: Load "Swing Setup Scanner" indicator on the chart before running.',
    {
      watchlist_name: z.string().optional().describe(
        'Name of the TradingView watchlist to scan (default: "SMA list")'
      ),
      section: z.string().optional().describe(
        'Only scan symbols in this named section (e.g. "STOCKS"). ' +
        'Uses the API to extract section symbols — ignores other sections like "MARKETS". ' +
        'If omitted, reads all visible watchlist symbols from the DOM.'
      ),
      timeframe: z.string().optional().describe(
        'Chart timeframe to scan on (default: "60" = 1 hour)'
      ),
      filter_by_bias: z.boolean().optional().describe(
        'If true (default), only return signals matching SPY market direction. ' +
        'Set false to see all setups regardless of market bias.'
      ),
      delay_ms: z.coerce.number().optional().describe(
        'Milliseconds to wait per symbol after chart loads (default: 2000). ' +
        'Increase if signals are missing due to slow rendering.'
      ),
    },
    async ({ watchlist_name, section, timeframe, filter_by_bias, delay_ms }) => {
      try {
        return jsonResult(await core.runWatchlistScan({
          watchlist_name,
          section,
          timeframe,
          filter_by_bias,
          delay_ms,
        }));
      } catch (err) {
        return jsonResult({ success: false, error: err.message }, true);
      }
    }
  );
}
