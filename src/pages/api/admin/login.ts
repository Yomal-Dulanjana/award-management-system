// POST /api/admin/login — Administrator authentication endpoint
import type { APIRoute } from 'astro';
import { db, initDb } from '@/db';
import { admins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, createSessionToken, verifyCsrfToken } from '@/lib/auth';
import { getClientIp, checkRateLimit } from '@/lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Rate limiting against brute-force attacks (10 attempts per minute per IP)
  const ip = getClientIp(request);
  if (!checkRateLimit(`admin_login:${ip}`, 10, 60)) {
    return json(429, {
      success: false,
      message: 'Too many login attempts. For security reasons, please wait a minute before retrying.',
    });
  }

  let email = '';
  let password = '';
  let csrfToken = '';

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await request.json() as Record<string, unknown>;
      email = String(body['email'] ?? '').trim().toLowerCase();
      password = String(body['password'] ?? '');
      csrfToken = String(body['csrf_token'] ?? '');
    } else {
      const formData = await request.formData();
      email = String(formData.get('email') ?? '').trim().toLowerCase();
      password = String(formData.get('password') ?? '');
      csrfToken = String(formData.get('csrf_token') ?? '');
    }
  } catch {
    return json(400, { success: false, message: 'Invalid login request body.' });
  }

  // Validate CSRF token
  if (!csrfToken || !verifyCsrfToken(csrfToken)) {
    return json(403, { success: false, message: 'Security token invalid or expired. Please refresh the page.' });
  }

  if (!email || !password) {
    return json(400, { success: false, message: 'Email and password are required.' });
  }

  try {
    await initDb();

    // Find admin by email
    const results = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
    const admin = results[0];

    if (!admin) {
      return json(401, { success: false, message: 'Invalid email or password.' });
    }

    // Verify bcrypt hash
    const isValid = await verifyPassword(password, admin.password_hash);
    if (!isValid) {
      return json(401, { success: false, message: 'Invalid email or password.' });
    }

    // Issue signed session token
    const token = createSessionToken({
      id: admin.id,
      email: admin.email,
      name: admin.name,
    });

    // Enforce secure HttpOnly session cookie
    const isHttps = process.env['APP_ENV'] === 'production';
    cookies.set('admin_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: isHttps,
      maxAge: 86400, // 24 hours
    });

    return json(200, {
      success: true,
      message: 'Authentication successful.',
      redirect: '/admin/dashboard',
    });
  } catch (err) {
    console.error('[Admin Login Error]', err);
    return json(500, { success: false, message: 'An internal error occurred during authentication.' });
  }
};
