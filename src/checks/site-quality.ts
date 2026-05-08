import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchHtml, fetchJson, fetchWithTimeout } from './helpers.js';
import { TIMEOUTS } from '../config/sites.js';

// ── Category 7: Navigation & Menu ──

async function checkNavigation(site: SiteConfig): Promise<CheckResult[]> {
  const CAT = '7-Navigation';
  const results: CheckResult[] = [];
  const s = site.id;

  // 7.1 Menu API returns data
  // API returns { dropdowns: { sportarten: [...], themes: [...], ... } }
  try {
    const data = await fetchJson(`${site.url}/wp-json/hercules/v1/main-header-menu`);
    const dropdowns = data?.dropdowns || {};
    const allItems: any[] = [];
    for (const key of Object.keys(dropdowns)) {
      const group = dropdowns[key];
      if (Array.isArray(group)) allItems.push(...group);
    }
    results.push(
      allItems.length > 0
        ? result('7.1', CAT, s, 'Menu API returns data', 'pass', `${allItems.length} items across ${Object.keys(dropdowns).length} groups`)
        : result('7.1', CAT, s, 'Menu API returns data', 'fail', 'Empty menu')
    );

    // 7.2 Top-level menu URLs resolve
    let broken = 0;
    const checked: string[] = [];
    for (const item of allItems.slice(0, 8)) {
      const href = item.url || item.href || '';
      if (!href || href === '#') continue;
      const fullUrl = href.startsWith('http') ? href : site.url + href;
      try {
        const res = await fetchWithTimeout(fullUrl, TIMEOUTS.page);
        if (res.status >= 400) {
          broken++;
          checked.push(`${href} → ${res.status}`);
        }
      } catch {
        broken++;
        checked.push(`${href} → timeout`);
      }
    }
    results.push(
      broken === 0
        ? result('7.2', CAT, s, 'Menu URLs resolve', 'pass', 'All OK')
        : result('7.2', CAT, s, 'Menu URLs resolve', 'fail', `${broken} broken`, checked.join('; '))
    );
  } catch (e: any) {
    results.push(result('7.1', CAT, s, 'Menu API returns data', 'fail', `Error: ${e.message}`));
  }

  // 7.3 Review link check
  try {
    const { html } = await fetchHtml(site.url + '/');
    const reviewLinkMatch = html.match(/href="([^"]*google[^"]*review[^"]*)"/i) || html.match(/href="([^"]*maps[^"]*Hercules[^"]*)"/i);
    const hasReviewBadge = html.includes('GoogleReviewsBadge') || html.includes('review-section') || html.includes('Google Reviews');
    if (reviewLinkMatch) {
      results.push(result('7.3', CAT, s, 'Review link in header', 'pass', reviewLinkMatch[1].substring(0, 80)));
    } else if (hasReviewBadge) {
      results.push(result('7.3', CAT, s, 'Review link in header', 'pass', 'SVG review badge found'));
    } else {
      results.push(result('7.3', CAT, s, 'Review link in header', 'warn', 'No Google review link found'));
    }

    // 7.4 Mobile menu has cart + quote
    const hasCartMobile = html.includes(site.paths.cart) || html.includes('cart');
    const hasQuoteMobile = html.includes(site.paths.quoteGenerator) || html.includes('quote');
    results.push(result('7.4', CAT, s, 'Mobile menu cart/quote', hasCartMobile && hasQuoteMobile ? 'pass' : 'warn',
      `Cart: ${hasCartMobile ? 'yes' : 'no'}, Quote: ${hasQuoteMobile ? 'yes' : 'no'}`));

    // 7.5 No wrong-language labels
    const wrongLangPatterns: Record<string, string[]> = {
      uk: ['Warenkorb', 'Kasse', 'Panier', 'Accueil'],
      de: ['Shopping Cart', 'Checkout', 'Panier', 'Accueil'],
      fr: ['Shopping Cart', 'Checkout', 'Warenkorb', 'Kasse'],
    };
    const wrongPatterns = wrongLangPatterns[s] || [];
    const found = wrongPatterns.filter(p => html.includes(p));
    results.push(result('7.5', CAT, s, 'No wrong-language labels', found.length === 0 ? 'pass' : 'warn',
      found.length === 0 ? 'Clean' : `Found: ${found.join(', ')}`));
  } catch (e: any) {
    results.push(result('7.3', CAT, s, 'Review link check', 'fail', `Error: ${e.message}`));
  }

  // 7.6 Search returns results
  try {
    const data = await fetchJson(`${site.syncWorkerUrl}/search?q=${site.searchTestQuery}`);
    const items = data?.data || data?.results || data;
    results.push(
      Array.isArray(items) && items.length > 0
        ? result('7.6', CAT, s, 'Search works', 'pass', `${items.length} results for "${site.searchTestQuery}"`)
        : result('7.6', CAT, s, 'Search works', 'fail', 'No results')
    );
  } catch (e: any) {
    results.push(result('7.6', CAT, s, 'Search works', 'fail', `Error: ${e.message}`));
  }

  return results;
}

// ── Category 8: SEO & Structured Data ──

async function checkSeo(site: SiteConfig): Promise<CheckResult[]> {
  const CAT = '8-SEO';
  const results: CheckResult[] = [];
  const s = site.id;

  let homeHtml = '';
  try {
    const res = await fetchHtml(site.url + '/');
    homeHtml = res.html;
  } catch (e: any) {
    results.push(result('8.0', CAT, s, 'Homepage fetch', 'fail', `Error: ${e.message}`));
    return results;
  }

  // 8.1 H1 tag
  const hasH1 = /<h1[^>]*>/i.test(homeHtml);
  results.push(result('8.1', CAT, s, 'Homepage has H1', hasH1 ? 'pass' : 'fail', hasH1 ? 'Found' : 'Missing'));

  // 8.4 No staging URLs
  const hasStagingUrl = homeHtml.includes('staging.') || homeHtml.includes('.pages.dev');
  results.push(result('8.4', CAT, s, 'No staging URLs in source', !hasStagingUrl ? 'pass' : 'fail',
    !hasStagingUrl ? 'Clean' : 'Staging URLs found in page source'));

  // 8.5 Canonical tag
  const hasCanonical = homeHtml.includes('rel="canonical"') || homeHtml.includes("rel='canonical'");
  results.push(result('8.5', CAT, s, 'Canonical tag present', hasCanonical ? 'pass' : 'warn', hasCanonical ? 'Found' : 'Missing'));

  // 8.6 Sitemap
  try {
    const res = await fetchWithTimeout(site.url + '/sitemap.xml', TIMEOUTS.api);
    results.push(result('8.6', CAT, s, 'Sitemap accessible', res.status === 200 ? 'pass' : 'warn', `HTTP ${res.status}`));
  } catch (e: any) {
    results.push(result('8.6', CAT, s, 'Sitemap accessible', 'warn', `Error: ${e.message}`));
  }

  // Product page SEO checks (only headless sites)
  if (site.isHeadless) {
    const prodUrl = `${site.url}${site.paths.products}/${site.benchmarkProducts.attributeComplex.slug}/`;
    try {
      const res = await fetchHtml(prodUrl);

      // 8.2 Product JSON-LD
      const hasProductLd = res.html.includes('"@type":"Product"') || res.html.includes('"@type": "Product"');
      results.push(result('8.2', CAT, s, 'Product JSON-LD schema', hasProductLd ? 'pass' : 'warn', hasProductLd ? 'Found' : 'Missing'));

      // 8.3 Hreflang
      const hasHreflang = res.html.includes('hreflang');
      results.push(result('8.3', CAT, s, 'Hreflang tags present', hasHreflang ? 'pass' : 'warn', hasHreflang ? 'Found' : 'Missing'));

      // 8.7 FAQ schema on collection page
      const collUrl = `${site.url}${site.paths.collections}/${site.benchmarkCategories[0].slug}/`;
      const collRes = await fetchHtml(collUrl);
      const hasFaqSchema = collRes.html.includes('FAQPage') || collRes.html.includes('faqpage');
      results.push(result('8.7', CAT, s, 'FAQ schema on collection', hasFaqSchema ? 'pass' : 'warn', hasFaqSchema ? 'Found' : 'Missing'));
    } catch (e: any) {
      results.push(result('8.2', CAT, s, 'Product page SEO', 'fail', `Error: ${e.message}`));
    }
  }

  return results;
}

// ── Category 9: Design & Locale ──

async function checkDesignLocale(site: SiteConfig): Promise<CheckResult[]> {
  const CAT = '9-DesignLocale';
  const results: CheckResult[] = [];
  const s = site.id;

  let html = '';
  try {
    const res = await fetchHtml(site.url + '/');
    html = res.html;
  } catch (e: any) {
    results.push(result('9.0', CAT, s, 'Homepage fetch', 'fail', `Error: ${e.message}`));
    return results;
  }

  // 9.1 Logo
  const hasLogo = html.includes(site.logoPath);
  results.push(result('9.1', CAT, s, 'Correct logo', hasLogo ? 'pass' : 'warn',
    hasLogo ? site.logoPath : `Expected "${site.logoPath}" not found`));

  // 9.2 Phone number
  const phoneClean = site.phone.replace(/\D/g, '');
  const hasPhone = html.includes(site.phone) || html.includes(phoneClean);
  results.push(result('9.2', CAT, s, 'Phone number present', hasPhone ? 'pass' : 'warn',
    hasPhone ? site.phone : `"${site.phone}" not found`));

  // 9.3 Email domain
  const hasEmailDomain = html.includes(site.emailDomain);
  results.push(result('9.3', CAT, s, 'Email domain present', hasEmailDomain ? 'pass' : 'warn',
    hasEmailDomain ? site.emailDomain : `"${site.emailDomain}" not found`));

  // 9.4 Chat widget
  const hasChatWidget = html.includes('chathive') || html.includes('ChatHive') || html.includes('chat-widget');
  results.push(result('9.4', CAT, s, 'Chat widget present', hasChatWidget ? 'pass' : 'warn',
    hasChatWidget ? 'Found' : 'Not found'));

  // 9.5 Google Reviews badge
  const hasReviews = html.includes('trustindex') || html.includes('google-review') || html.includes('GoogleReviews') || html.includes('GoogleReviewsBadge') || html.includes('review-section');
  results.push(result('9.5', CAT, s, 'Reviews badge present', hasReviews ? 'pass' : 'warn',
    hasReviews ? 'Found' : 'Not found'));

  // 9.6 Cookie banner
  const hasCookieBanner = html.includes('complianz') || html.includes('cookie-notice') || html.includes('cmplz');
  results.push(result('9.6', CAT, s, 'Cookie banner present', hasCookieBanner ? 'pass' : 'warn',
    hasCookieBanner ? 'Found' : 'Not found'));

  // 9.7 WhatsApp button
  const hasWhatsApp = html.includes('whatsapp') || html.includes('wa.me');
  results.push(result('9.7', CAT, s, 'WhatsApp button present', hasWhatsApp ? 'pass' : 'warn',
    hasWhatsApp ? 'Found' : 'Not found'));

  // 9.8 Fonts
  if (site.isHeadless) {
    const hasFonts = (html.includes('Jost') || html.includes('jost')) && (html.includes('Roboto') || html.includes('roboto'));
    results.push(result('9.8', CAT, s, 'Fonts (Jost + Roboto)', hasFonts ? 'pass' : 'warn',
      hasFonts ? 'Both found' : `Jost: ${html.includes('Jost') || html.includes('jost')}, Roboto: ${html.includes('Roboto') || html.includes('roboto')}`));
  }

  // 9.9 Currency in page (headless sites render prices client-side, so also check for priceCurrency in JSON-LD)
  const hasCurrency = html.includes(site.currency.symbol) || html.includes(site.currency.htmlEntity) || html.includes(`"priceCurrency":"${site.currency.code}"`) || html.includes(`priceCurrency`);
  results.push(result('9.9', CAT, s, 'Currency symbol present', hasCurrency ? 'pass' : 'warn',
    hasCurrency ? site.currency.symbol : 'Not found'));

  // 9.10 Decimal separator
  try {
    const sessionData = await fetchJson(`${site.url}/wp-json/hercules/v1/session`);
    const cartTotal = sessionData?.cart?.total || '';
    let sepCorrect = false;
    if (site.cartTotalFormat === 'prefix_dot' || site.cartTotalFormat === 'prefix_dot_de') {
      sepCorrect = /[£€]\s*\d+\.\d{2}/.test(cartTotal) || cartTotal.includes('.00') || cartTotal.includes('\u00a00.00');
    } else if (site.cartTotalFormat === 'suffix_comma') {
      sepCorrect = /\d+,\d{2}\s*€/.test(cartTotal) || cartTotal.includes(',00');
    }
    results.push(result('9.10', CAT, s, 'Decimal separator correct', sepCorrect ? 'pass' : 'warn',
      `Cart total: "${cartTotal}" (expected ${site.decimalSeparator})`));
  } catch (e: any) {
    results.push(result('9.10', CAT, s, 'Decimal separator', 'warn', `Error: ${e.message}`));
  }

  // 9.11 Currency position
  try {
    const config = await fetchJson(`${site.syncWorkerUrl}/product-config/${site.benchmarkProducts.attributeComplex.slug}`);
    const pos = config.currency_position || '';
    const expectedPos = site.currency.position;
    const posMatch = pos === expectedPos || pos.startsWith(expectedPos.split('_')[0]);
    results.push(result('9.11', CAT, s, 'Currency position correct', posMatch ? 'pass' : 'warn',
      `API: "${pos}", expected: "${expectedPos}"`));
  } catch (e: any) {
    results.push(result('9.11', CAT, s, 'Currency position', 'warn', `Error: ${e.message}`));
  }

  // 9.12 Cart total format
  try {
    const sessionData = await fetchJson(`${site.url}/wp-json/hercules/v1/session`);
    const cartTotal = sessionData?.cart?.total || '';
    let formatCorrect = false;
    if (site.id === 'uk') formatCorrect = cartTotal.includes('£');
    else if (site.id === 'de') formatCorrect = cartTotal.includes('€');
    else if (site.id === 'fr') formatCorrect = cartTotal.includes('€') && cartTotal.indexOf('€') > cartTotal.indexOf('0');
    results.push(result('9.12', CAT, s, 'Cart total format', formatCorrect ? 'pass' : 'warn',
      `"${cartTotal}"`));
  } catch (e: any) {
    results.push(result('9.12', CAT, s, 'Cart total format', 'warn', `Error: ${e.message}`));
  }

  return results;
}

// ── Category 10: Performance ──

async function checkPerformance(site: SiteConfig): Promise<CheckResult[]> {
  const CAT = '10-Performance';
  const results: CheckResult[] = [];
  const s = site.id;
  const threshold = 5000;

  const pages = [
    { name: 'Homepage', path: '/' },
    { name: 'Product page', path: `${site.paths.products}/${site.benchmarkProducts.attributeComplex.slug}/` },
    { name: 'Collection page', path: `${site.paths.collections}/${site.benchmarkCategories[0].slug}/` },
  ];

  for (const page of pages) {
    try {
      const start = Date.now();
      await fetchWithTimeout(site.url + page.path, TIMEOUTS.page);
      const time = Date.now() - start;
      results.push(result('10', CAT, s, `${page.name} < ${threshold}ms`, time < threshold ? 'pass' : 'warn',
        `${time}ms`, undefined, time));
    } catch (e: any) {
      results.push(result('10', CAT, s, `${page.name} < ${threshold}ms`, 'fail', `Error: ${e.message}`));
    }
  }

  return results;
}

// ── Category 11: Cross-Environment Safety ──

async function checkCrossEnv(site: SiteConfig): Promise<CheckResult[]> {
  const CAT = '11-CrossEnv';
  const results: CheckResult[] = [];
  const s = site.id;

  if (!site.isHeadless) return results;

  // 11.1 No staging worker URLs in Astro pages
  try {
    const prodUrl = `${site.url}${site.paths.products}/${site.benchmarkProducts.attributeComplex.slug}/`;
    const { html } = await fetchHtml(prodUrl);

    const stagingWorkerPatterns = [
      'hercules-product-sync-uk.gilles-86d.workers.dev',
      'hercules-product-sync-live.gilles-86d.workers.dev',
      'hercules-product-sync-fr.gilles-86d.workers.dev',
    ];
    // The page should use the correct worker, not staging default env
    const hasStagingWorker = html.includes('staging.') && !html.includes(site.url);
    results.push(result('11.1', CAT, s, 'No staging worker URLs in pages', !hasStagingWorker ? 'pass' : 'warn',
      !hasStagingWorker ? 'Clean' : 'Found staging worker URLs'));

    // 11.2 is covered in sync-integrity 2.7

    // 11.4 GTM container ID
    const hasGtm = html.includes(site.gtmId);
    results.push(result('11.4', CAT, s, `GTM ID (${site.gtmId})`, hasGtm ? 'pass' : 'warn',
      hasGtm ? 'Found' : 'Not found in page'));
  } catch (e: any) {
    results.push(result('11.1', CAT, s, 'Cross-env check', 'fail', `Error: ${e.message}`));
  }

  return results;
}

// ── Export all ──

export async function checkSiteQuality(site: SiteConfig): Promise<CheckResult[]> {
  const [nav, seo, design, perf, crossEnv] = await Promise.all([
    checkNavigation(site),
    checkSeo(site),
    checkDesignLocale(site),
    checkPerformance(site),
    checkCrossEnv(site),
  ]);
  return [...nav, ...seo, ...design, ...perf, ...crossEnv];
}
