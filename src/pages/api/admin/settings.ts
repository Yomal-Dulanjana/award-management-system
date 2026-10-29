// src/pages/api/admin/settings.ts — Admin Notification Settings API
import type { APIRoute } from 'astro';
import { verifySessionToken } from '@/lib/auth';
import { initDb, getSystemSetting, setSystemSetting } from '@/db';

export const prerender = false;

// Email validation helper: supports single email or comma-separated email list
function validateEmails(input: string): { valid: boolean; normalized: string; error?: string } {
  const parts = input.split(',').map(e => e.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { valid: false, normalized: '', error: 'Email address cannot be empty.' };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  for (const email of parts) {
    if (!emailRegex.test(email)) {
      return { valid: false, normalized: '', error: `Invalid email address format: "${email}"` };
    }
  }
  return { valid: true, normalized: parts.join(', ') };
}

// GET /api/admin/settings — Retrieve current notification settings
export const GET: APIRoute = async ({ cookies }) => {
  const sessionCookie = cookies.get('admin_session')?.value;
  const session = sessionCookie ? verifySessionToken(sessionCookie) : null;
  if (!session) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized. Admin session required.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await initDb();
    // DB is the sole source of truth for admin notification email.
    // No .env fallback — configure via Admin Dashboard → Notification Settings.
    const email = await getSystemSetting('admin_notification_email', '');

    return new Response(
      JSON.stringify({
        success: true,
        email,
        admin_notification_email: email,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[API /api/admin/settings GET Error]', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Failed to retrieve notification settings.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// POST /api/admin/settings — Update admin notification settings
export const POST: APIRoute = async ({ request, cookies }) => {
  const sessionCookie = cookies.get('admin_session')?.value;
  const session = sessionCookie ? verifySessionToken(sessionCookie) : null;
  if (!session) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized. Admin session required.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let rawEmail = '';
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      rawEmail = String(body['admin_notification_email'] ?? body['email'] ?? '').trim();
    } else {
      const formData = await request.formData();
      rawEmail = String(formData.get('admin_notification_email') ?? formData.get('email') ?? '').trim();
    }
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'Invalid request body payload.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validation = validateEmails(rawEmail);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, message: validation.error || 'Invalid email address.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await initDb();
    await setSystemSetting('admin_notification_email', validation.normalized);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin notification email updated successfully.',
        email: validation.normalized,
        admin_notification_email: validation.normalized,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[API /api/admin/settings POST Error]', err);
    return new Response(
      JSON.stringify({ success: false, message: 'Database error updating settings.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

// Support PUT as alias for POST
export const PUT: APIRoute = async (context) => {
  return POST(context);
};
