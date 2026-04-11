import { SITES } from './config/sites.js';
import { checkAvailability } from './checks/availability.js';
import { checkSyncIntegrity } from './checks/sync-integrity.js';
import { checkAttributeProducts } from './checks/attribute-products.js';
import { checkAddonProducts } from './checks/addon-products.js';
import { checkPageContent } from './checks/page-content.js';
import { checkCategories } from './checks/categories.js';
import { checkSiteQuality } from './checks/site-quality.js';
import { generateMarkdownReport } from './report/generator.js';
import { generateExcelReport } from './report/excel.js';
import { sendEmailReport } from './report/emailer.js';
import type { CheckResult, Report, SiteConfig } from './types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function runChecksForSite(site: SiteConfig): Promise<CheckResult[]> {
  console.log(`\n🔍 Checking ${site.name} (${site.url})...`);
  const allResults: CheckResult[] = [];

  const categories = [
    { name: 'Availability', fn: checkAvailability },
    { name: 'Sync Integrity', fn: checkSyncIntegrity },
    { name: 'Attribute Products', fn: checkAttributeProducts },
    { name: 'Addon Products', fn: checkAddonProducts },
    { name: 'Page Content', fn: checkPageContent },
    { name: 'Categories', fn: checkCategories },
    { name: 'Site Quality', fn: checkSiteQuality },
  ];

  for (const cat of categories) {
    try {
      console.log(`  ├─ ${cat.name}...`);
      const results = await cat.fn(site);
      allResults.push(...results);
      const passed = results.filter(r => r.status === 'pass').length;
      const failed = results.filter(r => r.status === 'fail').length;
      const warns = results.filter(r => r.status === 'warn').length;
      console.log(`  │  └─ ${results.length} checks: ${passed} ✅ ${failed > 0 ? failed + ' ❌' : ''} ${warns > 0 ? warns + ' ⚠️' : ''}`);
    } catch (e: any) {
      console.error(`  │  └─ ${cat.name} CRASHED: ${e.message}`);
      allResults.push({
        id: 'crash',
        category: cat.name,
        site: site.id,
        name: `${cat.name} execution`,
        status: 'fail',
        message: `Check category crashed: ${e.message}`,
      });
    }
  }

  return allResults;
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode='));
  const siteArg = args.find(a => a.startsWith('--site='));
  const noEmail = args.includes('--no-email');

  const mode: 'daily' | 'deploy' = modeArg?.split('=')[1] === 'deploy' ? 'deploy' : 'daily';

  let siteIds: string[];
  if (siteArg) {
    const id = siteArg.split('=')[1];
    if (!SITES[id]) {
      console.error(`Unknown site: ${id}. Available: ${Object.keys(SITES).join(', ')}`);
      process.exit(1);
    }
    siteIds = [id];
  } else if (mode === 'daily') {
    siteIds = Object.keys(SITES);
  } else {
    siteIds = ['uk'];
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  HERCULES HEALTH CHECK`);
  console.log(`  Mode: ${mode.toUpperCase()}`);
  console.log(`  Sites: ${siteIds.map(s => s.toUpperCase()).join(', ')}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(60)}`);

  const allResults: CheckResult[] = [];

  for (const siteId of siteIds) {
    const siteResults = await runChecksForSite(SITES[siteId]);
    allResults.push(...siteResults);
  }

  const report: Report = {
    timestamp: new Date().toISOString(),
    mode,
    sites: siteIds,
    totalChecks: allResults.length,
    passed: allResults.filter(r => r.status === 'pass').length,
    failed: allResults.filter(r => r.status === 'fail').length,
    warnings: allResults.filter(r => r.status === 'warn').length,
    results: allResults,
  };

  // Generate and save markdown report
  const markdown = generateMarkdownReport(report);
  const reportsDir = join(process.cwd(), 'reports');
  try { mkdirSync(reportsDir, { recursive: true }); } catch {}
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `health-check-${mode}-${dateStr}.md`;
  writeFileSync(join(reportsDir, filename), markdown, 'utf-8');

  // Print summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  RESULTS SUMMARY`);
  console.log(`  Total: ${report.totalChecks} | ✅ ${report.passed} | ❌ ${report.failed} | ⚠️ ${report.warnings}`);
  console.log(`${'═'.repeat(60)}`);

  if (report.failed > 0) {
    console.log(`\n❌ FAILURES:`);
    for (const f of allResults.filter(r => r.status === 'fail')) {
      console.log(`  [${f.site.toUpperCase()}] ${f.category} > ${f.name}`);
      console.log(`    ${f.message}${f.details ? ` — ${f.details}` : ''}`);
    }
  }

  console.log(`\n📄 Markdown report: ${join(reportsDir, filename)}`);

  // Generate Excel report
  console.log('📊 Generating Excel report...');
  let excelPath: string | undefined;
  try {
    excelPath = await generateExcelReport(report);
    console.log(`📊 Excel report: ${excelPath}`);
  } catch (e: any) {
    console.error(`❌ Excel generation failed: ${e.message}`);
  }

  // Send email with Excel attachment
  if (!noEmail) {
    await sendEmailReport(report, excelPath);
  } else {
    console.log('📧 Email skipped (--no-email)');
  }

  // Exit with error code if failures
  if (report.failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(2);
});
