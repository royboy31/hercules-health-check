import type { CheckResult, CheckStatus, SiteConfig } from '../types.js';
import { TIMEOUTS } from '../config/sites.js';

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
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function fetchHtml(url: string, timeoutMs = TIMEOUTS.page): Promise<{ html: string; status: number; time: number }> {
  const start = Date.now();
  const res = await fetchWithTimeout(url, timeoutMs);
  const html = await res.text();
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
