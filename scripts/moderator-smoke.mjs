#!/usr/bin/env node
/**
 * Moderator smoke test — the scoped-staff layer added on top of the console.
 *
 * It proves, against the hosted project only, that:
 *   1. a member without a staff row cannot open the console
 *   2. a moderator session reports the moderator role and cannot activate,
 *      curate, verify, release a photo, sanction, read reports or read audit
 *   3. admins can assign a persona; moderators see and edit only assigned ones
 *   4. a persona has one moderator: reassignment is a move, not a duplicate, and
 *      the capacity check refuses an over-limit assignment
 *   5. thread claims are a 30-minute lease: the claim holder can reply, a second
 *      operator gets 409, and an admin can force-release
 *   6. replies are attributed to the operator in the console but never to the
 *      member (no sentBy* fields on the member message route)
 *   7. escalation round-trips: moderator raises it, admin sees it and clears it
 *   8. staff directory is readable by admins but only writable by the owner
 *
 * Fixtures are created with the service key and removed in a finally block.
 *
 * Usage:  node scripts/moderator-smoke.mjs            (clean up afterwards)
 *         node scripts/moderator-smoke.mjs --keep     (leave fixtures)
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
const backEnv = loadEnv('.env');
const SUPABASE_URL = (frontEnv.VITE_SUPABASE_URL || backEnv.SUPABASE_URL || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = frontEnv.VITE_SUPABASE_ANON_KEY || backEnv.SUPABASE_PUBLISHABLE_KEY || '';
const SERVICE_KEY = backEnv.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) {
  console.error('Missing Supabase env values (frontend/.env, .env).');
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

const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const accounts = {
  admin: { email: `qa-mod-admin-${stamp}@wassaa.test`, password: `QA-ModAdmin!${stamp}-aA1` },
  mod: { email: `qa-mod-moderator-${stamp}@wassaa.test`, password: `QA-ModMod!${stamp}-mM1` },
  member: { email: `qa-mod-member-${stamp}@wassaa.test`, password: `QA-ModMember!${stamp}-cC1` }
};
const created = { authIds: {}, profileIds: {}, npcIds: [], matchId: null, adminRows: false };
let tokens = {};

async function createUser(name) {
  const r = await authAdmin('/admin/users', {
    method: 'POST',
    body: { email: accounts[name].email, password: accounts[name].password, email_confirm: true }
  });
  const id = r.data?.id || r.data?.user?.id;
  if (r.status !== 200 || !id) throw new Error(`createUser(${name}) failed (${r.status})`);
  created.authIds[name] = id;
  const signIn = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email: accounts[name].email, password: accounts[name].password } });
  const token = signIn.data?.access_token || '';
  if (signIn.status !== 200 || !token) throw new Error(`signIn(${name}) failed (${signIn.status})`);
  tokens[name] = token;
}

async function createProfile(key, { authUser = '', isNpc = false, displayName = '' } = {}) {
  const id = crypto.randomUUID();
  const row = {
    id,
    auth_user_id: isNpc ? null : created.authIds[authUser],
    phone: `+2349${stamp.slice(-6)}${Math.floor(Math.random() * 9000 + 1000)}${isNpc ? '1' : '2'}`,
    name: displayName || `QA ${key} ${stamp}`,
    gender: 'female',
    birth_date: '1996-04-12',
    city: 'Lagos',
    state: 'Lagos',
    country_code: 'NG',
    profession_category: 'Others',
    profession_title: isNpc ? null : 'Analyst',
    bio: 'QA fixture profile for the moderator smoke test.',
    is_npc: isNpc,
    npc_active: false,
    npc: isNpc ? { photoState: 'manual' } : null,
    photos: isNpc ? [] : ['https://example.com/qa-a.jpg', 'https://example.com/qa-b.jpg'],
    interests: isNpc ? [] : ['Reading', 'Cooking', 'Travel'],
    dating_goal: isNpc ? null : 'long_term',
    match_preferences: isNpc ? null : { gender: 'everyone', minAge: 18, maxAge: 60 }
  };
  const r = await rest('/profiles', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } });
  if (r.status !== 201) throw new Error(`createProfile(${key}) failed (${r.status}) ${JSON.stringify(r.data)}`);
  created.profileIds[key] = id;
  if (isNpc) created.npcIds.push(id);
  return id;
}

async function cleanup() {
  if (KEEP) {
    info('--keep set', 'fixtures left behind');
    return;
  }
  if (created.matchId) await rest(`/matches?id=eq.${created.matchId}`, { method: 'DELETE' });
  for (const id of Object.values(created.profileIds)) {
    await rest(`/profiles?id=eq.${id}`, { method: 'DELETE' });
  }
  for (const id of Object.values(created.authIds)) {
    await rest(`/wassaa_admin_users?user_id=eq.${id}`, { method: 'DELETE' });
    await authAdmin(`/admin/users/${id}`, { method: 'DELETE' });
  }
  // Audit rows are append-only in the product; QA rows name QA ids, so remove
  // them explicitly rather than leaving "QA" noise in the real trail.
  for (const id of Object.values(created.authIds)) {
    await rest(`/admin_audit?actor_user_id=eq.${id}`, { method: 'DELETE' });
    await rest(`/admin_audit?target_id=eq.${id}`, { method: 'DELETE' });
  }
  if (created.matchId) {
    await rest(`/admin_audit?target_id=eq.${created.matchId}`, { method: 'DELETE' });
  }
  for (const id of [...created.npcIds, ...Object.values(created.profileIds)]) {
    await rest(`/admin_audit?target_id=eq.${id}`, { method: 'DELETE' });
  }
}

try {
  step('1. fixtures: admin, moderator, member and two persona rows');
  await createUser('admin');
  await createUser('mod');
  await createUser('member');
  await createProfile('member', { authUser: 'member', displayName: 'QA Member' });
  const personaId = await createProfile('persona1', { isNpc: true, displayName: `QA Persona ${stamp}` });
  const personaTwoId = await createProfile('persona2', { isNpc: true, displayName: `QA Persona Two ${stamp}` });
  info('personas', `${personaId} / ${personaTwoId}`);

  const adminRow = await rest('/wassaa_admin_users', {
    method: 'POST',
    body: { user_id: created.authIds.admin, display_name: `QA Admin ${stamp}`, role: 'admin', persona_limit: 30 },
    headers: { Prefer: 'return=representation' }
  });
  const modRow = await rest('/wassaa_admin_users', {
    method: 'POST',
    body: { user_id: created.authIds.mod, display_name: `QA Mod ${stamp}`, role: 'moderator', persona_limit: 1 },
    headers: { Prefer: 'return=representation' }
  });
  created.adminRows = adminRow.status === 201 && modRow.status === 201;
  check('staff rows created (admin + moderator)', created.adminRows, `${adminRow.status}/${modRow.status}`);

  // A real thread: member ↔ persona, with one member message waiting.
  const match = await rest('/matches', {
    method: 'POST',
    body: { user_a: created.profileIds.member, user_b: personaId },
    headers: { Prefer: 'return=representation' }
  });
  created.matchId = match.data?.[0]?.id || null;
  check('match created', match.status === 201 && Boolean(created.matchId), `status ${match.status}`);
  if (created.matchId) {
    await rest('/messages', {
      method: 'POST',
      body: { match_id: created.matchId, sender_id: created.profileIds.member, kind: 'text', text: 'QA: are you around this evening?' }
    });
  }

  step('2. the console gate');
  const memberSession = await api('/admin/session', { token: tokens.member });
  check('member without a staff row is refused', memberSession.status === 403, `status ${memberSession.status}`);

  const adminSession = await api('/admin/session', { token: tokens.admin });
  check('admin session opens', adminSession.status === 200 && adminSession.data?.staff?.role === 'admin', `status ${adminSession.status}`);
  check('admin may activate personas', adminSession.data?.staff?.capabilities?.activatePersonas === true);
  check('admin may release a photo', adminSession.data?.staff?.capabilities?.releasePhoto === true);

  const modSession = await api('/admin/session', { token: tokens.mod });
  check('moderator session opens', modSession.status === 200 && modSession.data?.staff?.role === 'moderator', `status ${modSession.status}`);
  check('moderator cannot activate personas', modSession.data?.staff?.capabilities?.activatePersonas === false);
  check('moderator cannot release a photo', modSession.data?.staff?.capabilities?.releasePhoto === false);
  check('moderator persona scope is assignment-based', modSession.data?.staff?.capabilities?.personas === 'assigned');

  step('3. unassigned personas are invisible and untouchable');
  const unassignedList = await api(`/admin/npcs?search=${encodeURIComponent(`QA Persona ${stamp}`)}`, { token: tokens.mod });
  check('moderator list is empty before assignment', unassignedList.status === 200 && (unassignedList.data?.total || 0) === 0, `total ${unassignedList.data?.total}`);
  const unassignedPatch = await api(`/admin/npcs/${personaId}`, { method: 'PATCH', token: tokens.mod, body: { bio: 'QA edit before assignment' } });
  check('moderator cannot edit an unassigned persona', unassignedPatch.status === 403, `status ${unassignedPatch.status}`);

  step('4. assignment: one active moderator per persona, capacity enforced');
  const assign = await api(`/admin/npcs/${personaId}/assign`, { method: 'POST', token: tokens.admin, body: { moderatorId: created.authIds.mod } });
  check('admin assigns the persona', assign.status === 200 && assign.data?.assigned === true, `status ${assign.status}`);
  const assignedList = await api(`/admin/npcs?search=${encodeURIComponent(`QA Persona ${stamp}`)}`, { token: tokens.mod });
  check('moderator now sees the persona', assignedList.status === 200 && (assignedList.data?.total || 0) === 1, `total ${assignedList.data?.total}`);
  check('list exposes the assignee', assignedList.data?.npcs?.[0]?.assignedTo?.id === created.authIds.mod);

  const secondAssign = await api(`/admin/npcs/${personaTwoId}/assign`, { method: 'POST', token: tokens.admin, body: { moderatorId: created.authIds.mod } });
  check('capacity limit refuses a second persona', secondAssign.status === 409, `status ${secondAssign.status}`);

  const edited = await api(`/admin/npcs/${personaId}`, { method: 'PATCH', token: tokens.mod, body: { bio: 'QA moderator wrote this bio.' } });
  check('moderator edits the assigned persona', edited.status === 200, `status ${edited.status}`);
  const sourceUrl = `https://example.com/qa-source/${stamp}`;
  const sourced = await api(`/admin/npcs/${personaId}`, { method: 'PATCH', token: tokens.mod, body: { photoSourceUrl: sourceUrl } });
  check('moderator attaches a photo source link', sourced.status === 200, `status ${sourced.status}`);
  const sourcedList = await api(`/admin/npcs?search=${encodeURIComponent(`QA Persona ${stamp}`)}`, { token: tokens.mod });
  check('the source link comes back to the moderator', sourcedList.data?.npcs?.[0]?.persona?.photoSourceUrl === sourceUrl, String(sourcedList.data?.npcs?.[0]?.persona?.photoSourceUrl));
  const badSource = await api(`/admin/npcs/${personaId}`, { method: 'PATCH', token: tokens.mod, body: { photoSourceUrl: 'javascript:alert(1)' } });
  check('a non-http source link is refused', badSource.status === 400, `status ${badSource.status}`);
  for (const [label, body] of [
    ['activation', { active: true }],
    ['the curated set', { curated: true }],
    ['AI replies', { aiEnabled: true }],
    ['the verified seal', { verificationStatus: 'verified' }],
    ['releasing a photo', { photoReview: 'ok' }]
  ]) {
    const denied = await api(`/admin/npcs/${personaId}`, { method: 'PATCH', token: tokens.mod, body });
    check(`moderator cannot change ${label}`, denied.status === 403, `status ${denied.status}`);
  }
  const flagged = await api(`/admin/npcs/${personaId}/quarantine`, { method: 'POST', token: tokens.mod, body: { quarantine: true, reason: 'QA flag' } });
  check('moderator can flag a photo', flagged.status === 200, `status ${flagged.status}`);
  const released = await api(`/admin/npcs/${personaId}/quarantine`, { method: 'POST', token: tokens.mod, body: { quarantine: false } });
  check('moderator cannot release a photo', released.status === 403, `status ${released.status}`);
  await api(`/admin/npcs/${personaId}/quarantine`, { method: 'POST', token: tokens.admin, body: { quarantine: false } });

  step('5. the rest of the console is closed to moderators');
  for (const [label, req] of [
    ['reports', () => api('/admin/reports', { token: tokens.mod })],
    ['verifications', () => api('/admin/verifications', { token: tokens.mod })],
    ['appeals', () => api('/admin/appeals?status=pending', { token: tokens.mod })],
    ['audit log', () => api('/admin/audit', { token: tokens.mod })],
    ['sanctions', () => api(`/admin/users/${created.profileIds.member}/sanction`, { method: 'POST', token: tokens.mod, body: { action: 'restrict', reason: 'QA should fail' } })],
    ['staff directory', () => api('/admin/staff', { token: tokens.mod })]
  ]) {
    const denied = await req();
    check(`moderator cannot open ${label}`, denied.status === 403, `status ${denied.status}`);
  }
  const adminStaffRead = await api('/admin/staff', { token: tokens.admin });
  check('admin can read the staff directory', adminStaffRead.status === 200, `status ${adminStaffRead.status}`);
  const adminStaffWrite = await api('/admin/staff', { method: 'POST', token: tokens.admin, body: { email: accounts.member.email, role: 'moderator' } });
  check('admin cannot add staff (owner only)', adminStaffWrite.status === 403, `status ${adminStaffWrite.status}`);

  step('6. thread claims: one operator, one lease');
  const modThreads = await api('/admin/threads', { token: tokens.mod });
  check('moderator sees the assigned thread', modThreads.status === 200 && (modThreads.data?.threads || []).some((t) => t.id === created.matchId), `status ${modThreads.status}`);
  check('thread list flags the waiting member', Boolean((modThreads.data?.threads || []).find((t) => t.id === created.matchId)?.waiting));

  const modThreadRead = await api(`/admin/threads/${created.matchId}/messages`, { token: tokens.mod });
  check('moderator reads the thread', modThreadRead.status === 200, `status ${modThreadRead.status}`);

  const modReply = await api(`/admin/threads/${created.matchId}/messages`, { method: 'POST', token: tokens.mod, body: { text: 'QA moderator reply.' } });
  check('moderator replies as the persona', modReply.status === 200, `status ${modReply.status}`);
  check('reply is attributed to the moderator', modReply.data?.message?.sentByName === `QA Mod ${stamp}`, String(modReply.data?.message?.sentByName));

  const adminDuringClaim = await api(`/admin/threads/${created.matchId}/messages`, { method: 'POST', token: tokens.admin, body: { text: 'QA admin should be blocked.' } });
  check('a second operator is refused while the lease is live', adminDuringClaim.status === 409, `status ${adminDuringClaim.status}`);

  const memberRead = await api(`/matches/${created.matchId}/messages`, { token: tokens.member });
  check('member reads the thread', memberRead.status === 200, `status ${memberRead.status}`);
  check('staff attribution never reaches the member', !JSON.stringify(memberRead.data || {}).includes('sentBy'), 'no sentBy fields');
  const memberMatches = await api('/matches', { token: tokens.member });
  check('the admin-only photo source never reaches the member', !JSON.stringify(memberMatches.data || {}).includes('photoSourceUrl'), 'no photoSourceUrl field');

  const forceRelease = await api(`/admin/threads/${created.matchId}/release`, { method: 'POST', token: tokens.admin });
  check('admin force-releases the lease', forceRelease.status === 200, `status ${forceRelease.status}`);
  const adminReply = await api(`/admin/threads/${created.matchId}/messages`, { method: 'POST', token: tokens.admin, body: { text: 'QA admin reply after release.' } });
  check('admin replies after release', adminReply.status === 200, `status ${adminReply.status}`);
  check('admin reply is attributed to the admin', adminReply.data?.message?.sentByName === `QA Admin ${stamp}`, String(adminReply.data?.message?.sentByName));

  step('7. escalation round-trip');
  const escalate = await api(`/admin/threads/${created.matchId}/escalate`, { method: 'POST', token: tokens.mod, body: { note: 'QA: member asks for something outside the script.' } });
  check('moderator escalates with a note', escalate.status === 200, `status ${escalate.status}`);
  const escalatedList = await api('/admin/threads?escalated=1', { token: tokens.admin });
  const escalatedRow = (escalatedList.data?.threads || []).find((t) => t.id === created.matchId);
  check('admin sees the escalation', Boolean(escalatedRow) && escalatedRow.escalationNote.includes('QA:'), escalatedRow?.escalationNote);
  const clearEscalation = await api(`/admin/threads/${created.matchId}/escalate`, { method: 'DELETE', token: tokens.admin });
  check('admin clears the escalation', clearEscalation.status === 200, `status ${clearEscalation.status}`);

  step('8. unassign revokes everything immediately');
  const unassign = await api(`/admin/npcs/${personaId}/assign`, { method: 'POST', token: tokens.admin, body: { moderatorId: null } });
  check('admin unassigns the persona', unassign.status === 200 && unassign.data?.assigned === false, `status ${unassign.status}`);
  const afterUnassign = await api(`/admin/npcs?search=${encodeURIComponent(`QA Persona ${stamp}`)}`, { token: tokens.mod });
  check('moderator loses the persona immediately', (afterUnassign.data?.total || 0) === 0, `total ${afterUnassign.data?.total}`);
  const threadAfterUnassign = await api(`/admin/threads/${created.matchId}/messages`, { token: tokens.mod });
  check('moderator loses the thread immediately', threadAfterUnassign.status === 403, `status ${threadAfterUnassign.status}`);
} finally {
  try { await cleanup(); } catch (e) { console.log(`  WARN  cleanup incomplete — ${e.message}`); }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
