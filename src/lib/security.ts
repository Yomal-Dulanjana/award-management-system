// src/lib/security.ts — HMAC-signed download token utilities, constant-time verification, XSS sanitization & IP rate limiting.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getBaseUrl } from './url';

export { getBaseUrl } from './url';

const DOWNLOAD_SECRET = process.env['DOWNLOAD_SECRET'] || process.env['SESSION_SECRET'] || 'award_sec_fallback_bdc_2026_dtech';
const TOKEN_TTL_SECONDS = 3600; // 1-hour signed link expiry

// Extract client IP address reliably from incoming request headers
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return normalizeIp(realIp);

  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return normalizeIp(cfIp);

  return '127.0.0.1';
}

function normalizeIp(ip: string): string {
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return '127.0.0.1';
  return ip.replace(/^::ffff:/, '');
}

// Generate HMAC-SHA256 token for PDF download authorization
export function generateDownloadToken(reference: string, ts: number): string {
  return createHmac('sha256', DOWNLOAD_SECRET)
    .update(`${reference}:${ts}`)
    .digest('hex');
}

// Verify download token and timestamp; returns false if tampered, expired, or post-dated
export function verifyDownloadToken(reference: string, ts: number, token: string): boolean {
  if (!reference || !token || typeof ts !== 'number' || isNaN(ts)) return false;

  const now = Math.floor(Date.now() / 1000);

  // Reject tokens post-dated by more than 60s (clock skew tolerance)
  if (ts > now + 60) return false;

  // Reject expired tokens
  if (now - ts > TOKEN_TTL_SECONDS) return false;

  const expected = generateDownloadToken(reference, ts);

  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const tokenBuf = Buffer.from(token, 'hex');

    if (expectedBuf.length !== tokenBuf.length || expectedBuf.length === 0) {
      return false;
    }

    return timingSafeEqual(expectedBuf, tokenBuf);
  } catch {
    return false;
  }
}

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

// In-process sliding window rate limit store
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const _rateLimitMap = new Map<string, RateLimitEntry>();

// Clean up expired rate limit entries periodically to prevent memory exhaustion
let _lastPrune = Date.now();
function pruneRateLimitStore(nowSec: number): void {
  if (Date.now() - _lastPrune < 60000) return; // Prune at most once per minute
  _lastPrune = Date.now();
  for (const [key, entry] of _rateLimitMap.entries()) {
    if (nowSec > entry.resetAt) {
      _rateLimitMap.delete(key);
    }
  }
}

/**
 * Check rate limit for a key (e.g. `submit:${ip}`, `login:${ip}`).
 * Returns true if request is within limits, false if exceeded.
 */
export function checkRateLimit(key: string, max = 5, windowSec = 60): boolean {
  const now = Math.floor(Date.now() / 1000);
  pruneRateLimitStore(now);

  const entry = _rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    _rateLimitMap.set(key, { count: 1, resetAt: now + windowSec });
    return true;
  }

  if (entry.count >= max) {
    return false;
  }

  entry.count++;
  return true;
}
