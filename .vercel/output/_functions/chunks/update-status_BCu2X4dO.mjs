import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { o as verifySessionToken } from "./auth_Do_B7C9A.mjs";
import { a as applications, n as initDb, t as db } from "./db_DRY7wOyu.mjs";
import { eq } from "drizzle-orm";
// src/pages/api/admin/update-status.ts
var update_status_exports = /* @__PURE__ */ __exportAll({ POST: () => POST });
var POST = async ({ request, cookies }) => {
	const json = (status, body) => new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
	const sessionCookie = cookies.get("admin_session")?.value;
	if (!(sessionCookie ? verifySessionToken(sessionCookie) : null)) return json(401, {
		success: false,
		message: "Unauthorized. Session expired or missing."
	});
	let reference = "";
	let newStatus = "";
	try {
		if ((request.headers.get("content-type") ?? "").includes("application/json")) {
			const body = await request.json();
			reference = String(body["reference"] ?? "").trim();
			newStatus = String(body["status"] ?? "").trim();
		} else {
			const formData = await request.formData();
			reference = String(formData.get("reference") ?? "").trim();
			newStatus = String(formData.get("status") ?? "").trim();
		}
	} catch {
		return json(400, {
			success: false,
			message: "Invalid request payload."
		});
	}
	if (![
		"PENDING",
		"UNDER_REVIEW",
		"APPROVED",
		"REJECTED"
	].includes(newStatus)) return json(400, {
		success: false,
		message: `Invalid status "${newStatus}".`
	});
	try {
		await initDb();
		if ((await db.select({ id: applications.id }).from(applications).where(eq(applications.reference, reference)).limit(1)).length === 0) return json(404, {
			success: false,
			message: `Application ${reference} not found.`
		});
		await db.update(applications).set({ status: newStatus }).where(eq(applications.reference, reference));
		return json(200, {
			success: true,
			message: `Status updated to ${newStatus}.`,
			reference,
			status: newStatus
		});
	} catch (err) {
		console.error("[Update Status Error]", reference, err);
		return json(500, {
			success: false,
			message: "Database error while updating status."
		});
	}
};
// \0virtual:astro:page:src/pages/api/admin/update-status@_@ts
var page = () => update_status_exports;
export { page };
