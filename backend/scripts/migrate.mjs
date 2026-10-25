// Apply backend/migrations/*.sql to the configured Postgres database.
// Usage: npm run db:migrate  (reads backend/.env -> SUPABASE_DB_URL)
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'migrations');

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Copy backend/.env.example to backend/.env first.');
  process.exit(1);
}

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    console.log(`applied ${file}`);
  }
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name"
  );
  console.log('tables:', rows.map((r) => r.table_name).join(', '));
} finally {
  await client.end();
}
