#!/usr/bin/env node
// Applies a SQL file to the linked Supabase database with node-postgres.
//
// The Supabase CLI bundles Bun, and its binary occasionally panics on this
// machine ("Illegal instruction"), which makes `supabase db push` unusable.
// This is the fallback: same connection string, same SQL, and it records the
// migration version so a later `db push` does not try to re-apply it.
//
//   node scripts/apply-sql.mjs supabase/migrations/20261107010000_foo.sql
//
// Connection string resolution: SUPABASE_DB_URL env var, else backend/.env.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve('backend/package.json'));
const { Client } = require('pg');

function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL.trim();
  const file = path.resolve('backend/.env');
  if (!fs.existsSync(file)) throw new Error('SUPABASE_DB_URL not set and backend/.env is missing');
  const line = fs.readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^\s*SUPABASE_DB_URL\s*=/.test(l));
  if (!line) throw new Error('SUPABASE_DB_URL not found in backend/.env');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-sql.mjs <file.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');
const name = path.basename(file).replace(/^\d+_/, '').replace(/\.sql$/, '');
const version = (path.basename(file).match(/^(\d+)_/) || [])[1];

const client = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  await client.query(sql);
  if (version) {
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3) on conflict (version) do nothing`,
      [version, name, [sql]]
    );
  }
  await client.query('commit');
  console.log(`applied ${path.basename(file)}${version ? ` (recorded ${version})` : ''}`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error(`failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
