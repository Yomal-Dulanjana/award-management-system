// src/middleware.ts — Route guard middleware & Essential HTTP Security Headers injection
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  const pathname = url.pathname;

  // 1. Guard HTML admin pages under /admin/* (except public login and registration)
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/admin/signup') {
    const sessionCookie = cookies.get('admin_session')?.value;
    const session = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!session) {
      return redirect('/admin/login');
    }

    context.locals.admin = session;
  }

  // 2. Guard JSON/streaming admin API endpoints under /api/admin/* (except public login, registration, and logout)
  if (
    pathname.startsWith('/api/admin') &&
    pathname !== '/api/admin/login' &&
    pathname !== '/api/admin/signup' &&
    pathname !== '/api/admin/logout'
  ) {
    const sessionCookie = cookies.get('admin_session')?.value;
    const session = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!session) {
      return new Response(JSON.stringify({ success: false, message: 'Unauthorized: Valid admin session required.' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      });
    }

    context.locals.admin = session;
  }

  // Process request and retrieve downstream response
  const response = await next();

  // 3. Inject Essential HTTP Security Headers across all responses
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content-Security-Policy: restrict frame ancestors, object tags, allow self resources & Google Fonts
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  return response;
});
