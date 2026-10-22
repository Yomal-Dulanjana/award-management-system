// GET /api/download — HMAC token-verified PDF download endpoint
import type { APIRoute } from 'astro';
import { applicationPdfStoragePath, generateApplicationPdf, pdfStoragePath, generatePdf } from '@/lib/pdf';
import { isAllowedStoragePath } from '@/lib/storage';
import { db, initDb } from '@/db';
import { applications } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { verifyDownloadToken, getClientIp, checkRateLimit } from '@/lib/security';
import { verifySessionToken } from '@/lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ url, request, cookies }) => {
  const ip = getClientIp(request);

  // Rate limit: 30 downloads per minute per IP
  if (!checkRateLimit(`download:${ip}`, 30, 60)) {
    return new Response('Rate limit exceeded: Too many download requests. Please try again shortly.', {
      status: 429,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const ref = (url.searchParams.get('ref') ?? '').trim();
  const tsStr = (url.searchParams.get('ts') ?? '').trim();
  const token = (url.searchParams.get('token') ?? '').trim();

  // Validate reference pattern strictly: BDC-202X-XXXXXXXX
  if (!ref || !/^BDC-202[5-9]-[A-Za-z0-9]{6,20}$/.test(ref)) {
    return new Response('Invalid download request: invalid or malformed reference number.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Check if caller is an authenticated admin
  const adminCookie = cookies.get('admin_session')?.value;
  const isAdmin = adminCookie ? !!verifySessionToken(adminCookie) : false;

  // If not authenticated admin, require valid HMAC token and timestamp
  if (!isAdmin) {
    if (!tsStr || !token) {
      return new Response('Invalid download request: missing authorization token.', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const ts = parseInt(tsStr, 10);
    if (isNaN(ts) || !verifyDownloadToken(ref, ts, token)) {
      return new Response('Download link has expired or signature is invalid. Please request a new link.', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  let filePath = applicationPdfStoragePath(ref);
  if (!existsSync(filePath)) {
    // In serverless environments, the container /tmp may be empty.
    // Seamlessly regenerate from persisted application record in database.
    try {
      await initDb();
      const records = await db.select().from(applications).where(eq(applications.reference, ref)).limit(1);
      const app = records[0];
      if (app && app.data_json) {
        const data = app.data_json as any;
        const pdfResult = await generateApplicationPdf({
          reference: ref,
          companyName: data.company_name,
          financialYear: data.financial_year,
          natureOperations: data.nature_operations,
          contactName: data.contact_name_designation,
          contactEmail: data.contact_email,
          contactPhone: data.contact_phone,
          newProductsServices: data.new_products_services,
          newMarketEntered: data.new_market_entered,
          newMarketDetails: data.new_market_details,
          diversificationDetails: data.diversification_details || data.new_market_details || (data.products?.[0]?.description ?? ''),
          marketsCustomers: data.markets_customers || data.new_market_details,
          products: data.products || [],
          grossProfitMarginOption: data.gross_profit_margin_option,
          totalCompanyRevenue: data.total_company_revenue,
          revenueRows: data.metrics?.revenueRows || [],
          diversificationTotal: data.metrics?.diversificationTotal || 0,
          combinedPercent: data.metrics?.combinedPercent || 0,
          totalInvestment: data.total_investment,
          operatingProfit: data.operating_profit,
          roi: data.metrics?.roi || 0,
          payback: data.metrics?.payback,
          declarationName: data.declaration_name,
          declarationDesignation: data.declaration_designation,
          declarationDate: data.declaration_date,
          signatureDataUri: data.signature_data,
          evidenceFiles: data.evidence_files || [],
          submissionDate: app.submitted_at || new Date(),
        });
        filePath = pdfResult.filePath;
      }
    } catch (e) {
      console.warn('[Download On-Demand Gen Warning]', ref, e);
    }
  }

  if (!existsSync(filePath)) {
    return new Response('Application PDF file not found or has been cleaned up.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  if (!isAllowedStoragePath(filePath)) {
    return new Response('Forbidden: Invalid storage path.', { status: 403 });
  }

  try {
    const fileBytes = await readFile(filePath);
    return new Response(fileBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(ref)}.pdf"`,
        'Content-Length': fileBytes.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    console.error('[Download Read Error]', ref, err);
    return new Response('Failed to read PDF file.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
};
