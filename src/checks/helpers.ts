import type { CheckResult, CheckStatus, SiteConfig } from '../types.js';
import { TIMEOUTS } from '../config/sites.js';

/** Thrown when a 403 is caused by an IP/firewall block rather than a real issue */
export class IpBlockedError extends Error {
  constructor(url: string) {
    super(`IP blocked by firewall for ${url}`);
    this.name = 'IpBlockedError';
  }
}

/** Detect if a 403 response is from a security firewall blocking our IP */
function isFirewallBlock(status: number, body: string): boolean {
  if (status !== 403) return false;
  const lower = body.toLowerCase();
  return lower.includes('blocked because of malicious')
    || lower.includes('security plugin')
    || lower.includes('firewall')
    || lower.includes('malware scanner')
    || lower.includes('reference id:');
}

export function result(
  id: string,
  category: string,
  site: string,
  name: string,
  status: CheckStatus,
  message: string,
  details?: string,
  responseTime?: number
): CheckResult {
  return { id, category, site, name, status, message, details, responseTime };
}

export async function fetchWithTimeout(url: string, timeoutMs = TIMEOUTS.api): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'HerculesHealthCheck/1.0' },
      redirect: 'follow',
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url: string, timeoutMs = TIMEOUTS.api): Promise<any> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) {
    const body = await res.text();
    if (isFirewallBlock(res.status, body)) throw new IpBlockedError(url);
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

export async function fetchHtml(url: string, timeoutMs = TIMEOUTS.page): Promise<{ html: string; status: number; time: number }> {
  const start = Date.now();
  const res = await fetchWithTimeout(url, timeoutMs);
  const html = await res.text();
  if (isFirewallBlock(res.status, html)) throw new IpBlockedError(url);
  return { html, status: res.status, time: Date.now() - start };
}

export function parsePrice(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value.replace(',', '.'));
  return NaN;
}

export function normalizeStr(s: string): string {
  return s.replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/\s+/g, ' ').trim();
}

/** Fetch product config — tries sync worker first, falls back to WP REST API */
export async function fetchProductConfig(site: { syncWorkerUrl: string; url: string }, slug: string): Promise<any> {
  try {
    return await fetchJson(`${site.syncWorkerUrl}/product-config/${slug}`);
  } catch {
    return await fetchJson(`${site.url}/wp-json/hercules/v1/product-config-by-slug/${slug}`);
  }
}

export function pricesDescending(prices: { qty: number; price: any }[]): boolean {
  if (prices.length < 2) return true;
  const sorted = [...prices].sort((a, b) => a.qty - b.qty);
  for (let i = 1; i < sorted.length; i++) {
    const prev = parsePrice(sorted[i - 1].price);
    const curr = parsePrice(sorted[i].price);
    if (isNaN(prev) || isNaN(curr)) return false;
    if (curr > prev) return false;
  }
  return true;
}
