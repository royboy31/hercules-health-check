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

function statusIcon(status: string): string {
  if (status === 'pass') return '✅ PASS';
  if (status === 'fail') return '❌ FAIL';
  return '⚠️ WARN';
}

export async function generateExcelReport(report: Report): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hercules Health Check Agent';
  wb.created = new Date();

  // ── Summary Sheet ──
  const summarySheet = wb.addWorksheet('Summary', {
    properties: { tabColor: { argb: '253461' } },
  });

  summarySheet.columns = [
    { header: '', width: 25 },
    { header: '', width: 20 },
  ];

  const summaryData = [
    ['Hercules Health Check Report', ''],
    ['', ''],
    ['Date', new Date(report.timestamp).toLocaleString('en-GB', { timeZone: 'Europe/Brussels' })],
    ['Mode', report.mode === 'daily' ? 'Daily (All Sites)' : 'Post-Deploy'],
    ['Sites Checked', report.sites.map(s => s.toUpperCase()).join(', ')],
    ['', ''],
    ['Total Checks', report.totalChecks],
    ['Passed', report.passed],
    ['Failed', report.failed],
    ['Warnings', report.warnings],
    ['Pass Rate', `${((report.passed / report.totalChecks) * 100).toFixed(1)}%`],
  ];

  for (const [i, row] of summaryData.entries()) {
    const r = summarySheet.addRow(row);
    if (i === 0) {
      r.font = { bold: true, size: 16, color: { argb: COLORS.headerBg } };
      summarySheet.mergeCells(`A${i + 1}:B${i + 1}`);
    }
    if (i >= 6) {
      r.getCell(1).font = { bold: true };
      if (row[0] === 'Failed' && (row[1] as number) > 0) {
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
    const failHeader = summarySheet.addRow(['FAILURES (Action Required)', '']);
    failHeader.font = { bold: true, size: 12, color: { argb: COLORS.fail.fg } };
    summarySheet.mergeCells(`A${failHeader.number}:B${failHeader.number}`);

    for (const f of failures) {
      const r = summarySheet.addRow([`[${f.site.toUpperCase()}] ${f.name}`, f.message]);
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
      { header: 'Status', width: 12, key: 'status' },
      { header: 'Category', width: 22, key: 'category' },
      { header: 'Check Name', width: 55, key: 'name' },
      { header: 'Result', width: 50, key: 'message' },
      { header: 'Details', width: 45, key: 'details' },
      { header: 'Time (ms)', width: 11, key: 'time' },
      { header: 'Verified', width: 10, key: 'verified' },
      { header: 'Comments', width: 40, key: 'comments' },
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
          category: currentCategory,
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
        status: statusIcon(check.status),
        category: check.category,
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

      // Verified checkbox column — data validation dropdown
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

      // Comments column — light yellow bg to indicate editable
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

  // ── All Checks Sheet (flat 642 rows) ──
  const allSheet = wb.addWorksheet('All Checks', {
    properties: { tabColor: { argb: '10C99E' } },
  });

  allSheet.columns = [
    { header: '#', width: 5, key: 'num' },
    { header: 'Site', width: 6, key: 'site' },
    { header: 'Status', width: 12, key: 'status' },
    { header: 'Category', width: 22, key: 'category' },
    { header: 'Check Name', width: 55, key: 'name' },
    { header: 'Result', width: 50, key: 'message' },
    { header: 'Details', width: 40, key: 'details' },
    { header: 'Time (ms)', width: 11, key: 'time' },
    { header: 'Verified', width: 10, key: 'verified' },
    { header: 'Comments', width: 40, key: 'comments' },
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
      status: statusIcon(check.status),
      category: check.category,
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
  const reportsDir = join(process.cwd(), 'reports');
  const { mkdirSync } = await import('fs');
  try { mkdirSync(reportsDir, { recursive: true }); } catch {}
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `hercules-health-check-${report.mode}-${dateStr}.xlsx`;
  const filepath = join(reportsDir, filename);
  await wb.xlsx.writeFile(filepath);

  return filepath;
}
