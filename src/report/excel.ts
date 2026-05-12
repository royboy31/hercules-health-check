import ExcelJS from 'exceljs';
import type { Report, CheckResult } from '../types.js';
import { join } from 'path';

const COLORS = {
  pass: { bg: 'FFE8F5E9', fg: 'FF2E7D32' },
  fail: { bg: 'FFFFEBEE', fg: 'FFC62828' },
  warn: { bg: 'FFFFF8E1', fg: 'FFF57F17' },
  headerBg: 'FF253461',
  headerFg: 'FFFFFFFF',
  siteBg: 'FF469ADC',
  catBg: 'FFE3F2FD',
  borderColor: 'FFD0D0D0',
};

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

function statusLabel(status: string): string {
  if (status === 'pass') return '✅ OK';
  if (status === 'fail') return '❌ Issue';
  return '⚠️ Warning';
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

export async function generateExcelReport(report: Report): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hercules Health Check';
  wb.created = new Date();

  // ── Summary Sheet ──
  const summarySheet = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: '253461' } },
  });

  summarySheet.columns = [
    { header: '', width: 28 },
    { header: '', width: 45 },
  ];

  const passRate = ((report.passed / report.totalChecks) * 100).toFixed(1);

  const summaryData: [string, string | number][] = [
    ['Hercules Daily Website Report', ''],
    ['', ''],
    ['Date', new Date(report.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Brussels' })],
    ['Sites Checked', report.sites.map(s => s.toUpperCase()).join(', ')],
    ['', ''],
    ['Status', generateVerdict(report)],
    ['', ''],
    ['Total Items Checked', report.totalChecks],
    ['Passed', report.passed],
    ['Issues', report.failed],
    ['Warnings', report.warnings],
    ['Pass Rate', `${passRate}%`],
  ];

  for (const [i, row] of summaryData.entries()) {
    const r = summarySheet.addRow(row);
    if (i === 0) {
      r.font = { bold: true, size: 16, color: { argb: COLORS.headerBg } };
      summarySheet.mergeCells(`A${i + 1}:B${i + 1}`);
    }
    // Verdict row
    if (i === 5) {
      r.getCell(1).font = { bold: true, size: 12 };
      r.getCell(2).font = { bold: true, size: 12, color: { argb: report.failed > 0 ? COLORS.fail.fg : COLORS.pass.fg } };
    }
    if (i >= 7) {
      r.getCell(1).font = { bold: true };
      if (row[0] === 'Issues' && (row[1] as number) > 0) {
        r.getCell(2).font = { bold: true, color: { argb: COLORS.fail.fg } };
      }
      if (row[0] === 'Passed') {
        r.getCell(2).font = { bold: true, color: { argb: COLORS.pass.fg } };
      }
    }
  }

  // Failures summary on summary sheet
  const failures = report.results.filter(r => r.status === 'fail');
  if (failures.length > 0) {
    summarySheet.addRow([]);
    const failHeader = summarySheet.addRow(['Issues That Need Fixing', '']);
    failHeader.font = { bold: true, size: 12, color: { argb: COLORS.fail.fg } };
    summarySheet.mergeCells(`A${failHeader.number}:B${failHeader.number}`);

    for (const f of failures) {
      const r = summarySheet.addRow([`${f.site.toUpperCase()} — ${friendlyCategory(f.category)}`, f.message]);
      r.getCell(1).font = { bold: true };
      r.getCell(2).font = { color: { argb: COLORS.fail.fg } };
    }
  }

  // ── Per-Site Detailed Sheets ──
  const bySite = new Map<string, CheckResult[]>();
  for (const r of report.results) {
    if (!bySite.has(r.site)) bySite.set(r.site, []);
    bySite.get(r.site)!.push(r);
  }

  for (const [siteId, checks] of bySite) {
    const tabColor = siteId === 'uk' ? '253461' : siteId === 'de' ? 'DD0000' : '002395';
    const sheet = wb.addWorksheet(`${siteId.toUpperCase()} Checks`, {
      properties: { tabColor: { argb: tabColor } },
    });

    // Columns
    sheet.columns = [
      { header: '#', width: 5, key: 'num' },
      { header: 'Status', width: 14, key: 'status' },
      { header: 'Area', width: 22, key: 'category' },
      { header: 'What We Checked', width: 55, key: 'name' },
      { header: 'Result', width: 50, key: 'message' },
      { header: 'Details', width: 45, key: 'details' },
      { header: 'Speed (ms)', width: 11, key: 'time' },
      { header: 'Reviewed', width: 10, key: 'verified' },
      { header: 'Notes', width: 40, key: 'comments' },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      cell.font = { bold: true, color: { argb: COLORS.headerFg }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: COLORS.headerBg } },
      };
    });
    headerRow.height = 28;

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

    // Add data rows
    let currentCategory = '';
    let rowNum = 0;
    for (const check of checks) {
      rowNum++;

      // Category separator row
      if (check.category !== currentCategory) {
        currentCategory = check.category;
        const catRow = sheet.addRow({
          num: '',
          status: '',
          category: friendlyCategory(currentCategory),
          name: '',
          message: '',
          details: '',
          time: '',
          verified: '',
          comments: '',
        });
        sheet.mergeCells(`C${catRow.number}:I${catRow.number}`);
        catRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.catBg } };
        catRow.getCell(3).font = { bold: true, size: 11, color: { argb: COLORS.headerBg } };
        catRow.getCell(3).alignment = { vertical: 'middle' };
        catRow.height = 24;
      }

      const statusColor = COLORS[check.status];
      const row = sheet.addRow({
        num: rowNum,
        status: statusLabel(check.status),
        category: friendlyCategory(check.category),
        check: check.id,
        name: check.name,
        message: check.message,
        details: check.details || '',
        time: check.responseTime || '',
        verified: '',
        comments: '',
      });

      // Style the status cell
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor.bg } };
      row.getCell(2).font = { bold: true, color: { argb: statusColor.fg }, size: 10 };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

      // Style the check name
      row.getCell(4).font = { size: 10 };
      row.getCell(4).alignment = { wrapText: true, vertical: 'middle' };

      // Style the result
      row.getCell(5).font = { size: 10, color: { argb: statusColor.fg } };
      row.getCell(5).alignment = { wrapText: true, vertical: 'middle' };

      // Style details
      row.getCell(6).font = { size: 9, color: { argb: 'FF757575' } };
      row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };

      // Reviewed checkbox column — data validation dropdown
      row.getCell(8).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"☐,☑"'],
        showInputMessage: false,
        showErrorMessage: false,
      };
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).font = { size: 14 };
      row.getCell(8).value = '☐';

      // Notes column — light yellow bg to indicate editable
      row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
      row.getCell(9).alignment = { wrapText: true, vertical: 'middle' };

      // Borders
      for (let col = 1; col <= 9; col++) {
        row.getCell(col).border = {
          bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
          right: { style: 'thin', color: { argb: COLORS.borderColor } },
        };
      }

      // Highlight fail rows
      if (check.status === 'fail') {
        for (let col = 1; col <= 9; col++) {
          if (col !== 2 && col !== 8 && col !== 9) {
            row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fail.bg } };
          }
        }
      }
    }

    // Auto-filter
    sheet.autoFilter = { from: 'A1', to: 'I1' };
  }

  // ── All Checks Sheet (flat view) ──
  const allSheet = wb.addWorksheet('All Checks', {
    properties: { tabColor: { argb: '10C99E' } },
  });

  allSheet.columns = [
    { header: '#', width: 5, key: 'num' },
    { header: 'Site', width: 6, key: 'site' },
    { header: 'Status', width: 14, key: 'status' },
    { header: 'Area', width: 22, key: 'category' },
    { header: 'What We Checked', width: 55, key: 'name' },
    { header: 'Result', width: 50, key: 'message' },
    { header: 'Details', width: 40, key: 'details' },
    { header: 'Speed (ms)', width: 11, key: 'time' },
    { header: 'Reviewed', width: 10, key: 'verified' },
    { header: 'Notes', width: 40, key: 'comments' },
  ];

  // Header styling
  const allHeaderRow = allSheet.getRow(1);
  allHeaderRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.headerFg }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  allHeaderRow.height = 28;
  allSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  for (const [i, check] of report.results.entries()) {
    const statusColor = COLORS[check.status];
    const row = allSheet.addRow({
      num: i + 1,
      site: check.site.toUpperCase(),
      status: statusLabel(check.status),
      category: friendlyCategory(check.category),
      name: check.name,
      message: check.message,
      details: check.details || '',
      time: check.responseTime || '',
      verified: '☐',
      comments: '',
    });

    row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor.bg } };
    row.getCell(3).font = { bold: true, color: { argb: statusColor.fg }, size: 10 };
    row.getCell(3).alignment = { horizontal: 'center' };

    row.getCell(9).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"☐,☑"'],
      showInputMessage: false,
      showErrorMessage: false,
    };
    row.getCell(9).alignment = { horizontal: 'center' };
    row.getCell(9).font = { size: 14 };
    row.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
    row.getCell(10).alignment = { wrapText: true };

    for (let col = 1; col <= 10; col++) {
      row.getCell(col).border = {
        bottom: { style: 'thin', color: { argb: COLORS.borderColor } },
        right: { style: 'thin', color: { argb: COLORS.borderColor } },
      };
    }

    if (check.status === 'fail') {
      for (let col = 1; col <= 10; col++) {
        if (col !== 3 && col !== 9 && col !== 10) {
          row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fail.bg } };
        }
      }
    }
  }

  allSheet.autoFilter = { from: 'A1', to: 'J1' };

  // Save
  const reportsDir = join(import.meta.dirname || '.', '..', '..', 'reports');
  const { mkdirSync } = await import('fs');
  try { mkdirSync(reportsDir, { recursive: true }); } catch {}
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `hercules-health-check-${report.mode}-${dateStr}.xlsx`;
  const filepath = join(reportsDir, filename);
  await wb.xlsx.writeFile(filepath);

  return filepath;
}
