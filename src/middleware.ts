// Route guard middleware protecting all /admin/* endpoints except /admin/login.
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  const pathname = url.pathname;

  // Intercept all routes under /admin/* except the public login and signup pages
  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/admin/signup') {
    const sessionCookie = cookies.get('admin_session')?.value;
    const session = sessionCookie ? verifySessionToken(sessionCookie) : null;

    if (!session) {
      // Unauthenticated access — redirect to admin login
      return redirect('/admin/login');
    }

    // Attach validated admin context to locals
    context.locals.admin = session;
  }

  return next();
});
