import type { Report, CheckResult } from '../types.js';

const FRIENDLY_CATEGORIES: Record<string, string> = {
  '1-Availability': 'Website Status',
  '2-SyncIntegrity': 'Product Data',
  '3-AttributeProducts': 'Product Options',
  '4-AddonProducts': 'Product Add-ons',
  '5-PageContent': 'Page Content',
  '6-Categories': 'Product Categories',
  '7-SiteQuality': 'Site Quality',
};

function friendlyCategory(cat: string): string {
  return FRIENDLY_CATEGORIES[cat] || cat;
}

function friendlyStatus(status: string): string {
  if (status === 'pass') return 'OK';
  if (status === 'fail') return 'Issue';
  return 'Warning';
}

function friendlyStatusIcon(status: string): string {
  if (status === 'pass') return '✅';
  if (status === 'fail') return '❌';
  return '⚠️';
}

function generateVerdict(report: Report): string {
  const siteNames = report.sites.map(s => s.toUpperCase()).join(', ');
  if (report.failed === 0 && report.warnings <= 5) {
    return `All ${report.sites.length} websites (${siteNames}) are running smoothly.`;
  }
  if (report.failed === 0) {
    return `All ${report.sites.length} websites are online with ${report.warnings} minor warnings to review.`;
  }
  const failSites = [...new Set(report.results.filter(r => r.status === 'fail').map(r => r.site.toUpperCase()))];
  return `${report.failed} issue${report.failed > 1 ? 's' : ''} found on ${failSites.join(', ')} — please review below.`;
}

export function generateMarkdownReport(report: Report): string {
  const lines: string[] = [];
  const timestamp = new Date(report.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Brussels' });
  const passRate = ((report.passed / report.totalChecks) * 100).toFixed(1);

  lines.push(`# Hercules Daily Website Report`);
  lines.push(`**Date:** ${timestamp}`);
  lines.push(`**Sites:** ${report.sites.map(s => s.toUpperCase()).join(', ')}`);
  lines.push('');

  // Verdict
  lines.push(`> **${generateVerdict(report)}**`);
  lines.push('');

  // Summary
  lines.push(`## Overview`);
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| Total Items Checked | ${report.totalChecks} |`);
  lines.push(`| Pass Rate | **${passRate}%** |`);
  if (report.failed > 0) {
    lines.push(`| Issues | ${report.failed} |`);
  }
  if (report.warnings > 0) {
    lines.push(`| Warnings | ${report.warnings} |`);
  }
  lines.push('');

  if (report.failed > 0) {
    lines.push(`## Issues That Need Attention`);
    lines.push('');
    const failures = report.results.filter(r => r.status === 'fail');
    for (const f of failures) {
      lines.push(`- **${f.site.toUpperCase()} — ${friendlyCategory(f.category)}:** ${f.message}`);
    }
    lines.push('');
  }

  if (report.warnings > 0) {
    lines.push(`## Warnings`);
    lines.push('');
    const warnings = report.results.filter(r => r.status === 'warn');
    for (const w of warnings) {
      lines.push(`- **${w.site.toUpperCase()}** — ${friendlyCategory(w.category)}: ${w.message}`);
    }
    lines.push('');
  }

  // Full checklist per site
  const bySite = new Map<string, CheckResult[]>();
  for (const r of report.results) {
    if (!bySite.has(r.site)) bySite.set(r.site, []);
    bySite.get(r.site)!.push(r);
  }

  for (const [siteId, checks] of bySite) {
    lines.push(`---`);
    lines.push(`## ${siteId.toUpperCase()} — Detailed Results`);
    lines.push('');

    const byCat = new Map<string, CheckResult[]>();
    for (const c of checks) {
      if (!byCat.has(c.category)) byCat.set(c.category, []);
      byCat.get(c.category)!.push(c);
    }

    for (const [cat, catChecks] of byCat) {
      lines.push(`### ${friendlyCategory(cat)}`);
      lines.push('');
      for (const c of catChecks) {
        const icon = friendlyStatusIcon(c.status);
        lines.push(`- ${icon} ${c.name}: ${c.message}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('*This report is automatically generated daily for your convenience.*');

  return lines.join('\n');
}

export function generateHtmlReport(report: Report): string {
  const md = generateMarkdownReport(report);

  // Simple HTML conversion
  let html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^> (.+)$/gm, '<div style="background:#f0f7ff;border-left:4px solid #253461;padding:12px 16px;margin:12px 0;border-radius:4px;font-size:15px;">$1</div>')
    .replace(/^- ✅ (.+)$/gm, '<div style="color:#16a34a;margin:4px 0;padding:2px 0;">✅ $1</div>')
    .replace(/^- ❌ (.+)$/gm, '<div style="color:#dc2626;margin:4px 0;padding:2px 0;font-weight:bold;">❌ $1</div>')
    .replace(/^- ⚠️ (.+)$/gm, '<div style="color:#d97706;margin:4px 0;padding:2px 0;">⚠️ $1</div>')
    .replace(/^- (.+)$/gm, '<div style="margin:4px 0;padding:2px 0;">• $1</div>')
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => c.match(/^-+$/))) return '';
      return `<tr>${cells.map(c => `<td style="padding:6px 14px;border:1px solid #e0e0e0;">${c}</td>`).join('')}</tr>`;
    })
    .replace(/^---$/gm, '<hr>')
    .replace(/\n\n/g, '<br>');

  // Wrap table rows
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table style="border-collapse:collapse;margin:10px 0;width:auto;">$1</table>');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:900px;margin:20px auto;padding:0 20px;font-size:14px;line-height:1.6;color:#333;}
h1{color:#253461;border-bottom:2px solid #253461;padding-bottom:8px;} h2{color:#253461;margin-top:28px;} h3{color:#469ADC;margin-top:18px;}
hr{border:none;border-top:2px solid #eee;margin:24px 0;}
</style></head><body>${html}</body></html>`;
}

export function getSubjectLine(report: Report): string {
  const sites = report.sites.map(s => s.toUpperCase()).join(', ');
  if (report.failed > 0) {
    return `🔴 Hercules Daily Report: ${report.failed} Issue${report.failed > 1 ? 's' : ''} Found — ${sites}`;
  }
  if (report.warnings > 5) {
    return `⚠️ Hercules Daily Report: ${report.warnings} Warnings — ${sites}`;
  }
  return `✅ Hercules Daily Report: All ${report.sites.length} Sites Healthy — ${sites}`;
}
