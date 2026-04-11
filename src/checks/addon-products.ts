import type { CheckResult, SiteConfig, BenchmarkProduct } from '../types.js';
import { result, fetchJson, parsePrice, pricesDescending, normalizeStr } from './helpers.js';

const CAT = '4-AddonProducts';

async function checkOne(site: SiteConfig, bp: BenchmarkProduct, label: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const s = site.id;
  const prefix = `${label} (${bp.slug})`;

  let config: any;
  try {
    config = await fetchJson(`${site.syncWorkerUrl}/product-config/${bp.slug}`);
  } catch (e: any) {
    results.push(result('4.0', CAT, s, `${prefix}: Config API reachable`, 'fail', `Error: ${e.message}`));
    return results;
  }

  // 4.1 Name
  const nameMatch = config.product_name === bp.name;
  results.push(result('4.1', CAT, s, `${prefix}: Name matches`, nameMatch ? 'pass' : 'fail',
    nameMatch ? bp.name : `Expected "${bp.name}", got "${config.product_name}"`));

  // 4.2 Product ID
  if (bp.productId > 0) {
    const idMatch = config.product_id === bp.productId;
    results.push(result('4.2', CAT, s, `${prefix}: Product ID`, idMatch ? 'pass' : 'fail',
      idMatch ? `ID: ${bp.productId}` : `Expected ${bp.productId}, got ${config.product_id}`));
  }

  const addons = config.addons || [];

  // 4.3 Top-level addon count
  const topLevel = addons.filter((a: any) => a.parent_id === 0);
  if (bp.expectedTopLevelAddonCount) {
    const match = topLevel.length === bp.expectedTopLevelAddonCount;
    results.push(result('4.3', CAT, s, `${prefix}: Top-level addon count`, match ? 'pass' : 'fail',
      match ? `${topLevel.length} addons` : `Expected ${bp.expectedTopLevelAddonCount}, got ${topLevel.length}: [${topLevel.map((a: any) => a.name).join(', ')}]`));
  }

  // 4.4 Total addon count
  if (bp.expectedAddonCount) {
    const match = addons.length === bp.expectedAddonCount;
    results.push(result('4.4', CAT, s, `${prefix}: Total addon count`, match ? 'pass' : 'fail',
      match ? `${addons.length} total` : `Expected ${bp.expectedAddonCount}, got ${addons.length}`));
  }

  // 4.5-4.11 Per-addon checks
  for (const ea of bp.expectedAddons || []) {
    const addon = addons.find((a: any) => a.id === ea.id);
    if (!addon) {
      results.push(result('4.5', CAT, s, `${prefix}: Addon ${ea.id} (${ea.name}) exists`, 'fail', 'Not found'));
      continue;
    }

    // Name (normalize quotes for cross-locale comparison)
    const nameOk = normalizeStr(addon.name) === normalizeStr(ea.name);
    results.push(result('4.5', CAT, s, `${prefix}: Addon ${ea.id} name`, nameOk ? 'pass' : 'fail',
      nameOk ? ea.name : `Expected "${ea.name}", got "${addon.name}"`));

    // Display type
    const dtOk = addon.display_type === ea.displayType;
    results.push(result('4.6', CAT, s, `${prefix}: Addon ${ea.id} display_type`, dtOk ? 'pass' : 'fail',
      dtOk ? ea.displayType : `Expected "${ea.displayType}", got "${addon.display_type}"`));

    // Option count
    const opts = addon.options || [];
    const ocOk = opts.length === ea.optionCount;
    results.push(result('4.7', CAT, s, `${prefix}: Addon ${ea.id} option count`, ocOk ? 'pass' : 'fail',
      ocOk ? `${opts.length} options` : `Expected ${ea.optionCount}, got ${opts.length}`));

    // Option names (only check if expected names provided)
    if (ea.optionNames.length > 0) {
      const actualNames = opts.map((o: any) => o.name);
      const missing = ea.optionNames.filter((n: string) => !actualNames.includes(n));
      results.push(result('4.8', CAT, s, `${prefix}: Addon ${ea.id} option names`, missing.length === 0 ? 'pass' : 'fail',
        missing.length === 0 ? 'All match' : `Missing: ${missing.join(', ')}`));
    }

    // Price tables on surcharge options
    const pricedOpts = opts.filter((o: any) => o.price_table && o.price_table.length > 0);
    for (const opt of pricedOpts) {
      // 4.9 Valid price_table
      const allValid = opt.price_table.every((pt: any) => {
        const p = parsePrice(pt.price);
        return !isNaN(p) && p >= 0 && pt.qty > 0;
      });
      results.push(result('4.9', CAT, s, `${prefix}: Addon ${ea.id} "${opt.name}" price_table valid`, allValid ? 'pass' : 'fail',
        allValid ? `${opt.price_table.length} entries` : 'Invalid price entries'));

      // 4.10 Prices descend
      if (opt.price_table.length > 1) {
        const desc = pricesDescending(opt.price_table);
        results.push(result('4.10', CAT, s, `${prefix}: Addon ${ea.id} "${opt.name}" prices descend`, desc ? 'pass' : 'warn',
          desc ? 'Descending' : 'Non-descending price curve'));
      }
    }

    // 4.11 Child addons reference correct parent
    if (ea.parentId === 0) {
      const children = addons.filter((a: any) => a.parent_id === ea.id);
      for (const child of children) {
        const visOk = child.visible_if_option && child.visible_if_option.length > 0;
        results.push(result('4.11', CAT, s, `${prefix}: Child addon ${child.id} has visible_if_option`, visOk ? 'pass' : 'warn',
          visOk ? `visible_if: "${child.visible_if_option}"` : 'Missing visible_if_option'));
      }
    }
  }

  // 4.12 Base conditional_prices
  const variations = config.variations || [];
  if (variations.length > 0) {
    const hasCp = variations[0].conditional_prices && variations[0].conditional_prices.length > 0;
    results.push(result('4.12', CAT, s, `${prefix}: Base conditional_prices exist`, hasCp ? 'pass' : (bp.hasPrices ? 'fail' : 'pass'),
      hasCp ? `${variations[0].conditional_prices.length} entries` : 'No base prices'));
  }

  // 4.13 Minimum quantity
  const mqMatch = config.minimum_quantity === bp.minimumQuantity;
  results.push(result('4.13', CAT, s, `${prefix}: Min quantity`, mqMatch ? 'pass' : 'fail',
    mqMatch ? bp.minimumQuantity : `Expected "${bp.minimumQuantity}", got "${config.minimum_quantity}"`));

  // 4.14 Lead time
  if (variations.length > 0) {
    const lt = variations[0].lead_time;
    results.push(result('4.14', CAT, s, `${prefix}: Lead time`, lt ? 'pass' : 'warn',
      lt || 'Empty'));
  }

  return results;
}

export async function checkAddonProducts(site: SiteConfig): Promise<CheckResult[]> {
  const r1 = await checkOne(site, site.benchmarkProducts.addonSimple, 'Addon-Simple');
  const r2 = await checkOne(site, site.benchmarkProducts.addonComplex, 'Addon-Complex');
  return [...r1, ...r2];
}
