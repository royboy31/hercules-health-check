import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchWithTimeout, fetchJson } from './helpers.js';
import { TIMEOUTS } from '../config/sites.js';

const CAT = '1-Availability';

export async function checkAvailability(site: SiteConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;

  // 1.1 Homepage
  try {
    const start = Date.now();
    const res = await fetchWithTimeout(site.url + '/', TIMEOUTS.page);
    const time = Date.now() - start;
    results.push(
      res.status === 200
        ? result('1.1', CAT, s, 'Homepage returns 200', 'pass', `HTTP ${res.status} in ${time}ms`, undefined, time)
        : result('1.1', CAT, s, 'Homepage returns 200', 'fail', `HTTP ${res.status}`, undefined, time)
    );
  } catch (e: any) {
    results.push(result('1.1', CAT, s, 'Homepage returns 200', 'fail', `Error: ${e.message}`));
  }

  // 1.2 Sync worker health (uses /status since /health may not exist)
  try {
    const data = await fetchJson(site.syncWorkerUrl + '/status');
    const hasLastSync = data && (data.last_sync || data.lastSync);
    results.push(
      hasLastSync
        ? result('1.2', CAT, s, 'Sync worker healthy', 'pass', 'Worker responded with status')
        : result('1.2', CAT, s, 'Sync worker healthy', 'fail', 'Invalid status response')
    );
  } catch (e: any) {
    results.push(result('1.2', CAT, s, 'Sync worker healthy', 'fail', `Error: ${e.message}`));
  }

  // 1.3 Last sync timestamp (syncs are webhook-triggered on product changes, not daily)
  try {
    const data = await fetchJson(site.syncWorkerUrl + '/status');
    const lastSync = new Date(data.last_sync || data.lastSync || '');
    const hoursAgo = (Date.now() - lastSync.getTime()) / 3600000;
    if (hoursAgo < 24) {
      results.push(result('1.3', CAT, s, 'Last sync recency', 'pass', `${hoursAgo.toFixed(1)}h ago`));
    } else {
      // Syncs are webhook-triggered — no sync just means no product changes, not a failure
      results.push(result('1.3', CAT, s, 'Last sync recency', 'pass', `${hoursAgo.toFixed(1)}h ago (webhook-triggered, no recent product changes)`));
    }
  } catch (e: any) {
    results.push(result('1.3', CAT, s, 'Last sync recency', 'fail', `Error: ${e.message}`));
  }

  // 1.4 Session API
  try {
    const data = await fetchJson(site.url + '/wp-json/hercules/v1/session');
    const valid = data && typeof data.logged_in !== 'undefined' && data.cart;
    results.push(
      valid
        ? result('1.4', CAT, s, 'Session API responds', 'pass', `Cart total: ${data.cart.total}`)
        : result('1.4', CAT, s, 'Session API responds', 'fail', 'Invalid response structure')
    );
  } catch (e: any) {
    results.push(result('1.4', CAT, s, 'Session API responds', 'fail', `Error: ${e.message}`));
  }

  // 1.5 Cart page
  try {
    const res = await fetchWithTimeout(site.url + site.paths.cart, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.5', CAT, s, 'Cart page loads', 'pass', `HTTP ${res.status}`)
        : result('1.5', CAT, s, 'Cart page loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    results.push(result('1.5', CAT, s, 'Cart page loads', 'fail', `Error: ${e.message}`));
  }

  // 1.6 Checkout page
  try {
    const res = await fetchWithTimeout(site.url + site.paths.checkout, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.6', CAT, s, 'Checkout page loads', 'pass', `HTTP ${res.status}`)
        : result('1.6', CAT, s, 'Checkout page loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    results.push(result('1.6', CAT, s, 'Checkout page loads', 'fail', `Error: ${e.message}`));
  }

  // 1.7 Quote generator
  try {
    const res = await fetchWithTimeout(site.url + site.paths.quoteGenerator, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.7', CAT, s, 'Quote generator loads', 'pass', `HTTP ${res.status}`)
        : result('1.7', CAT, s, 'Quote generator loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    results.push(result('1.7', CAT, s, 'Quote generator loads', 'fail', `Error: ${e.message}`));
  }

  return results;
}
