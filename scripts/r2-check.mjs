#!/usr/bin/env node
/**
 * Validates the R2 configuration in backend/.env WITHOUT printing any values.
 *
 * Checks:
 *  1. Required R2 keys are present and shaped correctly (names + pass/fail only).
 *  2. Credentials work: signed PUT -> GET -> DELETE round-trip on the private
 *     bucket (the test object is removed again).
 *  3. Public bucket works: signed PUT, unsigned GET through R2_PUBLIC_BASE_URL,
 *     then DELETE.
 *
 * Usage: node scripts/r2-check.mjs
 * Exit 0 = everything usable; exit 1 = at least one check failed.
 */
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { parse } = require('dotenv');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fs = require('node:fs');

let values = {};
try {
  values = parse(fs.readFileSync(path.join(root, 'backend', '.env')));
} catch {
  console.error('Cannot read backend/.env.');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function info(name, detail) { console.log(`  INFO  ${name}${detail ? ` — ${detail}` : ''}`); }

// ------------------------------------------------------------- 1. key presence
console.log('== 1. R2 keys in backend/.env (values are never printed)');

const ACCOUNT = values.R2_ACCOUNT_ID?.trim();
const ACCESS = values.R2_ACCESS_KEY_ID?.trim();
const SECRET = values.R2_SECRET_ACCESS_KEY?.trim();
const PRIVATE_BUCKET = (values.R2_PRIVATE_BUCKET || values.R2_BUCKET || '').trim();
const PUBLIC_BUCKET = values.R2_PUBLIC_BUCKET?.trim();
const ENDPOINT = (values.R2_ENDPOINT || '').trim() || (ACCOUNT ? `https://${ACCOUNT}.r2.cloudflarestorage.com` : '');
const PUBLIC_BASE = (values.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

check('R2_ACCOUNT_ID present', Boolean(ACCOUNT));
check('R2_ACCESS_KEY_ID present', Boolean(ACCESS));
check('R2_SECRET_ACCESS_KEY present', Boolean(SECRET));
check('R2_BUCKET (private) present', Boolean(PRIVATE_BUCKET));
check('R2_PUBLIC_BUCKET present', Boolean(PUBLIC_BUCKET));
check('private and public buckets differ', Boolean(PRIVATE_BUCKET && PUBLIC_BUCKET) && PRIVATE_BUCKET !== PUBLIC_BUCKET);
check('R2_ENDPOINT/derived endpoint is HTTPS', /^https:\/\//i.test(ENDPOINT), ENDPOINT ? 'set' : 'missing');
check('R2_PUBLIC_BASE_URL is HTTPS', /^https:\/\//i.test(PUBLIC_BASE), PUBLIC_BASE ? 'set' : 'missing');

if (!ACCOUNT || !ACCESS || !SECRET || !PRIVATE_BUCKET || !PUBLIC_BUCKET || !/^https:\/\//i.test(ENDPOINT)) {
  console.log('\nCannot continue without the keys above.');
  process.exit(1);
}

// ------------------------------------------------------------------ 2. signing
const EMPTY_SHA = crypto.createHash('sha256').update('').digest('hex');

function sign(method, key, payloadSha, amzDate, dateStamp) {
  const host = new URL(ENDPOINT).host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadSha}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [method, key === '' ? '/' : `/${key.replace(/^\/+/, '')}`, '', canonicalHeaders, 'host;x-amz-content-sha256;x-amz-date', payloadSha].join('\n');
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

async function s3(method, key, body, contentType = 'text/plain') {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadSha = crypto.createHash('sha256').update(body ?? '').digest('hex');
  const url = `${ENDPOINT}/${key.replace(/^\/+/, '')}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: sign(method, key, payloadSha, amzDate, dateStamp),
      'x-amz-content-sha256': payloadSha,
      'x-amz-date': amzDate,
      'content-type': contentType,
    },
    body: body ?? undefined,
  }).catch((e) => ({ status: `network error: ${e.message}` }));
  return res.status;
}

const KEY = 'wassaa-smoke/r2-check.txt';
const BODY = `r2-check ${new Date().toISOString()}`;

// --------------------------------------------------------- 3. private bucket IO
console.log('\n== 2. Credentials against the private bucket (round-trip, object removed after)');
const pPut = await s3('PUT', `${PRIVATE_BUCKET}/${KEY}`, BODY);
check('signed PUT to private bucket', pPut === 200 || pPut === 201, `HTTP ${pPut}`);
const pGet = await s3('GET', `${PRIVATE_BUCKET}/${KEY}`);
check('signed GET from private bucket', pGet === 200, `HTTP ${pGet}`);
const pDel = await s3('DELETE', `${PRIVATE_BUCKET}/${KEY}`);
check('cleanup DELETE from private bucket', pDel === 204 || pDel === 200, `HTTP ${pDel}`);

// --------------------------------------------------------- 4. public bucket + URL
console.log('\n== 3. Public bucket and asset URL (round-trip, object removed after)');
const uPut = await s3('PUT', `${PUBLIC_BUCKET}/${KEY}`, BODY);
check('signed PUT to public bucket', uPut === 200 || uPut === 201, `HTTP ${uPut}`);

let publicGet = 'skipped';
if (/^https:\/\//i.test(PUBLIC_BASE)) {
  publicGet = await fetch(`${PUBLIC_BASE}/${KEY}`, { method: 'GET' })
    .then((r) => r.status)
    .catch((e) => `network error: ${e.message}`);
}
check('unsigned GET through R2_PUBLIC_BASE_URL (photos must load in the browser)', publicGet === 200, `HTTP ${publicGet}`);
if (publicGet !== 200) {
  info('hint', 'Enable public access for the public bucket (Cloudflare R2 → bucket → Settings → Public access: r2.dev or a custom domain) and make R2_PUBLIC_BASE_URL match it.');
}
const uDel = await s3('DELETE', `${PUBLIC_BUCKET}/${KEY}`);
check('cleanup DELETE from public bucket', uDel === 204 || uDel === 200, `HTTP ${uDel}`);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
