#!/usr/bin/env node
/**
 * Uploads ONLY the R2_* secrets from backend/.env to the hosted Supabase
 * Edge Function environment, then removes the temporary file.
 *
 * Use this after rotating R2 credentials in the Cloudflare dashboard and
 * updating backend/.env. For the full secret set (Termii/Paystack/Google/SMS
 * hook), use scripts/deploy-supabase.mjs instead.
 *
 * Secret values are never printed: they only pass through a mode-0600 temp
 * file into `supabase secrets set --env-file`.
 *
 * Usage: node scripts/set-r2-secrets.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const projectRef = 'avlbsficfejvwokxkgyl';

const KEYS = [
  'R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET', 'R2_PRIVATE_BUCKET', 'R2_PUBLIC_BUCKET', 'R2_PUBLIC_BASE_URL',
];
const REQUIRED = [
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET', 'R2_PUBLIC_BUCKET', 'R2_PUBLIC_BASE_URL',
];

const raw = readFileSync(join(root, 'backend', '.env'), 'utf8');
const values = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  else v = v.replace(/\s+#.*$/, '').trim();
  values[m[1]] = v;
}

const missing = REQUIRED.filter((k) => !values[k]?.trim());
if (missing.length) {
  console.error(`Stopped. Add these to backend/.env: ${missing.join(', ')}`);
  process.exit(1);
}
if (values.R2_BUCKET === values.R2_PUBLIC_BUCKET) {
  console.error('Stopped. R2_BUCKET and R2_PUBLIC_BUCKET must be different buckets.');
  process.exit(1);
}
values.R2_PRIVATE_BUCKET ||= values.R2_BUCKET;

const present = KEYS.filter((k) => values[k]?.trim());
const tempDir = mkdtempSync(join(tmpdir(), 'wassaa-r2-'));
const tempEnv = join(tempDir, 'r2.env');

try {
  writeFileSync(tempEnv, present.map((k) => `${k}=${values[k]}`).join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
  console.log(`Uploading ${present.length} R2 secret(s): ${present.join(', ')} (values not printed).`);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['supabase', 'secrets', 'set', '--env-file', tempEnv, '--project-ref', projectRef],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`supabase secrets set failed (exit ${result.status ?? 'unknown'}).`);
  console.log('R2 secrets uploaded to the hosted project.');
} finally {
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
