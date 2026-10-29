// DELETE /api/admin/applications/[id] & POST /api/admin/applications/[id]
// Authenticated cascading deletion endpoint for admin dashboard
import type { APIRoute } from 'astro';
import { executeDeleteApplication } from '@/lib/deleteApplication';

export const prerender = false;

export const DELETE: APIRoute = async ({ params, cookies, request }) => {
  let targetId = params.id;

  // Support fallback to request body if param is missing or generic
  if (!targetId || targetId === 'undefined') {
    try {
      const contentType = request.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const body = (await request.json()) as Record<string, unknown>;
        targetId = String(body['id'] ?? body['reference'] ?? '');
      }
    } catch {
      // ignore body parsing error
    }
  }

  const result = await executeDeleteApplication(targetId, cookies);

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  });
};

export const POST: APIRoute = async (context) => {
  return DELETE(context);
};
