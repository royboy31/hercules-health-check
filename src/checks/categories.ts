import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchHtml, fetchJson } from './helpers.js';

const CAT = '6-Categories';

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

  return results;
}
