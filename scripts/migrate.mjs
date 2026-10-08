import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env or .env.local');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('kallen_schema_migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS tbl_schema_migration (
    filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = new URL('../database/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const recorded = await client.query('SELECT checksum FROM tbl_schema_migration WHERE filename=$1', [file]);
    if (recorded.rowCount) {
      if (recorded.rows[0].checksum !== checksum) throw new Error(`Applied migration ${file} has changed. Create a new migration instead.`);
      continue;
    }
    // The original CLI applied 001 before migration tracking existed.
    if (file === '001_initial.sql') {
      const existing = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
        AND tablename=ANY($1::text[])`, [['tbl_user','tbl_gameBoard','tblkp_square','tbljn_users_gameBoard','tbl_ticket','tbljn_ticket_user','tbl_session','tbl_login_attempt']]);
      if (existing.rowCount && existing.rowCount !== 8) throw new Error('Initial schema is incomplete. Inspect the database before migrating.');
      if (existing.rowCount === 8) {
        await client.query('INSERT INTO tbl_schema_migration (filename, checksum) VALUES ($1,$2)', [file, checksum]);
        console.log(`Recorded existing ${file}.`);
        continue;
      }
    }
    await client.query('BEGIN');
    try {
      // Each SQL file is also runnable by psql. Own the transaction here so its
      // migration marker commits atomically with the schema change.
      await client.query(sql.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, ''));
      await client.query('INSERT INTO tbl_schema_migration (filename, checksum) VALUES ($1,$2)', [file, checksum]);
      await client.query('COMMIT');
      console.log(`Applied ${file}.`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  console.log('Database migrations are up to date.');
} finally { await client.end(); }
