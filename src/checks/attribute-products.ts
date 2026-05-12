import type { CheckResult, SiteConfig, BenchmarkProduct } from '../types.js';
import { result, fetchProductConfig, parsePrice, pricesDescending } from './helpers.js';

const CAT = '3-AttributeProducts';

async function checkOne(site: SiteConfig, bp: BenchmarkProduct, label: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;
  const prefix = `${label} (${bp.slug})`;

  let config: any;
  try {
    config = await fetchProductConfig(site, bp.slug);
  } catch (e: any) {
    results.push(result('3.0', CAT, s, `${prefix}: Config API reachable`, 'fail', `Error: ${e.message}`));
    return results;
  }

  // 3.1 Product name
  const nameMatch = config.product_name === bp.name;
  results.push(result('3.1', CAT, s, `${prefix}: Name matches`, nameMatch ? 'pass' : 'fail',
    nameMatch ? bp.name : `Expected "${bp.name}", got "${config.product_name}"`));

  // 3.2 Product ID
  if (bp.productId > 0) {
    const idMatch = config.product_id === bp.productId;
    results.push(result('3.2', CAT, s, `${prefix}: Product ID matches`, idMatch ? 'pass' : 'fail',
      idMatch ? `ID: ${bp.productId}` : `Expected ${bp.productId}, got ${config.product_id}`));
  }

  // 3.3 Attribute count
  const attrs = config.attributes || {};
  const attrKeys = Object.keys(attrs).filter(k => k !== 'pa_options');
  const expectedCount = bp.expectedAttributeCount || 0;
  if (expectedCount > 0) {
    const countMatch = attrKeys.length === expectedCount;
    results.push(result('3.3', CAT, s, `${prefix}: Attribute count`, countMatch ? 'pass' : 'fail',
      countMatch ? `${attrKeys.length} attributes` : `Expected ${expectedCount}, got ${attrKeys.length}: [${attrKeys.join(', ')}]`));
  }

  // 3.4-3.9 Per-attribute checks
  for (const ea of bp.expectedAttributes || []) {
    const attr = attrs[ea.slug];
    if (!attr) {
      results.push(result('3.4', CAT, s, `${prefix}: Attribute ${ea.slug} exists`, 'fail', 'Not found'));
      continue;
    }

    // Term count
    const terms = attr.terms || [];
    const termCountMatch = terms.length === ea.termCount;
    results.push(result('3.4', CAT, s, `${prefix}: ${ea.slug} has ${ea.termCount} terms`, termCountMatch ? 'pass' : 'fail',
      termCountMatch ? `${terms.length} terms` : `Expected ${ea.termCount}, got ${terms.length}`));

    // Term slugs
    const actualSlugs = terms.map((t: any) => t.slug).sort();
    const expectedSlugs = [...ea.termSlugs].sort();
    const slugsMatch = JSON.stringify(actualSlugs) === JSON.stringify(expectedSlugs);
    results.push(result('3.5', CAT, s, `${prefix}: ${ea.slug} term slugs match`, slugsMatch ? 'pass' : 'fail',
      slugsMatch ? 'All terms match' : `Missing: ${expectedSlugs.filter(s => !actualSlugs.includes(s)).join(', ')}; Extra: ${actualSlugs.filter((s: string) => !expectedSlugs.includes(s)).join(', ')}`));

    // Display type
    const dtMatch = attr.display_type === ea.displayType;
    results.push(result('3.6', CAT, s, `${prefix}: ${ea.slug} display_type`, dtMatch ? 'pass' : 'fail',
      dtMatch ? ea.displayType : `Expected "${ea.displayType}", got "${attr.display_type}"`));

    // Display title not empty
    results.push(result('3.7', CAT, s, `${prefix}: ${ea.slug} display_title`, attr.display_title ? 'pass' : 'warn',
      attr.display_title || 'Empty'));

    // Thumbnails valid
    const badThumbs = terms.filter((t: any) => !t.thumbnail_url || t.thumbnail_url.includes('staging.'));
    results.push(result('3.8', CAT, s, `${prefix}: ${ea.slug} thumbnails valid`, badThumbs.length === 0 ? 'pass' : 'warn',
      badThumbs.length === 0 ? 'All valid' : `${badThumbs.length} invalid: ${badThumbs.map((t: any) => t.slug).join(', ')}`));
  }

  // 3.10 Variation count
  const variations = config.variations || [];
  if (bp.expectedVariationCount) {
    const vcMatch = variations.length === bp.expectedVariationCount;
    results.push(result('3.10', CAT, s, `${prefix}: Variation count`, vcMatch ? 'pass' : 'fail',
      vcMatch ? `${variations.length} variations` : `Expected ${bp.expectedVariationCount}, got ${variations.length}`));
  }

  // 3.11 Conditional prices exist
  const allHavePrices = variations.every((v: any) => v.conditional_prices && v.conditional_prices.length > 0);
  if (bp.hasPrices) {
    results.push(result('3.11', CAT, s, `${prefix}: All variations have prices`, allHavePrices ? 'pass' : 'fail',
      allHavePrices ? 'Yes' : `${variations.filter((v: any) => !v.conditional_prices?.length).length} missing`));
  }

  // 3.12 Prices are valid numbers > 0
  if (bp.hasPrices && allHavePrices) {
    let invalidCount = 0;
    for (const v of variations) {
      for (const cp of v.conditional_prices) {
        const p = parsePrice(cp.price);
        if (isNaN(p) || p <= 0) invalidCount++;
      }
    }
    results.push(result('3.12', CAT, s, `${prefix}: Prices valid (> 0)`, invalidCount === 0 ? 'pass' : 'fail',
      invalidCount === 0 ? 'All valid' : `${invalidCount} invalid prices`));
  }

  // 3.13 Prices descend as qty increases
  if (bp.hasPrices && allHavePrices) {
    let nonDescending = 0;
    for (const v of variations) {
      if (!pricesDescending(v.conditional_prices)) nonDescending++;
    }
    results.push(result('3.13', CAT, s, `${prefix}: Prices descend with qty`, nonDescending === 0 ? 'pass' : 'warn',
      nonDescending === 0 ? 'All descending' : `${nonDescending} variations with non-descending prices`));
  }

  // 3.14 Minimum quantity
  const mqMatch = config.minimum_quantity === bp.minimumQuantity;
  results.push(result('3.14', CAT, s, `${prefix}: Minimum quantity`, mqMatch ? 'pass' : 'fail',
    mqMatch ? bp.minimumQuantity : `Expected "${bp.minimumQuantity}", got "${config.minimum_quantity}"`));

  // 3.15 Lead time not empty
  const leadTimes = variations.map((v: any) => v.lead_time).filter(Boolean);
  results.push(result('3.15', CAT, s, `${prefix}: Lead time present`, leadTimes.length > 0 ? 'pass' : 'warn',
    leadTimes.length > 0 ? leadTimes[0] : 'No lead time'));

  // 3.16 Currency matches
  const ccMatch = config.currency_code === site.currency.code;
  results.push(result('3.16', CAT, s, `${prefix}: Currency code`, ccMatch ? 'pass' : 'fail',
    ccMatch ? site.currency.code : `Expected "${site.currency.code}", got "${config.currency_code}"`));

  return results;
}

export async function checkAttributeProducts(site: SiteConfig): Promise<CheckResult[]> {
  const r1 = await checkOne(site, site.benchmarkProducts.attributeSimple, 'Attr-Simple');
  const r2 = await checkOne(site, site.benchmarkProducts.attributeComplex, 'Attr-Complex');
  return [...r1, ...r2];
}
