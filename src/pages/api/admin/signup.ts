// POST /api/admin/signup — Secure Administrator Registration Endpoint
import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db, initDb } from '@/db';
import { admins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyCsrfToken } from '@/lib/auth';
import { getClientIp, checkRateLimit } from '@/lib/security';

export const prerender = false;

const SignupSchema = z.object({
  name: z.string().trim().min(2, 'Full Name must be at least 2 characters.').max(100),
  email: z.string().trim().email('Invalid email address.').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters long.').max(128),
  confirm_password: z.string(),
  secret_key: z.string().min(1, 'Admin secret passcode is required.'),
  csrf_token: z.string().optional(),
}).refine(data => data.password === data.confirm_password, {
  message: 'Passwords do not match.',
  path: ['confirm_password'],
});

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Rate limiting against registration endpoint abuse
  const ip = getClientIp(request);
  const isDev = process.env['APP_ENV'] === 'development';
  const maxSignups = isDev ? 50 : 10;
  if (!checkRateLimit(`admin_signup:${ip}`, maxSignups, 60)) {
    return json(429, {
      success: false,
      message: 'Too many registration requests. Please wait a minute before retrying.',
    });
  }

  let rawBody: Record<string, unknown> = {};

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      rawBody = await request.json() as Record<string, unknown>;
    } else {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        rawBody[key] = typeof value === 'string' ? value : '';
      }
    }
  } catch {
    return json(400, { success: false, message: 'Invalid request payload.' });
  }

  // Validate CSRF token if present
  if (rawBody['csrf_token'] && !verifyCsrfToken(String(rawBody['csrf_token']))) {
    return json(403, { success: false, message: 'Security token invalid or expired. Please refresh the page.' });
  }

  // Validate with Zod
  const parseResult = SignupSchema.safeParse(rawBody);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return json(422, {
      success: false,
      message: firstIssue?.message ?? 'Validation failed.',
      field: firstIssue?.path.join('.'),
    });
  }

  const { name, email, password, secret_key } = parseResult.data;

  // Enforce server-side registration secret check
  const configuredSecret = process.env['ADMIN_REGISTRATION_SECRET'];
  if (!configuredSecret || secret_key !== configuredSecret) {
    return json(403, {
      success: false,
      message: 'Invalid administrative registration secret passcode.',
      field: 'secret_key',
    });
  }

  try {
    await initDb();

    // Check if admin already exists with this email
    const existing = await db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.email, email))
      .limit(1);

    if (existing.length > 0) {
      return json(409, {
        success: false,
        message: 'An administrator with this email address is already registered.',
        field: 'email',
      });
    }

    // Securely hash password
    const passwordHash = await hashPassword(password);

    // Insert new administrator
    await db.insert(admins).values({
      id: randomUUID(),
      email,
      password_hash: passwordHash,
      name,
      created_at: new Date(),
    });

    return json(201, {
      success: true,
      message: 'Administrator account registered successfully. Please sign in.',
      redirect: '/admin/login',
    });
  } catch (err) {
    console.error('[Admin Signup Error]', err);
    return json(500, {
      success: false,
      message: 'Database error occurred while creating admin account.',
    });
  }
};
