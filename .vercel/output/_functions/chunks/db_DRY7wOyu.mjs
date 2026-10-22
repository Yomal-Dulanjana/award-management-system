import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
// src/db/schema.ts
var schema_exports = /* @__PURE__ */ __exportAll({
	admins: () => admins,
	applicationAttachments: () => applicationAttachments,
	applications: () => applications
});
var admins = mysqlTable("admins", {
	id: varchar("id", { length: 36 }).primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	password_hash: varchar("password_hash", { length: 255 }).notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	created_at: timestamp("created_at").defaultNow().notNull()
});
var applications = mysqlTable("applications", {
	id: int("id").autoincrement().primaryKey(),
	reference: varchar("reference", { length: 64 }).notNull().unique(),
	company_name: varchar("company_name", { length: 255 }).notNull(),
	financial_year: varchar("financial_year", { length: 32 }).notNull(),
	nature_of_operations: text("nature_of_operations").notNull(),
	contact_name: varchar("contact_name", { length: 255 }).notNull(),
	contact_email: varchar("contact_email", { length: 255 }).notNull(),
	contact_phone: varchar("contact_phone", { length: 64 }).notNull(),
	total_revenue: decimal("total_revenue", {
		precision: 15,
		scale: 2
	}).notNull(),
	diversification_revenue: decimal("diversification_revenue", {
		precision: 15,
		scale: 2
	}).notNull(),
	total_investment: decimal("total_investment", {
		precision: 15,
		scale: 2
	}).notNull(),
	operating_profit: decimal("operating_profit", {
		precision: 15,
		scale: 2
	}).notNull(),
	roi_percent: decimal("roi_percent", {
		precision: 8,
		scale: 2
	}).notNull(),
	payback_years: decimal("payback_years", {
		precision: 8,
		scale: 2
	}),
	status: mysqlEnum("status", [
		"PENDING",
		"UNDER_REVIEW",
		"APPROVED",
		"REJECTED"
	]).default("PENDING").notNull(),
	pdf_path: varchar("pdf_path", { length: 512 }).notNull(),
	submitted_at: timestamp("submitted_at").defaultNow().notNull(),
	data_json: json("data_json")
});
var applicationAttachments = mysqlTable("application_attachments", {
	id: int("id").autoincrement().primaryKey(),
	application_id: int("application_id").notNull(),
	original_filename: varchar("original_filename", { length: 255 }).notNull(),
	stored_filename: varchar("stored_filename", { length: 255 }).notNull(),
	file_path: varchar("file_path", { length: 512 }).notNull(),
	mime_type: varchar("mime_type", { length: 128 }).notNull(),
	file_size_bytes: int("file_size_bytes").notNull()
});
// src/db/index.ts
var databaseUrl = (process.env["DATABASE_URL"] ?? (typeof import.meta !== "undefined" && Object.assign({
	"ASSETS_PREFIX": void 0,
	"BASE_URL": "/",
	"DEV": false,
	"MODE": "production",
	"PROD": true,
	"SITE": void 0,
	"SSR": true
}, {
	DATABASE_URL: "mysql://3ow7y3WSChC8cjG.root:Dj8L0nd5btZbVg2b@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/award_db",
	_: "/home/yomal-dulanjana/.nvm/versions/node/v26.1.0/bin/npm"
}) ? "mysql://3ow7y3WSChC8cjG.root:Dj8L0nd5btZbVg2b@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/award_db" : void 0) ?? "mysql://user:password@localhost:3306/award_db").replace(/^["']|["']$/g, "").trim();
var isRemoteOrCloud = !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
var pool = mysql.createPool({
	uri: databaseUrl,
	ssl: isRemoteOrCloud ? {
		rejectUnauthorized: true,
		minVersion: "TLSv1.2"
	} : void 0,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});
var db = drizzle(pool, {
	schema: schema_exports,
	mode: "default"
});
async function initDb() {
	const conn = await pool.getConnection();
	try {
		await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
		await conn.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reference VARCHAR(64) NOT NULL UNIQUE,
        company_name VARCHAR(255) NOT NULL,
        financial_year VARCHAR(32) NOT NULL,
        nature_of_operations TEXT NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(64) NOT NULL,
        total_revenue DECIMAL(15,2) NOT NULL,
        diversification_revenue DECIMAL(15,2) NOT NULL,
        total_investment DECIMAL(15,2) NOT NULL,
        operating_profit DECIMAL(15,2) NOT NULL,
        roi_percent DECIMAL(8,2) NOT NULL,
        payback_years DECIMAL(8,2) NULL,
        status ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') DEFAULT 'PENDING' NOT NULL,
        pdf_path VARCHAR(512) NOT NULL,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        data_json JSON NULL,
        INDEX idx_reference (reference),
        INDEX idx_status (status),
        INDEX idx_submitted_at (submitted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
		await conn.query(`
      CREATE TABLE IF NOT EXISTS application_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        application_id INT NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(512) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        file_size_bytes INT NOT NULL,
        INDEX idx_application_id (application_id),
        CONSTRAINT fk_app_attachments_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
	} finally {
		conn.release();
	}
}
export { applications as a, applicationAttachments as i, initDb as n, admins as r, db as t };
