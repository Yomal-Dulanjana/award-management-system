import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { a as verifyPassword, i as verifyCsrfToken, t as createSessionToken } from "./auth_Do_B7C9A.mjs";
import { n as initDb, r as admins, t as db } from "./db_DRY7wOyu.mjs";
import { eq } from "drizzle-orm";
// src/pages/api/admin/login.ts
var login_exports = /* @__PURE__ */ __exportAll({ POST: () => POST });
var POST = async ({ request, cookies }) => {
	const json = (status, body) => new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
	let email = "";
	let password = "";
	let csrfToken = "";
	try {
		if ((request.headers.get("content-type") ?? "").includes("application/json")) {
			const body = await request.json();
			email = String(body["email"] ?? "").trim().toLowerCase();
			password = String(body["password"] ?? "");
			csrfToken = String(body["csrf_token"] ?? "");
		} else {
			const formData = await request.formData();
			email = String(formData.get("email") ?? "").trim().toLowerCase();
			password = String(formData.get("password") ?? "");
			csrfToken = String(formData.get("csrf_token") ?? "");
		}
	} catch {
		return json(400, {
			success: false,
			message: "Invalid login request body."
		});
	}
	if (!csrfToken || !verifyCsrfToken(csrfToken)) return json(403, {
		success: false,
		message: "Security token invalid or expired. Please refresh the page."
	});
	if (!email || !password) return json(400, {
		success: false,
		message: "Email and password are required."
	});
	try {
		await initDb();
		const admin = (await db.select().from(admins).where(eq(admins.email, email)).limit(1))[0];
		if (!admin) return json(401, {
			success: false,
			message: "Invalid email or password."
		});
		if (!await verifyPassword(password, admin.password_hash)) return json(401, {
			success: false,
			message: "Invalid email or password."
		});
		const token = createSessionToken({
			id: admin.id,
			email: admin.email,
			name: admin.name
		});
		const isHttps = process.env["APP_ENV"] === "production";
		cookies.set("admin_session", token, {
			path: "/",
			httpOnly: true,
			sameSite: "strict",
			secure: isHttps,
			maxAge: 86400
		});
		return json(200, {
			success: true,
			message: "Authentication successful.",
			redirect: "/admin/dashboard"
		});
	} catch (err) {
		console.error("[Admin Login Error]", err);
		return json(500, {
			success: false,
			message: "An internal error occurred during authentication."
		});
	}
};
// \0virtual:astro:page:src/pages/api/admin/login@_@ts
var page = () => login_exports;
export { page };
