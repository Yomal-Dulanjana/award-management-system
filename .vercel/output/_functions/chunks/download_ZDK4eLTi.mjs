import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { a as verifyDownloadToken } from "./security_CKQhKMlQ.mjs";
import { r as pdfStoragePath } from "./pdf_DnnQoHuQ.mjs";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
// src/pages/api/download.ts
var download_exports = /* @__PURE__ */ __exportAll({ GET: () => GET });
var GET = async ({ url }) => {
	const ref = url.searchParams.get("ref") ?? "";
	const tsStr = url.searchParams.get("ts") ?? "";
	const token = url.searchParams.get("token") ?? "";
	if (!ref || !tsStr || !token) return new Response("Invalid download request: missing parameters.", {
		status: 400,
		headers: { "Content-Type": "text/plain" }
	});
	const ts = parseInt(tsStr, 10);
	if (isNaN(ts) || !verifyDownloadToken(ref, ts, token)) return new Response("Download link has expired or signature is invalid. Please request a new link.", {
		status: 403,
		headers: { "Content-Type": "text/plain" }
	});
	const filePath = pdfStoragePath(ref);
	if (!existsSync(filePath)) return new Response("Application PDF file not found or has been cleaned up.", {
		status: 404,
		headers: { "Content-Type": "text/plain" }
	});
	try {
		const fileBytes = await readFile(filePath);
		return new Response(fileBytes, {
			status: 200,
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${encodeURIComponent(ref)}.pdf"`,
				"Content-Length": fileBytes.length.toString(),
				"Cache-Control": "private, no-cache, no-store, must-revalidate"
			}
		});
	} catch (err) {
		console.error("[Download Read Error]", ref, err);
		return new Response("Failed to read PDF file.", {
			status: 500,
			headers: { "Content-Type": "text/plain" }
		});
	}
};
// \0virtual:astro:page:src/pages/api/download@_@ts
var page = () => download_exports;
export { page };
