import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema';

const rawDatabaseUrl = process.env['DATABASE_URL']
  ?? (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DATABASE_URL : undefined)
  ?? 'mysql://user:password@localhost:3306/award_db';
const databaseUrl = rawDatabaseUrl.replace(/^["']|["']$/g, '').trim();

// TiDB Cloud or remote cloud hosts require mandatory secure TLS with certificate validation
const isTiDb = databaseUrl.includes('tidb') || databaseUrl.includes('4000');
const isRemoteOrCloud = !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');
const requireSsl = isRemoteOrCloud || isTiDb || process.env['DATABASE_SSL'] === 'true' || process.env['TIDB_ENABLE_SSL'] === 'true';

// Create persistent connection pool
export const pool = mysql.createPool({
  uri: databaseUrl,
  ssl: requireSsl
    ? {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      }
    : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});


// Drizzle ORM client instance
export const db = drizzle(pool, { schema, mode: 'default' });

// Ensure database tables exist automatically on boot
export async function initDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // 1. Admins table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Applications table
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

    // 3. Application Attachments table
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