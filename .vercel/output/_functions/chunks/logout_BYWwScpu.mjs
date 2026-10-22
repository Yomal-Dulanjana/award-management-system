import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
// src/pages/api/admin/logout.ts
var logout_exports = /* @__PURE__ */ __exportAll({
	GET: () => GET,
	POST: () => POST
});
var POST = async ({ cookies, request }) => {
	cookies.delete("admin_session", { path: "/" });
	if ((request.headers.get("accept") || "").includes("application/json")) return new Response(JSON.stringify({
		success: true,
		redirect: "/"
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Set-Cookie": "admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict"
		}
	});
	return new Response(null, {
		status: 303,
		headers: {
			Location: "/",
			"Set-Cookie": "admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict"
		}
	});
};
var GET = async ({ cookies }) => {
	cookies.delete("admin_session", { path: "/" });
	return new Response(null, {
		status: 302,
		headers: {
			Location: "/",
			"Set-Cookie": "admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Strict"
		}
	});
};
// \0virtual:astro:page:src/pages/api/admin/logout@_@ts
var page = () => logout_exports;
export { page };
