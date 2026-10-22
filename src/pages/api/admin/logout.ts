// POST & GET /api/admin/logout — Clears admin session cookie and redirects to home page ('/')
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  cookies.delete('admin_session', { path: '/' });

  // If invoked via client-side AJAX/fetch with JSON accept header
  const accept = request.headers.get('accept') || '';
  if (accept.includes('application/json')) {
    return new Response(JSON.stringify({ success: true, redirect: '/' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict',
      },
    });
  }

  // Standard browser form POST: HTTP 303 See Other redirecting directly to home page ('/')
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict',
    },
  });
};

export const GET: APIRoute = async ({ cookies }) => {
  cookies.delete('admin_session', { path: '/' });
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': 'admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict',
    },
  });
};

