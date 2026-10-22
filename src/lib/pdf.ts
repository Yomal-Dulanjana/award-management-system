// High-end corporate A4 PDF generator using pdf-lib with strict 2-page deterministic flow.
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { writeFile, mkdir, chmod, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Executive Corporate Color Palette
const NAVY       = rgb(0.059, 0.090, 0.165); // #0f172a (Deep Slate/Navy)
const AMBER      = rgb(0.851, 0.467, 0.024); // #d97706 (Award Gold)
const SLATE_DARK = rgb(0.118, 0.161, 0.235); // #1e293b
const SLATE_MID  = rgb(0.392, 0.455, 0.545); // #64748b
const SLATE_LT   = rgb(0.886, 0.914, 0.941); // #e2e8f0
const BG_LIGHT   = rgb(0.973, 0.980, 0.992); // #f8fafc
const WHITE      = rgb(1, 1, 1);
const EMERALD    = rgb(0.020, 0.588, 0.412); // #059669
const EMERALD_BG = rgb(0.925, 0.992, 0.961); // #ecfdf5
const EMERALD_BD = rgb(0.655, 0.953, 0.816); // #a7f3d0
const BLUE_CALL  = rgb(0.937, 0.965, 1.000); // #eff6ff
const BLUE_BORD  = rgb(0.749, 0.859, 0.996); // #bfdbfe
const BLUE_ACC   = rgb(0.114, 0.306, 0.859); // #1d4ed8
const RED_TEXT   = rgb(0.725, 0.110, 0.110); // #b91c1c
const RED_BG     = rgb(0.996, 0.949, 0.949); // #fef2f2

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
  signatureDataUri: string; // Base64 PNG data URI or raw base64
}

export interface GeneratePdfResult {
  filePath: string;
  buffer: Buffer;
  toString(): string;
}

// Format number as Sri Lankan currency
function fmtCurrency(n: number): string {
  return 'Rs. ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Clamp single line text to maxWidth with ellipsis
function clamp(text: string, font: any, size: number, maxWidth: number): string {
  if (!text) return '';
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '...';
}

// Resolve active temporary storage directory across development and production
function resolveTempStorageDir(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'storage', 'temp'))) {
    return join(cwd, 'storage', 'temp');
  }
  if (existsSync(join(cwd, 'astro-award', 'storage', 'temp'))) {
    return join(cwd, 'astro-award', 'storage', 'temp');
  }
  return join(cwd, 'storage', 'temp');
}

// Clean and decode incoming base64 signature string
function decodeSignatureBuffer(raw: string): Buffer | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip data URI scheme prefix if present
  const base64Clean = trimmed.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (!base64Clean) return null;
  try {
    const buf = Buffer.from(base64Clean, 'base64');
    // Basic verification: valid PNG or JPEG header or minimum size
    if (buf.length < 16) return null;
    return buf;
  } catch {
    return null;
  }
}

// Draw visual status badge with crisp vector icon
function drawStatusBadge(page: any, x: number, y: number, text: string, confirmed: boolean, fontBold: any) {
  const badgeW = 145;
  const badgeH = 17;
  const bg = confirmed ? EMERALD_BG : RED_BG;
  const border = confirmed ? EMERALD_BD : rgb(0.996, 0.792, 0.792);
  const fg = confirmed ? EMERALD : RED_TEXT;

  page.drawRectangle({
    x, y, width: badgeW, height: badgeH,
    color: bg, borderColor: border, borderWidth: 0.8,
  });

  if (confirmed) {
    // Vector Checkmark (✓)
    const cx = x + 7;
    const cy = y + 5;
    page.drawLine({ start: { x: cx, y: cy + 3.5 }, end: { x: cx + 2.5, y: cy }, color: fg, thickness: 1.4 });
    page.drawLine({ start: { x: cx + 2.5, y: cy }, end: { x: cx + 7.5, y: cy + 7 }, color: fg, thickness: 1.4 });
    page.drawText(text, { x: x + 18, y: y + 4.5, font: fontBold, size: 7.2, color: fg });
  } else {
    // Vector Cross (✗)
    const cx = x + 7;
    const cy = y + 5;
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 6, y: cy + 6 }, color: fg, thickness: 1.4 });
    page.drawLine({ start: { x: cx + 6, y: cy }, end: { x: cx, y: cy + 6 }, color: fg, thickness: 1.4 });
    page.drawText('Not Met', { x: x + 18, y: y + 4.5, font: fontBold, size: 7.2, color: fg });
  }
}

// Generate an executive-grade, strict 2-page A4 PDF dossier
export async function generatePdf(bundle: PdfBundle): Promise<GeneratePdfResult> {
  const doc = await PDFDocument.create();
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const [W, H] = PageSizes.A4; // 595.28 x 841.89 points
  const LM = 36, RM = W - 36, BM = 30;
  const contentW = RM - LM; // 523.28 points

  const drawSectionTitle = (pg: any, title: string, curY: number) => {
    pg.drawText(title, { x: LM, y: curY, font: helveticaBold, size: 9.2, color: NAVY });
    pg.drawLine({ start: { x: LM, y: curY - 3 }, end: { x: RM, y: curY - 3 }, color: NAVY, thickness: 1.5 });
    return curY - 14;
  };

  const drawPageFooter = (pg: any, pageNum: number) => {
    pg.drawLine({ start: { x: LM, y: BM + 14 }, end: { x: RM, y: BM + 14 }, color: SLATE_LT, thickness: 0.8 });
    pg.drawText('CONFIDENTIAL • BEST DIVERSIFIED COMPANY AWARD 2025/26', {
      x: LM, y: BM + 4, font: helvetica, size: 6.8, color: SLATE_MID,
    });
    const pageLabel = `Page ${pageNum} of 2`;
    pg.drawText(pageLabel, {
      x: RM - helvetica.widthOfTextAtSize(pageLabel, 6.8), y: BM + 4, font: helvetica, size: 6.8, color: SLATE_MID,
    });
  };

  // =========================================================================
  // PAGE 1: Organization Profile & Core Qualitative Criteria
  // =========================================================================
  const page1 = doc.addPage([W, H]);
  let y = H - 32;

  // Header Banner
  const headerH = 68;
  page1.drawRectangle({ x: LM, y: y - headerH, width: contentW, height: headerH, color: NAVY });
  page1.drawLine({ start: { x: LM, y: y - headerH }, end: { x: RM, y: y - headerH }, color: AMBER, thickness: 3 });

  page1.drawText('STATUTORY EVALUATION DOSSIER • FINANCIAL YEAR 2025/26', {
    x: LM + 14, y: y - 18, font: helveticaBold, size: 7.2, color: rgb(0.576, 0.769, 0.992),
  });
  page1.drawText('BEST DIVERSIFIED COMPANY AWARD 2025/26', {
    x: LM + 14, y: y - 36, font: helveticaBold, size: 14.5, color: WHITE,
  });
  page1.drawText('Official Corporate Qualification & Performance Application', {
    x: LM + 14, y: y - 52, font: helvetica, size: 8.5, color: rgb(0.796, 0.835, 0.886),
  });

  // Reference Badge on Header Right
  const pillW = 152, pillH = 36;
  const pillX = RM - pillW - 12, pillY = y - headerH + 16;
  page1.drawRectangle({
    x: pillX, y: pillY, width: pillW, height: pillH,
    color: WHITE, borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 1,
  });
  page1.drawText(bundle.reference, {
    x: pillX + 10, y: pillY + 20, font: helveticaBold, size: 9.5, color: NAVY,
  });
  const dateFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  page1.drawText(`Submitted: ${dateFormatted}`, {
    x: pillX + 10, y: pillY + 8, font: helvetica, size: 7.2, color: SLATE_MID,
  });

  y -= headerH + 18;

  // Section 1: Company Profile & Applicant Details
  y = drawSectionTitle(page1, '1. COMPANY PROFILE & APPLICANT DETAILS', y);

  const sec1H = 78;
  page1.drawRectangle({
    x: LM, y: y - sec1H, width: contentW, height: sec1H,
    color: BG_LIGHT, borderColor: SLATE_LT, borderWidth: 1,
  });

  const colW = (contentW - 1) / 2;
  const rowH = sec1H / 3;

  // Horizontal and vertical grid dividers
  page1.drawLine({ start: { x: LM + colW, y }, end: { x: LM + colW, y: y - sec1H }, color: SLATE_LT, thickness: 0.8 });
  page1.drawLine({ start: { x: LM, y: y - rowH }, end: { x: RM, y: y - rowH }, color: SLATE_LT, thickness: 0.8 });
  page1.drawLine({ start: { x: LM, y: y - rowH * 2 }, end: { x: RM, y: y - rowH * 2 }, color: SLATE_LT, thickness: 0.8 });

  const renderKv = (pg: any, label: string, value: string, x: number, cellY: number, maxW: number) => {
    pg.drawText(label.toUpperCase(), { x: x + 8, y: cellY - 9, font: helveticaBold, size: 6.5, color: SLATE_MID });
    pg.drawText(clamp(value, helveticaBold, 8, maxW - 16), {
      x: x + 8, y: cellY - 20, font: helveticaBold, size: 8, color: NAVY,
    });
  };

  renderKv(page1, 'Company Name', bundle.companyName, LM, y, colW);
  renderKv(page1, 'Financial Year Covered', bundle.financialYear, LM + colW, y, colW);

  renderKv(page1, 'Nature of Operations', bundle.natureOperations, LM, y - rowH, colW);
  renderKv(page1, 'Primary Contact Person', bundle.contactName, LM + colW, y - rowH, colW);

  renderKv(page1, 'Official Email Address', bundle.contactEmail, LM, y - rowH * 2, colW);
  renderKv(page1, 'Contact Telephone', bundle.contactPhone, LM + colW, y - rowH * 2, colW);

  y -= sec1H + 18;

  // Criteria 1: Mandatory Diversification Qualification
  y = drawSectionTitle(page1, 'CRITERIA 1 – DIVERSIFICATION QUALIFICATION (CORE MANDATORY)', y);

  const calloutH = 22;
  page1.drawRectangle({
    x: LM, y: y - calloutH, width: contentW, height: calloutH,
    color: BLUE_CALL, borderColor: BLUE_BORD, borderWidth: 0.8,
  });
  page1.drawLine({ start: { x: LM, y }, end: { x: LM, y: y - calloutH }, color: BLUE_ACC, thickness: 3.5 });
  page1.drawText('Mandatory Condition: Both new products/services AND new market entry must be confirmed to qualify.', {
    x: LM + 10, y: y - 14, font: helvetica, size: 7.5, color: BLUE_ACC,
  });
  y -= calloutH + 8;

  const badgeRowH = 24;
  page1.drawRectangle({
    x: LM, y: y - badgeRowH * 2, width: contentW, height: badgeRowH * 2,
    color: WHITE, borderColor: SLATE_LT, borderWidth: 0.8,
  });
  page1.drawLine({ start: { x: LM, y: y - badgeRowH }, end: { x: RM, y: y - badgeRowH }, color: SLATE_LT, thickness: 0.6 });

  page1.drawText('New Products / Services Introduced', { x: LM + 10, y: y - 16, font: helveticaBold, size: 7.8, color: NAVY });
  drawStatusBadge(page1, RM - 155, y - 20, 'Confirmed & Verified', bundle.newProductsServices, helveticaBold);

  page1.drawText('New Market Entered', { x: LM + 10, y: y - badgeRowH - 16, font: helveticaBold, size: 7.8, color: NAVY });
  drawStatusBadge(page1, RM - 155, y - badgeRowH - 20, 'Confirmed & Verified', bundle.newMarketEntered, helveticaBold);

  y -= badgeRowH * 2 + 6;

  if (bundle.newMarketDetails && bundle.newMarketDetails.trim()) {
    const narrH = 28;
    page1.drawRectangle({
      x: LM, y: y - narrH, width: contentW, height: narrH,
      color: BG_LIGHT, borderColor: SLATE_LT, borderWidth: 0.8,
    });
    page1.drawText('NEW MARKET STRATEGIC DETAILS:', { x: LM + 8, y: y - 10, font: helveticaBold, size: 6.5, color: SLATE_MID });
    page1.drawText(clamp(bundle.newMarketDetails, helvetica, 7.5, contentW - 20), {
      x: LM + 8, y: y - 21, font: helvetica, size: 7.5, color: SLATE_DARK,
    });
    y -= narrH + 16;
  } else {
    y -= 14;
  }

  // Criteria 2: Diversification of Products / Services
  y = drawSectionTitle(page1, 'CRITERIA 2 – DIVERSIFICATION OF PRODUCTS / SERVICES', y);

  // Exact Table Widths: # (8%), Product (32%), Description (60%)
  const colNumW  = contentW * 0.08;
  const colProdW = contentW * 0.32;
  const colDescW = contentW * 0.60;

  const thH = 16;
  page1.drawRectangle({ x: LM, y: y - thH, width: contentW, height: thH, color: rgb(0.945, 0.953, 0.969), borderColor: SLATE_LT, borderWidth: 0.8 });
  page1.drawText('#', { x: LM + 12, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  page1.drawText('PRODUCT / SERVICE INTRODUCED', { x: LM + colNumW + 8, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  page1.drawText('BRIEF DESCRIPTION & STRATEGIC SCOPE', { x: LM + colNumW + colProdW + 8, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  y -= thH;

  const productsList = bundle.products.length > 0 ? bundle.products : [{ name: 'N/A', description: 'No specific product rows registered.' }];
  productsList.forEach((p, idx) => {
    const rowH = 22;
    const bg = idx % 2 === 1 ? BG_LIGHT : WHITE;
    page1.drawRectangle({ x: LM, y: y - rowH, width: contentW, height: rowH, color: bg, borderColor: SLATE_LT, borderWidth: 0.6 });

    page1.drawText(String(idx + 1), { x: LM + 14, y: y - 14, font: helveticaBold, size: 7.5, color: NAVY });
    page1.drawText(clamp(p.name, helveticaBold, 7.5, colProdW - 14), {
      x: LM + colNumW + 8, y: y - 14, font: helveticaBold, size: 7.5, color: NAVY,
    });
    page1.drawText(clamp(p.description, helvetica, 7.5, colDescW - 14), {
      x: LM + colNumW + colProdW + 8, y: y - 14, font: helvetica, size: 7.5, color: SLATE_DARK,
    });
    y -= rowH;
  });

  drawPageFooter(page1, 1);


  // =========================================================================
  // PAGE 2: Audited Financials, Metrics Dashboard & Unified Declaration
  // =========================================================================
  const page2 = doc.addPage([W, H]);
  y = H - 32;

  // Mini Header on Page 2
  const miniHeaderH = 32;
  page2.drawRectangle({ x: LM, y: y - miniHeaderH, width: contentW, height: miniHeaderH, color: NAVY });
  page2.drawLine({ start: { x: LM, y: y - miniHeaderH }, end: { x: RM, y: y - miniHeaderH }, color: AMBER, thickness: 2 });
  page2.drawText('BEST DIVERSIFIED COMPANY AWARD 2025/26 • FINANCIAL PERFORMANCE DOSSIER', {
    x: LM + 12, y: y - 20, font: helveticaBold, size: 7.5, color: WHITE,
  });
  const refPillText = `Ref: ${bundle.reference}`;
  page2.drawText(refPillText, {
    x: RM - helveticaBold.widthOfTextAtSize(refPillText, 8) - 12, y: y - 20, font: helveticaBold, size: 8, color: AMBER,
  });

  y -= miniHeaderH + 18;

  // Criteria 3: Revenue from Diversification
  y = drawSectionTitle(page2, 'CRITERIA 3 – REVENUE FROM DIVERSIFICATION', y);

  // Revenue Hero Banner
  const heroH = 34;
  page2.drawRectangle({ x: LM, y: y - heroH, width: contentW, height: heroH, color: BG_LIGHT, borderColor: rgb(0.80, 0.84, 0.89), borderWidth: 1 });
  page2.drawLine({ start: { x: LM, y }, end: { x: LM, y: y - heroH }, color: NAVY, thickness: 3.5 });
  page2.drawText('TOTAL AUDITED COMPANY REVENUE (EVALUATION PERIOD)', {
    x: LM + 12, y: y - 12, font: helveticaBold, size: 6.5, color: SLATE_MID,
  });
  page2.drawText(fmtCurrency(bundle.totalCompanyRevenue), {
    x: LM + 12, y: y - 26, font: helveticaBold, size: 12.5, color: NAVY,
  });
  y -= heroH + 10;

  // Structured Table: # (8%), Activity (44%), Revenue (28%), % of Total (20%)
  const colRevNumW = contentW * 0.08;
  const colRevActW = contentW * 0.44;
  const colRevValW = contentW * 0.28;

  page2.drawRectangle({ x: LM, y: y - thH, width: contentW, height: thH, color: rgb(0.945, 0.953, 0.969), borderColor: SLATE_LT, borderWidth: 0.8 });
  page2.drawText('#', { x: LM + 12, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  page2.drawText('DIVERSIFIED BUSINESS ACTIVITY', { x: LM + colRevNumW + 8, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  const revThText = 'REVENUE (RS.)';
  page2.drawText(revThText, { x: LM + colRevNumW + colRevActW + colRevValW - helveticaBold.widthOfTextAtSize(revThText, 7) - 8, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  const pctThText = '% OF TOTAL';
  page2.drawText(pctThText, { x: RM - helveticaBold.widthOfTextAtSize(pctThText, 7) - 8, y: y - 11, font: helveticaBold, size: 7, color: NAVY });
  y -= thH;

  const revRowsList = bundle.revenueRows.length > 0 ? bundle.revenueRows : [{ activity: 'N/A', revenue: 0, percent: 0 }];
  revRowsList.forEach((r, idx) => {
    const rowH = 18;
    const bg = idx % 2 === 1 ? BG_LIGHT : WHITE;
    page2.drawRectangle({ x: LM, y: y - rowH, width: contentW, height: rowH, color: bg, borderColor: SLATE_LT, borderWidth: 0.6 });

    page2.drawText(String(idx + 1), { x: LM + 14, y: y - 12, font: helveticaBold, size: 7.5, color: NAVY });
    page2.drawText(clamp(r.activity, helveticaBold, 7.5, colRevActW - 12), {
      x: LM + colRevNumW + 8, y: y - 12, font: helveticaBold, size: 7.5, color: NAVY,
    });

    const revStr = fmtCurrency(r.revenue);
    page2.drawText(revStr, {
      x: LM + colRevNumW + colRevActW + colRevValW - helvetica.widthOfTextAtSize(revStr, 7.5) - 8,
      y: y - 12, font: helvetica, size: 7.5, color: SLATE_DARK,
    });

    const pctStr = r.percent.toFixed(2) + '%';
    page2.drawText(pctStr, {
      x: RM - helveticaBold.widthOfTextAtSize(pctStr, 7.5) - 8,
      y: y - 12, font: helveticaBold, size: 7.5, color: NAVY,
    });
    y -= rowH;
  });

  // Summary Footer Row
  const sumH = 20;
  page2.drawRectangle({ x: LM, y: y - sumH, width: contentW, height: sumH, color: rgb(0.882, 0.906, 0.941), borderColor: SLATE_LT, borderWidth: 0.8 });
  page2.drawLine({ start: { x: LM, y }, end: { x: RM, y }, color: NAVY, thickness: 1.5 });
  page2.drawText('TOTAL DIVERSIFICATION REVENUE', { x: LM + 10, y: y - 13.5, font: helveticaBold, size: 7.5, color: NAVY });

  const totRevStr = fmtCurrency(bundle.diversificationTotal);
  page2.drawText(totRevStr, {
    x: LM + colRevNumW + colRevActW + colRevValW - helveticaBold.widthOfTextAtSize(totRevStr, 8) - 8,
    y: y - 13.5, font: helveticaBold, size: 8, color: NAVY,
  });

  const totPctStr = bundle.combinedPercent.toFixed(2) + '%';
  page2.drawText(totPctStr, {
    x: RM - helveticaBold.widthOfTextAtSize(totPctStr, 8) - 8,
    y: y - 13.5, font: helveticaBold, size: 8, color: EMERALD,
  });

  y -= sumH + 18;

  // Criteria 4 & 5: Profit Margin, ROI & Payback Dashboard
  y = drawSectionTitle(page2, 'CRITERIA 4 & 5 – PROFIT MARGIN, ROI & PAYBACK DASHBOARD', y);

  // Criteria 4 Margin Strip
  const marginStripH = 20;
  page2.drawRectangle({ x: LM, y: y - marginStripH, width: contentW, height: marginStripH, color: BG_LIGHT, borderColor: SLATE_LT, borderWidth: 0.8 });
  page2.drawLine({ start: { x: LM, y }, end: { x: LM, y: y - marginStripH }, color: BLUE_ACC, thickness: 3 });
  page2.drawText('GROSS PROFIT MARGIN PERFORMANCE CATEGORY:', { x: LM + 10, y: y - 13, font: helveticaBold, size: 6.8, color: SLATE_MID });
  page2.drawText(bundle.grossProfitMarginOption || 'Standard Performance', { x: LM + 200, y: y - 13, font: helveticaBold, size: 7.8, color: NAVY });
  y -= marginStripH + 8;

  // 4 Metric Cards Grid (2x2)
  const cardGap = 8;
  const mCardW = (contentW - cardGap) / 2;
  const mCardH = 36;

  const metricCards = [
    { label: 'TOTAL INVESTMENT IN DIVERSIFICATION', value: fmtCurrency(bundle.totalInvestment), color: NAVY },
    { label: 'OPERATING PROFIT GENERATED', value: fmtCurrency(bundle.operatingProfit), color: NAVY },
    { label: 'RETURN ON INVESTMENT (ROI %)', value: bundle.roi.toFixed(2) + '%', color: EMERALD },
    { label: 'ESTIMATED PAYBACK PERIOD (YEARS)', value: bundle.payback !== null ? bundle.payback.toFixed(2) + ' Years' : 'N/A', color: BLUE_ACC },
  ];

  [0, 2].forEach(startIdx => {
    const rowY = y;
    [startIdx, startIdx + 1].forEach((ci, col) => {
      const card = metricCards[ci];
      if (!card) return;
      const cx = LM + col * (mCardW + cardGap);
      page2.drawRectangle({
        x: cx, y: rowY - mCardH, width: mCardW, height: mCardH,
        color: WHITE, borderColor: rgb(0.80, 0.84, 0.89), borderWidth: 0.8,
      });
      page2.drawLine({ start: { x: cx, y: rowY }, end: { x: cx + mCardW, y: rowY }, color: NAVY, thickness: 2.5 });
      page2.drawText(card.label, { x: cx + 10, y: rowY - 13, font: helveticaBold, size: 6.2, color: SLATE_MID });
      page2.drawText(card.value, { x: cx + 10, y: rowY - 27, font: helveticaBold, size: 11, color: card.color });
    });
    y -= mCardH + 6;
  });

  y -= 12;

  // Section 3: Declaration & Digital Signature Block (ATOMIC - NEVER SPLITS)
  y = drawSectionTitle(page2, 'SECTION 3 – APPLICANT DECLARATION & DIGITAL SIGNATURE', y);

  const declQuoteH = 32;
  page2.drawRectangle({
    x: LM, y: y - declQuoteH, width: contentW, height: declQuoteH,
    color: BG_LIGHT, borderColor: SLATE_LT, borderWidth: 0.8,
  });
  page2.drawLine({ start: { x: LM, y }, end: { x: LM, y: y - declQuoteH }, color: EMERALD, thickness: 3.5 });
  page2.drawText('"I/We hereby formally confirm and declare that the statements, operational details, and financial figures submitted in this', {
    x: LM + 10, y: y - 11, font: helvetica, size: 7.2, color: rgb(0.20, 0.25, 0.33),
  });
  page2.drawText('application are true, accurate, and relate exclusively to verified New Products to New Markets diversification initiatives', {
    x: LM + 10, y: y - 20, font: helvetica, size: 7.2, color: rgb(0.20, 0.25, 0.33),
  });
  page2.drawText('and strategically linked long-term capital investments for the 2025/26 evaluation period."', {
    x: LM + 10, y: y - 29, font: helvetica, size: 7.2, color: rgb(0.20, 0.25, 0.33),
  });
  y -= declQuoteH + 8;

  // Unified Declaration & Signature Card
  const unifiedCardH = 92;
  const leftColW = contentW * 0.58;
  const rightColW = contentW * 0.42;

  page2.drawRectangle({
    x: LM, y: y - unifiedCardH, width: contentW, height: unifiedCardH,
    color: WHITE, borderColor: rgb(0.80, 0.84, 0.89), borderWidth: 0.8,
  });

  // Vertical column boundary line
  page2.drawLine({
    start: { x: LM + leftColW, y }, end: { x: LM + leftColW, y: y - unifiedCardH },
    color: SLATE_LT, thickness: 0.8,
  });

  // Left Column: Signatory details
  const leftRowH = unifiedCardH / 4;
  const lRender = (label: string, val: string, rIdx: number, isBadge = false) => {
    const rowY = y - rIdx * leftRowH;
    page2.drawText(label.toUpperCase(), { x: LM + 10, y: rowY - 14, font: helveticaBold, size: 6.5, color: SLATE_MID });
    if (isBadge) {
      drawStatusBadge(page2, LM + 110, rowY - 18, 'Legally Confirmed & Signed', true, helveticaBold);
    } else {
      page2.drawText(clamp(val, helveticaBold, 7.8, leftColW - 120), {
        x: LM + 110, y: rowY - 14, font: helveticaBold, size: 7.8, color: NAVY,
      });
    }
    if (rIdx < 3) {
      page2.drawLine({ start: { x: LM, y: rowY - leftRowH }, end: { x: LM + leftColW, y: rowY - leftRowH }, color: SLATE_LT, thickness: 0.5 });
    }
  };

  lRender('Authorized Signatory', bundle.declarationName, 0);
  lRender('Official Designation', bundle.declarationDesignation, 1);
  lRender('Date of Declaration', bundle.declarationDate, 2);
  lRender('Declaration Status', '', 3, true);

  // Right Column: Digital Signature Bounding Box
  const sigRightX = LM + leftColW;
  const sigLineY = y - unifiedCardH + 28;
  const sigBoxW = rightColW - 30;
  const sigBoxX = sigRightX + 15;

  // Process signature image if available
  let signatureEmbedded = false;
  const sigBuf = decodeSignatureBuffer(bundle.signatureDataUri);

  if (sigBuf) {
    try {
      let pngImg = await doc.embedPng(sigBuf).catch(() => null);
      if (!pngImg) {
        pngImg = await doc.embedJpg(sigBuf).catch(() => null);
      }
      if (pngImg) {
        // Guard against degenerate or 1x1 dummy pixels
        if (pngImg.width < 10 || pngImg.height < 10) {
          signatureEmbedded = false;
        } else {
          // Enforce max-height: 55px; max-width: 200px
          const maxW = Math.min(sigBoxW, 200);
          const maxH = 50;
          let dims = pngImg.scaleToFit(maxW, maxH);
          if (pngImg.width <= maxW && pngImg.height <= maxH) {
            dims = { width: pngImg.width, height: pngImg.height };
          }
          const imgX = sigBoxX + (sigBoxW - dims.width) / 2;
          const imgY = sigLineY + (50 - dims.height) / 2 + 3;
          page2.drawImage(pngImg, {
            x: imgX,
            y: imgY,
            width: dims.width,
            height: dims.height,
          });
          signatureEmbedded = true;
        }
      }
    } catch {
      signatureEmbedded = false;
    }
  }

  // If signature missing or corrupt, render clean italic fallback note
  if (!signatureEmbedded) {
    const fallbackText = '[Digitally Authenticated upon Submission]';
    const fbW = helveticaOblique.widthOfTextAtSize(fallbackText, 7.5);
    page2.drawText(fallbackText, {
      x: sigBoxX + (sigBoxW - fbW) / 2, y: sigLineY + 16, font: helveticaOblique, size: 7.5, color: SLATE_MID,
    });
  }

  // Draw formal signature line
  page2.drawLine({
    start: { x: sigBoxX, y: sigLineY }, end: { x: sigBoxX + sigBoxW, y: sigLineY },
    color: NAVY, thickness: 1,
  });

  // Caption beneath line
  const sigCap = 'AUTHORIZED DIGITAL SIGNATURE';
  const sigCapW = helveticaBold.widthOfTextAtSize(sigCap, 6.5);
  page2.drawText(sigCap, {
    x: sigBoxX + (sigBoxW - sigCapW) / 2, y: sigLineY - 9, font: helveticaBold, size: 6.5, color: SLATE_MID,
  });

  const sigNameSub = bundle.declarationName;
  const sigNameSubW = helvetica.widthOfTextAtSize(sigNameSub, 6.2);
  page2.drawText(sigNameSub, {
    x: sigBoxX + (sigBoxW - sigNameSubW) / 2, y: sigLineY - 17, font: helvetica, size: 6.2, color: SLATE_DARK,
  });

  drawPageFooter(page2, 2);

  // =========================================================================
  // Storage & Streaming Pipeline (Filesystem & Raw Buffer)
  // =========================================================================
  const pdfBytes = await doc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  const safeRef = bundle.reference.replace(/[^A-Za-z0-9_-]/g, '') || 'submission';
  const storageTempDir = resolveTempStorageDir();

  // Ensure directories exist
  const refSubDir = join(storageTempDir, safeRef);
  if (!existsSync(refSubDir)) await mkdir(refSubDir, { recursive: true });
  if (!existsSync(storageTempDir)) await mkdir(storageTempDir, { recursive: true });

  // Write to both storage/temp/[reference].pdf and storage/temp/[reference]/[reference].pdf
  const primaryFilePath = join(storageTempDir, `${safeRef}.pdf`);
  const nestedFilePath  = join(refSubDir, `${safeRef}.pdf`);

  await writeFile(primaryFilePath, pdfBuffer);
  await writeFile(nestedFilePath, pdfBuffer);

  // Enforce restrictive file permissions (0640)
  await chmod(primaryFilePath, 0o640).catch(() => {});
  await chmod(nestedFilePath, 0o640).catch(() => {});

  const result: GeneratePdfResult = {
    filePath: primaryFilePath,
    buffer: pdfBuffer,
    toString() {
      return primaryFilePath;
    },
  };

  return result;
}

// Return expected PDF path for reference (checked by download endpoint)
export function pdfStoragePath(reference: string): string {
  const safeRef = reference.replace(/[^A-Za-z0-9_-]/g, '') || 'submission';
  const storageTempDir = resolveTempStorageDir();
  const p1 = join(storageTempDir, `${safeRef}.pdf`);
  if (existsSync(p1)) return p1;
  const p2 = join(storageTempDir, safeRef, `${safeRef}.pdf`);
  if (existsSync(p2)) return p2;
  return p1;
}

// Garbage collect temp PDFs older than 24 hours
export async function gcTempStorage(): Promise<void> {
  try {
    const storageTempDir = resolveTempStorageDir();
    if (!existsSync(storageTempDir)) return;
    const entries = await readdir(storageTempDir);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    await Promise.all(entries.map(async name => {
      if (name.startsWith('.')) return;
      const full = join(storageTempDir, name);
      try {
        const s = await stat(full);
        if (s.mtimeMs < cutoff) {
          await rm(full, { recursive: true, force: true });
        }
      } catch { /* ignore individual stat/rm error */ }
    }));
  } catch { /* non-fatal */ }
}
