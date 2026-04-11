import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchJson, fetchWithTimeout } from './helpers.js';
import { TIMEOUTS } from '../config/sites.js';

const CAT = '2-SyncIntegrity';

export async function checkSyncIntegrity(site: SiteConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;

  // 2.1 Products not empty
  let products: any[] = [];
  try {
    products = await fetchJson(site.syncWorkerUrl + '/products');
    results.push(
      Array.isArray(products) && products.length > 0
        ? result('2.1', CAT, s, 'Products list not empty', 'pass', `${products.length} products`)
        : result('2.1', CAT, s, 'Products list not empty', 'fail', 'Product list is empty or invalid')
    );
  } catch (e: any) {
    results.push(result('2.1', CAT, s, 'Products list not empty', 'fail', `Error: ${e.message}`));
  }

  // 2.2 Product count within tolerance
  if (products.length > 0) {
    const dropPercent = ((site.expectedProductCount - products.length) / site.expectedProductCount) * 100;
    if (dropPercent > 20) {
      results.push(result('2.2', CAT, s, 'Product count stable', 'fail', `${products.length}/${site.expectedProductCount} — ${dropPercent.toFixed(0)}% drop`));
    } else if (dropPercent > 10) {
      results.push(result('2.2', CAT, s, 'Product count stable', 'warn', `${products.length}/${site.expectedProductCount} — ${dropPercent.toFixed(0)}% drop`));
    } else {
      results.push(result('2.2', CAT, s, 'Product count stable', 'pass', `${products.length}/${site.expectedProductCount} expected`));
    }
  }

  // 2.3 Benchmark product pages return 200
  const slugs = [
    site.benchmarkProducts.attributeComplex.slug,
    site.benchmarkProducts.addonSimple.slug,
  ];
  for (const slug of slugs) {
    const url = `${site.url}${site.paths.products}/${slug}/`;
    try {
      const res = await fetchWithTimeout(url, TIMEOUTS.page);
      results.push(
        res.status === 200
          ? result('2.3', CAT, s, `Product page /${slug}/ returns 200`, 'pass', `HTTP ${res.status}`)
          : result('2.3', CAT, s, `Product page /${slug}/ returns 200`, 'fail', `HTTP ${res.status}`)
      );
    } catch (e: any) {
      results.push(result('2.3', CAT, s, `Product page /${slug}/ returns 200`, 'fail', `Error: ${e.message}`));
    }
  }

  // 2.4 Product images load
  const imgSlug = site.benchmarkProducts.attributeComplex.slug;
  try {
    const res = await fetchWithTimeout(`${site.syncWorkerUrl}/image/${imgSlug}`, TIMEOUTS.image);
    const ct = res.headers.get('content-type') || '';
    results.push(
      res.status === 200 && ct.includes('image')
        ? result('2.4', CAT, s, 'Product image loads', 'pass', `Content-Type: ${ct}`)
        : result('2.4', CAT, s, 'Product image loads', 'fail', `HTTP ${res.status}, Content-Type: ${ct}`)
    );
  } catch (e: any) {
    results.push(result('2.4', CAT, s, 'Product image loads', 'fail', `Error: ${e.message}`));
  }

  // 2.5 Product config API returns valid data
  try {
    const data = await fetchJson(`${site.syncWorkerUrl}/product-config/${imgSlug}`);
    results.push(
      data && data.product_id
        ? result('2.5', CAT, s, 'Product config API valid', 'pass', `product_id: ${data.product_id}`)
        : result('2.5', CAT, s, 'Product config API valid', 'fail', 'Missing product_id')
    );
  } catch (e: any) {
    results.push(result('2.5', CAT, s, 'Product config API valid', 'fail', `Error: ${e.message}`));
  }

  // 2.6 Category has products
  if (site.benchmarkCategories.length > 0) {
    const cat = site.benchmarkCategories[0];
    try {
      const data = await fetchJson(`${site.syncWorkerUrl}/products-by-category/${cat.slug}`);
      results.push(
        Array.isArray(data) && data.length > 0
          ? result('2.6', CAT, s, `Category ${cat.slug} has products`, 'pass', `${data.length} products`)
          : result('2.6', CAT, s, `Category ${cat.slug} has products`, 'fail', 'Empty category')
      );
    } catch (e: any) {
      results.push(result('2.6', CAT, s, `Category ${cat.slug} has products`, 'fail', `Error: ${e.message}`));
    }
  }

  // 2.7 No staging URLs in production KV data
  try {
    const data = await fetchJson(`${site.syncWorkerUrl}/product-config/${imgSlug}`);
    const jsonStr = JSON.stringify(data);
    const hasStagingUrls = jsonStr.includes('staging.') || jsonStr.includes('.pages.dev');
    results.push(
      !hasStagingUrls
        ? result('2.7', CAT, s, 'No staging URLs in KV data', 'pass', 'Clean')
        : result('2.7', CAT, s, 'No staging URLs in KV data', 'warn', 'Found staging URLs in product config data', jsonStr.match(/staging\.[^\s"]+/g)?.slice(0, 3).join(', '))
    );
  } catch (e: any) {
    results.push(result('2.7', CAT, s, 'No staging URLs in KV data', 'fail', `Error: ${e.message}`));
  }

  // 2.8 Search returns results
  try {
    const data = await fetchJson(`${site.syncWorkerUrl}/search?q=${site.searchTestQuery}`);
    const items = data?.data || data?.results || data;
    const count = Array.isArray(items) ? items.length : 0;
    results.push(
      count > 0
        ? result('2.8', CAT, s, `Search "${site.searchTestQuery}" returns results`, 'pass', `${count} results`)
        : result('2.8', CAT, s, `Search "${site.searchTestQuery}" returns results`, 'fail', 'No results')
    );
  } catch (e: any) {
    results.push(result('2.8', CAT, s, `Search "${site.searchTestQuery}" returns results`, 'fail', `Error: ${e.message}`));
  }

  return results;
}
