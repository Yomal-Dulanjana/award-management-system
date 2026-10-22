import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { i as verifyCsrfToken, r as hashPassword } from "./auth_Do_B7C9A.mjs";
import { n as initDb, r as admins, t as db } from "./db_DRY7wOyu.mjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
// src/pages/api/admin/signup.ts
var signup_exports = /* @__PURE__ */ __exportAll({ POST: () => POST });
var SignupSchema = z.object({
	name: z.string().trim().min(2, "Full Name must be at least 2 characters.").max(100),
	email: z.string().trim().email("Invalid email address.").toLowerCase(),
	password: z.string().min(8, "Password must be at least 8 characters long.").max(128),
	confirm_password: z.string(),
	secret_key: z.string().min(1, "Admin secret passcode is required."),
	csrf_token: z.string().optional()
}).refine((data) => data.password === data.confirm_password, {
	message: "Passwords do not match.",
	path: ["confirm_password"]
});
var POST = async ({ request }) => {
	const json = (status, body) => new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
	let rawBody = {};
	try {
		if ((request.headers.get("content-type") ?? "").includes("application/json")) rawBody = await request.json();
		else {
			const formData = await request.formData();
			for (const [key, value] of formData.entries()) rawBody[key] = typeof value === "string" ? value : "";
		}
	} catch {
		return json(400, {
			success: false,
			message: "Invalid request payload."
		});
	}
	if (rawBody["csrf_token"] && !verifyCsrfToken(String(rawBody["csrf_token"]))) return json(403, {
		success: false,
		message: "Security token invalid or expired. Please refresh the page."
	});
	const parseResult = SignupSchema.safeParse(rawBody);
	if (!parseResult.success) {
		const firstIssue = parseResult.error.issues[0];
		return json(422, {
			success: false,
			message: firstIssue?.message ?? "Validation failed.",
			field: firstIssue?.path.join(".")
		});
	}
	const { name, email, password, secret_key } = parseResult.data;
	const configuredSecret = process.env["ADMIN_REGISTRATION_SECRET"];
	if (!configuredSecret || secret_key !== configuredSecret) return json(403, {
		success: false,
		message: "Invalid administrative registration secret passcode.",
		field: "secret_key"
	});
	try {
		await initDb();
		if ((await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email)).limit(1)).length > 0) return json(409, {
			success: false,
			message: "An administrator with this email address is already registered.",
			field: "email"
		});
		const passwordHash = await hashPassword(password);
		await db.insert(admins).values({
			id: randomUUID(),
			email,
			password_hash: passwordHash,
			name,
			created_at: /* @__PURE__ */ new Date()
		});
		return json(201, {
			success: true,
			message: "Administrator account registered successfully. Please sign in.",
			redirect: "/admin/login"
		});
	} catch (err) {
		console.error("[Admin Signup Error]", err);
		return json(500, {
			success: false,
			message: "Database error occurred while creating admin account."
		});
	}
};
// \0virtual:astro:page:src/pages/api/admin/signup@_@ts
var page = () => signup_exports;
export { page };
