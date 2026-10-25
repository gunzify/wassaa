import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { parse } = require('dotenv');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const projectRef = 'avlbsficfejvwokxkgyl';

if (!process.argv.includes('--credentials-rotated')) {
  throw new Error('Deployment stopped. Rotate the Termii and R2 credentials exposed in chat, update backend/.env, then rerun with --credentials-rotated.');
}

const envFile = join(root, 'backend', '.env');
let values;
try {
  values = parse(readFileSync(envFile));
} catch {
  throw new Error('Cannot read backend/.env.');
}

const required = [
  'TERMII_API_KEY', 'TERMII_SENDER_ID', 'SEND_SMS_HOOK_SECRET', 'APP_ORIGINS',
  'GOOGLE_CLIENT_ID', 'R2_ACCOUNT_ID', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BUCKET',
  'R2_PUBLIC_BASE_URL', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_CALLBACK_URL',
];
const missing = required.filter((key) => !values[key]?.trim());
if (missing.length) throw new Error(`Deployment stopped. Add these values to backend/.env: ${missing.join(', ')}`);
if (values.R2_BUCKET === values.R2_PUBLIC_BUCKET) throw new Error('R2_BUCKET and R2_PUBLIC_BUCKET must be different buckets.');
if (!/^v1,whsec_.{32,}$/.test(values.SEND_SMS_HOOK_SECRET)) throw new Error('SEND_SMS_HOOK_SECRET must use Supabase format v1,whsec_<base64 secret> and match the Send SMS Auth Hook configured in the Dashboard.');
if (!/^https:\/\//i.test(values.R2_PUBLIC_BASE_URL)) throw new Error('R2_PUBLIC_BASE_URL must be an HTTPS asset domain.');
if (!/^https:\/\//i.test(values.PAYSTACK_CALLBACK_URL)) throw new Error('PAYSTACK_CALLBACK_URL must use the deployed HTTPS app URL.');

const names = [
  'TERMII_API_KEY', 'TERMII_SENDER_ID', 'TERMII_BASE_URL', 'SEND_SMS_HOOK_SECRET',
  'APP_ORIGINS', 'GOOGLE_CLIENT_ID', 'R2_ACCOUNT_ID', 'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PRIVATE_BUCKET',
  'R2_PUBLIC_BUCKET', 'R2_PUBLIC_BASE_URL', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_CALLBACK_URL',
];
values.R2_PRIVATE_BUCKET ||= values.R2_BUCKET;
const filtered = names.filter((name) => values[name]?.trim()).map((name) => `${name}=${values[name]}`).join('\n') + '\n';
const tempDir = mkdtempSync(join(tmpdir(), 'wassaa-edge-secrets-'));
const tempEnv = join(tempDir, 'edge.env');

function run(args) {
  const result = spawnSync(process.platform === 'win32' ? 'supabase.cmd' : 'supabase', args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Supabase CLI command failed (exit ${result.status ?? 'unknown'}).`);
}

try {
  writeFileSync(tempEnv, filtered, { encoding: 'utf8', mode: 0o600 });
  console.log('Uploading filtered Edge Function secrets; secret values will not be printed.');
  run(['secrets', 'set', '--env-file', tempEnv, '--project-ref', projectRef]);
  for (const name of ['send-sms', 'api']) {
    console.log(`Deploying Edge Function: ${name}`);
    run(['functions', 'deploy', name, '--no-verify-jwt', '--project-ref', projectRef]);
  }
  console.log('Edge Functions deployed. Configure the matching Auth Send SMS hook in the Dashboard and verify provider delivery in staging.');
} finally {
  try { unlinkSync(tempEnv); } catch {}
  try { rmdirSync(tempDir); } catch {}
}
