import { t as sequence, wt as defineMiddleware } from "./chunks/sequence_DdyAz2mZ.mjs";
import { o as verifySessionToken } from "./chunks/auth_Do_B7C9A.mjs";
// src/middleware.ts
var onRequest$1 = defineMiddleware(async (context, next) => {
	const { url, cookies, redirect } = context;
	const pathname = url.pathname;
	if (pathname.startsWith("/admin") && pathname !== "/admin/login" && pathname !== "/admin/signup") {
		const sessionCookie = cookies.get("admin_session")?.value;
		const session = sessionCookie ? verifySessionToken(sessionCookie) : null;
		if (!session) return redirect("/admin/login");
		context.locals.admin = session;
	}
	return next();
});
// \0virtual:astro:middleware
var onRequest = sequence(onRequest$1);
export { onRequest };
