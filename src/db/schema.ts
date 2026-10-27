// Relational database schema for Admins, Applications, and Application Attachments.
import { mysqlTable, varchar, text, decimal, mysqlEnum, timestamp, int, json } from 'drizzle-orm/mysql-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Admins table — role-based access for dashboard managers
export const admins = mysqlTable('admins', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Applications table — core dossier submissions and calculated financial metrics
export const applications = mysqlTable('applications', {
  id: int('id').autoincrement().primaryKey(),
  reference: varchar('reference', { length: 64 }).notNull().unique(),
  company_name: varchar('company_name', { length: 255 }).notNull(),
  financial_year: varchar('financial_year', { length: 32 }).notNull(),
  nature_of_operations: text('nature_of_operations').notNull(),
  contact_name: varchar('contact_name', { length: 255 }).notNull(),
  contact_designation: varchar('contact_designation', { length: 255 }).notNull(),
  contact_email: varchar('contact_email', { length: 255 }).notNull(),
  contact_phone: varchar('contact_phone', { length: 64 }).notNull(),
  declaration_name: varchar('declaration_name', { length: 255 }).notNull(),
  declaration_designation: varchar('declaration_designation', { length: 255 }).notNull(),
  total_revenue: decimal('total_revenue', { precision: 15, scale: 2 }).notNull(),
  diversification_revenue: decimal('diversification_revenue', { precision: 15, scale: 2 }).notNull(),
  total_investment: decimal('total_investment', { precision: 15, scale: 2 }).notNull(),
  operating_profit: decimal('operating_profit', { precision: 15, scale: 2 }).notNull(),
  roi_percent: decimal('roi_percent', { precision: 8, scale: 2 }).notNull(),
  payback_years: decimal('payback_years', { precision: 8, scale: 2 }),
  status: mysqlEnum('status', ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).default('PENDING').notNull(),
  pdf_path: varchar('pdf_path', { length: 512 }).notNull(),
  submitted_at: timestamp('submitted_at').defaultNow().notNull(),
  data_json: json('data_json'),
});

// Application attachments table — evidence files stored for verification
export const applicationAttachments = mysqlTable('application_attachments', {
  id: int('id').autoincrement().primaryKey(),
  application_id: int('application_id').notNull(),
  original_filename: varchar('original_filename', { length: 255 }).notNull(),
  stored_filename: varchar('stored_filename', { length: 255 }).notNull(),
  file_path: varchar('file_path', { length: 512 }).notNull(),
  mime_type: varchar('mime_type', { length: 128 }).notNull(),
  file_size_bytes: int('file_size_bytes').notNull(),
});

export type Admin = InferSelectModel<typeof admins>;
export type NewAdmin = InferInsertModel<typeof admins>;
export type Application = InferSelectModel<typeof applications>;
export type NewApplication = InferInsertModel<typeof applications>;
export type ApplicationAttachment = InferSelectModel<typeof applicationAttachments>;
export type NewApplicationAttachment = InferInsertModel<typeof applicationAttachments>;
export type ApplicationStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
