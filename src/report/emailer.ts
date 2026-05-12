import type { Report } from '../types.js';
import { ALERT_EMAILS, DEPLOY_EMAILS, BREVO_API_KEY } from '../config/sites.js';
import { generateHtmlReport, getSubjectLine } from './generator.js';
import { readFileSync } from 'fs';
import { basename } from 'path';

export async function sendEmailReport(report: Report, excelPath?: string): Promise<void> {
  if (!BREVO_API_KEY) {
    console.log('⚠️  BREVO_API_KEY not set — skipping email, printing report to stdout');
    return;
  }

  const htmlContent = generateHtmlReport(report);
  const subject = getSubjectLine(report);

  const recipients = report.mode === 'deploy' ? DEPLOY_EMAILS : ALERT_EMAILS;

  const payload: any = {
    sender: { name: 'Hercules Health Check', email: 'info@hercules-merchandise.de' },
    to: recipients.map(email => ({ email })),
    subject,
    htmlContent,
  };

  // Attach Excel file if provided
  if (excelPath) {
    try {
      const fileBuffer = readFileSync(excelPath);
      const base64Content = fileBuffer.toString('base64');
      const fileName = basename(excelPath);
      payload.attachment = [
        {
          content: base64Content,
          name: fileName,
        },
      ];
      console.log(`📎 Attaching: ${fileName} (${(fileBuffer.length / 1024).toFixed(0)} KB)`);
    } catch (e: any) {
      console.error(`⚠️  Could not read Excel file: ${e.message}`);
    }
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`✅ Email sent to: ${recipients.join(', ')} (messageId: ${data.messageId || 'ok'})`);
    } else {
      const err = await res.text();
      console.error(`❌ Email failed (HTTP ${res.status}): ${err}`);
    }
  } catch (e: any) {
    console.error(`❌ Email error: ${e.message}`);
  }
}
