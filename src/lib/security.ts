// HMAC-signed download token utilities and XSS sanitization helpers.
import { createHmac, randomBytes } from 'node:crypto';

const DOWNLOAD_SECRET = process.env['DOWNLOAD_SECRET'] ?? 'insecure-dev-secret';
const TOKEN_TTL_SECONDS = 3600; // 1-hour signed link expiry

// Generate HMAC-SHA256 token for PDF download authorization
export function generateDownloadToken(reference: string, ts: number): string {
  return createHmac('sha256', DOWNLOAD_SECRET)
    .update(`${reference}:${ts}`)
    .digest('hex');
}

// Verify download token and timestamp; returns false if tampered or expired
export function verifyDownloadToken(reference: string, ts: number, token: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (now - ts > TOKEN_TTL_SECONDS) return false;
  const expected = generateDownloadToken(reference, ts);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= (expected.charCodeAt(i) ^ token.charCodeAt(i));
  }
  return diff === 0;
}

export { getBaseUrl } from './url';
import { getBaseUrl } from './url';

// Build full public download URL with embedded signed token
export function buildDownloadUrl(reference: string, baseUrl?: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const token = generateDownloadToken(reference, ts);
  const cleanBase = (baseUrl || getBaseUrl()).replace(/\/+$/, '');
  return `${cleanBase}/api/download?ref=${encodeURIComponent(reference)}&ts=${ts}&token=${token}`;
}

// Sanitize user input — strips script/event attributes to prevent stored XSS
export function sanitizeText(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// Generate a cryptographically secure random hex string
export function secureHex(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

// Rate-limit store: simple in-process map (swap with Redis for multi-process deployments)
const _rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Check rolling-window rate limit; returns true if request is allowed
export function checkRateLimit(ip: string, max = 5, windowSec = 3600): boolean {
  const now = Math.floor(Date.now() / 1000);
  const entry = _rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(ip, { count: 1, resetAt: now + windowSec });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}
