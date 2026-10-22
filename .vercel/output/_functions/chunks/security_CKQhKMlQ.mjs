import { createHmac, randomBytes } from "node:crypto";
// src/lib/security.ts
var DOWNLOAD_SECRET = process.env["DOWNLOAD_SECRET"] ?? "insecure-dev-secret";
var TOKEN_TTL_SECONDS = 3600;
function generateDownloadToken(reference, ts) {
	return createHmac("sha256", DOWNLOAD_SECRET).update(`${reference}:${ts}`).digest("hex");
}
function verifyDownloadToken(reference, ts, token) {
	if (Math.floor(Date.now() / 1e3) - ts > TOKEN_TTL_SECONDS) return false;
	const expected = generateDownloadToken(reference, ts);
	if (expected.length !== token.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
	return diff === 0;
}
function buildDownloadUrl(reference, baseUrl) {
	const ts = Math.floor(Date.now() / 1e3);
	const token = generateDownloadToken(reference, ts);
	return `${baseUrl}/api/download?ref=${encodeURIComponent(reference)}&ts=${ts}&token=${token}`;
}
function sanitizeText(raw) {
	return raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/on\w+\s*=\s*["'][^"']*["']/gi, "").replace(/<[^>]+>/g, "").trim();
}
function secureHex(bytes = 16) {
	return randomBytes(bytes).toString("hex");
}
var _rateLimitMap = /* @__PURE__ */ new Map();
function checkRateLimit(ip, max = 5, windowSec = 3600) {
	const now = Math.floor(Date.now() / 1e3);
	const entry = _rateLimitMap.get(ip);
	if (!entry || now > entry.resetAt) {
		_rateLimitMap.set(ip, {
			count: 1,
			resetAt: now + windowSec
		});
		return true;
	}
	if (entry.count >= max) return false;
	entry.count++;
	return true;
}
export { verifyDownloadToken as a, secureHex as i, checkRateLimit as n, sanitizeText as r, buildDownloadUrl as t };
