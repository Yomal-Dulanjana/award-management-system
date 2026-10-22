// POST /api/admin/update-status — Authenticated status transition endpoint
import type { APIRoute } from 'astro';
import { db, initDb } from '@/db';
import { applications } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken } from '@/lib/auth';
import type { ApplicationStatus } from '@/db/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Authenticate session
  const sessionCookie = cookies.get('admin_session')?.value;
  const session = sessionCookie ? verifySessionToken(sessionCookie) : null;
  if (!session) {
    return json(401, { success: false, message: 'Unauthorized. Session expired or missing.' });
  }

  let reference = '';
  let newStatus = '';

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await request.json() as Record<string, unknown>;
      reference = String(body['reference'] ?? '').trim();
      newStatus = String(body['status'] ?? '').trim();
    } else {
      const formData = await request.formData();
      reference = String(formData.get('reference') ?? '').trim();
      newStatus = String(formData.get('status') ?? '').trim();
    }
  } catch {
    return json(400, { success: false, message: 'Invalid request payload.' });
  }

  const VALID_STATUSES: ApplicationStatus[] = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];
  if (!VALID_STATUSES.includes(newStatus as ApplicationStatus)) {
    return json(400, { success: false, message: `Invalid status "${newStatus}".` });
  }

  try {
    await initDb();

    // Verify application exists
    const existing = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.reference, reference))
      .limit(1);

    if (existing.length === 0) {
      return json(404, { success: false, message: `Application ${reference} not found.` });
    }

    // Update status
    await db
      .update(applications)
      .set({ status: newStatus as ApplicationStatus })
      .where(eq(applications.reference, reference));

    return json(200, {
      success: true,
      message: `Status updated to ${newStatus}.`,
      reference,
      status: newStatus,
    });
  } catch (err) {
    console.error('[Update Status Error]', reference, err);
    return json(500, { success: false, message: 'Database error while updating status.' });
  }
};
