import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchWithTimeout, fetchJson, fetchHtml, IpBlockedError } from './helpers.js';
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

  // 1.3 Last sync < 24h (use most recent of full sync, delta sync, or post sync)
  try {
    const data = await fetchJson(site.syncWorkerUrl + '/status');
    const candidates = [
      data.last_sync, data.lastSync,
      data.last_delta_sync, data.lastDeltaSync,
      data.last_post_sync, data.lastPostSync,
    ].filter(Boolean).map((d: string) => new Date(d).getTime()).filter((t: number) => !isNaN(t));
    const lastSyncTime = candidates.length > 0 ? Math.max(...candidates) : 0;
    if (lastSyncTime === 0) {
      results.push(result('1.3', CAT, s, 'Last sync < 24h ago', 'fail', 'No sync timestamp found'));
    } else {
      const hoursAgo = (Date.now() - lastSyncTime) / 3600000;
      if (hoursAgo < 24) {
        results.push(result('1.3', CAT, s, 'Last sync < 24h ago', 'pass', `${hoursAgo.toFixed(1)}h ago`));
      } else if (hoursAgo < 48) {
        results.push(result('1.3', CAT, s, 'Last sync < 24h ago', 'warn', `${hoursAgo.toFixed(1)}h ago — stale`));
      } else {
        results.push(result('1.3', CAT, s, 'Last sync < 24h ago', 'fail', `${hoursAgo.toFixed(1)}h ago — very stale`));
      }
    }
  } catch (e: any) {
    results.push(result('1.3', CAT, s, 'Last sync < 24h ago', 'fail', `Error: ${e.message}`));
  }

  // 1.4 Session API (WordPress — may be blocked by firewall)
  try {
    const data = await fetchJson(site.url + '/wp-json/hercules/v1/session');
    const valid = data && typeof data.logged_in !== 'undefined' && data.cart;
    results.push(
      valid
        ? result('1.4', CAT, s, 'Session API responds', 'pass', `Cart total: ${data.cart.total}`)
        : result('1.4', CAT, s, 'Session API responds', 'fail', 'Invalid response structure')
    );
  } catch (e: any) {
    if (e instanceof IpBlockedError) { /* skip — firewall block, not a real issue */ }
    else results.push(result('1.4', CAT, s, 'Session API responds', 'fail', `Error: ${e.message}`));
  }

  // 1.5 Cart page (WordPress — may be blocked by firewall)
  try {
    const res = await fetchHtml(site.url + site.paths.cart, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.5', CAT, s, 'Cart page loads', 'pass', `HTTP ${res.status}`)
        : result('1.5', CAT, s, 'Cart page loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    if (e instanceof IpBlockedError) { /* skip */ }
    else results.push(result('1.5', CAT, s, 'Cart page loads', 'fail', `Error: ${e.message}`));
  }

  // 1.6 Checkout page (WordPress — may be blocked by firewall)
  try {
    const res = await fetchHtml(site.url + site.paths.checkout, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.6', CAT, s, 'Checkout page loads', 'pass', `HTTP ${res.status}`)
        : result('1.6', CAT, s, 'Checkout page loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    if (e instanceof IpBlockedError) { /* skip */ }
    else results.push(result('1.6', CAT, s, 'Checkout page loads', 'fail', `Error: ${e.message}`));
  }

  // 1.7 Quote generator (WordPress — may be blocked by firewall)
  try {
    const res = await fetchHtml(site.url + site.paths.quoteGenerator, TIMEOUTS.page);
    results.push(
      res.status === 200
        ? result('1.7', CAT, s, 'Quote generator loads', 'pass', `HTTP ${res.status}`)
        : result('1.7', CAT, s, 'Quote generator loads', 'fail', `HTTP ${res.status}`)
    );
  } catch (e: any) {
    if (e instanceof IpBlockedError) { /* skip */ }
    else results.push(result('1.7', CAT, s, 'Quote generator loads', 'fail', `Error: ${e.message}`));
  }

  return results;
}
