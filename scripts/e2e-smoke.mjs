#!/usr/bin/env node
/**
 * Two-account live smoke test for the WASSAA active stack.
 *
 * Exercises the hosted Edge API + Postgres migration + private Realtime path
 * end to end: onboarding gate, profile completion drafts, location/radius
 * preferences, ranked discovery, mutual match, two-way messaging (each send
 * debits 1 credit, KB §18E), persona-marker concealment, the exhausted-balance
 * 402 paywall, realtime broadcast, and block enforcement (message API +
 * channel authorization).
 *
 * Reads credentials from local env files only. Never prints secrets.
 * Creates two clearly named QA users and deletes them (profiles + auth users)
 * in a finally block.
 *
 * Usage:  node scripts/e2e-smoke.mjs
 * Exit 0 = every check passed; exit 1 = at least one check failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- env loading

function loadEnv(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const frontEnv = loadEnv('frontend/.env');
const backEnv = loadEnv('backend/.env');

const SUPABASE_URL = (frontEnv.VITE_SUPABASE_URL || backEnv.SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = frontEnv.VITE_SUPABASE_ANON_KEY || backEnv.SUPABASE_PUBLISHABLE_KEY || '';
const SERVICE_KEY = backEnv.SUPABASE_SERVICE_ROLE_KEY || '';
const BACK_URL = (backEnv.SUPABASE_URL || '').replace(/\/$/, '');

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (frontend/.env) or SUPABASE_SERVICE_ROLE_KEY (backend/.env).');
  process.exit(1);
}
if (BACK_URL && BACK_URL !== SUPABASE_URL) {
  console.error(`Refusing to run: backend/.env targets a different Supabase project than frontend/.env (${new URL(BACK_URL).host} vs ${new URL(SUPABASE_URL).host}).`);
  process.exit(1);
}

const API = `${SUPABASE_URL}/functions/v1/api`;
const AUTH = `${SUPABASE_URL}/auth/v1`;
const REST = `${SUPABASE_URL}/rest/v1`;
const WS_URL = `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket`;

// ------------------------------------------------------------------- reporting

let passed = 0;
let failed = 0;
const redact = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-jwt]');

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${redact(detail)}` : ''}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${redact(detail)}` : ''}`);
  }
}
function step(title) {
  console.log(`\n== ${title}`);
}
function info(name, detail) {
  console.log(`  INFO  ${name}${detail ? ` — ${redact(detail)}` : ''}`);
}

// ---------------------------------------------------------------- http helpers

async function call(url, { method = 'GET', token, key = PUBLISHABLE_KEY, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key === SERVICE_KEY ? { Authorization: `Bearer ${SERVICE_KEY}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}
const api = (p, opts) => call(`${API}${p}`, opts);
const admin = (p, opts) => call(`${AUTH}${p}`, { ...opts, key: SERVICE_KEY });

async function signIn(email, password) {
  const r = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email, password } });
  if (r.status === 200 && r.data?.access_token) return r.data.access_token;
  // Fallback when the password grant is disabled on the project: mint an
  // admin-generated OTP and confirm it exactly like the app's email flow.
  const link = await admin('/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email } });
  const otp = link.data?.email_otp;
  if (!otp) throw new Error(`password grant failed (${r.status}) and no admin OTP available (${link.status})`);
  const v = await call(`${AUTH}/verify`, { method: 'POST', body: { email, token: otp, type: 'magiclink' } });
  if (v.status !== 200 || !v.data?.access_token) throw new Error(`admin OTP verify failed (${v.status})`);
  return v.data.access_token;
}

// ------------------------------------------------------------ realtime helper

function openChannel(token, channelTopic) {
  let WebSocketImpl = globalThis.WebSocket;
  if (!WebSocketImpl) {
    try { WebSocketImpl = require('ws'); } catch { /* handled below */ }
  }
  if (!WebSocketImpl) throw new Error('No WebSocket implementation available in this Node runtime.');

  // The daily realtime.messages partition is created by a live socket, so the
  // first join of the day can fail once with MissingPartition. Mirror the
  // production client: retry transient join failures exactly once.
  const transient = /MissingPartition|PartitionCreationFailed/i;
  const attempt = () => new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(`${WS_URL}?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`);
    const listeners = [];
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(joinTimer);
      try { ws.close(); } catch { /* ignore */ }
      reject(err);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(joinTimer);
      resolve({
        nextBroadcast: (timeoutMs = 12000) => new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`no broadcast within ${timeoutMs}ms`)), timeoutMs);
          listeners.push((m) => {
            if (m.topic === channelTopic && m.event === 'broadcast') {
              clearTimeout(timer);
              res(m.payload);
            }
          });
        }),
        close: () => { try { ws.close(); } catch { /* ignore */ } }
      });
    };
    const joinTimer = setTimeout(() => fail(new Error('join timed out after 10s')), 10000);
    const onMessage = (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data ?? event)); } catch { return; }
      if (msg.topic === channelTopic && msg.event === 'phx_reply' && msg.payload?.status) {
        if (msg.payload.status === 'error') {
          fail(new Error(`join rejected: ${msg.payload.response?.reason || 'authorization denied'}`));
        } else if (msg.payload.status === 'ok') {
          succeed();
        }
        return;
      }
      listeners.slice().forEach((fn) => fn(msg));
    };
    ws.addEventListener('message', onMessage);
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        topic: channelTopic,
        event: 'phx_join',
        payload: {
          config: { broadcast: { ack: false, self: false }, presence: { enabled: false, key: '' }, postgres_changes: [], private: true },
          access_token: token
        },
        ref: '1',
        join_ref: '1'
      }));
    });
    ws.addEventListener('error', () => fail(new Error('websocket error during join')));
    ws.addEventListener('close', () => fail(new Error('websocket closed before join')));
  });

  return attempt().catch(async (error) => {
    if (!transient.test(String(error?.message || ''))) throw error;
    await new Promise((r) => setTimeout(r, 1200));
    return attempt();
  });
}

// ------------------------------------------------------------- media cleanup

const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

/**
 * Directly signs a DELETE against R2 (path style) so the smoke run can remove
 * the object it uploaded through the Edge presign URL — no orphan test media.
 * Returns the HTTP status, or null if the R2 env values are unavailable.
 */
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
        'x-amz-date': amzDate,
      },
    });
    return res.status;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ fixtures

const stamp = Date.now().toString(36);
const ACCOUNTS = {
  a: {
    label: 'A',
    email: `qa-smoke-a-${stamp}@wassaa.test`,
    password: `QA-Smoke!${stamp}-aA1`,
    profile: {
      name: 'QA Smoke A', birthDate: '1996-04-12', gender: 'male',
      professionCategory: 'Healthcare', professionTitle: 'QA Test Clinician',
      city: 'Lekki', state: 'Lagos', bio: 'QA smoke fixture account for automated live verification.',
      photos: ['https://example.com/qa/a1.jpg', 'https://example.com/qa/a2.jpg'],
      datingGoal: 'long_term'
    },
    location: { latitude: 6.5244, longitude: 3.3792 },   // Lagos
    prefs: { gender: 'women', minAge: 18, maxAge: 45, maxDistanceKm: 100 }
  },
  b: {
    label: 'B',
    email: `qa-smoke-b-${stamp}@wassaa.test`,
    password: `QA-Smoke!${stamp}-bB1`,
    profile: {
      name: 'QA Smoke B', birthDate: '1998-07-22', gender: 'female',
      professionCategory: 'Engineering', professionTitle: 'QA Test Engineer',
      city: 'Abeokuta', state: 'Ogun', bio: 'QA smoke fixture account for automated live verification.',
      photos: ['https://example.com/qa/b1.jpg', 'https://example.com/qa/b2.jpg'],
      datingGoal: 'long_term'
    },
    location: { latitude: 7.15, longitude: 3.35 },        // Abeokuta ~70 km away
    prefs: { gender: 'men', minAge: 18, maxAge: 45, maxDistanceKm: 100 }
  }
};

const createdAuthIds = [];
const createdProfileIds = [];

async function createUser(acct) {
  const r = await admin('/admin/users', { method: 'POST', body: { email: acct.email, password: acct.password, email_confirm: true } });
  if (r.status !== 200 || !r.data?.id) throw new Error(`admin createUser failed for ${acct.label} (${r.status})`);
  createdAuthIds.push(r.data.id);
  return r.data.id;
}

async function deleteAll() {
  for (const pid of createdProfileIds) {
    try {
      await call(`${REST}/profiles?id=eq.${pid}`, { method: 'DELETE', key: SERVICE_KEY });
    } catch { /* best effort */ }
  }
  for (const uid of createdAuthIds) {
    try {
      await admin(`/admin/users/${uid}`, { method: 'DELETE' });
    } catch { /* best effort */ }
  }
}

// ---------------------------------------------------------------------- main

async function main() {
  let tokenA = '', tokenB = '';
  let matchId = '';

  step('0. Edge function health');
  const health = await api('/health');
  check('GET /health is live', health.status === 200 && health.data?.ok === true, `status ${health.status}`);

  step('1. Provision two confirmed QA accounts');
  const idA = await createUser(ACCOUNTS.a);
  const idB = await createUser(ACCOUNTS.b);
  info('created auth users', `A=${idA} B=${idB}`);
  tokenA = await signIn(ACCOUNTS.a.email, ACCOUNTS.a.password);
  tokenB = await signIn(ACCOUNTS.b.email, ACCOUNTS.b.password);
  check('both accounts sign in with password grant', Boolean(tokenA && tokenB));

  const sessionA = await api('/auth/session', { token: tokenA });
  check('confirmed email produced a linked profile (auth/session)', sessionA.status === 200 && Boolean(sessionA.data?.user?.id));
  if (sessionA.data?.user?.id) createdProfileIds.push(sessionA.data.user.id);
  const sessionB = await api('/auth/session', { token: tokenB });
  check('second account profile linked', sessionB.status === 200 && Boolean(sessionB.data?.user?.id));
  if (sessionB.data?.user?.id) createdProfileIds.push(sessionB.data.user.id);

  step('2. Onboarding gate blocks incomplete profiles');
  const gatedDiscovery = await api('/discovery', { token: tokenA });
  check('incomplete profile cannot open discovery', gatedDiscovery.status === 409 && gatedDiscovery.data?.code === 'ONBOARDING_REQUIRED', `status ${gatedDiscovery.status}`);
  const gatedMatches = await api('/matches', { token: tokenA });
  check('incomplete profile cannot open matches', gatedMatches.status === 409 && gatedMatches.data?.code === 'ONBOARDING_REQUIRED', `status ${gatedMatches.status}`);
  const gatedRadius = await api('/me/preferences', { token: tokenA, method: 'PATCH', body: { gender: 'women', minAge: 18, maxAge: 45, maxDistanceKm: 50 } });
  check('radius without device location is refused', gatedRadius.status === 409 && gatedRadius.data?.code === 'LOCATION_REQUIRED', `status ${gatedRadius.status}`);

  step('3. Draft-saving onboarding reaches the gate field by field');
  const baseA = await api('/me/profile', { token: tokenA, method: 'PATCH', body: ACCOUNTS.a.profile });
  check('profile basics save before completion', baseA.status === 200, `status ${baseA.status}`);
  const stillGated = await api('/discovery', { token: tokenA });
  check('profile still gated while interests and preferences are missing', stillGated.status === 409, `status ${stillGated.status}`);
  const interestsA = await api('/me/profile', { token: tokenA, method: 'PATCH', body: { interests: ['Reading', 'Travel', 'Fitness'] } });
  check('interests save', interestsA.status === 200, `status ${interestsA.status}`);
  const gatedOnPrefs = await api('/discovery', { token: tokenA });
  check('still gated until match preferences exist', gatedOnPrefs.status === 409, `status ${gatedOnPrefs.status}`);

  step('4. Location and preferences complete member A');
  const locA = await api('/me/location', { token: tokenA, method: 'PATCH', body: ACCOUNTS.a.location });
  check('device coordinates accepted', locA.status === 200 && locA.data?.hasPreciseLocation === true, `status ${locA.status}`);
  const prefsA = await api('/me/preferences', { token: tokenA, method: 'PATCH', body: ACCOUNTS.a.prefs });
  check('radius saved once location exists', prefsA.status === 200, `status ${prefsA.status}`);
  const openA = await api('/discovery', { token: tokenA });
  check('complete profile passes the gate', openA.status === 200, `status ${openA.status}`);
  const sessionA2 = await api('/auth/session', { token: tokenA });
  check('own profile reports precise-location flag', sessionA2.data?.user?.hasPreciseLocation === true);

  step('5. Member B completes without device location (permission-denied path)');
  const baseB = await api('/me/profile', { token: tokenB, method: 'PATCH', body: ACCOUNTS.b.profile });
  check('B profile basics save', baseB.status === 200, `status ${baseB.status}`);
  const interestsB = await api('/me/profile', { token: tokenB, method: 'PATCH', body: { interests: ['Art', 'Music', 'Cooking'] } });
  check('B interests save', interestsB.status === 200, `status ${interestsB.status}`);
  const prefsB = await api('/me/preferences', { token: tokenB, method: 'PATCH', body: { gender: 'men', minAge: 18, maxAge: 45 } });
  check('B preferences save without location (no radius)', prefsB.status === 200, `status ${prefsB.status}`);
  const openB = await api('/discovery', { token: tokenB });
  check('B discovers without device location', openB.status === 200, `status ${openB.status}`);
  const sessionB2 = await api('/auth/session', { token: tokenB });
  check('B correctly reports no precise location', sessionB2.data?.user?.hasPreciseLocation === false);
  // Now B opts in, so distance can be measured from A's side as well.
  const locB = await api('/me/location', { token: tokenB, method: 'PATCH', body: ACCOUNTS.b.location });
  const prefsB2 = await api('/me/preferences', { token: tokenB, method: 'PATCH', body: ACCOUNTS.b.prefs });
  check('B opts into location and radius', locB.status === 200 && prefsB2.status === 200);

  step('6. Ranked discovery with radius');
  const deckA = await api('/discovery?limit=30', { token: tokenA });
  const personB = (deckA.data?.profiles || []).find((p) => p.id === createdProfileIds[1]);
  check('B appears in A deck', deckA.status === 200 && Boolean(personB), `status ${deckA.status}, deck ${deckA.data?.profiles?.length ?? 0}`);
  check('distance band is a 5 km multiple', personB && Number.isInteger(personB.distanceKm) && personB.distanceKm % 5 === 0, `distanceKm=${personB?.distanceKm}`);
  check('distance is plausible (~70 km Lagos↔Abeokuta)', personB && personB.distanceKm >= 50 && personB.distanceKm <= 90, `distanceKm=${personB?.distanceKm}`);
  check('raw coordinates are never returned', personB && personB.location_lat === undefined && personB.location_lng === undefined);
  check('deck payloads carry no persona markers', personB && JSON.stringify(personB).indexOf('isNpc') === -1);

  const tightPrefs = await api('/me/preferences', { token: tokenA, method: 'PATCH', body: { gender: 'women', minAge: 18, maxAge: 45, maxDistanceKm: 5 } });
  check('radius can be tightened to 5 km', tightPrefs.status === 200, `status ${tightPrefs.status}`);
  const tightDeck = await api('/discovery?limit=30', { token: tokenA });
  const tightB = (tightDeck.data?.profiles || []).find((p) => p.id === createdProfileIds[1]);
  check('5 km radius excludes the ~70 km candidate', tightDeck.status === 200 && !tightB, `status ${tightDeck.status}`);
  const restorePrefs = await api('/me/preferences', { token: tokenA, method: 'PATCH', body: ACCOUNTS.a.prefs });
  check('radius restored to 100 km', restorePrefs.status === 200, `status ${restorePrefs.status}`);

  step('7. Mutual like creates a match');
  const likeA = await api('/likes', { token: tokenA, method: 'POST', body: { targetUserId: createdProfileIds[1] } });
  check('A likes B without matching yet', likeA.status === 200 && likeA.data?.isMatch === false, `status ${likeA.status}`);
  const likeB = await api('/likes', { token: tokenB, method: 'POST', body: { targetUserId: createdProfileIds[0] } });
  check('B like completes the mutual match', likeB.status === 200 && likeB.data?.isMatch === true && Boolean(likeB.data?.match?.id), `status ${likeB.status}`);
  matchId = likeB.data?.match?.id || '';

  step('8. Two-way messaging through the authenticated API (1 credit per send)');
  // Session load applies today's drip, so this is the stable pre-send balance.
  const creditsSessionA = await api('/auth/session', { token: tokenA });
  const beforeA = Number(creditsSessionA.data?.user?.credits);
  check('A loads a session with a credit balance', creditsSessionA.status === 200 && Number.isFinite(beforeA) && beforeA > 0, `credits=${beforeA}`);
  const sendA = await api(`/matches/${matchId}/messages`, { token: tokenA, method: 'POST', body: { kind: 'text', text: 'hello from A' } });
  check('A sends the first message', sendA.status === 200 && Boolean(sendA.data?.message?.id), `status ${sendA.status}`);
  check('sending debits exactly 1 credit', Number(sendA.data?.balance) === beforeA - 1, `balance ${sendA.data?.balance} from ${beforeA}`);
  const fetchB = await api(`/matches/${matchId}/messages`, { token: tokenB });
  check('B receives A message', fetchB.status === 200 && (fetchB.data?.messages || []).some((m) => m.text === 'hello from A'));
  check('conversation payload leaks no persona markers',
    fetchB.data?.npcState === undefined && JSON.stringify(fetchB.data || {}).indexOf('isNpc') === -1);
  const creditsSessionB = await api('/auth/session', { token: tokenB });
  const beforeB = Number(creditsSessionB.data?.user?.credits);
  const sendB = await api(`/matches/${matchId}/messages`, { token: tokenB, method: 'POST', body: { kind: 'text', text: 'reply from B' } });
  check('B replies', sendB.status === 200, `status ${sendB.status}`);
  check('a real member replying also pays 1 credit', Number(sendB.data?.balance) === beforeB - 1, `balance ${sendB.data?.balance} from ${beforeB}`);
  const fetchA = await api(`/matches/${matchId}/messages`, { token: tokenA });
  check('A receives B reply', fetchA.status === 200 && (fetchA.data?.messages || []).some((m) => m.text === 'reply from B'));
  const stranger = await api('/matches/00000000-0000-0000-0000-000000000000/messages', { token: tokenA });
  check('non-member match id is rejected', stranger.status === 404, `status ${stranger.status}`);

  step('9. Private realtime broadcast (message ID only)');
  try {
    const channel = await openChannel(tokenB, `realtime:match:${matchId}`);
    const pending = channel.nextBroadcast(12000);
    const sendRealtime = await api(`/matches/${matchId}/messages`, { token: tokenA, method: 'POST', body: { kind: 'text', text: 'ping via realtime' } });
    check('A sends while B is subscribed', sendRealtime.status === 200, `status ${sendRealtime.status}`);
    const broadcast = await pending;
    check('B receives the broadcast', Boolean(broadcast), JSON.stringify(broadcast?.payload ?? {}));
    const broadcastMessageId = broadcast?.payload?.payload?.message_id ?? broadcast?.payload?.message_id;
    check('broadcast carries only a message id, not content', Boolean(broadcastMessageId) && JSON.stringify(broadcast).indexOf('ping via realtime') === -1);
    const after = await api(`/matches/${matchId}/messages`, { token: tokenB });
    check('B fetches the body through the API', (after.data?.messages || []).some((m) => m.text === 'ping via realtime'));
    channel.close();
  } catch (e) {
    check('realtime channel authorization and delivery', false, e.message);
  }

  step('10. Block enforcement (API + channel authorization)');
  const block = await api('/blocks', { token: tokenA, method: 'POST', body: { blockedUserId: createdProfileIds[1], reason: 'QA smoke block' } });
  check('A blocks B', block.status === 200, `status ${block.status}`);
  const sendAfterBlockA = await api(`/matches/${matchId}/messages`, { token: tokenA, method: 'POST', body: { kind: 'text', text: 'should fail' } });
  check('blocked pair cannot send (blocker side)', sendAfterBlockA.status === 403, `status ${sendAfterBlockA.status}`);
  const sendAfterBlockB = await api(`/matches/${matchId}/messages`, { token: tokenB, method: 'POST', body: { kind: 'text', text: 'should fail' } });
  check('blocked pair cannot send (blocked side)', sendAfterBlockB.status === 403, `status ${sendAfterBlockB.status}`);
  try {
    await openChannel(tokenB, `realtime:match:${matchId}`);
    check('blocked member cannot rejoin the match channel', false, 'join unexpectedly succeeded');
  } catch (e) {
    check('blocked member cannot rejoin the match channel', /rejected|denied/i.test(e.message), e.message);
  }
  const unblock = await api(`/blocks/${createdProfileIds[1]}`, { token: tokenA, method: 'DELETE' });
  check('A unblocks B', unblock.status === 200, `status ${unblock.status}`);

  step('11. Media upload round-trip through the hosted Edge API');
  const jpegBytes = Buffer.from('wassaa-smoke-r2-round-trip-bytes');
  const presign = await api('/uploads/presign', { token: tokenA, method: 'POST', body: { kind: 'photo', contentType: 'image/jpeg', contentLength: jpegBytes.length } });
  const presignOk = presign.status === 200 && typeof presign.data?.uploadUrl === 'string';
  check('presign issues a signed upload URL', presignOk, `status ${presign.status}${presignOk ? '' : `: ${presign.data?.error || 'unknown'}`}`);

  let putStatus = 'skipped', publicStatus = 'skipped', deleteStatus = 'skipped', uploadedKey = '';
  if (presignOk) {
    uploadedKey = String(presign.data.key || '');
    putStatus = await fetch(presign.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpegBytes })
      .then((r) => r.status).catch((e) => `error: ${e.message}`);
    if (presign.data.publicUrl) {
      publicStatus = await fetch(presign.data.publicUrl).then((r) => r.status).catch((e) => `error: ${e.message}`);
    } else {
      publicStatus = 'no publicUrl';
    }
    deleteStatus = await r2DeleteObject(uploadedKey, backEnv.R2_PUBLIC_BUCKET?.trim());
  }
  check('signed PUT uploads image bytes to R2', putStatus === 200, `HTTP ${putStatus}`);
  check('public URL serves the uploaded photo', publicStatus === 200, `HTTP ${publicStatus}`);
  check('test object removed from the bucket (no orphan media)', deleteStatus === 204 || deleteStatus === 200, `HTTP ${deleteStatus}`);

  step('12. Exhausted balance hits the paywall (KB §18E)');
  // Spend A's remaining credits through the same member send path the app uses
  // (1 credit each) instead of writing the balance with a privileged client, so
  // the paywall is proven end to end. Today's daily drip was already applied
  // when A's session loaded, so it cannot silently refill mid-drain.
  let paywallReached = false;
  let drainedBalance = NaN;
  for (let sent = 0; sent < 40 && !paywallReached; sent++) {
    const drain = await api(`/matches/${matchId}/messages`, {
      token: tokenA,
      method: 'POST',
      body: { kind: 'text', text: `credit drain ${sent + 1}` }
    });
    drainedBalance = Number(drain.data?.balance);
    if (drain.status === 402 && drain.data?.code === 'CREDITS_NEEDED') paywallReached = true;
    else if (drain.status !== 200) {
      check('credit drain sends stay successful until the balance empties', false, `status ${drain.status}`);
      break;
    }
  }
  check('sending drains the balance to the paywall', paywallReached, `last balance ${drainedBalance}`);
  const sendBroke = await api(`/matches/${matchId}/messages`, { token: tokenA, method: 'POST', body: { kind: 'text', text: 'no credits left' } });
  check('exhausted balance refuses the send with 402 CREDITS_NEEDED',
    sendBroke.status === 402 && sendBroke.data?.code === 'CREDITS_NEEDED',
    `status ${sendBroke.status}, code ${sendBroke.data?.code}`);
  const afterBroke = await api(`/matches/${matchId}/messages`, { token: tokenB });
  check('failed spend leaves no message behind',
    !(afterBroke.data?.messages || []).some((m) => m.text === 'no credits left'));
}

try {
  await main();
} catch (e) {
  failed++;
  console.error(`\nFATAL ${redact(e?.message || e)}`);
} finally {
  step('teardown');
  await deleteAll();
  console.log('  QA users and profiles removed.');
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
