#!/usr/bin/env node
/**
 * Admin console smoke test (KB §18D) — exercises the deployed Edge admin routes
 * that back frontend/public/admin.
 *
 * Covers, against the hosted project only:
 *   1. allowlist gate (non-admin 403, allowlisted admin session)
 *   2. verification queue → approve (media signed for the reviewer, profile
 *      verified, double-review refused) and reject (note stored, profile rejected)
 *   3. safety report with real DM evidence → admin list, full review context
 *      (conversation, flagged message, face-vs-ID, account shape) and status update
 *   4. restrict / ban / lift with reasons, and the member-side enforcement each
 *      one produces (ACCOUNT_RESTRICTED, ACCOUNT_BANNED)
 *   5. appeals: filing while banned, duplicate refusal, admin queue, grant
 *      (account reinstated) and deny paths
 *   6. persona editing: search, bio/active patch, non-NPC refusal, R2 photo
 *      presign + upload + attach, and the audit trail for every action
 *
 * Reads credentials from local env files only, never prints secrets, and
 * removes every QA row (profiles, auth users, allowlist entry, audit entries)
 * and R2 object it created in a finally block.
 *
 * Usage:  node scripts/admin-smoke.mjs            (clean up afterwards)
 *         node scripts/admin-smoke.mjs --keep     (leave fixtures for inspection)
 * Exit 0 = every check passed; exit 1 = at least one check failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = process.argv.includes('--keep');

function loadEnv(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

const frontEnv = loadEnv('frontend/.env');
const backEnv = loadEnv('backend/.env');
const SUPABASE_URL = (frontEnv.VITE_SUPABASE_URL || backEnv.SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = frontEnv.VITE_SUPABASE_ANON_KEY || backEnv.SUPABASE_PUBLISHABLE_KEY || '';
const SERVICE_KEY = backEnv.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) {
  console.error('Missing Supabase env values (frontend/.env, backend/.env).');
  process.exit(1);
}

const API = `${SUPABASE_URL}/functions/v1/api`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const REST = `${SUPABASE_URL}/rest/v1`;

let passed = 0;
let failed = 0;
const redact = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]');
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? ` — ${redact(detail)}` : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${redact(detail)}` : ''}`); }
};
const step = (title) => console.log(`\n== ${title}`);
const info = (name, detail = '') => console.log(`  INFO  ${name}${detail ? ` — ${redact(detail)}` : ''}`);

async function call(url, { method = 'GET', token, key = PUBLISHABLE_KEY, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key === SERVICE_KEY ? { Authorization: `Bearer ${SERVICE_KEY}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}
const api = (p, opts) => call(`${API}${p}`, opts);
const authAdmin = (p, opts) => call(`${AUTH}${p}`, { ...opts, key: SERVICE_KEY });
const rest = (p, opts) => call(`${REST}${p}`, { ...opts, key: SERVICE_KEY });

// ------------------------------------------------------------- r2 test cleanup

const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

async function r2DeleteObject(key, bucket) {
  const account = backEnv.R2_ACCOUNT_ID?.trim();
  const access = backEnv.R2_ACCESS_KEY_ID?.trim();
  const secret = backEnv.R2_SECRET_ACCESS_KEY?.trim();
  if (!account || !access || !secret || !bucket || !key) return null;
  const endpoint = (backEnv.R2_ENDPOINT || '').trim().replace(/\/$/, '') || `https://${account}.r2.cloudflarestorage.com`;
  let host;
  try { host = new URL(endpoint).host; } catch { return null; }
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalPath = `/${bucket}/${key}`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${EMPTY_SHA256}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = ['DELETE', canonicalPath, '', canonicalHeaders, 'host;x-amz-content-sha256;x-amz-date', EMPTY_SHA256].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const hmac = (data, key2) => crypto.createHmac('sha256', key2).update(data).digest();
  const signingKey = hmac('aws4_request', hmac('s3', hmac('auto', hmac(dateStamp, `AWS4${secret}`))));
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  try {
    const res = await fetch(`${endpoint}${canonicalPath}`, {
      method: 'DELETE',
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
        'x-amz-content-sha256': EMPTY_SHA256,
        'x-amz-date': amzDate
      }
    });
    return res.status;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ fixtures

const stamp = Date.now().toString(36);
const ADMIN_LABEL = `QA Console Admin ${stamp}`;
const accounts = {
  admin: { email: `qa-admin-${stamp}@wassaa.test`, password: `QA-Admin!${stamp}-aA1` },
  target: { email: `qa-target-${stamp}@wassaa.test`, password: `QA-Target!${stamp}-tT1` },
  reporter: { email: `qa-reporter-${stamp}@wassaa.test`, password: `QA-Reporter!${stamp}-rR1` }
};

const created = { authIds: {}, tokens: {}, profileIds: {}, key: {} };
const mediaKeys = [];       // private verification objects this run uploaded
const publicKeys = [];      // public bucket objects this run uploaded
let reportId = '';
let npcId = '';
let npcOriginal = null;
let allowlistInserted = false;

async function createUser(name) {
  const r = await authAdmin('/admin/users', {
    method: 'POST',
    body: { email: accounts[name].email, password: accounts[name].password, email_confirm: true }
  });
  const id = r.data?.id || r.data?.user?.id || '';
  if (r.status !== 200 || !id) throw new Error(`createUser(${name}) failed (${r.status})`);
  created.authIds[name] = id;
  const signIn = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email: accounts[name].email, password: accounts[name].password } });
  const token = signIn.data?.access_token || '';
  if (signIn.status !== 200 || !token) throw new Error(`signIn(${name}) failed (${signIn.status})`);
  created.tokens[name] = token;
  const bridge = await rest(`/profiles?auth_user_id=eq.${id}&select=id`);
  created.profileIds[name] = bridge.data?.[0]?.id || '';
  if (!created.profileIds[name]) throw new Error(`profile bridge missing for ${name}`);
  return created.profileIds[name];
}

async function completeProfile(name, overrides) {
  const base = {
    name: `QA Console ${name}`,
    birth_date: '1994-03-08',
    gender: name === 'reporter' ? 'female' : 'male',
    profession_category: 'Engineering',
    profession_title: 'QA Console Fixture',
    class_of_service: 'civilian',
    city: 'Lekki',
    state: 'Lagos',
    bio: 'QA fixture used by scripts/admin-smoke.mjs to exercise the integrity console.',
    photos: ['https://example.com/qa/admin-smoke-1.jpg', 'https://example.com/qa/admin-smoke-2.jpg'],
    interests: ['Reading', 'Travel', 'Fitness'],
    dating_goal: 'long_term',
    match_preferences: { gender: name === 'reporter' ? 'men' : 'women', minAge: 22, maxAge: 45, maxDistanceKm: 100 },
    location_lat: 6.4698,
    location_lng: 3.5852
  };
  const r = await rest(`/profiles?id=eq.${created.profileIds[name]}`, { method: 'PATCH', body: { ...base, ...overrides } });
  if (r.status !== 204 && r.status !== 200) throw new Error(`completeProfile(${name}) failed (${r.status})`);
}

async function uploadToPresign(name, kind, bytes) {
  const presign = await api('/uploads/presign', {
    token: created.tokens[name],
    method: 'POST',
    body: { kind, contentType: 'image/jpeg', contentLength: bytes.length }
  });
  const key = presign.data?.key || '';
  if (presign.status !== 200 || !presign.data?.uploadUrl) throw new Error(`presign ${kind} failed (${presign.status}: ${presign.data?.error || 'unknown'})`);
  const put = await fetch(presign.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: bytes });
  if (put.status !== 200) throw new Error(`upload ${kind} failed (HTTP ${put.status})`);
  mediaKeys.push(key);
  return key;
}

async function submitVerification(name, documentNumber) {
  const bytes = Buffer.from(`wassaa-admin-smoke-${name}-${stamp}-verification-bytes`);
  const idDocKey = await uploadToPresign(name, 'id_doc', bytes);
  const selfieKey = await uploadToPresign(name, 'selfie', bytes);
  const submit = await api('/verification/submit', {
    token: created.tokens[name],
    method: 'POST',
    body: { documentType: 'NIN', documentNumber, idDocKey, selfieKey }
  });
  if (submit.status !== 200 || submit.data?.status !== 'pending') {
    throw new Error(`verification submit failed (${submit.status}: ${submit.data?.error || 'unknown'})`);
  }
  return submit.data.submissionId;
}

async function cleanup() {
  step(KEEP ? 'fixtures kept (--keep): clean up later with the SQL/REST notes above' : 'teardown');
  try {
    for (const key of mediaKeys) {
      const status = await r2DeleteObject(key, backEnv.R2_PRIVATE_BUCKET?.trim() || backEnv.R2_BUCKET?.trim());
      if (KEEP) info('kept media', key);
      else if (status !== 204 && status !== 200 && status !== null) console.log(`  WARN  R2 delete ${key} → HTTP ${status}`);
    }
    for (const key of publicKeys) {
      const status = await r2DeleteObject(key, backEnv.R2_PUBLIC_BUCKET?.trim());
      if (KEEP) info('kept media', key);
      else if (status !== 204 && status !== 200 && status !== null) console.log(`  WARN  R2 delete ${key} → HTTP ${status}`);
    }
    if (KEEP) return;
    if (reportId) await rest(`/reports?id=eq.${reportId}`, { method: 'DELETE' });
    if (npcId && npcOriginal) {
      await rest(`/profiles?id=eq.${npcId}`, { method: 'PATCH', body: { bio: npcOriginal.bio, photos: npcOriginal.photos, npc_active: npcOriginal.npc_active } });
    }
    for (const name of ['target', 'reporter']) {
      const pid = created.profileIds[name];
      if (!pid) continue;
      await rest(`/messages?sender_id=eq.${pid}`, { method: 'DELETE' });
      await rest(`/matches?or=(user_a.eq.${pid},user_b.eq.${pid})`, { method: 'DELETE' });
      await rest(`/swipes?or=(from_user_id.eq.${pid},to_user_id.eq.${pid})`, { method: 'DELETE' });
      await rest(`/blocks?or=(blocker_id.eq.${pid},blocked_id.eq.${pid})`, { method: 'DELETE' });
      await rest(`/reports?or=(reporter_id.eq.${pid},reported_user_id.eq.${pid})`, { method: 'DELETE' });
      await rest(`/profiles?id=eq.${pid}`, { method: 'DELETE' });
    }
    await rest(`/admin_audit?admin_id=eq.${encodeURIComponent(ADMIN_LABEL)}`, { method: 'DELETE' });
    if (allowlistInserted) await rest(`/wassaa_admin_users?user_id=eq.${created.authIds.admin}`, { method: 'DELETE' });
    for (const name of ['target', 'reporter', 'admin']) {
      const uid = created.authIds[name];
      if (uid) await authAdmin(`/admin/users/${uid}`, { method: 'DELETE' });
    }
    // Verify the allowlist entry is really gone: a leftover console admin is a
    // security problem, so this is checked rather than assumed.
    const left = await rest(`/wassaa_admin_users?user_id=eq.${created.authIds.admin}&select=user_id`);
    if ((left.data || []).length) console.log('  WARN  allowlist entry still present — remove it manually: delete from wassaa_admin_users where user_id = \'' + created.authIds.admin + '\';');
    else console.log('  QA console admin, members, reports, appeals and audit rows removed.');
  } catch (e) {
    console.log(`  WARN  cleanup incomplete — ${e.message}`);
  }
}

// ---------------------------------------------------------------------- main

async function main() {
  step('0. Deployed Edge API and QA accounts');
  const health = await api('/health');
  check('GET /health is live', health.status === 200 && health.data?.ok === true, `status ${health.status}`);

  await createUser('admin');
  await createUser('target');
  await createUser('reporter');
  await completeProfile('target');
  await completeProfile('reporter');
  info('QA accounts', `admin=${created.authIds.admin} target=${created.profileIds.target} reporter=${created.profileIds.reporter}`);

  const preflight = await api('/admin/session', { token: created.tokens.admin });
  check('deployed API serves the admin routes (non-admin gets 403, not 404)',
    preflight.status === 403 && /not enabled/i.test(preflight.data?.error || ''),
    `status ${preflight.status}: ${preflight.data?.error || 'no error body'}`);
  if (preflight.status === 404) {
    console.log('\nThe deployed function predates the admin routes. Redeploy before trusting any result below.');
    return;
  }

  step('1. Allowlist gate');
  const insert = await rest('/wassaa_admin_users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: [{ user_id: created.authIds.admin, display_name: ADMIN_LABEL }]
  });
  allowlistInserted = insert.status === 201 || insert.status === 200;
  check('owner allowlists the QA admin (SQL-equivalent insert)', allowlistInserted, `status ${insert.status}`);
  const session = await api('/admin/session', { token: created.tokens.admin });
  check('allowlisted admin opens a console session', session.status === 200 && session.data?.ok === true, `status ${session.status}`);
  check('console reports R2 available for reviewer media', session.data?.storage === true, `storage=${session.data?.storage}`);
  const memberDenied = await api('/admin/verifications', { token: created.tokens.reporter });
  check('a plain member is refused the verification queue', memberDenied.status === 403, `status ${memberDenied.status}`);
  const emptyQueue = await api('/admin/verifications', { token: created.tokens.admin });
  check('admin reads the verification queue', emptyQueue.status === 200 && Array.isArray(emptyQueue.data?.queue), `status ${emptyQueue.status}`);

  step('2. Verification queue → approve');
  const targetSubmission = await submitVerification('target', '12345678901');
  const queue = await api('/admin/verifications', { token: created.tokens.admin });
  const queued = (queue.data?.queue || []).find((item) => item.id === targetSubmission);
  check('submission appears in the pending queue', Boolean(queued));
  check('queue carries the profile facts a reviewer compares against',
    Boolean(queued?.profile?.name) && Boolean(queued?.profile?.birthDate) && queued?.profile?.age > 0,
    `name=${queued?.profile?.name} age=${queued?.profile?.age}`);
  check('masked document number is shown, raw number never is', Boolean(queued?.documentNumberMasked) && !JSON.stringify(queued).includes('12345678901'));
  check('ID document is exposed as a signed private URL', /^https:\/\//.test(queued?.idDocUrl || '') && /X-Amz-Signature/i.test(queued?.idDocUrl || ''));
  check('selfie is exposed as a signed private URL', /^https:\/\//.test(queued?.selfieUrl || '') && /X-Amz-Signature/i.test(queued?.selfieUrl || ''));

  const approve = await api(`/admin/verifications/${targetSubmission}/review`, {
    token: created.tokens.admin,
    method: 'POST',
    body: { approve: true, note: 'QA: ID, selfie and date of birth all agree.' }
  });
  check('admin approves the submission', approve.status === 200 && approve.data?.success === true, `status ${approve.status}`);
  const targetProfile = await rest(`/profiles?id=eq.${created.profileIds.target}&select=verification_status,verified_at`);
  check('approval flips the profile to verified', targetProfile.data?.[0]?.verification_status === 'verified', JSON.stringify(targetProfile.data?.[0] || null));
  const reReview = await api(`/admin/verifications/${targetSubmission}/review`, { token: created.tokens.admin, method: 'POST', body: { approve: false } });
  check('a reviewed submission cannot be reviewed twice', reReview.status === 409, `status ${reReview.status}`);

  step('2b. Verification queue → reject with a note');
  const reporterSubmission = await submitVerification('reporter', '98765432109');
  const reject = await api(`/admin/verifications/${reporterSubmission}/review`, {
    token: created.tokens.admin,
    method: 'POST',
    body: { approve: false, note: 'QA: selfie does not match the document photo.' }
  });
  check('admin rejects the submission', reject.status === 200 && reject.data?.submission?.status === 'rejected', `status ${reject.status}`);
  const reporterSub = await rest(`/verification_submissions?id=eq.${reporterSubmission}&select=status,review_note,reviewed_by`);
  check('rejection note and reviewer are stored for the member to read',
    reporterSub.data?.[0]?.review_note === 'QA: selfie does not match the document photo.' && Boolean(reporterSub.data?.[0]?.reviewed_by),
    JSON.stringify(reporterSub.data?.[0] || null));

  step('3. Safety report with real DM evidence');
  // Build the conversation the way members do: two likes, then a match.
  const likeReporter = await api('/likes', { token: created.tokens.reporter, method: 'POST', body: { targetUserId: created.profileIds.target } });
  const likeTarget = await api('/likes', { token: created.tokens.target, method: 'POST', body: { targetUserId: created.profileIds.reporter } });
  const matchId = likeTarget.data?.match?.id || '';
  check('conversation exists between reporter and target',
    likeReporter.status === 200 && likeTarget.data?.isMatch === true && typeof matchId === 'string' && matchId.length === 36,
    `like=${likeReporter.status}/${likeTarget.status}, matchId=${matchId}`);
  const sendReporter = await api(`/matches/${matchId}/messages`, { token: created.tokens.reporter, method: 'POST', body: { kind: 'text', text: 'QA console smoke: opening message.' } });
  const sendTarget = await api(`/matches/${matchId}/messages`, { token: created.tokens.target, method: 'POST', body: { kind: 'text', text: 'QA console smoke: the message being reported.' } });
  check('both sides can talk (1 credit each)', sendReporter.status === 200 && sendTarget.status === 200, `${sendReporter.status}/${sendTarget.status}`);
  const reportedMessageId = sendTarget.data?.message?.id || '';
  const file = await api('/reports', {
    token: created.tokens.reporter,
    method: 'POST',
    body: {
      reportedUserId: created.profileIds.target,
      category: 'harassment',
      categoryLabel: 'Harassment',
      details: 'QA console smoke report with conversation evidence attached.',
      matchId,
      messageId: reportedMessageId
    }
  });
  check('report accepted with match + message evidence', file.status === 200 && Boolean(file.data?.report?.id), `status ${file.status}`);
  reportId = file.data?.report?.id || '';

  const reports = await api('/admin/reports?status=pending_review', { token: created.tokens.admin });
  const listed = (reports.data?.reports || []).find((r) => r.id === reportId);
  check('report appears in the admin list', Boolean(listed));
  check('list rows name both sides', Boolean(listed?.reporter?.name) && Boolean(listed?.reported?.name), `${listed?.reporter?.name} → ${listed?.reported?.name}`);
  check('list row carries the evidence linkage', Boolean(listed?.matchId) && Boolean(listed?.messageId));

  const context = await api(`/admin/reports/${reportId}/context`, { token: created.tokens.admin });
  check('review context loads', context.status === 200 && Boolean(context.data?.report), `status ${context.status}`);
  const convo = context.data?.conversation;
  check('context returns the full DM history',
    Array.isArray(convo?.messages) && convo.messages.length >= 2 &&
    convo.messages.some((m) => m.text === 'QA console smoke: opening message.') &&
    convo.messages.some((m) => m.text === 'QA console smoke: the message being reported.'),
    `messages=${convo?.messages?.length}`);
  check('context flags exactly the reported message', convo?.messages?.filter((m) => m.flagged).length === 1 && convo?.reportedMessageId === reportedMessageId);
  check('reported account shape includes identity the member cannot see',
    context.data?.reported?.email === accounts.target.email &&
    context.data?.reported?.verificationStatus === 'verified' &&
    Boolean(context.data?.reported?.createdAt),
    `verificationStatus=${context.data?.reported?.verificationStatus}`);
  check('context exposes the stored face-vs-ID media (verification retained)',
    Array.isArray(context.data?.verification) && context.data.verification.length >= 1 &&
    /^https:\/\//.test(context.data.verification[0]?.idDocUrl || ''),
    `submissions=${context.data?.verification?.length}`);
  check('reporter shape is returned too', context.data?.reporter?.id === created.profileIds.reporter);

  const badStatus = await api(`/admin/reports/${reportId}/status`, { token: created.tokens.admin, method: 'POST', body: { status: 'banana' } });
  check('invalid report status is refused', badStatus.status === 400, `status ${badStatus.status}`);
  const investigating = await api(`/admin/reports/${reportId}/status`, {
    token: created.tokens.admin,
    method: 'POST',
    body: { status: 'investigating', reviewNote: 'QA: reviewing the conversation.' }
  });
  check('report moves to investigating with a note',
    investigating.status === 200 && investigating.data?.report?.status === 'investigating' && investigating.data?.report?.reviewNote === 'QA: reviewing the conversation.',
    `status ${investigating.status}`);

  step('4. Restrict / ban / lift and member-side enforcement');
  const noReason = await api(`/admin/users/${created.profileIds.target}/sanction`, { token: created.tokens.admin, method: 'POST', body: { action: 'restrict', reason: 'x' } });
  check('restrict without a reason is refused', noReason.status === 400, `status ${noReason.status}`);
  const badAction = await api(`/admin/users/${created.profileIds.target}/sanction`, { token: created.tokens.admin, method: 'POST', body: { action: 'shadow-ban', reason: 'QA invalid action' } });
  check('unknown sanction action is refused', badAction.status === 400, `status ${badAction.status}`);
  const notAdmin = await api(`/admin/users/${created.profileIds.target}/sanction`, { token: created.tokens.reporter, method: 'POST', body: { action: 'ban', reason: 'QA not allowed' } });
  check('a plain member cannot sanction anyone', notAdmin.status === 403, `status ${notAdmin.status}`);

  const restrict = await api(`/admin/users/${created.profileIds.target}/sanction`, {
    token: created.tokens.admin, method: 'POST', body: { action: 'restrict', reason: 'QA: restricted pending review of the report.' }
  });
  check('admin restricts the account', restrict.status === 200 && restrict.data?.accountStatus === 'restricted', `status ${restrict.status}`);
  const restrictedSession = await api('/auth/session', { token: created.tokens.target });
  check('restricted member still loads a session carrying the reason',
    restrictedSession.status === 200 && restrictedSession.data?.user?.accountStatus === 'restricted' && /pending review/.test(restrictedSession.data?.user?.restrictionReason || ''),
    `status ${restrictedSession.status}`);
  const restrictedMutation = await api('/blocks', { token: created.tokens.target, method: 'POST', body: { blockedUserId: created.profileIds.reporter } });
  check('restricted member is refused a mutation (read-only)',
    restrictedMutation.status === 403 && restrictedMutation.data?.code === 'ACCOUNT_RESTRICTED' && /pending review/.test(restrictedMutation.data?.error || ''),
    `status ${restrictedMutation.status}, code ${restrictedMutation.data?.code}`);

  const lift = await api(`/admin/users/${created.profileIds.target}/sanction`, { token: created.tokens.admin, method: 'POST', body: { action: 'lift' } });
  check('admin lifts the restriction', lift.status === 200 && lift.data?.accountStatus === 'active', `status ${lift.status}`);
  const afterLift = await api('/blocks', { token: created.tokens.target, method: 'POST', body: { blockedUserId: created.profileIds.reporter } });
  check('lifted member can mutate again', afterLift.status === 200, `status ${afterLift.status}`);
  await api(`/blocks/${created.profileIds.reporter}`, { token: created.tokens.target, method: 'DELETE' });

  const ban = await api(`/admin/users/${created.profileIds.target}/sanction`, {
    token: created.tokens.admin, method: 'POST', body: { action: 'ban', reason: 'QA: banned while the report is investigated.' }
  });
  check('admin bans the account', ban.status === 200 && ban.data?.accountStatus === 'banned', `status ${ban.status}`);
  const bannedDiscovery = await api('/discovery', { token: created.tokens.target });
  check('banned member is refused discovery with ACCOUNT_BANNED',
    bannedDiscovery.status === 403 && bannedDiscovery.data?.code === 'ACCOUNT_BANNED' && /investigated/.test(bannedDiscovery.data?.error || ''),
    `status ${bannedDiscovery.status}, code ${bannedDiscovery.data?.code}`);
  const bannedSession = await api('/auth/session', { token: created.tokens.target });
  check('banned member can still load a session (appeal path)',
    bannedSession.status === 200 && bannedSession.data?.user?.accountStatus === 'banned', `status ${bannedSession.status}`);

  step('5. Appeals');
  const tooShort = await api('/appeals', { token: created.tokens.target, method: 'POST', body: { note: 'short' } });
  check('a too-short appeal note is refused', tooShort.status === 400, `status ${tooShort.status}`);
  const appeal = await api('/appeals', { token: created.tokens.target, method: 'POST', body: { note: 'QA: this ban is a mistake — please review the conversation again.' } });
  const appealId = appeal.data?.appeal?.id;
  check('banned member can file an appeal', appeal.status === 200 && Boolean(appealId), `status ${appeal.status}`);
  const duplicate = await api('/appeals', { token: created.tokens.target, method: 'POST', body: { note: 'QA: duplicate appeal attempt should be refused.' } });
  check('a second pending appeal is refused', duplicate.status === 409 && duplicate.data?.code === 'APPEAL_PENDING', `status ${duplicate.status}`);

  const pendingAppeals = await api('/admin/appeals?status=pending', { token: created.tokens.admin });
  const queuedAppeal = (pendingAppeals.data?.appeals || []).find((a) => a.id === appealId);
  check('appeal appears in the admin queue with the account snapshot',
    Boolean(queuedAppeal) && queuedAppeal?.profile?.accountStatus === 'banned' && /investigated/.test(queuedAppeal?.sanctionReason || ''),
    `status ${queuedAppeal?.profile?.accountStatus}`);
  const memberDecision = await api(`/admin/appeals/${appealId}/decision`, { token: created.tokens.reporter, method: 'POST', body: { grant: true } });
  check('a plain member cannot decide an appeal', memberDecision.status === 403, `status ${memberDecision.status}`);

  const grant = await api(`/admin/appeals/${appealId}/decision`, { token: created.tokens.admin, method: 'POST', body: { grant: true, note: 'QA: reinstated after review.' } });
  check('admin grants the appeal', grant.status === 200 && grant.data?.status === 'granted', `status ${grant.status}`);
  const reinstated = await api('/auth/session', { token: created.tokens.target });
  check('granting reinstates the account and clears the sanction',
    reinstated.status === 200 && reinstated.data?.user?.accountStatus === 'active' && !reinstated.data?.user?.restrictionReason,
    `status ${reinstated.status}, accountStatus=${reinstated.data?.user?.accountStatus}`);
  const reDecide = await api(`/admin/appeals/${appealId}/decision`, { token: created.tokens.admin, method: 'POST', body: { grant: false } });
  check('a decided appeal cannot be decided again', reDecide.status === 409, `status ${reDecide.status}`);

  step('5b. Appeal denial keeps the sanction and shows the member why');
  // Runs on the reporter account: a member gets 3 appeal attempts per day, and
  // the target already spent two (filed + duplicate) proving the queue path.
  const banReporter = await api(`/admin/users/${created.profileIds.reporter}/sanction`, { token: created.tokens.admin, method: 'POST', body: { action: 'ban', reason: 'QA: reporter banned for the denial path.' } });
  check('admin bans the reporter for the denial path', banReporter.status === 200 && banReporter.data?.accountStatus === 'banned', `status ${banReporter.status}`);
  const appeal2 = await api('/appeals', { token: created.tokens.reporter, method: 'POST', body: { note: 'QA: appeal expected to be denied in this test.' } });
  check('banned reporter files the appeal', appeal2.status === 200 && Boolean(appeal2.data?.appeal?.id), `status ${appeal2.status}: ${appeal2.data?.error || ''}`);
  const deny = await api(`/admin/appeals/${appeal2.data?.appeal?.id}/decision`, { token: created.tokens.admin, method: 'POST', body: { grant: false, note: 'QA: the report evidence stands.' } });
  check('admin denies the appeal', deny.status === 200 && deny.data?.status === 'denied', `status ${deny.status}`);
  const deniedRead = await api('/appeals', { token: created.tokens.reporter });
  const deniedRow = (deniedRead.data?.appeals || [])[0];
  check('member reads the denial and its decision note',
    deniedRow?.status === 'denied' && deniedRow?.decisionNote === 'QA: the report evidence stands.' && /denial path/.test(deniedRow?.sanctionReason || ''),
    `status=${deniedRow?.status}`);
  const stillBanned = await api('/blocks', { token: created.tokens.reporter, method: 'POST', body: { blockedUserId: created.profileIds.target } });
  check('denied appeal leaves the member banned',
    stillBanned.status === 403 && stillBanned.data?.code === 'ACCOUNT_BANNED', `status ${stillBanned.status}`);
  await api(`/admin/users/${created.profileIds.reporter}/sanction`, { token: created.tokens.admin, method: 'POST', body: { action: 'lift' } });

  step('6. Persona editing');
  const persona = await rest('/profiles?is_npc=eq.true&npc_active=eq.true&select=id,name,bio,photos,npc_active,npc&limit=1');
  const seed = persona.data?.[0];
  check('seeded personas are available to edit', Boolean(seed?.id), seed?.name || 'none');
  if (seed) {
    npcId = seed.id;
    npcOriginal = { bio: seed.bio, photos: seed.photos, npc_active: seed.npc_active };
    const searchName = String(seed.name).split(' ')[0];
    const search = await api(`/admin/npcs?search=${encodeURIComponent(searchName)}`, { token: created.tokens.admin });
    const found = (search.data?.npcs || []).find((n) => n.id === npcId);
    check('admin search finds the persona', search.status === 200 && Boolean(found), `status ${search.status}`);
    check('persona rows carry the persona internals (hidden from members)', Boolean(found?.persona) && typeof found.persona === 'object');

    const newBio = `QA smoke edited bio ${stamp} — safe to overwrite.`;
    const patch = await api(`/admin/npcs/${npcId}`, { token: created.tokens.admin, method: 'PATCH', body: { bio: newBio, active: false } });
    check('admin edits biography and pauses the persona', patch.status === 200 && patch.data?.success === true, `status ${patch.status}`);
    const after = await rest(`/profiles?id=eq.${npcId}&select=bio,npc_active`);
    check('edit is persisted (bio + paused flag)', after.data?.[0]?.bio === newBio && after.data?.[0]?.npc_active === false, JSON.stringify(after.data?.[0] || null));
    const detail = await api(`/admin/users/${npcId}`, { token: created.tokens.admin });
    check('account detail view exposes the paused state', detail.status === 200 && detail.data?.user?.npc_active === false);

    const notNpc = await api(`/admin/npcs/${created.profileIds.target}`, { token: created.tokens.admin, method: 'PATCH', body: { bio: 'QA: must not edit a member profile.' } });
    check('editing a real member through the persona route is refused', notNpc.status === 409, `status ${notNpc.status}`);
    const missing = await api('/admin/npcs/00000000-0000-0000-0000-000000000000', { token: created.tokens.admin, method: 'PATCH', body: { bio: 'QA: no such persona.' } });
    check('editing a missing persona returns 404', missing.status === 404, `status ${missing.status}`);

    const badType = await api(`/admin/npcs/${npcId}/photo-presign`, { token: created.tokens.admin, method: 'POST', body: { contentType: 'image/svg+xml', contentLength: 100 } });
    check('non-raster photo type is refused', badType.status === 415, `status ${badType.status}`);
    const bytes = Buffer.from(`wassaa-admin-smoke-npc-photo-${stamp}`);
    const presign = await api(`/admin/npcs/${npcId}/photo-presign`, { token: created.tokens.admin, method: 'POST', body: { contentType: 'image/jpeg', contentLength: bytes.length } });
    const photoOk = presign.status === 200 && Boolean(presign.data?.uploadUrl) && Boolean(presign.data?.publicUrl);
    check('admin presigns a persona photo upload', photoOk, `status ${presign.status}`);
    if (photoOk) {
      const put = await fetch(presign.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: bytes });
      check('presigned URL accepts the image bytes', put.status === 200, `HTTP ${put.status}`);
      publicKeys.push(presign.data.key);
      const attached = await api(`/admin/npcs/${npcId}/photos`, { token: created.tokens.admin, method: 'POST', body: { photos: [presign.data.publicUrl] } });
      check('attach photo updates the persona gallery', attached.status === 200 && attached.data?.photos?.[0] === presign.data.publicUrl, `status ${attached.status}`);
      const served = await fetch(presign.data.publicUrl).then((r) => r.status).catch((e) => `error: ${e.message}`);
      check('public URL serves the uploaded persona photo', served === 200, `HTTP ${served}`);
      const badPhotos = await api(`/admin/npcs/${npcId}/photos`, { token: created.tokens.admin, method: 'POST', body: { photos: 'not-an-array' } });
      check('photo attach rejects a non-array payload', badPhotos.status === 400, `status ${badPhotos.status}`);
      await rest(`/profiles?id=eq.${npcId}`, { method: 'PATCH', body: { photos: npcOriginal.photos } });
    }
    await api(`/admin/npcs/${npcId}`, { token: created.tokens.admin, method: 'PATCH', body: { bio: npcOriginal.bio, active: true } });
  }

  step('7. Audit trail');
  const audit = await api('/admin/audit?limit=100', { token: created.tokens.admin });
  const actions = (audit.data?.actions || []).filter((a) => a.adminId === ADMIN_LABEL).map((a) => a.action);
  for (const expected of ['verification.approved', 'verification.rejected', 'report.status', 'user.restrict', 'user.ban', 'user.lift', 'appeal.granted', 'appeal.denied', 'npc.updated', 'npc.photos']) {
    check(`audit records ${expected}`, actions.includes(expected), `found ${actions.length} entries`);
  }
  check('audit entries carry the acted-on subject', (audit.data?.actions || []).some((a) => a.adminId === ADMIN_LABEL && a.targetId));
  const nonAdminAudit = await api('/admin/audit', { token: created.tokens.reporter });
  check('a plain member cannot read the audit trail', nonAdminAudit.status === 403, `status ${nonAdminAudit.status}`);

  step('8. Report resolution closes the loop');
  const resolved = await api(`/admin/reports/${reportId}/status`, { token: created.tokens.admin, method: 'POST', body: { status: 'resolved', reviewNote: 'QA: resolved after review.' } });
  check('report resolves with a note', resolved.status === 200 && resolved.data?.report?.status === 'resolved', `status ${resolved.status}`);
  const resolvedList = await api('/admin/reports?status=resolved', { token: created.tokens.admin });
  check('resolved filter returns it', (resolvedList.data?.reports || []).some((r) => r.id === reportId));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`  FAIL  unexpected error — ${redact(e?.message || e)}`);
} finally {
  await cleanup();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
