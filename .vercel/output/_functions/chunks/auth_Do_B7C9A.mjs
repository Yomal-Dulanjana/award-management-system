import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
// src/lib/auth.ts
var SESSION_SECRET = process.env["ADMIN_SESSION_SECRET"] ?? "insecure-default-session-secret-change-me";
var SESSION_TTL_SECONDS = parseInt(process.env["SESSION_LIFETIME"] ?? "86400", 10);
async function hashPassword(plain) {
	return bcrypt.hash(plain, 10);
}
async function verifyPassword(plain, hash) {
	return bcrypt.compare(plain, hash);
}
function signPayload(payload) {
	return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}
function createSessionToken(admin) {
	const now = Math.floor(Date.now() / 1e3);
	const session = {
		adminId: admin.id,
		email: admin.email,
		name: admin.name,
		iat: now,
		exp: now + SESSION_TTL_SECONDS
	};
	const encodedPayload = Buffer.from(JSON.stringify(session)).toString("base64url");
	return `${encodedPayload}.${signPayload(encodedPayload)}`;
}
function verifySessionToken(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 2) return null;
		const [encodedPayload, providedSignature] = parts;
		if (!encodedPayload || !providedSignature) return null;
		const expectedSignature = signPayload(encodedPayload);
		const expectedBuf = Buffer.from(expectedSignature);
		const providedBuf = Buffer.from(providedSignature);
		if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) return null;
		const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf-8");
		const session = JSON.parse(jsonStr);
		const now = Math.floor(Date.now() / 1e3);
		if (!session.exp || session.exp < now) return null;
		return session;
	} catch {
		return null;
	}
}
function generateCsrfToken() {
	const day = Math.floor(Date.now() / 864e5);
	return createHmac("sha256", SESSION_SECRET).update(`csrf:${day}`).digest("hex");
}
function verifyCsrfToken(token) {
	if (!token) return false;
	const today = Math.floor(Date.now() / 864e5);
	const expectedToday = createHmac("sha256", SESSION_SECRET).update(`csrf:${today}`).digest("hex");
	const expectedYest = createHmac("sha256", SESSION_SECRET).update(`csrf:${today - 1}`).digest("hex");
	const tokenBuf = Buffer.from(token);
	const todayBuf = Buffer.from(expectedToday);
	const yestBuf = Buffer.from(expectedYest);
	if (tokenBuf.length === todayBuf.length && timingSafeEqual(tokenBuf, todayBuf)) return true;
	if (tokenBuf.length === yestBuf.length && timingSafeEqual(tokenBuf, yestBuf)) return true;
	return false;
}
export { verifyPassword as a, verifyCsrfToken as i, generateCsrfToken as n, verifySessionToken as o, hashPassword as r, createSessionToken as t };
