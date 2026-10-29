// Centralized deletion service for application submissions, cascading database records, and filesystem assets.
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { db, pool, initDb } from '@/db';
import { applications, applicationAttachments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifySessionToken } from '@/lib/auth';
import { getUploadsDir, isAllowedStoragePath } from '@/lib/storage';
import { applicationPdfStoragePath } from '@/lib/pdf';
import type { AstroCookies } from 'astro';

export interface DeleteApplicationResult {
  status: number;
  body: {
    success: boolean;
    message: string;
    id?: number;
    reference?: string;
  };
}

/**
 * Executes secure deletion of an application by ID or reference string:
 * 1. Strictly authenticates admin session.
 * 2. Cascades deletion through child database tables (application_attachments, files, products_services, revenue_items).
 * 3. Deletes primary application record.
 * 4. Unlinks associated evidence files, upload folders, and generated PDF dossiers.
 */
export async function executeDeleteApplication(
  targetIdOrRef: string | number | undefined,
  cookies: AstroCookies
): Promise<DeleteApplicationResult> {
  const jsonResponse = (status: number, success: boolean, message: string, extra?: { id?: number; reference?: string }): DeleteApplicationResult => ({
    status,
    body: {
      success,
      message,
      ...extra,
    },
  });

  // 1. Authentication & Authorization: Strictly verify admin session
  const sessionCookie = cookies.get('admin_session')?.value;
  const session = sessionCookie ? verifySessionToken(sessionCookie) : null;
  if (!session) {
    return jsonResponse(401, false, 'Unauthorized: Valid admin session required.');
  }

  const rawTarget = String(targetIdOrRef ?? '').trim();
  if (!rawTarget) {
    return jsonResponse(400, false, 'Invalid request: Application ID or reference is required.');
  }

  try {
    await initDb();

    // 2. Identify primary application record by ID or reference
    const isNumeric = /^\d+$/.test(rawTarget);
    let appRecord: typeof applications.$inferSelect | undefined;

    if (isNumeric) {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.id, Number(rawTarget)))
        .limit(1);
      appRecord = rows[0];
    }

    if (!appRecord) {
      const rows = await db
        .select()
        .from(applications)
        .where(eq(applications.reference, rawTarget))
        .limit(1);
      appRecord = rows[0];
    }

    if (!appRecord) {
      return jsonResponse(404, false, `Application "${rawTarget}" not found.`);
    }

    const appId = appRecord.id;
    const appRef = appRecord.reference;

    // 3. Query existing attachments before database records are deleted
    const attachmentRecords = await db
      .select()
      .from(applicationAttachments)
      .where(eq(applicationAttachments.application_id, appId));

    // 4. Cascading Database Deletion within an explicit transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // a. application_attachments
      await conn.query('DELETE FROM application_attachments WHERE application_id = ?', [appId]);

      // b. files (if present in custom schema)
      try {
        await conn.query('DELETE FROM files WHERE application_id = ?', [appId]);
      } catch (err: unknown) {
        const error = err as { errno?: number; code?: string; message?: string };
        if (error?.errno !== 1146 && error?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[Delete Application] Notice deleting from files:', error?.message);
        }
      }

      // c. products_services (if present in relational schema)
      try {
        await conn.query('DELETE FROM products_services WHERE application_id = ?', [appId]);
      } catch (err: unknown) {
        const error = err as { errno?: number; code?: string; message?: string };
        if (error?.errno !== 1146 && error?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[Delete Application] Notice deleting from products_services:', error?.message);
        }
      }

      // d. revenue_items (if present in relational schema)
      try {
        await conn.query('DELETE FROM revenue_items WHERE application_id = ?', [appId]);
      } catch (err: unknown) {
        const error = err as { errno?: number; code?: string; message?: string };
        if (error?.errno !== 1146 && error?.code !== 'ER_NO_SUCH_TABLE') {
          console.warn('[Delete Application] Notice deleting from revenue_items:', error?.message);
        }
      }

      // e. Primary applications record
      await conn.query('DELETE FROM applications WHERE id = ?', [appId]);

      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    // 5. File Cleanup: Unlink stored evidence files & generated PDF dossier
    const filesToUnlink = new Set<string>();

    // Collect attachment file paths
    for (const att of attachmentRecords) {
      if (att.file_path) {
        filesToUnlink.add(path.resolve(att.file_path));
      }
    }

    // Application PDF path from DB record
    if (appRecord.pdf_path) {
      filesToUnlink.add(path.resolve(appRecord.pdf_path));
    }

    // Candidate paths for generated PDF dossiers
    const safeRef = appRef.replace(/[^A-Za-z0-9_-]/g, '');
    if (safeRef) {
      try {
        filesToUnlink.add(path.resolve(applicationPdfStoragePath(appRef)));
      } catch {
        // ignore resolution error
      }
      filesToUnlink.add(path.resolve('/tmp', 'pdfs', `${safeRef}.pdf`));
      filesToUnlink.add(path.resolve(process.cwd(), 'storage', 'pdfs', `${safeRef}.pdf`));
      filesToUnlink.add(path.resolve('/tmp', 'temp', `${safeRef}.pdf`));
      filesToUnlink.add(path.resolve(process.cwd(), 'storage', 'temp', `${safeRef}.pdf`));
    }

    // Safely unlink files
    for (const filePath of filesToUnlink) {
      try {
        if (filePath && isAllowedStoragePath(filePath) && existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      } catch (unlinkErr) {
        console.warn(`[File Cleanup Notice] Could not unlink ${filePath}:`, unlinkErr);
      }
    }

    // Clean up uploads directories associated with this application reference
    const uploadDirs = [
      getUploadsDir(appRef),
      path.resolve(getUploadsDir(), safeRef),
      path.resolve('/tmp', 'uploads', safeRef),
      path.resolve(process.cwd(), 'storage', 'uploads', safeRef),
    ];

    for (const dirPath of uploadDirs) {
      try {
        if (dirPath && isAllowedStoragePath(dirPath) && existsSync(dirPath)) {
          await fs.rm(dirPath, { recursive: true, force: true });
        }
      } catch (rmErr) {
        console.warn(`[Directory Cleanup Notice] Could not remove directory ${dirPath}:`, rmErr);
      }
    }

    return jsonResponse(200, true, 'Application deleted successfully', {
      id: appId,
      reference: appRef,
    });
  } catch (err) {
    console.error('[Delete Application Error]', targetIdOrRef, err);
    return jsonResponse(500, false, 'Internal server error occurred while deleting application.');
  }
}
