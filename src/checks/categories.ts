import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchHtml, fetchJson } from './helpers.js';

const CAT = '6-Categories';

/** Count <li class="product"> elements in HTML (works for both Astro and WooCommerce) */
function countProductCards(html: string): number {
  // Match <li class="product"> exactly — not compound classes like "related-product-item"
  const matches = html.match(/<li\s+class="product"/g);
  return matches ? matches.length : 0;
}

export async function checkCategories(site: SiteConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;

  for (const bc of site.benchmarkCategories) {
    const prefix = bc.slug;

    // 6.1 Category page returns 200
    const url = `${site.url}${site.paths.collections}/${bc.slug}/`;
    try {
      const res = await fetchHtml(url);
      results.push(result('6.1', CAT, s, `${prefix}: Page returns 200`, res.status === 200 ? 'pass' : 'fail',
        `HTTP ${res.status} in ${res.time}ms`));

      if (res.status === 200) {
        // 6.4 Title in page
        const hasTitle = res.html.includes(bc.name) || res.html.toLowerCase().includes(bc.name.toLowerCase());
        results.push(result('6.4', CAT, s, `${prefix}: Title in page`, hasTitle ? 'pass' : 'warn',
          hasTitle ? 'Found' : `"${bc.name}" not in HTML`));

        // 6.5 Product cards present
        const hasCards = res.html.includes('product-card') || res.html.includes('product_card') || res.html.includes('woocommerce') || res.html.includes('products');
        results.push(result('6.5', CAT, s, `${prefix}: Product cards`, hasCards ? 'pass' : 'warn',
          hasCards ? 'Found' : 'No product card elements detected'));

        // 6.7 Description present
        const hasDesc = res.html.includes('category-description') || res.html.includes('term-description') || res.html.includes('collection-description');
        results.push(result('6.7', CAT, s, `${prefix}: Description`, hasDesc ? 'pass' : 'warn',
          hasDesc ? 'Found' : 'No description element'));

        // 6.8 FAQ on collection page
        if (site.isHeadless) {
          const hasFaq = res.html.includes('faq') || res.html.includes('FAQ') || res.html.includes('FAQPage');
          results.push(result('6.8', CAT, s, `${prefix}: FAQ section`, hasFaq ? 'pass' : 'warn',
            hasFaq ? 'Found' : 'No FAQ'));
        }
      }
    } catch (e: any) {
      results.push(result('6.1', CAT, s, `${prefix}: Page returns 200`, 'fail', `Error: ${e.message}`));
    }

    // 6.2 Product count from API
    try {
      const data = await fetchJson(`${site.syncWorkerUrl}/products-by-category/${bc.slug}`);
      const count = Array.isArray(data) ? data.length : 0;
      const diff = Math.abs(count - bc.expectedProductCount);
      if (diff <= bc.tolerance) {
        results.push(result('6.2', CAT, s, `${prefix}: Product count`, 'pass', `${count} (expected ~${bc.expectedProductCount})`));
      } else {
        results.push(result('6.2', CAT, s, `${prefix}: Product count`, 'warn', `${count} (expected ~${bc.expectedProductCount}, diff: ${diff})`));
      }
    } catch (e: any) {
      results.push(result('6.2', CAT, s, `${prefix}: Product count`, 'fail', `Error: ${e.message}`));
    }

    // 6.3 Category name from API
    try {
      const data = await fetchJson(`${site.syncWorkerUrl}/category/${bc.slug}`);
      const name = data?.name || data?.category_name || '';
      const nameMatch = name === bc.name || name.toLowerCase() === bc.name.toLowerCase();
      results.push(result('6.3', CAT, s, `${prefix}: Name matches`, nameMatch ? 'pass' : 'warn',
        nameMatch ? bc.name : `Expected "${bc.name}", got "${name}"`));
    } catch (e: any) {
      results.push(result('6.3', CAT, s, `${prefix}: Name from API`, 'warn', `Error: ${e.message}`));
    }
  }

  // 6.9 Cross-check: live page product count vs KV for ALL categories
  await checkAllCollectionPages(site, results);

  return results;
}

/**
 * Fetches every category from the sync worker, then for each one:
 *  - Counts products rendered on the live collection page
 *  - Counts products returned by KV (/products-by-category)
 *  - Counts products in the KV index that belong to that category
 *  - Fails if the page count doesn't match KV
 */
async function checkAllCollectionPages(site: SiteConfig, results: CheckResult[]): Promise<void> {
  const s = site.id;

  // Fetch all categories and the product index from KV
  let categories: any[];
  let productIndex: any[];
  try {
    categories = await fetchJson(`${site.syncWorkerUrl}/categories`);
    productIndex = await fetchJson(`${site.syncWorkerUrl}/products`);
  } catch (e: any) {
    results.push(result('6.9', CAT, s, 'Collection page cross-check', 'fail', `Cannot fetch categories/products: ${e.message}`));
    return;
  }

  if (!Array.isArray(categories) || categories.length === 0) {
    results.push(result('6.9', CAT, s, 'Collection page cross-check', 'fail', 'No categories returned from KV'));
    return;
  }

  // Skip meta/uncategorized categories
  const skipSlugs = new Set(['uncategorized']);

  let totalChecked = 0;
  let errors: string[] = [];
  let drifts: string[] = [];

  for (const cat of categories) {
    if (skipSlugs.has(cat.slug)) continue;

    // Count products in KV index for this category
    const kvIndexCount = productIndex.filter((p: any) =>
      Array.isArray(p.categories) && p.categories.includes(cat.slug)
    ).length;

    // Skip categories with 0 products in KV index (no page would be built)
    if (kvIndexCount === 0) continue;

    // Count products from /products-by-category (includes full product data with images)
    let kvCategoryCount = 0;
    try {
      const catProducts = await fetchJson(`${site.syncWorkerUrl}/products-by-category/${cat.slug}`);
      // Filter same way as Astro: only products with images
      kvCategoryCount = Array.isArray(catProducts)
        ? catProducts.filter((p: any) => p.images?.length > 0).length
        : 0;
    } catch {
      kvCategoryCount = -1; // endpoint failed
    }

    // Fetch the live collection page and count product cards
    let pageCount = 0;
    let pageError = '';
    try {
      const pageUrl = `${site.url}${site.paths.collections}/${cat.slug}/`;
      const res = await fetchHtml(pageUrl);
      if (res.status === 200) {
        pageCount = countProductCards(res.html);
      } else {
        pageError = `HTTP ${res.status}`;
      }
    } catch (e: any) {
      pageError = e.message;
    }

    totalChecked++;

    // Compare: page should match KV category count (the source Astro uses at build time)
    const kvCount = kvCategoryCount >= 0 ? kvCategoryCount : kvIndexCount;
    if (pageError) {
      errors.push(`${cat.slug}: page error (${pageError}), KV=${kvCount}`);
    } else if (pageCount === 0 && kvCount > 0) {
      // Page shows 0 products but KV has products — likely a sync wipe (critical)
      errors.push(`${cat.slug}: page=0, KV=${kvCount}`);
    } else if (Math.abs(pageCount - kvCount) > 2) {
      // Large drift — likely stale build or sync issue
      errors.push(`${cat.slug}: page=${pageCount}, KV=${kvCount}`);
    } else if (pageCount !== kvCount) {
      // Small drift (1-2) — normal between builds, just warn
      drifts.push(`${cat.slug}: page=${pageCount}, KV=${kvCount}`);
    }
  }

  if (errors.length === 0 && drifts.length === 0) {
    results.push(result('6.9', CAT, s, 'Collection pages match KV',
      'pass', `All ${totalChecked} collection pages match KV product counts`));
  } else if (errors.length === 0) {
    results.push(result('6.9', CAT, s, 'Collection pages match KV',
      'warn', `${drifts.length}/${totalChecked} minor drifts (<=2)`,
      drifts.join(' | ')));
  } else {
    results.push(result('6.9', CAT, s, 'Collection pages match KV',
      'fail', `${errors.length}/${totalChecked} mismatches`,
      [...errors, ...drifts.map(d => `(drift) ${d}`)].join(' | ')));
  }
}
