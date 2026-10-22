import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { o as verifySessionToken } from "./auth_Do_B7C9A.mjs";
import { a as applications, i as applicationAttachments, n as initDb, t as db } from "./db_DRY7wOyu.mjs";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import JSZip from "jszip";
// src/pages/api/admin/download-file.ts
var download_file_exports = /* @__PURE__ */ __exportAll({ GET: () => GET });
var GET = async ({ request, cookies }) => {
	const sessionCookie = cookies.get("admin_session")?.value;
	if (!(sessionCookie ? verifySessionToken(sessionCookie) : null)) return new Response("Unauthorized: Active admin session required.", { status: 401 });
	const url = new URL(request.url);
	const ref = url.searchParams.get("ref")?.trim() ?? "";
	const fileIdParam = url.searchParams.get("fileId")?.trim();
	const typeParam = url.searchParams.get("type")?.trim().toLowerCase();
	if (!ref) return new Response("Bad Request: Application reference is required.", { status: 400 });
	if (ref.includes("..") || ref.includes("/") || ref.includes("\\")) return new Response("Bad Request: Invalid reference format.", { status: 400 });
	await initDb();
	const app = (await db.select().from(applications).where(eq(applications.reference, ref)).limit(1))[0];
	if (!app) return new Response("Not Found: Application not found.", { status: 404 });
	const storageRoot = path.resolve(process.cwd(), "storage");
	if (typeParam === "pdf") {
		let pdfPath = app.pdf_path;
		if (!pdfPath || !pdfPath.endsWith(".pdf")) pdfPath = path.join(storageRoot, "temp", `${ref}.pdf`);
		const resolvedPdf = path.resolve(pdfPath);
		if (!resolvedPdf.startsWith(storageRoot)) return new Response("Forbidden: Path traversal detected.", { status: 403 });
		try {
			const stats = await fs.stat(resolvedPdf);
			const pdfBuffer = await fs.readFile(resolvedPdf);
			return new Response(new Uint8Array(pdfBuffer), {
				status: 200,
				headers: {
					"Content-Type": "application/pdf",
					"Content-Disposition": `inline; filename="${ref}.pdf"`,
					"Content-Length": String(stats.size),
					"Cache-Control": "private, no-cache"
				}
			});
		} catch {
			return new Response("Not Found: Compiled application PDF file does not exist on disk.", { status: 404 });
		}
	}
	if (typeParam === "zip") {
		const attachments = await db.select().from(applicationAttachments).where(eq(applicationAttachments.application_id, app.id));
		const zip = new JSZip();
		try {
			const resolvedPdf = path.resolve(app.pdf_path);
			if (resolvedPdf.startsWith(storageRoot)) {
				const pdfData = await fs.readFile(resolvedPdf);
				zip.file(`${ref}_Official_Application.pdf`, pdfData);
			}
		} catch {}
		let addedCount = 0;
		for (const att of attachments) try {
			const resolvedPath = path.resolve(att.file_path);
			if (resolvedPath.startsWith(storageRoot)) {
				const fileData = await fs.readFile(resolvedPath);
				zip.file(`evidence/${att.original_filename}`, fileData);
				addedCount++;
			}
		} catch (e) {
			console.warn(`[ZIP Packaging] Could not read ${att.file_path}:`, e);
		}
		if (addedCount === 0 && !zip.file(`${ref}_Official_Application.pdf`)) return new Response("Not Found: No evidence files available to bundle.", { status: 404 });
		const zipBuffer = await zip.generateAsync({
			type: "nodebuffer",
			compression: "DEFLATE",
			compressionOptions: { level: 6 }
		});
		return new Response(new Uint8Array(zipBuffer), {
			status: 200,
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${ref}_evidence_bundle.zip"`,
				"Content-Length": String(zipBuffer.length),
				"Cache-Control": "private, no-cache"
			}
		});
	}
	if (fileIdParam) {
		const fileId = parseInt(fileIdParam, 10);
		if (isNaN(fileId)) return new Response("Bad Request: Invalid fileId.", { status: 400 });
		const att = (await db.select().from(applicationAttachments).where(and(eq(applicationAttachments.id, fileId), eq(applicationAttachments.application_id, app.id))).limit(1))[0];
		if (!att) return new Response("Not Found: Attachment not associated with this application.", { status: 404 });
		const resolvedFilePath = path.resolve(att.file_path);
		if (!resolvedFilePath.startsWith(storageRoot)) return new Response("Forbidden: Path traversal detected.", { status: 403 });
		try {
			const stats = await fs.stat(resolvedFilePath);
			const fileBuffer = await fs.readFile(resolvedFilePath);
			return new Response(new Uint8Array(fileBuffer), {
				status: 200,
				headers: {
					"Content-Type": att.mime_type || "application/octet-stream",
					"Content-Disposition": `attachment; filename="${encodeURIComponent(att.original_filename)}"`,
					"Content-Length": String(stats.size),
					"Cache-Control": "private, no-cache"
				}
			});
		} catch {
			return new Response("Not Found: Stored evidence file missing from storage volume.", { status: 404 });
		}
	}
	return new Response("Bad Request: Specify ?type=pdf, ?type=zip, or ?fileId=...", { status: 400 });
};
// \0virtual:astro:page:src/pages/api/admin/download-file@_@ts
var page = () => download_file_exports;
export { page };
