// Application queries and domain operations
import { db, initDb } from '@/db';
import { applications, applicationAttachments } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import type { ApplicationMetrics, StoredFormData } from '@/types';

export interface DashboardData {
  applications: (typeof applications.$inferSelect)[];
  metrics: ApplicationMetrics;
}

export interface ApplicationDetailData {
  application: typeof applications.$inferSelect;
  attachments: (typeof applicationAttachments.$inferSelect)[];
  formData: StoredFormData;
}

// Fetch all applications and calculate dashboard counters
export async function getDashboardApplications(): Promise<DashboardData> {
  await initDb();

  const allApplications = await db
    .select()
    .from(applications)
    .orderBy(desc(applications.submitted_at));

  const metrics: ApplicationMetrics = {
    totalCount: allApplications.length,
    pendingCount: allApplications.filter(a => a.status === 'PENDING').length,
    underReviewCount: allApplications.filter(a => a.status === 'UNDER_REVIEW').length,
    approvedCount: allApplications.filter(a => a.status === 'APPROVED').length,
    rejectedCount: allApplications.filter(a => a.status === 'REJECTED').length,
  };

  return { applications: allApplications, metrics };
}

// Fetch single application by reference with attachments & parsed form data
export async function getApplicationByReference(reference: string): Promise<ApplicationDetailData | null> {
  await initDb();

  const appRecords = await db
    .select()
    .from(applications)
    .where(eq(applications.reference, reference))
    .limit(1);

  const application = appRecords[0];
  if (!application) return null;

  const attachments = await db
    .select()
    .from(applicationAttachments)
    .where(eq(applicationAttachments.application_id, application.id));

  const formData = (application.data_json as StoredFormData) ?? {};

  return { application, attachments, formData };
}

// Update review status of an application by ID
export async function updateApplicationStatus(id: number, status: string): Promise<boolean> {
  await initDb();

  await db
    .update(applications)
    .set({
      status: status as any,
    })
    .where(eq(applications.id, id));

  return true;
}

// Update review status of an application by reference
export async function updateApplicationStatusByReference(reference: string, status: string): Promise<boolean> {
  await initDb();

  const existing = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.reference, reference))
    .limit(1);

  if (existing.length === 0) return false;

  await db
    .update(applications)
    .set({
      status: status as any,
    })
    .where(eq(applications.reference, reference));

  return true;
}
