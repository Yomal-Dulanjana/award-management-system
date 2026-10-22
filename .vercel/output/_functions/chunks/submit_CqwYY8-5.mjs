import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { a as applications, i as applicationAttachments, n as initDb, t as db } from "./db_DRY7wOyu.mjs";
import { i as secureHex, n as checkRateLimit, r as sanitizeText, t as buildDownloadUrl } from "./security_CKQhKMlQ.mjs";
import { n as generatePdf, t as gcTempStorage } from "./pdf_DnnQoHuQ.mjs";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import nodemailer from "nodemailer";
// src/lib/validation.ts
var NATURE_OPTIONS = [
	"Manufacturing",
	"Services",
	"Trading",
	"Mixed"
];
var GROSS_OPTIONS = [
	"Improved by more than 5%",
	"Improved by 3% to less than 5%",
	"Improved by 1% to less than 3%",
	"Improved by less than 1%",
	"Declined compared to last year"
];
var ProductRowSchema = z.object({
	name: z.string().min(1, "Product name is required").max(300),
	description: z.string().min(1, "Description is required").max(2e3)
});
var RevenueRowSchema = z.object({
	activity: z.string().min(1, "Business activity is required").max(300),
	revenue: z.number({ invalid_type_error: "Revenue must be a number" }).nonnegative()
});
var ApplicationSchema = z.object({
	company_name: z.string().min(2, "Company name is required").max(300),
	financial_year: z.string().min(1).max(20),
	nature_operations: z.enum(NATURE_OPTIONS, { errorMap: () => ({ message: "Invalid nature of operations." }) }),
	contact_name_designation: z.string().min(2, "Contact name & designation is required").max(300),
	contact_email: z.string().email("Invalid email address"),
	contact_phone: z.string().min(5, "Telephone is required").max(30),
	new_products_services: z.literal(true, { errorMap: () => ({ message: "New products/services must be confirmed." }) }),
	new_market_entered: z.literal(true, { errorMap: () => ({ message: "New market entered must be confirmed." }) }),
	new_market_details: z.string().max(3e3).optional(),
	products: z.array(ProductRowSchema).min(1, "At least one product or service is required"),
	total_company_revenue: z.number({ invalid_type_error: "Revenue must be a number" }).positive("Total company revenue must be greater than zero"),
	revenue: z.array(RevenueRowSchema).min(1, "At least one revenue activity is required"),
	gross_profit_margin_option: z.enum(GROSS_OPTIONS, { errorMap: () => ({ message: "Invalid gross profit margin option." }) }),
	total_investment: z.number({ invalid_type_error: "Investment must be a number" }).nonnegative(),
	operating_profit: z.number({ invalid_type_error: "Operating profit must be a number" }).nonnegative(),
	declaration_name: z.string().min(2, "Declaration name is required").max(200),
	declaration_designation: z.string().min(1, "Designation is required").max(200),
	declaration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
	declaration_confirmed: z.literal(true, { errorMap: () => ({ message: "Please confirm the declaration before submitting." }) }),
	signature_data: z.string().min(100, "Signature is required").regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Invalid signature format").refine((v) => v.length <= 28e5, "Signature payload exceeds 2 MB limit")
});
// src/lib/calculations.ts
function recalculate(params) {
	const { totalCompanyRevenue, revenueRows, totalInvestment, operatingProfit } = params;
	let diversificationTotal = 0;
	const rows = revenueRows.map((r) => {
		diversificationTotal += r.revenue;
		const percent = totalCompanyRevenue > 0 ? Math.round(r.revenue / totalCompanyRevenue * 1e4) / 100 : 0;
		return {
			activity: r.activity,
			revenue: r.revenue,
			percent
		};
	});
	const combinedPercent = totalCompanyRevenue > 0 ? Math.round(diversificationTotal / totalCompanyRevenue * 1e4) / 100 : 0;
	const roi = totalInvestment > 0 ? Math.round(operatingProfit / totalInvestment * 1e4) / 100 : 0;
	const payback = operatingProfit > 0 ? Math.round(totalInvestment / operatingProfit * 100) / 100 : null;
	return {
		revenueRows: rows,
		diversificationTotal,
		combinedPercent,
		roi,
		payback
	};
}
function generateReference() {
	const year = (/* @__PURE__ */ new Date()).getFullYear();
	const buf = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(4));
	return `BDC-${year}-${Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
// src/lib/mailer.ts
function createTransport() {
	const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
	const encryption = (process.env["SMTP_ENCRYPTION"] ?? "tls").toLowerCase();
	const secure = encryption === "ssl" || port === 465;
	return nodemailer.createTransport({
		host: process.env["SMTP_HOST"] ?? "localhost",
		port,
		secure,
		requireTLS: !secure && (encryption === "tls" || port === 587),
		auth: process.env["SMTP_AUTH"] !== "false" ? {
			user: process.env["SMTP_USER"] ?? "",
			pass: (process.env["SMTP_PASS"] ?? "").replace(/^["']|["']$/g, "")
		} : void 0,
		tls: { rejectUnauthorized: process.env["SMTP_ALLOW_SELF_SIGNED"] === "true" ? false : true }
	});
}
function fmt(n) {
	return "Rs. " + n.toLocaleString("en-LK", { minimumFractionDigits: 2 });
}
function htmlWrap(body) {
	return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px}
  .card{background:#fff;border-radius:12px;max-width:620px;margin:0 auto;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#0b2043;color:#fff;padding:28px 32px;border-bottom:4px solid #d97706}
  .header h1{margin:0;font-size:20px;font-weight:800;letter-spacing:.5px}
  .header p{margin:6px 0 0;font-size:13px;color:#93c5fd}
  .body{padding:28px 32px}
  .badge{display:inline-block;background:#f7f2e5;border:1.5px solid #e8d59a;color:#0b2043;font-family:monospace;font-size:16px;font-weight:700;padding:10px 20px;border-radius:8px;letter-spacing:.15em;margin:12px 0}
  .kv{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
  .kv td{padding:8px 12px;border:1px solid #e2e8f0}
  .kv td:first-child{background:#f8fafc;color:#475569;font-weight:600;width:45%;text-transform:uppercase;font-size:12px;letter-spacing:.3px}
  .btn, a.btn, a.btn:link, a.btn:visited {
    display: inline-block;
    background-color: #1d4ed8 !important;
    color: #ffffff !important;
    padding: 12px 28px;
    border-radius: 8px;
    text-decoration: none !important;
    font-weight: 700;
    font-size: 15px;
    margin-top: 16px;
    border: 1px solid #1d4ed8;
  }
  .footer{padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
</style></head>
<body><div class="card">${body}</div></body></html>`;
}
async function sendApplicantConfirmation(bundle, pdfAttachment) {
	const transport = createTransport();
	const appName = process.env["APP_NAME"] ?? "Best Diversified Company Award";
	const fromName = process.env["MAIL_FROM_NAME"] ?? appName;
	const fromAddr = process.env["MAIL_FROM_ADDRESS"] ?? "no-reply@example.com";
	const body = `
    <div class="header">
      <h1>Application Received</h1>
      <p>${appName} • Financial Year 2025/26</p>
    </div>
    <div class="body">
      <p>Dear <strong>${bundle.contactName}</strong>,</p>
      <p>Thank you for submitting your application for the <strong>${appName}</strong>. We have received your application and it is currently under review.</p>
      <p>Your reference number:</p>
      <div class="badge">${bundle.reference}</div>
      <p>Please retain this reference number for all future correspondence regarding your application.</p>
      <table class="kv">
        <tr><td>Company</td><td>${bundle.companyName}</td></tr>
        <tr><td>Financial Year</td><td>${bundle.financialYear}</td></tr>
        <tr><td>Diversification Revenue</td><td>${fmt(bundle.diversificationTotal)} (${bundle.combinedPercent}% of total)</td></tr>
        <tr><td>ROI</td><td>${bundle.roi}%</td></tr>
        ${bundle.payback !== null ? `<tr><td>Payback Period</td><td>${bundle.payback} Years</td></tr>` : ""}
      </table>
      <p>A copy of your completed application is attached as a PDF for your records.</p>
      <p style="margin-top:20px;">
        <a class="btn" href="${bundle.downloadUrl}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff !important;text-decoration:none !important;padding:12px 28px;border-radius:8px;font-weight:700;font-size:15px;border:1px solid #1d4ed8;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:15px;">Download Application PDF</span>
        </a>
      </p>
    </div>
    <div class="footer">CONFIDENTIAL • ${appName} 2025/26 • This email was sent to ${bundle.contactEmail}</div>`;
	const attachment = Buffer.isBuffer(pdfAttachment) ? {
		filename: `${bundle.reference}.pdf`,
		content: pdfAttachment
	} : {
		filename: `${bundle.reference}.pdf`,
		path: pdfAttachment
	};
	const mailOptions = {
		from: `${fromName} <${fromAddr}>`,
		to: bundle.contactEmail,
		subject: `Application Received – ${bundle.reference} | ${appName}`,
		html: htmlWrap(body),
		text: `Application ${bundle.reference} received. Company: ${bundle.companyName}. Download: ${bundle.downloadUrl}`,
		attachments: [attachment]
	};
	await transport.sendMail(mailOptions);
}
async function sendAdminNotification(bundle, pdfAttachment, evidenceFiles = []) {
	const adminEmails = (process.env["ADMIN_EMAIL"] ?? "").split(",").map((e) => e.trim()).filter(Boolean);
	if (adminEmails.length === 0) return;
	const transport = createTransport();
	const appName = process.env["APP_NAME"] ?? "Best Diversified Company Award";
	const fromName = process.env["MAIL_FROM_NAME"] ?? appName;
	const fromAddr = process.env["MAIL_FROM_ADDRESS"] ?? "no-reply@example.com";
	const adminDetailUrl = `${process.env["APP_URL"] ?? "http://localhost:4321"}/admin/applications/${bundle.reference}`;
	let pdfSizeBytes = 0;
	if (Buffer.isBuffer(pdfAttachment)) pdfSizeBytes = pdfAttachment.length;
	else try {
		pdfSizeBytes = (await (await import("node:fs/promises")).stat(pdfAttachment)).size;
	} catch {
		pdfSizeBytes = 204800;
	}
	const evidenceSizeBytes = evidenceFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
	const totalPayloadBytes = pdfSizeBytes + evidenceSizeBytes;
	const exceedsThreshold = totalPayloadBytes > 20971520;
	const attachments = [Buffer.isBuffer(pdfAttachment) ? {
		filename: `${bundle.reference}.pdf`,
		content: pdfAttachment
	} : {
		filename: `${bundle.reference}.pdf`,
		path: pdfAttachment
	}];
	if (!exceedsThreshold && evidenceFiles.length > 0) for (const f of evidenceFiles) attachments.push({
		filename: f.originalName,
		path: f.filePath,
		contentType: f.mimeType
	});
	const largeAttachmentNotice = exceedsThreshold && evidenceFiles.length > 0 ? `
      <div style="background:#fffbeb;border:1px solid #fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:6px;margin:18px 0;font-size:13px;color:#92400e;">
        <strong style="display:block;font-size:14px;margin-bottom:6px;">⚠️ Large Evidence Attachments Notice</strong>
        Total submission files (${(totalPayloadBytes / 1048576).toFixed(1)} MB) exceed the 20MB email dispatch limit.
        The compiled PDF application is attached below. Access all candidate evidence files directly in the Admin Dashboard:
        <ul style="margin:8px 0 0;padding-left:20px;">
          ${evidenceFiles.map((f) => `<li><a href="${adminDetailUrl}" style="color:#1d4ed8;font-weight:600;text-decoration:underline;">${f.originalName}</a> (${(f.sizeBytes / 1048576).toFixed(2)} MB)</li>`).join("")}
        </ul>
      </div>` : evidenceFiles.length > 0 ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #10b981;padding:12px 16px;border-radius:6px;margin:16px 0;font-size:13px;color:#166534;">
        <strong>Attached Evidence:</strong> ${evidenceFiles.length} file(s) attached directly to this notification.
      </div>` : "";
	const body = `
    <div class="header">
      <h1>New Application Received</h1>
      <p>${appName} • Admin Notification</p>
    </div>
    <div class="body">
      <p>A new award application has been submitted:</p>
      <div class="badge">${bundle.reference}</div>
      <table class="kv">
        <tr><td>Company</td><td><strong>${bundle.companyName}</strong></td></tr>
        <tr><td>Contact</td><td>${bundle.contactName}</td></tr>
        <tr><td>Email</td><td>${bundle.contactEmail}</td></tr>
        <tr><td>Financial Year</td><td>${bundle.financialYear}</td></tr>
        <tr><td>Diversification Revenue</td><td>${fmt(bundle.diversificationTotal)}</td></tr>
        <tr><td>Combined %</td><td>${bundle.combinedPercent}%</td></tr>
        <tr><td>ROI</td><td>${bundle.roi}%</td></tr>
        ${bundle.payback !== null ? `<tr><td>Payback</td><td>${bundle.payback} Years</td></tr>` : ""}
      </table>
      ${largeAttachmentNotice}
      <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
        <a class="btn" href="${adminDetailUrl}" style="display:inline-block;background-color:#0b2043;color:#ffffff !important;text-decoration:none !important;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;border:1px solid #0b2043;margin-right:10px;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:14px;">Open in Admin Portal</span>
        </a>
        <a class="btn" href="${bundle.downloadUrl}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff !important;text-decoration:none !important;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;border:1px solid #1d4ed8;">
          <span style="color:#ffffff !important;text-decoration:none !important;font-weight:700;font-size:14px;">Download Application PDF</span>
        </a>
      </div>
    </div>
    <div class="footer">CONFIDENTIAL • ${appName} Admin Alert</div>`;
	await transport.sendMail({
		from: `${fromName} <${fromAddr}>`,
		to: adminEmails.join(", "),
		subject: `[Admin] New Application – ${bundle.reference} | ${bundle.companyName}`,
		html: htmlWrap(body),
		text: `New application ${bundle.reference} from ${bundle.companyName}. Admin Portal: ${adminDetailUrl}. Download PDF: ${bundle.downloadUrl}`,
		attachments
	});
}
// src/pages/api/submit.ts
var submit_exports = /* @__PURE__ */ __exportAll({ POST: () => POST });
var POST = async ({ request }) => {
	const json = (status, body) => new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" }
	});
	const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "0.0.0.0";
	const maxSubmissions = process.env["APP_ENV"] === "development" ? 100 : 5;
	if (!checkRateLimit(ip, maxSubmissions, 3600)) return json(429, {
		success: false,
		message: "Too many submissions. Please wait and try again later."
	});
	let rawData;
	let rawEvidenceFiles = [];
	try {
		if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
			const formData = await request.formData();
			rawData = {};
			for (const [key, value] of formData.entries()) if (value instanceof File) {
				if (key === "evidence_files[]" || key === "evidence_files") rawEvidenceFiles.push(value);
			} else {
				const v = value;
				const arrMatch = key.match(/^(\w+)\[(\d+)\]\[(\w+)\]$/);
				if (arrMatch) {
					const [, field, idx, prop] = arrMatch;
					if (!rawData[field]) rawData[field] = [];
					const arr = rawData[field];
					const i = parseInt(idx, 10);
					if (!arr[i]) arr[i] = {};
					arr[i][prop] = v;
				} else rawData[key] = v;
			}
		} else rawData = await request.json();
	} catch {
		return json(400, {
			success: false,
			message: "Invalid request body."
		});
	}
	if (rawData["website_url"] && String(rawData["website_url"]).trim() !== "") return json(200, {
		success: true,
		redirect: "/success"
	});
	const evidenceFiles = rawEvidenceFiles.filter((f) => f.size > 0 && f.name.trim() !== "");
	const ALLOWED_MIME_TYPES = /* @__PURE__ */ new Set([
		"application/pdf",
		"image/jpeg",
		"image/png"
	]);
	const MAX_FILE_SIZE = 5242880;
	if (evidenceFiles.length > 5) return json(422, {
		success: false,
		message: "A maximum of 5 evidence files are allowed."
	});
	for (const file of evidenceFiles) {
		const ext = path.extname(file.name).toLowerCase();
		const mime = file.type.toLowerCase();
		if (!(ALLOWED_MIME_TYPES.has(mime) || mime === "application/octet-stream" && (ext === ".pdf" || ext === ".jpg" || ext === ".jpeg" || ext === ".png"))) return json(422, {
			success: false,
			message: `Invalid file type for "${file.name}". Only PDF, JPEG, and PNG files are allowed.`
		});
		if (file.size > MAX_FILE_SIZE) return json(422, {
			success: false,
			message: `File "${file.name}" exceeds the maximum 5MB size limit.`
		});
	}
	const coerce = (raw) => {
		if (typeof raw === "string") {
			const n = parseFloat(raw.replace(/,/g, ""));
			return isNaN(n) ? raw : n;
		}
		return raw;
	};
	const products = Array.isArray(rawData["products"]) ? rawData["products"].filter((p) => p["name"] || p["description"]) : [];
	const revenue = Array.isArray(rawData["revenue"]) ? rawData["revenue"].filter((r) => r["activity"] || r["revenue"]) : [];
	const parseInput = {
		...rawData,
		company_name: sanitizeText(String(rawData["company_name"] ?? "")),
		financial_year: sanitizeText(String(rawData["financial_year"] ?? "2025/26")),
		nature_operations: sanitizeText(String(rawData["nature_operations"] ?? "")),
		contact_name_designation: sanitizeText(String(rawData["contact_name_designation"] ?? "")),
		contact_email: String(rawData["contact_email"] ?? "").trim().toLowerCase(),
		contact_phone: sanitizeText(String(rawData["contact_phone"] ?? "")),
		new_products_services: rawData["new_products_services"] === true || rawData["new_products_services"] === "true" || rawData["new_products_services"] === "1",
		new_market_entered: rawData["new_market_entered"] === true || rawData["new_market_entered"] === "true" || rawData["new_market_entered"] === "1",
		new_market_details: sanitizeText(String(rawData["new_market_details"] ?? "")),
		products: products.map((p) => ({
			name: sanitizeText(p["name"] ?? ""),
			description: sanitizeText(p["description"] ?? "")
		})),
		total_company_revenue: coerce(rawData["total_company_revenue"]),
		revenue: revenue.map((r) => ({
			activity: sanitizeText(r["activity"] ?? ""),
			revenue: coerce(r["revenue"])
		})),
		gross_profit_margin_option: sanitizeText(String(rawData["gross_profit_margin_option"] ?? "")),
		total_investment: coerce(rawData["total_investment"]),
		operating_profit: coerce(rawData["operating_profit"]),
		declaration_name: sanitizeText(String(rawData["declaration_name"] ?? "")),
		declaration_designation: sanitizeText(String(rawData["declaration_designation"] ?? "")),
		declaration_date: (() => {
			let d = String(rawData["declaration_date"] ?? "").trim();
			if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
				const parts = d.split("/");
				const p1 = parseInt(parts[0], 10);
				const p2 = parseInt(parts[1], 10);
				const y = parts[2];
				d = p1 > 12 ? `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}` : `${y}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
			}
			return d;
		})(),
		declaration_confirmed: rawData["declaration_confirmed"] === true || rawData["declaration_confirmed"] === "true" || rawData["declaration_confirmed"] === "1",
		signature_data: String(rawData["signature_data"] ?? "")
	};
	const parsed = ApplicationSchema.safeParse(parseInput);
	if (!parsed.success) {
		const firstError = parsed.error.issues[0];
		return json(422, {
			success: false,
			message: firstError?.message ?? "Validation error.",
			field: firstError?.path.join("."),
			errors: parsed.error.flatten().fieldErrors
		});
	}
	const data = parsed.data;
	const metrics = recalculate({
		totalCompanyRevenue: data.total_company_revenue,
		revenueRows: data.revenue.map((r) => ({
			activity: r.activity,
			revenue: r.revenue
		})),
		totalInvestment: data.total_investment,
		operatingProfit: data.operating_profit
	});
	const reference = generateReference();
	const baseUrl = process.env["APP_URL"] ?? "http://localhost:4321";
	const downloadUrl = buildDownloadUrl(reference, baseUrl);
	const uploadsDir = path.resolve(process.cwd(), "storage", "uploads", reference);
	await fs.mkdir(uploadsDir, { recursive: true });
	const savedEvidenceAttachments = [];
	for (const file of evidenceFiles) {
		const safeBase = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
		const storedName = `${Date.now()}_${secureHex(6)}_${safeBase}`;
		const filePath = path.join(uploadsDir, storedName);
		const buffer = Buffer.from(await file.arrayBuffer());
		await fs.writeFile(filePath, buffer);
		let mime = file.type || "application/octet-stream";
		if (mime === "application/octet-stream") {
			const ext = path.extname(file.name).toLowerCase();
			if (ext === ".pdf") mime = "application/pdf";
			else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
			else if (ext === ".png") mime = "image/png";
		}
		savedEvidenceAttachments.push({
			originalName: file.name,
			storedName,
			filePath,
			mimeType: mime,
			sizeBytes: file.size
		});
	}
	const pdfBundle = {
		reference,
		companyName: data.company_name,
		financialYear: data.financial_year,
		natureOperations: data.nature_operations,
		contactName: data.contact_name_designation,
		contactEmail: data.contact_email,
		contactPhone: data.contact_phone,
		newProductsServices: data.new_products_services,
		newMarketEntered: data.new_market_entered,
		newMarketDetails: data.new_market_details,
		products: data.products,
		grossProfitMarginOption: data.gross_profit_margin_option,
		totalCompanyRevenue: data.total_company_revenue,
		revenueRows: metrics.revenueRows,
		diversificationTotal: metrics.diversificationTotal,
		combinedPercent: metrics.combinedPercent,
		totalInvestment: data.total_investment,
		operatingProfit: data.operating_profit,
		roi: metrics.roi,
		payback: metrics.payback,
		declarationName: data.declaration_name,
		declarationDesignation: data.declaration_designation,
		declarationDate: data.declaration_date,
		signatureDataUri: data.signature_data
	};
	let pdfPath = "";
	let pdfBuffer = null;
	let pdfReady = false;
	try {
		const pdfResult = await generatePdf(pdfBundle);
		pdfPath = pdfResult.filePath;
		pdfBuffer = pdfResult.buffer;
		pdfReady = !!pdfPath && pdfBuffer.length > 0;
	} catch (err) {
		console.error("[PDF Generation Error]", reference, err);
	}
	try {
		await initDb();
		const [appResult] = await db.insert(applications).values({
			reference,
			company_name: data.company_name,
			financial_year: data.financial_year,
			nature_of_operations: data.nature_operations,
			contact_name: data.contact_name_designation,
			contact_email: data.contact_email,
			contact_phone: data.contact_phone,
			total_revenue: String(data.total_company_revenue),
			diversification_revenue: String(metrics.diversificationTotal),
			total_investment: String(data.total_investment),
			operating_profit: String(data.operating_profit),
			roi_percent: String(metrics.roi),
			payback_years: metrics.payback !== null ? String(metrics.payback) : null,
			status: "PENDING",
			pdf_path: pdfPath,
			submitted_at: /* @__PURE__ */ new Date(),
			data_json: {
				...data,
				metrics
			}
		});
		const insertedAppId = Number(appResult.insertId);
		if (insertedAppId && savedEvidenceAttachments.length > 0) for (const att of savedEvidenceAttachments) await db.insert(applicationAttachments).values({
			application_id: insertedAppId,
			original_filename: att.originalName,
			stored_filename: att.storedName,
			file_path: att.filePath,
			mime_type: att.mimeType,
			file_size_bytes: att.sizeBytes
		});
	} catch (dbErr) {
		console.error("[Database Insertion Error]", reference, dbErr);
	}
	let emailSent = false;
	if (pdfReady && (pdfBuffer || pdfPath)) {
		const pdfAttachment = pdfBuffer ?? pdfPath;
		try {
			await sendApplicantConfirmation({
				reference,
				companyName: data.company_name,
				financialYear: data.financial_year,
				contactEmail: data.contact_email,
				contactName: data.contact_name_designation,
				roi: metrics.roi,
				payback: metrics.payback,
				diversificationTotal: metrics.diversificationTotal,
				combinedPercent: metrics.combinedPercent,
				downloadUrl
			}, pdfAttachment);
			emailSent = true;
		} catch (err) {
			console.error("[Applicant Email Error]", reference, err);
		}
		try {
			await sendAdminNotification({
				reference,
				companyName: data.company_name,
				financialYear: data.financial_year,
				contactEmail: data.contact_email,
				contactName: data.contact_name_designation,
				roi: metrics.roi,
				payback: metrics.payback,
				diversificationTotal: metrics.diversificationTotal,
				combinedPercent: metrics.combinedPercent,
				downloadUrl
			}, pdfAttachment, savedEvidenceAttachments.map((a) => ({
				originalName: a.originalName,
				filePath: a.filePath,
				mimeType: a.mimeType,
				sizeBytes: a.sizeBytes
			})));
		} catch (err) {
			console.error("[Admin Email Error]", reference, err);
		}
	}
	gcTempStorage().catch(() => {});
	return json(200, {
		success: true,
		reference,
		email: data.contact_email,
		pdfReady,
		emailSent,
		downloadUrl,
		attachmentsCount: savedEvidenceAttachments.length
	});
};
// \0virtual:astro:page:src/pages/api/submit@_@ts
var page = () => submit_exports;
export { page };
