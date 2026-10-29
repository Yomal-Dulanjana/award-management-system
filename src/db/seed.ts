// Database seed script to initialize tables and default administrator account.
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool, db, initDb } from './index';
import { admins } from './schema';
import { eq } from 'drizzle-orm';

async function seed() {
  console.log('[Seed] Ensuring database tables exist...');
  await initDb();

  const defaultEmail = process.env['DEFAULT_ADMIN_EMAIL'] ?? 'admin@award.gov.lk';
  const defaultPass = process.env['DEFAULT_ADMIN_PASSWORD'] || randomUUID().replace(/-/g, '').slice(0, 16);
  const defaultName = process.env['DEFAULT_ADMIN_NAME'] ?? 'System Administrator';

  const existing = await db.select().from(admins).where(eq(admins.email, defaultEmail)).limit(1);

  if (existing.length === 0) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(defaultPass, saltRounds);

    await db.insert(admins).values({
      id: randomUUID(),
      email: defaultEmail,
      password_hash: passwordHash,
      name: defaultName,
    });

    console.log(`[Seed] Created default administrator: ${defaultEmail}`);
    console.log(`[Seed] Password: ${defaultPass}`);
  } else {
    console.log(`[Seed] Admin already exists: ${defaultEmail}`);
  }

  await pool.end();
  console.log('[Seed] Database initialization complete.');
}

seed().catch(err => {
  console.error('[Seed Error]', err);
  process.exit(1);
});
