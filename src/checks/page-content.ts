import type { CheckResult, SiteConfig } from '../types.js';
import { result, fetchHtml } from './helpers.js';

const CAT = '5-PageContent';

export async function checkPageContent(site: SiteConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;
  const benchmarks = [
    site.benchmarkProducts.attributeComplex,
    site.benchmarkProducts.addonSimple,
  ];

  for (const bp of benchmarks) {
    const url = `${site.url}${site.paths.products}/${bp.slug}/`;
    const prefix = bp.slug;
    let html: string;
    let status: number;

    try {
      const res = await fetchHtml(url);
      html = res.html;
      status = res.status;
    } catch (e: any) {
      results.push(result('5.0', CAT, s, `${prefix}: Page loads`, 'fail', `Error: ${e.message}`));
      continue;
    }

    if (status !== 200) {
      results.push(result('5.0', CAT, s, `${prefix}: Page loads`, 'fail', `HTTP ${status}`));
      continue;
    }

    // 5.1 Product name in page
    const nameInPage = html.includes(bp.name) || html.toLowerCase().includes(bp.name.toLowerCase());
    results.push(result('5.1', CAT, s, `${prefix}: Name in page`, nameInPage ? 'pass' : 'warn',
      nameInPage ? 'Found' : `"${bp.name}" not found in HTML`));

    // 5.2 Description present
    const hasDesc = html.includes('description') || html.includes('product-description') || html.includes('woocommerce-product-details');
    results.push(result('5.2', CAT, s, `${prefix}: Description area`, hasDesc ? 'pass' : 'warn',
      hasDesc ? 'Found' : 'No description element detected'));

    // 5.3-5.5 USP badges
    if (bp.madeInEurope) {
      const hasMadeEu = html.includes('made-in-europe') || html.includes('Made in Europe') || html.includes('Hergestellt in Europa') || html.includes('Fabriqué en Europe') || html.includes('made_in_europe');
      results.push(result('5.4', CAT, s, `${prefix}: Made in Europe badge`, hasMadeEu ? 'pass' : 'warn',
        hasMadeEu ? 'Present' : 'Not found'));
    }

    if (bp.greenOption) {
      const hasGreen = html.includes('green-option') || html.includes('Green Option') || html.includes('green_option') || html.includes('Grüne Option') || html.includes('Option verte');
      results.push(result('5.5', CAT, s, `${prefix}: Green Option badge`, hasGreen ? 'pass' : 'warn',
        hasGreen ? 'Present' : 'Not found'));
    }

    if (bp.madeInUk) {
      const hasMadeUk = html.includes('made-in-the-uk') || html.includes('Made in the UK') || html.includes('made_in_uk');
      results.push(result('5.3', CAT, s, `${prefix}: Made in UK badge`, hasMadeUk ? 'pass' : 'warn',
        hasMadeUk ? 'Present' : 'Not found'));
    }

    // 5.6 FAQ section (headless sites)
    if (site.isHeadless) {
      const hasFaq = html.includes('faq') || html.includes('FAQ') || html.includes('frequently') || html.includes('Häufig') || html.includes('foire');
      results.push(result('5.6', CAT, s, `${prefix}: FAQ section`, hasFaq ? 'pass' : 'warn',
        hasFaq ? 'Found' : 'No FAQ section detected'));
    }

    // 5.7 Currency in page
    const sym = site.currency.symbol;
    const entity = site.currency.htmlEntity;
    const hasCurrency = html.includes(sym) || html.includes(entity);
    results.push(result('5.7', CAT, s, `${prefix}: Currency (${sym}) present`, hasCurrency ? 'pass' : 'warn',
      hasCurrency ? 'Found' : `Neither "${sym}" nor "${entity}" found`));

    // 5.8 No error state in configurator
    if (site.isHeadless) {
      const hasError = html.includes('configurator-error') || html.includes('Error loading') || html.includes('Failed to load');
      results.push(result('5.8', CAT, s, `${prefix}: No configurator error`, !hasError ? 'pass' : 'fail',
        !hasError ? 'Clean' : 'Error state detected in configurator'));
    }

    // 5.9 CTA button present
    const ctaPatterns = ['Add to quotation', 'Add to cart', 'Zum Angebot', 'In den Warenkorb', 'Ajouter au devis', 'Ajouter au panier', 'quote', 'cart'];
    const hasCta = ctaPatterns.some(p => html.toLowerCase().includes(p.toLowerCase()));
    results.push(result('5.9', CAT, s, `${prefix}: CTA button present`, hasCta ? 'pass' : 'warn',
      hasCta ? 'Found' : 'No CTA button detected'));

    // 5.10 Product image present
    const imgMatch = html.match(/<img[^>]+src="([^"]+)"/);
    if (imgMatch) {
      results.push(result('5.10', CAT, s, `${prefix}: Product image present`, 'pass', 'Image tag found'));
    } else {
      results.push(result('5.10', CAT, s, `${prefix}: Product image present`, 'warn', 'No img tag found'));
    }
  }

  return results;
}
