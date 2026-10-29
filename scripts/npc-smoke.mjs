#!/usr/bin/env node
/**
 * Persona-loop smoke test (KB §18C/§18E).
 *
 * Proves the seeded NPC deck is not just browseable: a real member can match a
 * persona, the persona opens the conversation on its own, the member's message
 * costs exactly 1 credit, and the persona replies through the normal message
 * path. Also checks that no persona marker ever reaches the client.
 *
 * Reads local env files only (never prints secrets), creates one QA account and
 * deletes it plus its profile, swipes, matches and messages in a finally block.
 *
 * Usage: node scripts/npc-smoke.mjs
 * Exit 0 = every check passed; 1 = at least one failed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const rest = (p, opts) => call(`${REST}${p}`, { ...opts, key: SERVICE_KEY });

const stamp = Date.now();
const email = `qa-npc-${stamp}@wassaa.test`;
const password = `Qa!${crypto.randomBytes(12).toString('hex')}`;
let userId = '';
let matchId = '';

async function cleanup() {
  if (!userId) return;
  try {
    if (matchId) await rest(`/messages?match_id=eq.${matchId}`, { method: 'DELETE' });
    await rest(`/matches?or=(user_a.eq.${userId},user_b.eq.${userId})`, { method: 'DELETE' });
    await rest(`/swipes?or=(from_user_id.eq.${userId},to_user_id.eq.${userId})`, { method: 'DELETE' });
    await rest(`/profiles?id=eq.${userId}`, { method: 'DELETE' });
    await rest(`/credit_ledger?profile_id=eq.${userId}`, { method: 'DELETE' });
    await admin(`/admin/users/${userId}`, { method: 'DELETE' });
    console.log('\nQA persona account removed.');
  } catch (e) {
    console.log(`  WARN  cleanup incomplete — ${e.message}`);
  }
}

async function main() {
  step('1. Provision a confirmed QA account');
  const created = await admin('/admin/users', {
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { full_name: 'QA Persona Loop' } }
  });
  userId = created.data?.id || created.data?.user?.id || '';
  check('auth user created', Boolean(userId), `status ${created.status}`);
  if (!userId) return;

  const signIn = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email, password } });
  const token = signIn.data?.access_token || '';
  check('password sign-in returns a session', signIn.status === 200 && Boolean(token), `status ${signIn.status}`);
  if (!token) return;

  const bridge = await rest(`/profiles?id=eq.${userId}&select=id,credits,auth_user_id`);
  check('profile bridge created a linked profile', Boolean(bridge.data?.[0]?.auth_user_id), JSON.stringify(bridge.data?.[0] || null));

  step('2. Complete the profile (photos, interests, prefs, Lagos coordinates)');
  const profile = await rest(`/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    body: {
      name: 'QA Persona Loop',
      birth_date: '1993-04-12',
      gender: 'male',
      profession_category: 'Engineering',
      profession_title: 'Software Engineer',
      class_of_service: 'civilian',
      city: 'Lekki',
      state: 'Lagos',
      bio: 'QA account used to verify the persona match, greeting and reply loop.',
      photos: [
        'https://randomuser.me/api/portraits/men/12.jpg',
        'https://randomuser.me/api/portraits/men/13.jpg'
      ],
      interests: ['Music', 'Travel', 'Cooking'],
      dating_goal: 'long_term',
      match_preferences: { gender: 'women', minAge: 22, maxAge: 45, maxDistanceKm: 100 },
      location_lat: 6.4698,
      location_lng: 3.5852
    }
  });
  check('profile completed', profile.status === 204 || profile.status === 200, `status ${profile.status}`);

  const session = await api('/auth/session', { token });
  const credits = Number(session.data?.user?.credits);
  check('session carries a starting credit balance', session.status === 200 && credits >= 25, `credits=${credits}`);

  step('3. Discovery exposes personas without a marker');
  const deck = await api('/discovery?limit=20', { token });
  const cards = deck.data?.profiles || [];
  check('discovery returns a deck', deck.status === 200 && cards.length >= 5, `cards=${cards.length}`);
  check('deck payloads carry no persona marker', JSON.stringify(cards).indexOf('isNpc') === -1);

  step('4. Like until a persona matches back');
  // Only ~1 in 3 personas opens a conversation on its own (`npc.greeter`), so
  // target greeters directly instead of hoping the deck order cooperates.
  const personaRows = await rest('/profiles?is_npc=eq.true&npc_active=eq.true&gender=eq.female&select=id,name,npc&limit=80');
  const greeters = (personaRows.data || []).filter((p) => p.npc?.greeter);
  check('seeded deck contains greeting personas', greeters.length >= 5, `greeters=${greeters.length}`);
  const candidates = [...greeters, ...(personaRows.data || []).filter((p) => !p.npc?.greeter)].slice(0, 12);
  let partnerId = '';
  let liked = 0;
  for (const card of candidates) {
    if (card.id === userId) continue;
    const like = await api('/likes', { token, method: 'POST', body: { targetUserId: card.id } });
    liked++;
    if (like.data?.isMatch && like.data?.match?.id) {
      matchId = like.data.match.id;
      partnerId = card.id;
      break;
    }
  }
  check('a member can match a persona', Boolean(matchId), `likes sent=${liked}`);
  if (!matchId) return;

  const partnerRow = await rest(`/profiles?id=eq.${partnerId}&select=npc`);
  const partnerIsGreeter = Boolean(partnerRow.data?.[0]?.npc?.greeter);

  step('5. Persona opens the conversation by itself (60–180 s delay)');
  let greeting = null;
  const greetingDeadline = Date.now() + (partnerIsGreeter ? 210_000 : 0);
  while (Date.now() < greetingDeadline) {
    const thread = await api(`/matches/${matchId}/messages`, { token });
    const fromPartner = (thread.data?.messages || []).filter((m) => m.senderId === partnerId && m.kind !== 'system');
    if (fromPartner.length) { greeting = fromPartner[fromPartner.length - 1]; break; }
    await sleep(12_000);
  }
  if (partnerIsGreeter) check('persona sends the opening message', Boolean(greeting), greeting ? `"${String(greeting.text).slice(0, 60)}…"` : 'no greeting within 210s');
  else console.log('  INFO  matched persona is a non-greeter; it waits for the member to speak first (by design)');

  step('6. Member reply costs exactly 1 credit');
  const before = Number((await api('/auth/session', { token })).data?.user?.credits);
  const send = await api(`/matches/${matchId}/messages`, { token, method: 'POST', body: { kind: 'text', text: 'Hello! What do you enjoy doing in Lagos?' } });
  check('message accepted', send.status === 200 && Boolean(send.data?.message?.id), `status ${send.status}`);
  check('send debits exactly 1 credit', Number(send.data?.balance) === before - 1, `balance ${send.data?.balance} from ${before}`);

  step('7. Persona replies through the normal thread (20–90 s window)');
  let reply = null;
  const replyDeadline = Date.now() + 165_000;
  while (Date.now() < replyDeadline) {
    const thread = await api(`/matches/${matchId}/messages`, { token });
    const after = (thread.data?.messages || []).filter((m) => m.senderId === partnerId && m.kind !== 'system' && m.text !== greeting?.text);
    if (after.length) { reply = after[after.length - 1]; break; }
    await sleep(10_000);
  }
  check('persona answers the member', Boolean(reply), reply ? `"${String(reply.text).slice(0, 60)}…"` : 'no reply within 165s');
  check('thread payloads still leak no persona marker', JSON.stringify(reply || {}).indexOf('isNpc') === -1);

  step('8. Match list stays persona-agnostic');
  const matches = await api('/matches', { token });
  const row = (matches.data?.matches || []).find((m) => m.id === matchId);
  check('matched thread appears in the match list', Boolean(row));
  check('match summaries leak no persona marker', JSON.stringify(row || {}).indexOf('isNpc') === -1);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`  FAIL  unexpected error — ${e.message}`);
} finally {
  await cleanup();
}

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
