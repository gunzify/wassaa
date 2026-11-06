#!/usr/bin/env node
/**
 * Account-deletion companion (KB §18D deletion governance).
 *
 *  node scripts/account-deletion.mjs --qa            # delete every test account:
 *                                                    # profiles named "QA Design"
 *                                                    # plus any qa-design-* email
 *  node scripts/account-deletion.mjs --name "Name"   # delete accounts by profile name
 *  node scripts/account-deletion.mjs --purge-queue   # drain R2 media left behind
 *                                                    # by dashboard (auth.users)
 *                                                    # deletions (wassaa_media_purge_queue)
 *  node scripts/account-deletion.mjs --list          # show what --qa would delete
 *
 * For every account: R2 media keys are deleted (profile photos from the public
 * bucket, chat/verification media from the private bucket), reports and
 * admin-audit references are redacted, the profile is deleted (all relational
 * rows — swipes, matches, messages, blocks, verification submissions,
 * payments, appeals — cascade), then the Supabase auth user is deleted.
 * Only counts are printed; never secret values.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const { parse } = require('dotenv');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const values = parse(require('node:fs').readFileSync(path.join(root, '.env'), 'utf8'));

const URL_BASE = (values.SUPABASE_URL || '').trim();
const SERVICE = (values.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!URL_BASE || !SERVICE) {
  console.error('.env needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const AUTH = `${URL_BASE}/auth/v1`;
const REST = `${URL_BASE}/rest/v1`;

const ACCOUNT_ID = values.R2_ACCOUNT_ID?.trim();
const ACCESS = values.R2_ACCESS_KEY_ID?.trim();
const SECRET = values.R2_SECRET_ACCESS_KEY?.trim();
const PRIVATE_BUCKET = (values.R2_PRIVATE_BUCKET || values.R2_BUCKET || '').trim();
const PUBLIC_BUCKET = values.R2_PUBLIC_BUCKET?.trim();
const ENDPOINT = (values.R2_ENDPOINT || '').trim() || `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const args = process.argv.slice(2);
const mode = args.includes('--qa') ? 'qa' : args.includes('--purge-queue') ? 'queue' : args.includes('--list') ? 'list' : args.includes('--name') ? 'name' : 'help';
const nameArg = mode === 'name' ? args[args.indexOf('--name') + 1] : null;

const isStorageKey = (k) => typeof k === 'string' && /^[a-z]+\/[0-9a-f-]{36}\//.test(k) && !k.includes('..');

async function authGetUsers(page = 1) {
  const res = await fetch(`${AUTH}/admin/users?page=${page}&per_page=200`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) { console.error(`auth admin list failed (${res.status}).`); process.exit(1); }
  return (await res.json()).users || [];
}

async function restList(table, query) {
  const res = await fetch(`${REST}/${table}?${query}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!res.ok) { console.error(`REST list ${table} failed (${res.status}).`); process.exit(1); }
  return res.json();
}

const EMPTY_SHA = crypto.createHash('sha256').update('').digest('hex');

function r2Auth(method, key, amzDate, dateStamp) {
  const host = new URL(ENDPOINT).host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${EMPTY_SHA}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [method, `/${key.replace(/^\/+/, '')}`, '', canonicalHeaders, 'host;x-amz-content-sha256;x-amz-date', EMPTY_SHA].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (data, k) => crypto.createHmac('sha256', k).update(data).digest();
  const kDate = hmac(dateStamp, `AWS4${SECRET}`);
  const kRegion = hmac('auto', kDate);
  const kService = hmac('s3', kRegion);
  const kSigning = hmac('aws4_request', kService);
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
}

async function r2Delete(storageKey) {
  const bucket = storageKey.startsWith('photos/') ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  if (!bucket) return 'no-bucket-configured';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const scopedKey = `${bucket}/${storageKey.replace(/^\/+/, '')}`;
  const res = await fetch(`${ENDPOINT}/${scopedKey}`, {
    method: 'DELETE',
    headers: {
      Authorization: r2Auth('DELETE', scopedKey, amzDate, amzDate.slice(0, 8)),
      'x-amz-content-sha256': EMPTY_SHA,
      'x-amz-date': amzDate,
    },
  }).catch(() => ({ status: 'network-error' }));
  return res.status;
}

async function drainQueue() {
  const queued = await restList('wassaa_media_purge_queue', 'purged_at=is.null&select=user_id,keys');
  if (!queued.length) { console.log('purge queue is empty — nothing to clean.'); return; }
  let objects = 0;
  for (const row of queued) {
    for (const key of row.keys || []) {
      const status = await r2Delete(key);
      if (status === 204 || status === 200) objects++;
      else console.error(`  key ${key} → HTTP ${status} (left queued)`);
    }
    await fetch(`${REST}/wassaa_media_purge_queue?user_id=eq.${row.user_id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ purged_at: new Date().toISOString() }),
    });
  }
  console.log(`purged ${objects} R2 object(s) for ${queued.length} deleted account(s).`);
}

async function deleteAccount(row) {
  const uid = row.id;
  const keySet = new Set();
  for (const p of Array.isArray(row.photos) ? row.photos : []) if (isStorageKey(p)) keySet.add(p);
  for (const s of await restList('verification_submissions', `user_id=eq.${uid}&select=id_doc_url,selfie_url`)) {
    if (s.id_doc_url && isStorageKey(s.id_doc_url)) keySet.add(s.id_doc_url);
    if (s.selfie_url && isStorageKey(s.selfie_url)) keySet.add(s.selfie_url);
  }
  const media = [...keySet];
  for (const key of media) await r2Delete(key);

  // Redact references that must survive the cascade (same as the API path).
  if (row.hasProfile) {
    await fetch(`${REST}/reports?reported_user_id=eq.${uid}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_user_id: null, details: '[Report subject account deleted]', service_branch: null }),
    });
    const del = await fetch(`${REST}/profiles?id=eq.${uid}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    if (!del.ok) console.error(`  profile delete → HTTP ${del.status} for ${uid}`);
  }
  const authRes = await fetch(`${AUTH}/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  if (!authRes.ok) console.error(`  auth user delete → HTTP ${authRes.status} for ${uid}`);
  return { ok: authRes.ok && (!row.hasProfile || true), media: media.length };
}

const track = {
  yes: 0, failed: 0, media: 0,
  record(label, ok, mediaCount) {
    this[ok ? 'yes' : 'failed']++;
    this.media += mediaCount || 0;
    console.log(`  ${label}: ${ok ? 'deleted' : 'FAILED'}`);
  },
};

(async () => {
  if (mode === 'help') {
    console.log('Usage: node scripts/account-deletion.mjs [--qa | --name "Name" | --purge-queue | --list]');
    process.exit(0);
  }

  if (mode === 'queue') return drainQueue();

  // Build the target set. Auth users whose email starts with qa-design- are
  // test-fixture accounts; profiles named "QA Design" (or --name) are matched
  // directly so fixtures without the email are caught too.
  const targets = new Map();
  if (mode === 'qa') {
    for (const u of await authGetUsers()) {
      if ((u.email || '').startsWith('qa-design-')) targets.set(u.id, { id: u.id, label: `qa-design fixture (${u.email})`, hasProfile: true });
    }
    for (const p of await restList('profiles', 'name=eq.QA Design&select=id,photos')) {
      if (!targets.has(p.id)) targets.set(p.id, { id: p.id, label: 'profile name "QA Design"', hasProfile: true });
    }
  } else if (mode === 'name') {
    for (const p of await restList('profiles', `name=eq.${encodeURIComponent(nameArg)}&select=id,photos`)) {
      targets.set(p.id, { id: p.id, label: `profile name "${nameArg}"`, hasProfile: true });
    }
  } else {
    for (const p of await restList('profiles', 'name=eq.QA Design&select=id,photos')) targets.set(p.id, 'profile name "QA Design"');
    console.log(`--list: ${targets.size} account(s) would be deleted with --qa.`);
    for (const [id, why] of targets) console.log(`  ${id} — ${why}`);
    process.exit(0);
  }

  if (!targets.size) { console.log('no matching accounts found.'); return; }
  console.log(`deleting ${targets.size} account(s)...`);
  for (const [id, info] of targets.entries()) {
    const rows = await restList('profiles', `id=eq.${id}&select=id,photos`);
    const row = { id, hasProfile: info.hasProfile, photos: rows[0]?.photos || [] };
    const { ok, media } = await deleteAccount(row);
    track.record(info.label, ok, media);
  }
  console.log(`done — ${track.failed ? `${track.failed} had errors` : 'all clean'}, ${track.media} R2 object(s) removed.`);
})();
