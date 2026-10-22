// GET /api/download — HMAC token-verified PDF download endpoint
import type { APIRoute } from 'astro';
import { verifyDownloadToken } from '@/lib/security';
import { pdfStoragePath } from '@/lib/pdf';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const GET: APIRoute = async ({ url }) => {
  const ref = url.searchParams.get('ref') ?? '';
  const tsStr = url.searchParams.get('ts') ?? '';
  const token = url.searchParams.get('token') ?? '';

  if (!ref || !tsStr || !token) {
    return new Response('Invalid download request: missing parameters.', {
      status: 400,
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

  const filePath = pdfStoragePath(ref);
  if (!existsSync(filePath)) {
    return new Response('Application PDF file not found or has been cleaned up.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
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
