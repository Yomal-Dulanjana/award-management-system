// POST /api/submit — main form submission endpoint with MySQL persistence and file pipeline
import type { APIRoute } from 'astro';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ApplicationSchema } from '@/lib/validation';
import { recalculate, generateReference } from '@/lib/calculations';
import { sanitizeText, checkRateLimit, buildDownloadUrl, secureHex, getBaseUrl } from '@/lib/security';
import { generateApplicationPdf, generatePdf, applicationPdfStoragePath, gcTempStorage } from '@/lib/pdf';
import { sendApplicantConfirmation, sendAdminNotification } from '@/lib/mailer';
import type { PdfBundle } from '@/lib/pdf';
import { db, initDb } from '@/db';
import { applications, applicationAttachments } from '@/db/schema';
import { getUploadsDir, ensureDir } from '@/lib/storage';

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Resolve client IP for rate limiting
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '0.0.0.0';

  // Rolling submission per hour rate limit (lenient in development mode)
  const isDev = process.env['APP_ENV'] === 'development';
  const maxSubmissions = isDev ? 100 : 5;
  if (!checkRateLimit(ip, maxSubmissions, 3600)) {
    return json(429, { success: false, message: 'Too many submissions. Please wait and try again later.' });
  }

  // Parse multipart form (file uploads) or JSON
  let rawData: Record<string, unknown>;
  let rawEvidenceFiles: File[] = [];

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      rawData = {};

      // Collect all form fields and evidence files
      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          if (key === 'evidence_files[]' || key === 'evidence_files') {
            rawEvidenceFiles.push(value);
          }
        } else {
          const v = value as string;
          // Handle array fields: products[0][name] → nested structure
          const arrMatch = key.match(/^(\w+)\[(\d+)\]\[(\w+)\]$/);
          if (arrMatch) {
            const [, field, idx, prop] = arrMatch;
            if (!rawData[field!]) rawData[field!] = [];
            const arr = rawData[field!] as Record<string, unknown>[];
            const i = parseInt(idx!, 10);
            if (!arr[i]) arr[i] = {};
            (arr[i]!)[prop!] = v;
          } else {
            rawData[key] = v;
          }
        }
      }
    } else {
      rawData = await request.json() as Record<string, unknown>;
    }
  } catch {
    return json(400, { success: false, message: 'Invalid request body.' });
  }

  // Honeypot check
  if (rawData['website_url'] && String(rawData['website_url']).trim() !== '') {
    return json(200, { success: true, redirect: '/success' });
  }

  // Filter out empty file inputs
  const evidenceFiles = rawEvidenceFiles.filter(f => f.size > 0 && f.name.trim() !== '');

  // Enforce server-side constraints: Max 5 files, allowed MIME types, max 5MB per file
  const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

  if (evidenceFiles.length > 5) {
    return json(422, { success: false, message: 'A maximum of 5 evidence files are allowed.' });
  }

  for (const file of evidenceFiles) {
    const ext = path.extname(file.name).toLowerCase();
    const mime = file.type.toLowerCase();
    const isValidMime = ALLOWED_MIME_TYPES.has(mime) ||
      (mime === 'application/octet-stream' && (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg' || ext === '.png'));

    if (!isValidMime) {
      return json(422, {
        success: false,
        message: `Invalid file type for "${file.name}". Only PDF, JPEG, and PNG files are allowed.`,
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      return json(422, {
        success: false,
        message: `File "${file.name}" exceeds the maximum 5MB size limit.`,
      });
    }
  }

  // Coerce types before Zod parsing
  const coerce = (raw: unknown): unknown => {
    if (typeof raw === 'string') {
      const n = parseFloat(raw.replace(/,/g, ''));
      return isNaN(n) ? raw : n;
    }
    return raw;
  };

  // Normalize array fields from form encoding
  const products = Array.isArray(rawData['products'])
    ? (rawData['products'] as Array<Record<string, string>>).filter(p => p['name'] || p['description'])
    : [];
  const revenue = Array.isArray(rawData['revenue'])
    ? (rawData['revenue'] as Array<Record<string, string>>).filter(r => r['activity'] || r['revenue'])
    : [];

  // Build parse input — sanitize strings, coerce numbers
  const parseInput = {
    ...rawData,
    company_name:               sanitizeText(String(rawData['company_name'] ?? '')),
    financial_year:             sanitizeText(String(rawData['financial_year'] ?? '2025/26')),
    nature_operations:          sanitizeText(String(rawData['nature_operations'] ?? '')),
    contact_name_designation:   sanitizeText(String(rawData['contact_name_designation'] ?? '')),
    contact_email:              String(rawData['contact_email'] ?? '').trim().toLowerCase(),
    contact_phone:              sanitizeText(String(rawData['contact_phone'] ?? '')),
    new_products_services:      rawData['new_products_services'] === true || rawData['new_products_services'] === 'true' || rawData['new_products_services'] === '1',
    new_market_entered:         rawData['new_market_entered'] === true || rawData['new_market_entered'] === 'true' || rawData['new_market_entered'] === '1',
    new_market_details:         sanitizeText(String(rawData['new_market_details'] ?? '')),
    products:                   products.map(p => ({ name: sanitizeText(p['name'] ?? ''), description: sanitizeText(p['description'] ?? '') })),
    total_company_revenue:      coerce(rawData['total_company_revenue']),
    revenue:                    revenue.map(r => ({ activity: sanitizeText(r['activity'] ?? ''), revenue: coerce(r['revenue']) })),
    gross_profit_margin_option: sanitizeText(String(rawData['gross_profit_margin_option'] ?? '')),
    total_investment:           coerce(rawData['total_investment']),
    operating_profit:           coerce(rawData['operating_profit']),
    declaration_name:           sanitizeText(String(rawData['declaration_name'] ?? '')),
    declaration_designation:    sanitizeText(String(rawData['declaration_designation'] ?? '')),
    declaration_date:           (() => {
      let d = String(rawData['declaration_date'] ?? '').trim();
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
        const parts = d.split('/');
        const p1 = parseInt(parts[0]!, 10);
        const p2 = parseInt(parts[1]!, 10);
        const y = parts[2]!;
        d = p1 > 12
          ? `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`
          : `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
      return d;
    })(),
    declaration_confirmed:      rawData['declaration_confirmed'] === true || rawData['declaration_confirmed'] === 'true' || rawData['declaration_confirmed'] === '1',
    signature_data:             String(rawData['signature_data'] ?? ''),
  };

  // Zod validation
  const parsed = ApplicationSchema.safeParse(parseInput);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return json(422, {
      success: false,
      message: firstError?.message ?? 'Validation error.',
      field: firstError?.path.join('.'),
      errors: parsed.error.flatten().fieldErrors,
    });
  }
  const data = parsed.data;

  // Server-side financial recalculation
  const metrics = recalculate({
    totalCompanyRevenue: data.total_company_revenue,
    revenueRows:         data.revenue.map(r => ({ activity: r.activity, revenue: r.revenue as number })),
    totalInvestment:     data.total_investment as number,
    operatingProfit:     data.operating_profit as number,
  });

  const reference = generateReference();
  const baseUrl   = getBaseUrl(request);
  const downloadUrl = buildDownloadUrl(reference, baseUrl);

  // Securely persist uploaded evidence files to disk under dynamic uploads directory (/tmp/uploads on Vercel)
  const uploadsDir = getUploadsDir(reference);
  await ensureDir(uploadsDir);

  const savedEvidenceAttachments: Array<{
    originalName: string;
    storedName: string;
    filePath: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];

  for (const file of evidenceFiles) {
    const safeBase = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${Date.now()}_${secureHex(6)}_${safeBase}`;
    const filePath = path.join(uploadsDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    let mime = file.type || 'application/octet-stream';
    if (mime === 'application/octet-stream') {
      const ext = path.extname(file.name).toLowerCase();
      if (ext === '.pdf') mime = 'application/pdf';
      else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      else if (ext === '.png') mime = 'image/png';
    }

    savedEvidenceAttachments.push({
      originalName: file.name,
      storedName,
      filePath,
      mimeType: mime,
      sizeBytes: file.size,
    });
  }

  // Assemble PDF bundle
  const pdfBundle: PdfBundle = {
    reference,
    companyName:            data.company_name,
    financialYear:          data.financial_year,
    natureOperations:       data.nature_operations,
    contactName:            data.contact_name_designation,
    contactEmail:           data.contact_email,
    contactPhone:           data.contact_phone,
    newProductsServices:    data.new_products_services,
    newMarketEntered:       data.new_market_entered,
    newMarketDetails:       data.new_market_details,
    diversificationDetails: data.new_market_details || (data.products[0]?.description ?? ''),
    marketsCustomers:       data.new_market_details,
    products:               data.products,
    grossProfitMarginOption: data.gross_profit_margin_option,
    totalCompanyRevenue:    data.total_company_revenue,
    revenueRows:            metrics.revenueRows,
    diversificationTotal:   metrics.diversificationTotal,
    combinedPercent:        metrics.combinedPercent,
    totalInvestment:        data.total_investment as number,
    operatingProfit:        data.operating_profit as number,
    roi:                    metrics.roi,
    payback:                metrics.payback,
    declarationName:        data.declaration_name,
    declarationDesignation: data.declaration_designation,
    declarationDate:        data.declaration_date,
    signatureDataUri:       data.signature_data,
    evidenceFiles:          savedEvidenceAttachments.map(a => ({ name: a.originalName, size: a.sizeBytes })),
    submissionDate:         new Date(),
  };

  // Generate high-end corporate 2-page PDF
  let pdfPath = '';
  let pdfBuffer: Buffer | null = null;
  let pdfReady = false;
  try {
    const pdfResult = await generateApplicationPdf(pdfBundle);
    pdfPath   = pdfResult.filePath;
    pdfBuffer = pdfResult.buffer;
    pdfReady  = !!pdfPath && pdfBuffer.length > 0;
  } catch (err) {
    console.error('[PDF Generation Error]', reference, err);
  }

  // Database persistence: Applications & Application Attachments
  try {
    await initDb();

    const [appResult] = await db.insert(applications).values({
      reference,
      company_name: data.company_name,
      financial_year: data.financial_year,
      nature_of_operations: data.nature_operations,
      contact_name: data.contact_name_designation,
      contact_email: data.contact_email,
      contact_phone: data.contact_phone,
      total_revenue: String(data.total_company_revenue),
      diversification_revenue: String(metrics.diversificationTotal),
      total_investment: String(data.total_investment),
      operating_profit: String(data.operating_profit),
      roi_percent: String(metrics.roi),
      payback_years: metrics.payback !== null ? String(metrics.payback) : null,
      status: 'PENDING',
      pdf_path: pdfPath,
      submitted_at: new Date(),
      data_json: {
        ...data,
        metrics,
        evidence_files: savedEvidenceAttachments.map(a => ({ name: a.originalName, size: a.sizeBytes })),
      },
    });

    const insertedAppId = Number(appResult.insertId);

    if (insertedAppId && savedEvidenceAttachments.length > 0) {
      for (const att of savedEvidenceAttachments) {
        await db.insert(applicationAttachments).values({
          application_id: insertedAppId,
          original_filename: att.originalName,
          stored_filename: att.storedName,
          file_path: att.filePath,
          mime_type: att.mimeType,
          file_size_bytes: att.sizeBytes,
        });
      }
    }
  } catch (dbErr) {
    console.error('[Database Insertion Error]', reference, dbErr);
  }

  // Send emails with PDF attached (non-blocking on individual failure)
  let emailSent = false;
  if (pdfReady && (pdfBuffer || pdfPath)) {
    const pdfAttachment = pdfBuffer ?? pdfPath;
    try {
      await sendApplicantConfirmation(
        { reference, companyName: data.company_name, financialYear: data.financial_year,
          contactEmail: data.contact_email, contactName: data.contact_name_designation,
          roi: metrics.roi, payback: metrics.payback,
          diversificationTotal: metrics.diversificationTotal, combinedPercent: metrics.combinedPercent,
          downloadUrl, baseUrl },
        pdfAttachment,
      );
      emailSent = true;
    } catch (err) {
      console.error('[Applicant Email Error]', reference, err);
    }

    try {
      const adminDetailUrl = `${baseUrl}/admin/applications/${reference}`;
      await sendAdminNotification(
        { reference, companyName: data.company_name, financialYear: data.financial_year,
          contactEmail: data.contact_email, contactName: data.contact_name_designation,
          roi: metrics.roi, payback: metrics.payback,
          diversificationTotal: metrics.diversificationTotal, combinedPercent: metrics.combinedPercent,
          downloadUrl, baseUrl, adminDetailUrl },
        pdfAttachment,
        savedEvidenceAttachments.map(a => ({
          originalName: a.originalName,
          filePath: a.filePath,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      );
    } catch (err) {
      console.error('[Admin Email Error]', reference, err);
    }
  }

  // Opportunistic GC
  gcTempStorage().catch(() => {});

  return json(200, {
    success:    true,
    reference,
    email:      data.contact_email,
    pdfReady,
    emailSent,
    downloadUrl,
    attachmentsCount: savedEvidenceAttachments.length,
  });
};
