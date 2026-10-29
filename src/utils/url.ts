// Base URL resolution for local and production runtimes

export function getBaseUrl(requestOrUrl?: Request | URL): string {
  if (requestOrUrl) {
    if (typeof (requestOrUrl as Request).headers !== 'undefined') {
      const req = requestOrUrl as Request;
      const host = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host')?.trim();
      if (host) {
        const protoHeader = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
        const proto = protoHeader || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
        return `${proto}://${host}`.replace(/\/+$/, '');
      }
    } else if (typeof (requestOrUrl as URL).origin === 'string') {
      const u = requestOrUrl as URL;
      if (u.origin && u.origin !== 'null') {
        return u.origin.replace(/\/+$/, '');
      }
    }
  }

  // Fallbacks: .env APP_URL -> Vercel env -> localhost
  const appUrl = process.env['APP_URL']?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, '');

  if (process.env['VERCEL_PROJECT_PRODUCTION_URL']) {
    return `https://${process.env['VERCEL_PROJECT_PRODUCTION_URL'].replace(/\/+$/, '')}`;
  }
  if (process.env['VERCEL_URL']) {
    return `https://${process.env['VERCEL_URL'].replace(/\/+$/, '')}`;
  }

  return 'http://localhost:4321';
}
