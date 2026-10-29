// Nodemailer SMTP dispatcher — verified custom domain via Brevo SMTP
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';
import { getBaseUrl } from '@/utils/url';
import type { ApplicationBundle, EvidenceFileAttachment } from '@/types';

export type { ApplicationBundle, EvidenceFileAttachment };

// Brevo SMTP transporter instance
export const transporter = nodemailer.createTransport({
  host: process.env['SMTP_HOST'] || 'smtp-relay.brevo.com',
  port: Number(process.env['SMTP_PORT']) || 587,
  secure: process.env['SMTP_SECURE'] === 'true',
  auth: {
    user: process.env['SMTP_USER'] || '',
    pass: process.env['SMTP_PASS'] || '',
  },
});

// Outbound sender identity header
export const OFFICIAL_FROM_NAME    = process.env['MAIL_FROM_NAME'] || 'Best Diversified Company Award 2025/26';
export const OFFICIAL_FROM_ADDRESS = process.env['MAIL_FROM_ADDRESS'] || 'noreply@yomaldulanjana.me';
export const OFFICIAL_FROM         = process.env['MAIL_FROM'] || `"${OFFICIAL_FROM_NAME}" <${OFFICIAL_FROM_ADDRESS}>`;

export function getMailFromAddress(): string {
  return OFFICIAL_FROM;
}

function fmt(n: number) {
  return 'Rs. ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2 });
}

function htmlWrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px}
  .card{background:#fff;border-radius:12px;max-width:620px;margin:0 auto;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#0b2043;color:#fff;padding:28px 32px;border-bottom:4px solid #d97706}
  .header h1{margin:0;font-size:20px;font-weight:800;letter-spacing:.5px}
  .header p{margin:6px 0 0;font-size:13px;color:#93c5fd}
  .body{padding:28px 32px}
  .badge{display:inline-block;background:#f7f2e5;border:1.5px solid #e8d59a;color:#0b2043;font-family:monospace;font-size:16px;font-weight:700;padding:10px 20px;border-radius:8px;letter-spacing:.15em;margin:12px 0}
  .kv{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
  .kv td{padding:8px 12px;border:1px solid #e2e8f0}
  .kv td:first-child{background:#f8fafc;color:#475569;font-weight:600;width:45%;text-transform:uppercase;font-size:12px;letter-spacing:.3px}
  .btn, a.btn, a.btn:link, a.btn:visited {
    display: inline-block;
    background-color: #1d4ed8 !important;
    color: #ffffff !important;
    padding: 12px 28px;
    border-radius: 8px;
    text-decoration: none !important;
    font-weight: 700;
    font-size: 15px;
    margin-top: 16px;
    border: 1px solid #1d4ed8;
  }
  .footer{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
</style></head>
<body><div class="card">${body}</div></body></html>`;
}

// Send confirmation email and attach compiled PDF dossier to applicant
export async function sendApplicantConfirmation(bundle: ApplicationBundle, pdfAttachment: string | Buffer): Promise<void> {
  const appName = process.env['APP_NAME'] ?? 'Best Diversified Company Award';

  const body = `
    <div class="header">
      <h1>Application Received</h1>
      <p>${appName} • Financial Year 2025/26</p>
    </div>
    <div class="body">
      <p>Dear <strong>${bundle.contactName}</strong>,</p>
      <p>Thank you for submitting your application for the <strong>${appName}</strong>. We have received your application and it is currently under review.</p>
      <p>Your reference number:</p>
      <div class="badge">${bundle.reference}</div>
      <p>Please retain this reference number for all future correspondence regarding your application.</p>
      <table class="kv">
        <tr><td>Company</td><td>${bundle.companyName}</td></tr>
        <tr><td>Financial Year</td><td>${bundle.financialYear}</td></tr>
        <tr><td>Diversification Revenue</td><td>${fmt(bundle.diversificationTotal)} (${bundle.combinedPercent}% of total)</td></tr>
        <tr><td>ROI</td><td>${bundle.roi}%</td></tr>
        ${bundle.payback !== null ? `<tr><td>Payback Period</td><td>${bundle.payback} Years</td></tr>` : ''}
      </table>
      <p>A copy of your completed application is attached as a PDF for your records.</p>
      <p style="margin-top:20px;">
        <a class="btn" href="${bundle.downloadUrl}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff !important;text-decoration:none !important;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;border:1px solid #1d4ed8;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:15px;">Download Application PDF</span>
        </a>
      </p>
    </div>
    <div class="footer">CONFIDENTIAL • ${appName} 2025/26 • This email was sent to ${bundle.contactEmail}</div>`;

  const attachment = Buffer.isBuffer(pdfAttachment)
    ? { filename: `${bundle.reference}.pdf`, content: pdfAttachment }
    : { filename: `${bundle.reference}.pdf`, path: pdfAttachment };

  const mailOptions: Mail.Options = {
    from: OFFICIAL_FROM,
    to: bundle.contactEmail,
    subject: `Application Received – ${bundle.reference} | ${appName}`,
    html: htmlWrap(body),
    text: `Application ${bundle.reference} received. Company: ${bundle.companyName}. Download: ${bundle.downloadUrl}`,
    attachments: [attachment],
  };

  await transporter.sendMail(mailOptions);
}

// Send alert and dossier to admin notification recipient resolved from DB
export async function sendAdminNotification(
  bundle: ApplicationBundle,
  pdfAttachment: string | Buffer,
  evidenceFiles: EvidenceFileAttachment[] = [],
  adminRecipientOverride?: string | string[],
): Promise<void> {
  let adminEmails: string[] = [];
  if (adminRecipientOverride) {
    adminEmails = (Array.isArray(adminRecipientOverride) ? adminRecipientOverride : adminRecipientOverride.split(','))
      .map(e => e.trim())
      .filter(Boolean);
  }

  // Fetch admin recipient from system_settings table
  if (adminEmails.length === 0) {
    try {
      const { getSystemSetting } = await import('@/db');
      const dynamicEmail = await getSystemSetting('admin_notification_email');
      if (dynamicEmail && dynamicEmail !== 'admin@yourcompany.com') {
        adminEmails = dynamicEmail.split(',').map(e => e.trim()).filter(Boolean);
      }
    } catch (err) {
      console.warn('[Mailer] Could not fetch admin_notification_email from DB:', err);
    }
  }

  if (adminEmails.length === 0) {
    console.warn('[Mailer] No admin notification email configured in system_settings.');
    return;
  }

  const appName = process.env['APP_NAME'] ?? 'Best Diversified Company Award';
  const baseUrl = bundle.baseUrl || getBaseUrl();
  const adminDetailUrl = bundle.adminDetailUrl || `${baseUrl}/admin/applications/${bundle.reference}`;

  let pdfSizeBytes = 0;
  if (Buffer.isBuffer(pdfAttachment)) {
    pdfSizeBytes = pdfAttachment.length;
  } else {
    try {
      const fs = await import('node:fs/promises');
      const stats = await fs.stat(pdfAttachment);
      pdfSizeBytes = stats.size;
    } catch {
      pdfSizeBytes = 200 * 1024;
    }
  }

  const evidenceSizeBytes = evidenceFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
  const totalPayloadBytes = pdfSizeBytes + evidenceSizeBytes;
  const SMTP_THRESHOLD_BYTES = 20 * 1024 * 1024;
  const exceedsThreshold = totalPayloadBytes > SMTP_THRESHOLD_BYTES;

  const attachments: Mail.Options['attachments'] = [
    Buffer.isBuffer(pdfAttachment)
      ? { filename: `${bundle.reference}.pdf`, content: pdfAttachment }
      : { filename: `${bundle.reference}.pdf`, path: pdfAttachment },
  ];

  if (!exceedsThreshold && evidenceFiles.length > 0) {
    for (const f of evidenceFiles) {
      attachments.push({ filename: f.originalName, path: f.filePath, contentType: f.mimeType });
    }
  }

  const largeAttachmentNotice = exceedsThreshold && evidenceFiles.length > 0
    ? `
      <div style="background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:6px;margin:18px 0;font-size:13px;color:#92400e;">
        <strong style="display:block;font-size:14px;margin-bottom:6px;">⚠️ Large Evidence Attachments Notice</strong>
        Total submission files (${(totalPayloadBytes / (1024 * 1024)).toFixed(1)} MB) exceed the 20 MB email dispatch limit.
        The compiled PDF application is attached below. Access all candidate evidence files directly in the Admin Dashboard:
        <ul style="margin:8px 0 0;padding-left:20px;">
          ${evidenceFiles.map(f => `<li><a href="${adminDetailUrl}" style="color:#1d4ed8;font-weight:600;text-decoration:underline;">${f.originalName}</a> (${(f.sizeBytes / (1024 * 1024)).toFixed(2)} MB)</li>`).join('')}
        </ul>
      </div>`
    : (evidenceFiles.length > 0
      ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #10b981;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;color:#166534;">
        <strong>Attached Evidence:</strong> ${evidenceFiles.length} file(s) attached directly to this notification.
      </div>`
      : '');

  const body = `
    <div class="header">
      <h1>New Application Received</h1>
      <p>${appName} • Admin Notification</p>
    </div>
    <div class="body">
      <p>A new award application has been submitted:</p>
      <div class="badge">${bundle.reference}</div>
      <table class="kv">
        <tr><td>Company</td><td><strong>${bundle.companyName}</strong></td></tr>
        <tr><td>Contact</td><td>${bundle.contactName}</td></tr>
        <tr><td>Email</td><td>${bundle.contactEmail}</td></tr>
        <tr><td>Financial Year</td><td>${bundle.financialYear}</td></tr>
        <tr><td>Diversification Revenue</td><td>${fmt(bundle.diversificationTotal)}</td></tr>
        <tr><td>Combined %</td><td>${bundle.combinedPercent}%</td></tr>
        <tr><td>ROI</td><td>${bundle.roi}%</td></tr>
        ${bundle.payback !== null ? `<tr><td>Payback</td><td>${bundle.payback} Years</td></tr>` : ''}
      </table>
      ${largeAttachmentNotice}
      <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
        <a class="btn" href="${adminDetailUrl}" style="display:inline-block;background-color:#0b2043;color:#ffffff !important;text-decoration:none !important;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;border:1px solid #0b2043;margin-right:10px;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:14px;">Open in Admin Portal</span>
        </a>
        <a class="btn" href="${bundle.downloadUrl}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff !important;text-decoration:none !important;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;border:1px solid #1d4ed8;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:14px;">Download Application PDF</span>
        </a>
      </div>
    </div>
    <div class="footer">CONFIDENTIAL • ${appName} Admin Alert</div>`;

  await transporter.sendMail({
    from: OFFICIAL_FROM,
    to: adminEmails.join(', '),
    subject: `[Admin] New Application – ${bundle.reference} | ${bundle.companyName}`,
    html: htmlWrap(body),
    text: `New application ${bundle.reference} from ${bundle.companyName}. Admin Portal: ${adminDetailUrl}. Download PDF: ${bundle.downloadUrl}`,
    attachments,
  });
}
