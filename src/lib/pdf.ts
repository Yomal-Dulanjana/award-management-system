// High-end executive corporate A4 PDF generator using PDFKit matching the officially approved award dossier.
import PDFDocument from 'pdfkit';
import { writeFile, readFile, mkdir, readdir, stat, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isServerless, ensureDir } from './storage';

// Corporate Color Palette (matching reference images)
const COLOR_NAVY_HEADER = '#0f2347'; // Deep Navy Header background
const COLOR_NAVY_TABLE_TH = '#1e3a5f'; // Navy Table Header
const COLOR_TEXT_NAVY = '#0f2347'; // Dark Navy Headings
const COLOR_TEXT_BODY = '#1e293b'; // Slate dark body text
const COLOR_AMBER = '#d97706'; // Left accent bar on section headers
const COLOR_GOLD_REF = '#f59e0b'; // Gold / amber for Reference code
const COLOR_SECTION_BG = '#f1f5f9'; // Light slate bar background
const COLOR_BORDER = '#cbd5e1'; // Light border divider lines
const COLOR_MUTED = '#94a3b8'; // Footer text color
const COLOR_DISCLAIMER = '#475569'; // Muted dark slate disclaimer text
const COLOR_WHITE = '#ffffff';

export interface PdfBundle {
  reference: string;
  companyName: string;
  financialYear: string;
  natureOperations: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  newProductsServices: boolean;
  newMarketEntered: boolean;
  newMarketDetails?: string | undefined;
  diversificationDetails?: string | undefined;
  marketsCustomers?: string | undefined;
  products: Array<{ name: string; description: string }>;
  grossProfitMarginOption: string;
  totalCompanyRevenue: number;
  revenueRows: Array<{ activity: string; revenue: number; percent: number }>;
  diversificationTotal: number;
  combinedPercent: number;
  totalInvestment: number;
  operatingProfit: number;
  roi: number;
  payback: number | null;
  declarationName: string;
  declarationDesignation: string;
  declarationDate: string;
  signatureDataUri?: string | undefined;
  signaturePath?: string | undefined;
  evidenceFiles?: Array<{ name: string; size: number | string }> | undefined;
  submissionDate?: Date | string | undefined;
}

export interface GeneratePdfResult {
  filePath: string;
  buffer: Buffer;
  toString(): string;
}

// Format numbers with thousands separators and 2 decimal places
function fmtNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '0.00';
  const num = typeof n === 'string' ? parseFloat(n.replace(/,/g, '')) : n;
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format file size nicely
function fmtFileSize(size: number | string | null | undefined): string {
  if (typeof size === 'string') return size;
  if (!size || isNaN(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// Format submission date timestamp
function formatSubmissionTimestamp(d?: Date | string): string {
  const date = d ? (typeof d === 'string' ? new Date(d) : d) : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(validDate.getDate()).padStart(2, '0');
  const month = months[validDate.getMonth()];
  const year = validDate.getFullYear();

  let hours = validDate.getHours();
  const minutes = String(validDate.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');

  return `${day} ${month} ${year}, ${strHours}:${minutes} ${ampm}`;
}

/**
 * Returns the designated PDF storage path for a given application reference.
 * Vercel Serverless: /tmp/pdfs/[reference].pdf
 * Local Development: [cwd]/storage/pdfs/[reference].pdf
 */
export function applicationPdfStoragePath(reference: string): string {
  const safeRef = reference.replace(/[^A-Za-z0-9_-]/g, '') || 'submission';
  const runningOnVercel =
    process.env['VERCEL'] === '1' ||
    process.env['VERCEL'] === 'true' ||
    Boolean(process.env['VERCEL_ENV']) ||
    isServerless();

  if (runningOnVercel) {
    const vercelPdf = path.join('/tmp', 'pdfs', `${safeRef}.pdf`);
    if (existsSync(vercelPdf)) return vercelPdf;
    const legacyTemp = path.join('/tmp', 'temp', `${safeRef}.pdf`);
    if (existsSync(legacyTemp)) return legacyTemp;
    return vercelPdf;
  }

  const cwd = process.cwd();
  const baseDir = existsSync(path.join(cwd, 'storage'))
    ? path.join(cwd, 'storage', 'pdfs')
    : existsSync(path.join(cwd, 'astro-award', 'storage'))
      ? path.join(cwd, 'astro-award', 'storage', 'pdfs')
      : path.join(cwd, 'storage', 'pdfs');

  const localPdf = path.join(baseDir, `${safeRef}.pdf`);
  if (existsSync(localPdf)) return localPdf;

  // Check legacy candidates
  const legacyCandidates = [
    path.join(cwd, 'storage', 'temp', `${safeRef}.pdf`),
    path.join(cwd, 'astro-award', 'storage', 'temp', `${safeRef}.pdf`),
    path.join('/tmp', 'pdfs', `${safeRef}.pdf`),
    path.join('/tmp', 'temp', `${safeRef}.pdf`),
  ];
  for (const c of legacyCandidates) {
    if (existsSync(c)) return c;
  }

  return localPdf;
}

// Safely resolve uploaded signature image Buffer from base64 data URI or serverless/local upload dirs
async function resolveSignatureBuffer(bundle: PdfBundle): Promise<Buffer | null> {
  const sig = bundle.signatureDataUri || bundle.signaturePath;
  if (!sig || typeof sig !== 'string') return null;
  const trimmed = sig.trim();
  if (!trimmed) return null;

  // 1. Data URI scheme
  if (trimmed.startsWith('data:image/') || trimmed.includes(';base64,')) {
    const base64Data = trimmed.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    try {
      const buf = Buffer.from(base64Data, 'base64');
      if (buf.length > 16) return buf;
    } catch { /* ignore */ }
  }

  // 2. Pure base64 check
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 60) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length > 16) return buf;
    } catch { /* ignore */ }
  }

  // 3. File path check across Vercel /tmp/uploads and local storage/uploads
  const runningOnVercel =
    process.env['VERCEL'] === '1' ||
    process.env['VERCEL'] === 'true' ||
    Boolean(process.env['VERCEL_ENV']) ||
    isServerless();

  const safeRef = bundle.reference.replace(/[^A-Za-z0-9_-]/g, '');
  const candidateDirs = runningOnVercel
    ? ['/tmp/uploads', `/tmp/uploads/${safeRef}`, '/tmp']
    : [
      path.resolve(process.cwd(), 'storage', 'uploads'),
      path.resolve(process.cwd(), 'storage', 'uploads', safeRef),
      path.resolve(process.cwd(), 'astro-award', 'storage', 'uploads'),
      path.resolve(process.cwd(), 'astro-award', 'storage', 'uploads', safeRef),
      path.resolve(process.cwd(), 'storage', 'temp'),
      path.resolve('/tmp', 'uploads'),
    ];

  const candidatePaths = [
    trimmed,
    path.resolve(trimmed),
    ...candidateDirs.map(d => path.join(d, trimmed)),
    ...candidateDirs.map(d => path.join(d, path.basename(trimmed)))
  ];

  for (const c of candidatePaths) {
    if (existsSync(c)) {
      try {
        const buf = await readFile(c);
        if (buf.length > 16) return buf;
      } catch { /* ignore */ }
    }
  }

  return null;
}

/**
 * Generates an executive corporate 2-page A4 PDF application dossier matching the approved reference design.
 */
export async function generateApplicationPdf(bundle: PdfBundle, targetPath?: string): Promise<GeneratePdfResult> {
  const doc = new PDFDocument({
    size: 'A4',
    autoFirstPage: false,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const chunks: Buffer[] = [];
  doc.on('data', c => chunks.push(c));

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const LM = 42;
  const contentW = 511.28;
  const RM = LM + contentW; // 553.28

  // Helper: Draw Section Bar with left amber stripe
  function drawSectionBar(y: number, title: string): number {
    const barH = 20;
    doc.rect(LM, y, contentW, barH).fill(COLOR_SECTION_BG);
    doc.rect(LM, y, 4.5, barH).fill(COLOR_AMBER);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT_NAVY);
    doc.text(title, LM + 10, y + 4.5);
    return y + barH;
  }

  // Helper: Draw Table Outline
  function drawTableOutline(x: number, y: number, w: number, h: number) {
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER).rect(x, y, w, h).stroke();
  }

  // Helper: Draw Page Footer
  function drawFooter(pageNum: number) {
    const footY = 800;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED);
    doc.text('Best Diversified Company Award 2025/26', LM, footY);
    const rightText = `Page ${pageNum} / 2`;
    const rightW = doc.widthOfString(rightText);
    doc.text(rightText, RM - rightW, footY);
  }

  // =========================================================================
  // PAGE 1: Company Profile & Core Qualitative Criteria
  // =========================================================================
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });

  // Top Full-Width Navy Banner (Edge-to-edge from the very top of the page)
  const headH = 96;
  doc.rect(0, 0, doc.page.width, headH).fill(COLOR_NAVY_HEADER);

  // Title inside banner aligned with LM
  doc.font('Helvetica-Bold').fontSize(15.5).fillColor(COLOR_WHITE);
  doc.text('BEST DIVERSIFIED COMPANY AWARD 2025/26', LM, 26);

  // Subtitle
  const timestampStr = formatSubmissionTimestamp(bundle.submissionDate);
  doc.font('Helvetica').fontSize(7.8).fillColor('#cbd5e1');
  doc.text(`Application Submission - Generated ${timestampStr}`, LM, 48);

  // Reference Line
  const refText = `Reference: ${bundle.reference}`;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_GOLD_REF);
  doc.text(refText, LM, 65);

  // Solid gold underline directly beneath Reference text
  const refTextW = doc.widthOfString(refText);
  doc.lineWidth(1.5).strokeColor(COLOR_GOLD_REF);
  doc.moveTo(LM, 78).lineTo(LM + refTextW, 78).stroke();

  let curY = headH + 22;

  // Section 1 - Company Details
  curY = drawSectionBar(curY, 'Section 1 - Company Details');
  curY += 8;

  // Table 1: Company details (6 distinct rows)
  const sec1Rows = [
    ['Company Name', bundle.companyName || 'N/A'],
    ['Financial Year Covered', bundle.financialYear || '2025/26'],
    ['Nature of Operations', bundle.natureOperations || 'N/A'],
    ['Contact Person', bundle.contactName || 'N/A'],
    ['Email Address', bundle.contactEmail || 'N/A'],
    ['Telephone', bundle.contactPhone || 'N/A']
  ];

  const col1W = 145;
  const col2W = contentW - col1W;
  const rH = 17;

  sec1Rows.forEach((r, idx) => {
    const rowY = curY + idx * rH;
    drawTableOutline(LM, rowY, contentW, rH);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, rowY).lineTo(LM + col1W, rowY + rH).stroke();

    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(r[0]!, LM + 6, rowY + 4.5);

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(r[1]!, LM + col1W + 6, rowY + 4.5, { width: col2W - 12, height: rH - 4, ellipsis: true });
  });

  curY += sec1Rows.length * rH + 16;

  // Section 2 - Evaluation Criterias
  curY = drawSectionBar(curY, 'Section 2 - Evaluation Criterias');
  curY += 12;

  // Criteria 1 - Diversification Qualification (Mandatory)
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Criteria 1 - Diversification Qualification (Mandatory)', LM, curY);
  curY += 14;

  // Criteria 1 Table: 2 rows
  const r1H = 26;
  const r2H = 18;

  // Row 1: New Products / Services Introduced
  drawTableOutline(LM, curY, contentW, r1H);
  doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, curY).lineTo(LM + col1W, curY + r1H).stroke();
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('New Products / Services\nIntroduced', LM + 6, curY + 3.5, { lineGap: 1.5 });
  doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text(bundle.newProductsServices ? 'Yes - confirmed' : 'No - not confirmed', LM + col1W + 6, curY + 8);
  curY += r1H;

  // Row 2: New Market Entered
  drawTableOutline(LM, curY, contentW, r2H);
  doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, curY).lineTo(LM + col1W, curY + r2H).stroke();
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('New Market Entered', LM + 6, curY + 5);
  doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text(bundle.newMarketEntered ? 'Yes - confirmed' : 'No - not confirmed', LM + col1W + 6, curY + 5);
  curY += r2H + 4;

  // Italic disclaimer note
  doc.font('Helvetica-Oblique').fontSize(7.2).fillColor(COLOR_DISCLAIMER);
  doc.text('Core qualification: both conditions above must be met for the application to qualify for evaluation.', LM, curY);
  curY += 16;

  // Criteria 2 - Diversification of Products / Services
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Criteria 2 - Diversification of Products / Services', LM, curY);
  curY += 14;

  // Products Table
  const pCol1W = 35;
  const pCol2W = 145;
  const pCol3W = contentW - pCol1W - pCol2W;
  const thH = 18;

  // Table Header
  doc.rect(LM, curY, contentW, thH).fill(COLOR_NAVY_TABLE_TH);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_WHITE);
  doc.text('No.', LM + 6, curY + 5);
  doc.text('Product / Service', LM + pCol1W + 6, curY + 5);
  doc.text('Brief Description', LM + pCol1W + pCol2W + 6, curY + 5);
  curY += thH;

  // Products Data Rows
  const prods = (bundle.products && bundle.products.length > 0)
    ? bundle.products
    : [{ name: 'N/A', description: 'N/A' }];

  prods.forEach((p, idx) => {
    const rowH = 18;
    drawTableOutline(LM, curY, contentW, rowH);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER)
      .moveTo(LM + pCol1W, curY).lineTo(LM + pCol1W, curY + rowH)
      .moveTo(LM + pCol1W + pCol2W, curY).lineTo(LM + pCol1W + pCol2W, curY + rowH)
      .stroke();

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(String(idx + 1), LM + 6, curY + 5);
    doc.text(p.name, LM + pCol1W + 6, curY + 5, { width: pCol2W - 12, height: rowH - 4, ellipsis: true });
    doc.text(p.description, LM + pCol1W + pCol2W + 6, curY + 5, { width: pCol3W - 12, height: rowH - 4, ellipsis: true });
    curY += rowH;
  });

  curY += 14;

  // Supporting Details Subheading
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Details of New Market Entered', LM, curY);
  curY += 12;

  // Supporting Details Table (2 rows)
  const divDetail = bundle.diversificationDetails || bundle.products?.[0]?.description || bundle.natureOperations || 'N/A';
  const mktDetail = bundle.marketsCustomers || bundle.newMarketDetails || 'N/A';
  const suppRows = [
    ['Diversification Details', divDetail],
    ['Markets & Customers', mktDetail]
  ];

  suppRows.forEach(sr => {
    const rowH = 18;
    drawTableOutline(LM, curY, contentW, rowH);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, curY).lineTo(LM + col1W, curY + rowH).stroke();

    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(sr[0]!, LM + 6, curY + 5);

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(sr[1]!, LM + col1W + 6, curY + 5, { width: col2W - 12, height: rowH - 4, ellipsis: true });
    curY += rowH;
  });

  curY += 16;

  // Criteria 3 - Revenue from Diversification
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Criteria 3 - Revenue from Diversification', LM, curY);
  curY += 14;

  // Revenue Table Header
  const rCol1W = 35;
  const rCol2W = 210;
  const rCol3W = 145;
  const rCol4W = contentW - rCol1W - rCol2W - rCol3W; // 121.28

  doc.rect(LM, curY, contentW, thH).fill(COLOR_NAVY_TABLE_TH);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_WHITE);
  doc.text('No.', LM + 6, curY + 5);
  doc.text('Business Activity', LM + rCol1W + 6, curY + 5);
  doc.text('Revenue (Rs)', LM + rCol1W + rCol2W + 6, curY + 5);
  doc.text('% Total', LM + rCol1W + rCol2W + rCol3W + 6, curY + 5);
  curY += thH;

  // Revenue Rows
  const revRows = (bundle.revenueRows && bundle.revenueRows.length > 0)
    ? bundle.revenueRows
    : [{ activity: 'N/A', revenue: 0, percent: 0 }];

  revRows.forEach((r, idx) => {
    const rowH = 18;
    drawTableOutline(LM, curY, contentW, rowH);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER)
      .moveTo(LM + rCol1W, curY).lineTo(LM + rCol1W, curY + rowH)
      .moveTo(LM + rCol1W + rCol2W, curY).lineTo(LM + rCol1W + rCol2W, curY + rowH)
      .moveTo(LM + rCol1W + rCol2W + rCol3W, curY).lineTo(LM + rCol1W + rCol2W + rCol3W, curY + rowH)
      .stroke();

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(String(idx + 1), LM + 6, curY + 5);
    doc.text(r.activity, LM + rCol1W + 6, curY + 5, { width: rCol2W - 12, height: rowH - 4, ellipsis: true });
    doc.text(fmtNumber(r.revenue), LM + rCol1W + rCol2W + 6, curY + 5);
    doc.text(`${Number(r.percent).toFixed(2)}%`, LM + rCol1W + rCol2W + rCol3W + 6, curY + 5);
    curY += rowH;
  });

  // Summary Row (TOTAL)
  const sumH = 18;
  drawTableOutline(LM, curY, contentW, sumH);
  doc.lineWidth(0.75).strokeColor(COLOR_BORDER)
    .moveTo(LM + rCol1W, curY).lineTo(LM + rCol1W, curY + sumH)
    .moveTo(LM + rCol1W + rCol2W, curY).lineTo(LM + rCol1W + rCol2W, curY + sumH)
    .moveTo(LM + rCol1W + rCol2W + rCol3W, curY).lineTo(LM + rCol1W + rCol2W + rCol3W, curY + sumH)
    .stroke();

  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('TOTAL', LM + rCol1W + 6, curY + 5);
  doc.text(fmtNumber(bundle.diversificationTotal), LM + rCol1W + rCol2W + 6, curY + 5);
  doc.text(`${Number(bundle.combinedPercent).toFixed(2)}%`, LM + rCol1W + rCol2W + rCol3W + 6, curY + 5);

  drawFooter(1);

  // =========================================================================
  // PAGE 2: Financial Metrics, Declaration & Evidence Files
  // =========================================================================
  doc.addPage({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 } });

  let p2Y = 45;

  // Criteria 4 - Gross Profit Margin Improvement
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Criteria 4 - Gross Profit Margin Improvement', LM, p2Y);
  p2Y += 14;

  // Criteria 4 Table (1 row)
  const c4H = 18;
  drawTableOutline(LM, p2Y, contentW, c4H);
  doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, p2Y).lineTo(LM + col1W, p2Y + c4H).stroke();

  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('Selected Option', LM + 6, p2Y + 5);
  doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text(bundle.grossProfitMarginOption || 'N/A', LM + col1W + 6, p2Y + 5, { width: col2W - 12, height: c4H - 4, ellipsis: true });
  p2Y += c4H + 16;

  // Criteria 5 - Return on Investment (ROI)
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Criteria 5 - Return on Investment (ROI)', LM, p2Y);
  p2Y += 14;

  // Criteria 5 Table (4 rows)
  const paybackText = (bundle.payback !== null && bundle.payback !== undefined)
    ? `${Number(bundle.payback).toFixed(2)} years`
    : 'N/A';

  const c5Rows = [
    { label: 'Total Investment in\nDiversification', val: `Rs ${fmtNumber(bundle.totalInvestment)}`, h: 26 },
    { label: 'Operating Profit from\nDiversification', val: `Rs ${fmtNumber(bundle.operatingProfit)}`, h: 26 },
    { label: 'Return on Investment (ROI)', val: `${Number(bundle.roi).toFixed(2)}%`, h: 18 },
    { label: 'Estimated Payback Period', val: paybackText, h: 18 }
  ];

  c5Rows.forEach(r => {
    drawTableOutline(LM, p2Y, contentW, r.h);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER).moveTo(LM + col1W, p2Y).lineTo(LM + col1W, p2Y + r.h).stroke();

    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(r.label, LM + 6, p2Y + (r.h > 20 ? 3.5 : 5), { lineGap: 1.5 });

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(r.val, LM + col1W + 6, p2Y + (r.h > 20 ? 8 : 5));
    p2Y += r.h;
  });

  p2Y += 20;

  // Section 3 - Declaration
  p2Y = drawSectionBar(p2Y, 'Section 3 - Declaration');
  p2Y += 12;

  // Confirmation paragraph
  doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text(
    'I/We confirm that the information provided above is accurate and relates exclusively to New Products to\nNew Markets diversification and strategically linked long-term investments.',
    LM, p2Y, { lineGap: 2.5 }
  );
  p2Y += 28;

  // Electronic Declaration & Signature Box
  const sigBoxH = 100;
  doc.lineWidth(0.75).strokeColor(COLOR_BORDER).rect(LM, p2Y, contentW, sigBoxH).stroke();

  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Electronic Declaration & Signature', LM + 10, p2Y + 10);

  // Field: Name
  const fieldY1 = p2Y + 28;
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('Name: ', LM + 10, fieldY1, { continued: true });
  doc.font('Helvetica').text(bundle.declarationName || 'N/A');

  // Field: Designation
  const fieldY2 = p2Y + 44;
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('Designation: ', LM + 10, fieldY2, { continued: true });
  doc.font('Helvetica').text(bundle.declarationDesignation || 'N/A');

  // Field: Date
  const fieldY3 = p2Y + 60;
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('Date: ', LM + 10, fieldY3, { continued: true });
  doc.font('Helvetica').text(bundle.declarationDate || 'N/A');

  // Field: Signature
  const fieldY4 = p2Y + 78;
  doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
  doc.text('Signature:', LM + 10, fieldY4);

  // Embed Signature Image safely if available
  const sigBuf = await resolveSignatureBuffer(bundle);
  let signatureRendered = false;

  const isRealSig = (buf: Buffer | null): boolean => {
    if (!buf || buf.length < 100) return false;
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w <= 5 || h <= 5) return false;
    }
    return true;
  };

  if (sigBuf && isRealSig(sigBuf)) {
    try {
      doc.image(sigBuf, LM + 95, fieldY4 - 10, { fit: [110, 32] });
      signatureRendered = true;
    } catch {
      signatureRendered = false;
    }
  }

  if (!signatureRendered) {
    // Elegant digital authentication indicator
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLOR_MUTED);
    doc.text('[Digitally Authenticated upon Submission]', LM + 95, fieldY4);
  }

  p2Y += sigBoxH + 20;

  // Evidence Files Table
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_TEXT_NAVY);
  doc.text('Evidence Files', LM, p2Y);
  p2Y += 14;

  const eCol1W = 35;
  const eCol2W = 340;
  const eCol3W = contentW - eCol1W - eCol2W; // 136.28

  doc.rect(LM, p2Y, contentW, thH).fill(COLOR_NAVY_TABLE_TH);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_WHITE);
  doc.text('No.', LM + 6, p2Y + 5);
  doc.text('File Name', LM + eCol1W + 6, p2Y + 5);
  doc.text('Size', LM + eCol1W + eCol2W + 6, p2Y + 5);
  p2Y += thH;

  const evFiles = (bundle.evidenceFiles && bundle.evidenceFiles.length > 0)
    ? bundle.evidenceFiles
    : [{ name: 'No evidence files attached', size: 0 }];

  evFiles.forEach((f, idx) => {
    const rowH = 18;
    drawTableOutline(LM, p2Y, contentW, rowH);
    doc.lineWidth(0.75).strokeColor(COLOR_BORDER)
      .moveTo(LM + eCol1W, p2Y).lineTo(LM + eCol1W, p2Y + rowH)
      .moveTo(LM + eCol1W + eCol2W, p2Y).lineTo(LM + eCol1W + eCol2W, p2Y + rowH)
      .stroke();

    doc.font('Helvetica').fontSize(7.8).fillColor(COLOR_TEXT_BODY);
    doc.text(String(idx + 1), LM + 6, p2Y + 5);
    doc.text(f.name, LM + eCol1W + 6, p2Y + 5, { width: eCol2W - 12, height: rowH - 4, ellipsis: true });
    doc.text(fmtFileSize(f.size), LM + eCol1W + eCol2W + 6, p2Y + 5);
    p2Y += rowH;
  });

  drawFooter(2);

  // Finalize PDFKit document
  doc.end();
  const pdfBuffer = await pdfPromise;

  // File persistence pipeline
  const finalFilePath = targetPath ? path.resolve(targetPath) : applicationPdfStoragePath(bundle.reference);
  const targetDir = path.dirname(finalFilePath);

  await ensureDir(targetDir);
  await writeFile(finalFilePath, pdfBuffer);
  await chmod(finalFilePath, 0o640).catch(() => { });

  const result: GeneratePdfResult = {
    filePath: finalFilePath,
    buffer: pdfBuffer,
    toString() {
      return finalFilePath;
    },
  };

  return result;
}

// Backwards compatibility aliases for existing codebase callers
export const generatePdf = generateApplicationPdf;
export const pdfStoragePath = applicationPdfStoragePath;

/**
 * Garbage-collects generated PDFs older than 24 hours in temporary directories.
 */
export async function gcTempStorage(): Promise<void> {
  try {
    const isVercel = process.env['VERCEL'] === '1' || process.env['VERCEL'] === 'true' || isServerless();
    const pdfDir = isVercel
      ? path.join('/tmp', 'pdfs')
      : path.resolve(process.cwd(), 'storage', 'pdfs');

    if (!existsSync(pdfDir)) return;
    const entries = await readdir(pdfDir);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    await Promise.all(
      entries.map(async name => {
        if (name.startsWith('.')) return;
        const full = path.join(pdfDir, name);
        try {
          const s = await stat(full);
          if (s.mtimeMs < cutoff) {
            await rm(full, { recursive: true, force: true });
          }
        } catch { /* ignore individual stat/rm error */ }
      })
    );
  } catch { /* non-fatal */ }
}
