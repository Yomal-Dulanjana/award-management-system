// Cryptographic session management and password hashing for Admin portal.
import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const SESSION_SECRET = process.env['ADMIN_SESSION_SECRET'] ?? 'insecure-default-session-secret-change-me';
const SESSION_TTL_SECONDS = parseInt(process.env['SESSION_LIFETIME'] ?? '86400', 10);

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  exp: number;
  iat: number;
}

// Hash plaintext password with bcrypt
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

// Verify plaintext password against stored bcrypt hash
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Generate HMAC signature for string payload
function signPayload(payload: string): string {
  return createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
}

// Create signed session token for HttpOnly cookie
export function createSessionToken(admin: { id: string; email: string; name: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const session: AdminSession = {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

// Verify signed session token; returns session data or null if invalid/expired
export function verifySessionToken(token: string): AdminSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature) return null;

    const expectedSignature = signPayload(encodedPayload);
    const expectedBuf = Buffer.from(expectedSignature);
    const providedBuf = Buffer.from(providedSignature);

    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    const session = JSON.parse(jsonStr) as AdminSession;

    const now = Math.floor(Date.now() / 1000);
    if (!session.exp || session.exp < now) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

// Generate CSRF token based on current session secret and daily salt
export function generateCsrfToken(): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return createHmac('sha256', SESSION_SECRET).update(`csrf:${day}`).digest('hex');
}

// Validate CSRF token against today or yesterday (grace window for midnight crossover)
export function verifyCsrfToken(token: string): boolean {
  if (!token) return false;
  const today = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const expectedToday = createHmac('sha256', SESSION_SECRET).update(`csrf:${today}`).digest('hex');
  const expectedYest = createHmac('sha256', SESSION_SECRET).update(`csrf:${today - 1}`).digest('hex');

  const tokenBuf = Buffer.from(token);
  const todayBuf = Buffer.from(expectedToday);
  const yestBuf = Buffer.from(expectedYest);

  if (tokenBuf.length === todayBuf.length && timingSafeEqual(tokenBuf, todayBuf)) return true;
  if (tokenBuf.length === yestBuf.length && timingSafeEqual(tokenBuf, yestBuf)) return true;
  return false;
}
