#!/usr/bin/env node
/**
 * Provision (or tear down) a persistent QA account used for design review in
 * the browser. Creates one confirmed auth user, completes the onboarding gate
 * through the public API (exactly like the app does), and prints disposable
 * credentials so a dev session can sign in without email delivery.
 *
 *   node scripts/qa-design-user.mjs            # create + complete onboarding
 *   node scripts/qa-design-user.mjs --cleanup  # delete every qa-design user
 *
 * Credentials are throwaway (@wassaa.test, .test is RFC 2606 reserved, so no
 * mail is ever delivered) and must be removed with --cleanup when done.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const fe = loadEnv('frontend/.env');
const be = loadEnv('backend/.env');
const URL_BASE = fe.VITE_SUPABASE_URL || '';
const PUBLISHABLE = fe.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = be.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_BASE || !PUBLISHABLE || !SERVICE) {
  console.error('missing frontend/.env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) or backend/.env (SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}
const AUTH = `${URL_BASE}/auth/v1`;
const API = `${URL_BASE}/functions/v1/api`;
const REST = `${URL_BASE}/rest/v1`;

async function call(path, { method = 'GET', body, key = PUBLISHABLE, token } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${token || key}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

async function cleanup() {
  const list = await call(`${AUTH}/admin/users?page=1&per_page=200`, { key: SERVICE });
  const users = (list.data?.users || []).filter((u) => (u.email || '').startsWith('qa-design-'));
  if (!users.length) { console.log('no qa-design users found'); return; }
  for (const u of users) {
    await call(`${REST}/profiles?id=eq.${u.id}`, { method: 'DELETE', key: SERVICE });
    await call(`${AUTH}/admin/users/${u.id}`, { method: 'DELETE', key: SERVICE });
    console.log(`deleted ${u.email}`);
  }
}

async function create() {
  const stamp = Date.now().toString(36);
  const email = `qa-design-${stamp}@wassaa.test`;
  const password = `QA-Design!${stamp}-xX1`;

  const user = await call(`${AUTH}/admin/users`, {
    method: 'POST', key: SERVICE,
    body: { email, password, email_confirm: true },
  });
  if (user.status !== 200 || !user.data?.id) {
    throw new Error(`admin createUser failed (${user.status}): ${JSON.stringify(user.data)}`);
  }
  console.log(`created ${email} (${user.data.id})`);

  const signIn = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email, password } });
  if (signIn.status !== 200 || !signIn.data?.access_token) {
    throw new Error(`password grant failed (${signIn.status})`);
  }
  const token = signIn.data.access_token;

  const profile = {
    name: 'QA Design', birthDate: '1997-05-14', gender: 'female',
    professionCategory: 'Technology', professionTitle: 'Product Designer',
    city: 'Lekki', state: 'Lagos',
    bio: 'Design QA fixture account. Temporary — safe to delete.',
    photos: ['https://i.pravatar.cc/800?img=47', 'https://i.pravatar.cc/800?img=31'],
    datingGoal: 'long_term',
    interests: ['Photography', 'Running', 'Jazz', 'Travel'],
  };
  const p1 = await call(`${API}/me/profile`, { method: 'PATCH', token, body: profile });
  const p2 = await call(`${API}/me/location`, { method: 'PATCH', token, body: { latitude: 6.5244, longitude: 3.3792 } });
  const p3 = await call(`${API}/me/preferences`, { method: 'PATCH', token, body: { gender: 'men', minAge: 18, maxAge: 50, maxDistanceKm: 100 } });
  console.log(`profile ${p1.status}, location ${p2.status}, preferences ${p3.status}`);

  const deck = await call(`${API}/discovery?limit=30`, { token });
  const session = await call(`${API}/auth/session`, { token });
  console.log(`gate: discovery=${deck.status} deck=${deck.data?.profiles?.length ?? 0} profile=${session.status}`);
  if (deck.status !== 200) throw new Error(`onboarding gate not passed (${deck.status})`);

  console.log('--- sign-in for browser QA (disposable) ---');
  console.log(`email:    ${email}`);
  console.log(`password: ${password}`);
  console.log('-------------------------------------------');
}

async function seed() {
  // Deck fixtures: male profiles in Lagos so the QA reviewer (who prefers men,
  // 18-50, 100km of Lekki) has real cards to swipe. Same qa-design- prefix as
  // the reviewer, so --cleanup tears these down too.
  const stamp = Date.now().toString(36);
  const people = [
    { name: 'Tunde Bakare', age: 31, img: 12, title: 'Software Engineer', category: 'Technology' },
    { name: 'Emeka Nwosu', age: 28, img: 33, title: 'Architect', category: 'Design' },
    { name: 'Chidi Okafor', age: 35, img: 51, title: 'Medical Doctor', category: 'Healthcare' },
  ];
  const password = `QA-Design!${stamp}-xX1`;
  for (const [i, p] of people.entries()) {
    const email = `qa-design-deck${i + 1}-${stamp}@wassaa.test`;
    const user = await call(`${AUTH}/admin/users`, {
      method: 'POST', key: SERVICE,
      body: { email, password, email_confirm: true },
    });
    if (user.status !== 200 || !user.data?.id) {
      throw new Error(`seed createUser failed (${user.status}): ${JSON.stringify(user.data)}`);
    }
    const signIn = await call(`${AUTH}/token?grant_type=password`, { method: 'POST', body: { email, password } });
    const token = signIn.data?.access_token;
    if (!token) throw new Error(`seed password grant failed (${signIn.status})`);
    const birthYear = 2026 - p.age;
    const profile = {
      name: p.name, birthDate: `${birthYear}-04-12`, gender: 'male',
      professionCategory: p.category, professionTitle: p.title,
      city: 'Lekki', state: 'Lagos',
      bio: `QA deck fixture (${p.title}). Temporary profile for design review.`,
      photos: [`https://i.pravatar.cc/800?img=${p.img}`, `https://i.pravatar.cc/800?img=${p.img + 1}`],
      datingGoal: 'long_term',
      interests: ['Football', 'Travel', 'Music'],
    };
    const r1 = await call(`${API}/me/profile`, { method: 'PATCH', token, body: profile });
    const r2 = await call(`${API}/me/location`, { method: 'PATCH', token, body: { latitude: 6.4478, longitude: 3.4723 } });
    const r3 = await call(`${API}/me/preferences`, { method: 'PATCH', token, body: { gender: 'women', minAge: 18, maxAge: 50, maxDistanceKm: 100 } });
    console.log(`seeded ${p.name} (${email}) profile=${r1.status} location=${r2.status} prefs=${r3.status}`);
  }
}

const otpIdx = process.argv.indexOf('--otp');
if (otpIdx !== -1) {
  // Mint a sign-in code for an existing qa-design user, exactly like the
  // app's email flow will verify it (magiclink OTP).
  const email = process.argv[otpIdx + 1];
  if (!email) { console.error('usage: --otp <email>'); process.exit(1); }
  const link = await call(`${AUTH}/admin/generate_link`, { method: 'POST', key: SERVICE, body: { type: 'magiclink', email } });
  const code = link.data?.email_otp;
  if (!code) { console.error(`generate_link failed (${link.status})`); process.exit(1); }
  console.log(code);
} else if (process.argv.includes('--cleanup')) {
  await cleanup();
} else if (process.argv.includes('--seed')) {
  await seed();
} else {
  await create();
}
