// Centralized Base URL resolution helper for development (localhost) and production (Vercel).
// Accurately derives origin from request headers (x-forwarded-host, host, x-forwarded-proto)
// with fallbacks to system environment variables.

/**
 * Resolves the dynamic canonical base URL for the current runtime context.
 * 
 * Precedence:
 * 1. Incoming Request headers: x-forwarded-host / host + x-forwarded-proto
 * 2. Incoming URL instance origin
 * 3. Environment variables: APP_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL
 * 4. Default fallback: http://localhost:4321
 */
export function getBaseUrl(requestOrUrl?: Request | URL): string {
  if (requestOrUrl) {
    // If Web API Request object passed
    if (typeof (requestOrUrl as Request).headers !== 'undefined') {
      const req = requestOrUrl as Request;
      const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host')?.trim();
      if (host) {
        const protoHeader = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
        const proto = protoHeader || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
        return `${proto}://${host}`.replace(/\/+$/, '');
      }
    } 
    // If URL instance passed (e.g. Astro.url)
    else if (typeof (requestOrUrl as URL).origin === 'string') {
      const u = requestOrUrl as URL;
      if (u.origin && u.origin !== 'null') {
        return u.origin.replace(/\/+$/, '');
      }
    }
  }

  // Fallback 1: Custom configured APP_URL in .env
  const appUrl = process.env['APP_URL']?.trim();
  if (appUrl) {
    return appUrl.replace(/\/+$/, '');
  }

  // Fallback 2: Vercel Production Custom Domain / Alias (e.g. my-app.vercel.app)
  if (process.env['VERCEL_PROJECT_PRODUCTION_URL']) {
    return `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL'].replace(/\/+$/, '')}`;
  }

  // Fallback 3: Vercel Deployment-specific URL (e.g. my-app-hash.vercel.app)
  if (process.env['VERCEL_URL']) {
    return `https://${process.env['VERCEL_URL'].replace(/\/+$/, '')}`;
  }

  // Fallback 4: Standard local development URL
  return 'http://localhost:4321';
}
