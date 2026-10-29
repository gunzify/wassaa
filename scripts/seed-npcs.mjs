#!/usr/bin/env node
/**
 * Seed the persona deck (~300 profiles) into production via the
 * `wassaa_seed_npcs` service-role RPC (KB §18B).
 *
 *   node scripts/seed-npcs.mjs            # seed (no-op if NPCs already exist)
 *   node scripts/seed-npcs.mjs --force    # add another full deck on top
 *   node scripts/seed-npcs.mjs --count=50 # seed a smaller deck
 *   node scripts/seed-npcs.mjs --dry-run  # print 2 sample profiles, no writes
 *   node scripts/seed-npcs.mjs --backfill # give existing personas the
 *                                         # lifestyle / values / prompt
 *                                         # details members already carry
 *   node scripts/seed-npcs.mjs --fix-names [--dry-run]
 *                                         # repair personas whose first name
 *                                         # and surname come from different
 *                                         # traditions
 *
 * Profiles land verified, flagged is_npc, with real city coordinates and
 * reciprocal match preferences so they pass every wassaa_discovery predicate.
 * Photos use placeholder portrait URLs until staff upload real images from the
 * console (Personas → Photos).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildName, givenOriginOf, familyOriginsOf, FAMILY_NAMES,
  RETIRED_FAMILY_NAMES, RETIRED_GIVEN_NAMES, GIVEN_NAMES,
  CITIES, SKILLS, INTERESTS, ROLES_BY_CLASS,
  BIO_TEMPLATES, PROMPTS, LIFESTYLE, FAITHS, FAITH_IMPORTANCE, FAMILY_PLANS,
  PRONOUNS, pick,
} from './npc-corpus.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(file) {
  const out = {};
  try {
    for (const line of readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
  return out;
}

const env = { ...loadEnv('frontend/.env'), ...loadEnv('backend/.env') };
const URL_BASE = env.VITE_SUPABASE_URL || '';
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_BASE || !SERVICE) {
  console.error('missing frontend/.env (VITE_SUPABASE_URL) or backend/.env (SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}
const REST = `${URL_BASE}/rest/v1`;

// ---- deterministic PRNG so the deck is reproducible per seed ----
let seed = 0x57415353; // 'WASS'
function rng() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

// ---- persona mix (KB §18B): service-weighted classes, ~30% greeters ----
const CLASS_MIX = [
  { cls: 'military', weight: 0.34, categories: ['Military'], services: ['Nigerian Army', 'Nigerian Navy', 'Nigerian Air Force'] },
  { cls: 'police', weight: 0.18, categories: ['Police'], services: ['Nigerian Police Force'] },
  { cls: 'paramilitary', weight: 0.16, categories: ['Paramilitary'], services: ['NSCDC', 'FRSC', 'Immigration', 'Customs'] },
  { cls: 'civilian', weight: 0.32, categories: ['Healthcare', 'Engineering', 'Education', 'Business & Entrepreneurship', 'Law & Government', 'Others'], services: [null] },
];
const CIVILIAN_TITLES = {
  'Healthcare': ['Nurse', 'Medical Doctor', 'Pharmacist', 'Lab Scientist', 'Physiotherapist'],
  'Engineering': ['Software Engineer', 'Civil Engineer', 'Electrical Engineer', 'Mechanical Engineer', 'Data Analyst'],
  'Education': ['Teacher', 'Education Officer', 'Lecturer', 'Tutor'],
  'Business & Entrepreneurship': ['Banker', 'Entrepreneur', 'Accountant', 'Marketing Manager', 'Sales Executive'],
  'Law & Government': ['Lawyer', 'Civil Servant', 'Legal Officer', 'Policy Analyst'],
  'Others': ['Photographer', 'Chef', 'Journalist', 'Fashion Designer', 'Real Estate Agent', 'Surveyor'],
};
// No rank titles: cadre (officer / soldier) carries that meaning, and the job
// title for a uniformed persona is their trade, exactly as a member's is.
const DATING_GOALS = ['marriage', 'marriage', 'long_term', 'long_term', 'intentional', 'intentional', 'exploring'];
const AGE_MIN = 23, AGE_MAX = 41;

function weightedClass() {
  const roll = rng();
  let acc = 0;
  for (const c of CLASS_MIX) { acc += c.weight; if (roll <= acc) return c; }
  return CLASS_MIX[CLASS_MIX.length - 1];
}

function fill(template, slots) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (slots[key] !== undefined ? String(slots[key]) : ''));
}

function buildNpc(index) {
  const group = weightedClass();
  const gender = rng() < 0.52 ? 'female' : 'male';
  // Tribal first name → same-tribe surname; English first name → any surname.
  const name = buildName(rng, gender);
  const place = pick(rng, CITIES);
  const age = AGE_MIN + Math.floor(rng() * (AGE_MAX - AGE_MIN + 1));
  const birthDate = new Date(Date.UTC(new Date().getUTCFullYear() - age, Math.floor(rng() * 12), 1 + Math.floor(rng() * 27)))
    .toISOString().slice(0, 10);
  const uniformed = group.cls !== 'civilian';
  const orgRole = uniformed ? pick(rng, ROLES_BY_CLASS[group.cls]) : null;
  const professionCategory = pick(rng, group.categories);
  // For civilians the trade IS the job, so skill mirrors the title (a Nurse's
  // skill is Nursing, not Plumbing). Uniformed skills come from the class pool.
  // A civilian's trade is their job; a uniformed persona's trade is their
  // specialisation (never a rank title).
  const professionTitle = uniformed
    ? pick(rng, SKILLS[group.cls])
    : pick(rng, CIVILIAN_TITLES[professionCategory] || CIVILIAN_TITLES.Others);
  const skill = professionTitle;
  const interests = [];
  while (interests.length < 4) {
    const interest = pick(rng, INTERESTS);
    if (!interests.includes(interest)) interests.push(interest);
  }
  const slots = { skill, city: place.city, interest1: interests[0], role_label: orgRole === 'officer' ? 'Officer' : orgRole === 'soldier' ? 'Soldier' : professionTitle };
  const bio = fill(pick(rng, BIO_TEMPLATES), slots);
  const prompt = pick(rng, PROMPTS);
  // "master mosque on the side" is nonsense — keep places of worship out of
  // the hobby slot.
  const hobby = interests.find((i) => !['Church', 'Mosque', 'Volunteering'].includes(i)) || interests[0];
  const prompts = [
    { id: 'p0', question: prompt.q, answer: fill(prompt.a, slots) },
    { id: 'p1', question: 'A life goal of mine', answer: `Build something that outlasts me — and get properly good at ${hobby.toLowerCase()}.` },
  ];
  const lifestyle = {
    exercise: pick(rng, LIFESTYLE.exercise),
    drinking: pick(rng, LIFESTYLE.drinking),
    smoking: pick(rng, LIFESTYLE.smoking),
    pets: pick(rng, LIFESTYLE.pets),
  };
  const values = {
    faith: pick(rng, FAITHS),
    faithImportance: pick(rng, FAITH_IMPORTANCE),
    familyPlans: pick(rng, FAMILY_PLANS),
  };
  // Placeholder portraits until staff upload real photos from the console.
  // randomuser.me serves stable, correctly-gendered portraits; picsum returned
  // landscapes, which made every persona card look like a stock photo wall.
  const portraitSet = gender === 'female' ? 'women' : 'men';
  const portraitA = (index * 7) % 99;
  const portraitB = (portraitA + 37) % 99;
  return {
    name,
    birthDate,
    gender,
    pronouns: pick(rng, PRONOUNS[gender]),
    professionCategory,
    professionTitle,
    service: uniformed ? pick(rng, group.services) : null,
    orgRole,
    skill,
    city: place.city,
    state: place.state,
    lat: +(place.lat + (rng() - 0.5) * 0.08).toFixed(4),
    lng: +(place.lng + (rng() - 0.5) * 0.08).toFixed(4),
    bio,
    photos: [
      `https://randomuser.me/api/portraits/${portraitSet}/${portraitA}.jpg`,
      `https://randomuser.me/api/portraits/${portraitSet}/${portraitB}.jpg`,
    ],
    interests,
    prompts,
    lifestyle,
    values,
    datingGoal: pick(rng, DATING_GOALS),
    matchPreferences: { gender: 'everyone', minAge: 22, maxAge: 45 },
    classOfService: group.cls,
    // The persona blob is behaviour only; every displayed detail lives in the
    // same columns a member's does.
    persona: { greeter: rng() < 0.3 },
    active: true,
    ageDays: 30 + Math.floor(rng() * 240),
  };
}

async function rpc(path, body) {
  const res = await fetch(`${REST}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(`${path} failed (${res.status}): ${data?.message || data?.error_code || 'no details'}`);
  return data;
}

function hashId(value) {
  let h = 0;
  for (let i = 0; i < String(value).length; i++) h = (h * 31 + String(value).charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Personas seeded before the detail columns existed have no lifestyle, values
 * or prompts. Fill only the empty ones, deterministically per row id, so a
 * second run is a no-op and nobody's edited persona is overwritten.
 */
async function backfillDetails() {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const res = await fetch(`${REST}/profiles?is_npc=eq.true&select=id,name,gender,city,interests,skill,prompts,lifestyle,values_family&limit=1000`, { headers });
  if (!res.ok) throw new Error(`could not list personas (${res.status})`);
  const rows = await res.json();
  // Partial blocks count as missing: an earlier pass could drop individual keys
  // when a signed bit-shift produced a negative index.
  const missing = (value, keys) => !value || typeof value !== 'object' || keys.some((k) => !value[k]);
  const todo = rows.filter((r) =>
    missing(r.lifestyle, ['exercise', 'drinking', 'smoking', 'pets']) ||
    missing(r.values_family, ['faith', 'faithImportance', 'familyPlans']) ||
    !(r.prompts || []).length);
  if (!todo.length) {
    console.log(`All ${rows.length} personas already carry the full detail set.`);
    return;
  }
  let done = 0;
  for (const row of todo) {
    const h = hashId(row.id);
    const interest = (row.interests || [])[0] || 'good food';
    const body = {};
    if (!(row.prompts || []).length) {
      const prompt = PROMPTS[h % PROMPTS.length];
      body.prompts = [{ id: 'p0', question: prompt.q, answer: prompt.a.replace(/\{interest1\}/g, String(interest).toLowerCase()) }];
    }
    if (!row.lifestyle || ['exercise', 'drinking', 'smoking', 'pets'].some((k) => !row.lifestyle[k])) {
      body.lifestyle = {
        exercise: LIFESTYLE.exercise[h % LIFESTYLE.exercise.length],
        drinking: LIFESTYLE.drinking[(h >>> 2) % LIFESTYLE.drinking.length],
        smoking: LIFESTYLE.smoking[(h >>> 4) % LIFESTYLE.smoking.length],
        pets: LIFESTYLE.pets[(h >>> 6) % LIFESTYLE.pets.length],
      };
    }
    if (!row.values_family || ['faith', 'faithImportance', 'familyPlans'].some((k) => !row.values_family[k])) {
      body.values_family = {
        faith: FAITHS[(h >>> 3) % FAITHS.length],
        faithImportance: FAITH_IMPORTANCE[(h >>> 5) % FAITH_IMPORTANCE.length],
        familyPlans: FAMILY_PLANS[(h >>> 7) % FAMILY_PLANS.length],
      };
    }
    const patch = await fetch(`${REST}/profiles?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    if (!patch.ok) throw new Error(`backfill failed for ${row.name || row.id} (${patch.status})`);
    done++;
    process.stdout.write(`\rbackfilled ${done}/${todo.length}`);
  }
  console.log(`\nDone. ${done} personas now match the member detail set.`);
}

/**
 * Repair personas whose names mix traditions — an Igbo given name with a
 * Hausa surname, a Yoruba given name with an Efik surname, and so on.
 *
 * Only rows where the given name belongs to a known tribe *and* the surname
 * belongs to a different known pool are touched. English given names are
 * always allowed, and a surname outside the corpus is left alone, so an
 * admin's manual edit is never overwritten blindly.
 */
async function fixNames(dryRun) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const res = await fetch(`${REST}/profiles?is_npc=eq.true&select=id,name,gender&order=created_at.asc&limit=1000`, { headers });
  if (!res.ok) throw new Error(`could not list personas (${res.status})`);
  const rows = await res.json();
  const fixes = [];
  for (const row of rows) {
    const parts = String(row.name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const first = parts[0];
    const middle = parts.slice(1, -1);
    const last = parts[parts.length - 1];
    // A surname used as a given name ("Ekong") cannot be repaired by swapping
    // the surname — rebuild the whole name from one tradition.
    if (RETIRED_GIVEN_NAMES.has(first.toLowerCase())) {
      const traditions = Object.keys(GIVEN_NAMES);
      const tradition = traditions[hashId(row.id) % traditions.length];
      const givenPool = GIVEN_NAMES[tradition][row.gender === 'female' ? 'female' : 'male'];
      const given = givenPool[hashId(row.id + 'g') % givenPool.length];
      const familyPool = FAMILY_NAMES[tradition];
      let family = familyPool[hashId(row.id + 'f') % familyPool.length];
      if (family === given) family = familyPool[(hashId(row.id) + 1) % familyPool.length];
      fixes.push({ id: row.id, from: row.name, to: [given, ...middle, family].join(' ') });
      continue;
    }
    const retired = RETIRED_FAMILY_NAMES.has(last.toLowerCase());
    const origin = givenOriginOf(first);
    if (!origin || origin === 'english') {
      if (!retired) continue;                           // any real surname is valid
      const pool = Object.values(FAMILY_NAMES).flat();
      const replacement = pool[hashId(row.id + last) % pool.length];
      fixes.push({ id: row.id, from: row.name, to: [first, ...middle, replacement].join(' ') });
      continue;
    }
    const surnameOrigins = familyOriginsOf(last);
    if (!retired && !surnameOrigins.size) continue;     // not in the corpus — leave it
    if (!retired && surnameOrigins.has(origin)) continue;
    const pool = FAMILY_NAMES[origin];
    let replacement = pool[hashId(row.id + first) % pool.length];
    if (replacement === first) replacement = pool[(hashId(row.id) + 1) % pool.length];
    fixes.push({ id: row.id, from: row.name, to: [first, ...middle, replacement].join(' ') });
  }
  if (!fixes.length) {
    console.log(`All ${rows.length} persona names already follow the rule.`);
    return;
  }
  for (const fix of fixes) console.log(`  ${fix.from}  →  ${fix.to}`);
  if (dryRun) {
    console.log(`\n(dry run — ${fixes.length} of ${rows.length} names would be fixed)`);
    return;
  }
  let done = 0;
  for (const fix of fixes) {
    const patch = await fetch(`${REST}/profiles?id=eq.${encodeURIComponent(fix.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name: fix.to, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`rename failed for ${fix.from} (${patch.status})`);
    done++;
    process.stdout.write(`\rrenamed ${done}/${fixes.length}`);
  }
  console.log(`\nDone. ${done} names now match their naming tradition.`);
}

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  if (process.argv.includes('--fix-names')) {
    await fixNames(dryRun);
    return;
  }
  if (process.argv.includes('--backfill')) {
    await backfillDetails();
    return;
  }
  const countArg = process.argv.find((a) => a.startsWith('--count='));
  const count = countArg ? Math.max(1, Math.min(600, Number(countArg.split('=')[1]) || 300)) : 300;

  const existing = await fetch(`${REST}/profiles?is_npc=eq.true&select=id&limit=1`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact', Range: '0-0' },
  });
  const total = Number((existing.headers.get('content-range') || '0/0').split('/')[1] || 0);
  if (total > 0 && !force && !dryRun) {
    console.log(`${total} NPC profiles already seeded — pass --force to add another deck.`);
    return;
  }

  const profiles = Array.from({ length: count }, (_, i) => buildNpc(i + 1));
  if (dryRun) {
    console.log(JSON.stringify(profiles.slice(0, 2), null, 2));
    console.log(`\n(dry run — ${count} profiles would be seeded)`);
    return;
  }

  let inserted = 0;
  for (let i = 0; i < profiles.length; i += 50) {
    const batch = profiles.slice(i, i + 50);
    inserted += await rpc('/rpc/wassaa_seed_npcs', { p_profiles: batch });
    process.stdout.write(`\rseeded ${inserted}/${profiles.length}`);
  }
  console.log(`\nDone. ${inserted} personas are live, verified, and visible in Discover.`);
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
