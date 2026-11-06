#!/usr/bin/env node
/**
 * Seed persona decks into production via the `wassaa_seed_npcs` service-role
 * RPC (KB §18B).
 *
 *   node scripts/seed-npcs.mjs              # Nigerian deck (no-op if NPCs exist)
 *   node scripts/seed-npcs.mjs --global     # 500 uniformed personas worldwide
 *   node scripts/seed-npcs.mjs --global --count=500
 *   node scripts/seed-npcs.mjs --force      # add another deck on top
 *   node scripts/seed-npcs.mjs --dry-run    # print samples, no writes
 *   node scripts/seed-npcs.mjs --backfill   # fill missing detail blocks
 *   node scripts/seed-npcs.mjs --fix-names [--dry-run]
 *                                           # repair mixed-tradition names
 *   node scripts/seed-npcs.mjs --fix-photos [--dry-run]
 *                                           # re-match every portrait to the
 *                                           # persona's gender and ethnicity
 *   node scripts/seed-npcs.mjs --rewrite-bios [--dry-run]
 *                                           # replace template bios with the
 *                                           # composed, varied bio engine
 *
 * Profiles land verified, flagged is_npc, with real city coordinates and
 * reciprocal match preferences so they pass every wassaa_discovery predicate.
 * Portraits come from scripts/persona-photo-pools.json (generated, hosted on
 * R2) and are matched to gender + ethnicity; randomuser is the fallback when
 * the manifest is absent.
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
import {
  COUNTRIES, CULTURES, SKILLS_GLOBAL, INTERESTS_GLOBAL, buildGlobalName,
  pickCountry, pickBranch, pickWeighted, BRANCH_LABEL,
} from './npc-global.mjs';
import { composeBio, composePrompts, lowerTitle } from './npc-bios.mjs';


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

// ---------------------------------------------------------------- portraits
// Generated portraits hosted on R2, keyed by ethnicity + gender (see
// scripts/persona-photos.mjs). Every pool entry has a `-alt` companion crop of
// the same person, which supplies the second required photo without showing a
// different face.
let PHOTO_POOLS = null;
try {
  PHOTO_POOLS = JSON.parse(readFileSync(join(ROOT, 'scripts', 'persona-photo-pools.json'), 'utf8'));
} catch { /* fall back to randomuser portraits */ }

const poolCursor = new Map();

function fallbackPortrait(gender, key) {
  const set = gender === 'female' ? 'women' : 'men';
  const a = hashId(key) % 99;
  const b = (a + 37) % 99;
  return [
    `https://randomuser.me/api/portraits/${set}/${a}.jpg`,
    `https://randomuser.me/api/portraits/${set}/${b}.jpg`,
  ];
}

/** Cycle through a pool for a new deck so faces spread evenly. */
function nextPortrait(race, gender) {
  const pool = PHOTO_POOLS?.[race]?.[gender] || [];
  if (!pool.length) return fallbackPortrait(gender, `${race}:${gender}:${poolCursor.get(race) || 0}`);
  const key = `${race}:${gender}`;
  const i = poolCursor.get(key) || 0;
  poolCursor.set(key, i + 1);
  const url = pool[i % pool.length];
  return [url, url.replace(/\.jpg$/, '-alt.jpg')];
}

/** Deterministic portrait for an existing row (stable across runs). */
function portraitFor(race, gender, key) {
  const pool = PHOTO_POOLS?.[race]?.[gender] || [];
  if (!pool.length) return fallbackPortrait(gender, key);
  const url = pool[hashId(key) % pool.length];
  return [url, url.replace(/\.jpg$/, '-alt.jpg')];
}

// ------------------------------------------------------------- seed content
const NG_FLAVOUR = {
  food: ['jollof', 'suya', 'pounded yam', 'small chops', 'grilled fish'],
  places: ['the beach', 'a quiet buka', 'the mall', 'a lounge', 'the park'],
  habits: ['Sunday brunch', 'football viewing', 'beach days', 'night markets'],
};

const ACADEMIES = {
  US: ['US Military Academy (West Point)', 'US Naval Academy', 'US Air Force Academy'],
  GB: ['Royal Military Academy Sandhurst', 'Britannia Royal Naval College', 'Royal Air Force College Cranwell'],
  CA: ['Royal Military College of Canada'],
  AU: ['Australian Defence Force Academy'],
  NZ: ['New Zealand Defence Force Command and Staff College'],
  IE: ['Military College (Curragh)'],
  DE: ['Führungsakademie der Bundeswehr'],
  FR: ['École spéciale militaire de Saint-Cyr'],
  IT: ['Accademia Militare di Modena'],
  ES: ['Academia General Militar'],
  NL: ['Koninklijke Militaire Academie'],
  PL: ['Akademia Sztuki Wojennej'],
  PT: ['Academia Militar'],
  BR: ['Academia Militar das Agulhas Negras'],
  ZA: ['South African Military Academy'],
  KE: ['Kenya Military Academy'],
  GH: ['Ghana Military Academy'],
};

/** Deterministic PRNG for a single row, so fixes are reproducible. */
function seededRng(value) {
  let s = hashId(value) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function ageFromBirthDate(birthDate) {
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return 30;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const m = now.getUTCMonth() - born.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return Math.max(18, age);
}

function randomBirthDate(rng, minAge, maxAge) {
  const age = minAge + Math.floor(rng() * (maxAge - minAge + 1));
  return new Date(Date.UTC(new Date().getUTCFullYear() - age, Math.floor(rng() * 12), 1 + Math.floor(rng() * 27)))
    .toISOString().slice(0, 10);
}


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
  const serviceLabel = uniformed ? pick(rng, group.services) : null;
  const slots = {
    skill: String(skill).toLowerCase(),
    city: place.city,
    interest1: String(interests[0]).toLowerCase(),
    interest2: String(interests[1] || interests[0]).toLowerCase(),
    food: pick(rng, NG_FLAVOUR.food),
    place: pick(rng, NG_FLAVOUR.places),
    habit: pick(rng, NG_FLAVOUR.habits),
    service: serviceLabel || '',
    years: 3 + Math.floor(rng() * 16),
    role_label: orgRole === 'officer' ? 'Officer' : orgRole === 'soldier' ? 'Soldier' : professionTitle,
  };
  const bio = composeBio(rng, slots);
  const prompts = composePrompts(rng, slots, 3);
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
  // Race-matched portraits: Nigerian personas draw from the Black pool, and
  // each persona gets the same face twice (a wider and a tighter crop) rather
  // than two different people.
  const photos = nextPortrait('black', gender);
  return {
    name,
    birthDate,
    gender,
    pronouns: pick(rng, PRONOUNS[gender]),
    professionCategory,
    professionTitle,
    service: serviceLabel,
    orgRole,
    skill,
    city: place.city,
    state: place.state,
    countryCode: 'NG',
    lat: +(place.lat + (rng() - 0.5) * 0.08).toFixed(4),
    lng: +(place.lng + (rng() - 0.5) * 0.08).toFixed(4),
    bio,
    photos,
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

/**
 * Global uniformed persona: military / police / paramilitary, specific branch,
 * culturally correct name, race-matched portrait, composed bio.
 */
function buildGlobalNpc() {
  const countryCode = pickCountry(rng);
  const country = COUNTRIES[countryCode];
  const cultureId = pickWeighted(rng, country.cultures);
  const culture = CULTURES[cultureId];
  const gender = rng() < 0.5 ? 'female' : 'male';
  const name = buildGlobalName(rng, cultureId, gender);
  const place = pick(rng, country.cities);
  const birthDate = randomBirthDate(rng, 23, 45);

  const roll = rng();
  const cls = roll < 0.55 ? 'military' : roll < 0.80 ? 'police' : 'paramilitary';
  let service;
  let skill;
  let branch = null;
  if (cls === 'military') {
    branch = pickBranch(rng, country);
    const entry = country.military.find(([, kind]) => kind === branch) || country.military[0];
    service = entry[0];
    skill = pick(rng, SKILLS_GLOBAL[branch] || SKILLS_GLOBAL.army);
  } else if (cls === 'police') {
    service = pick(rng, country.police);
    skill = pick(rng, SKILLS_GLOBAL.police);
  } else {
    service = pick(rng, country.paramilitary);
    skill = pick(rng, SKILLS_GLOBAL.paramilitary);
  }
  const orgRole = rng() < 0.32 ? 'officer' : 'soldier';
  const professionCategory = cls === 'military' ? 'Military' : cls === 'police' ? 'Police' : 'Paramilitary';

  const interests = [];
  while (interests.length < 4) {
    const interest = pick(rng, INTERESTS_GLOBAL);
    if (!interests.includes(interest)) interests.push(interest);
  }
  const flavour = country.flavour;
  const skillWord = lowerTitle(skill);
  const slots = {
    skill: skillWord,
    a: /^[aeiou]/.test(skillWord) ? 'an' : 'a',
    service_phrase: `the ${service}`,
    city: place[0],
    interest1: String(interests[0]).toLowerCase(),
    interest2: String(interests[1] || interests[0]).toLowerCase(),
    food: pick(rng, flavour.food),
    place: pick(rng, flavour.places),
    habit: pick(rng, flavour.habits),
    service,
    years: 3 + Math.floor(rng() * 15),
  };
  const bio = composeBio(rng, slots);
  const prompts = composePrompts(rng, slots, 3);
  const lifestyle = {
    exercise: pick(rng, LIFESTYLE.exercise),
    drinking: pick(rng, LIFESTYLE.drinking),
    smoking: pick(rng, LIFESTYLE.smoking),
    pets: pick(rng, LIFESTYLE.pets),
  };
  const faiths = ['Christian', 'Christian', 'Muslim', 'None', 'Spiritual', 'Prefer not to say'];
  const values = {
    faith: pick(rng, faiths),
    faithImportance: pick(rng, FAITH_IMPORTANCE),
    familyPlans: pick(rng, FAMILY_PLANS),
  };
  const educationLevel = orgRole === 'officer'
    ? (rng() < 0.55 ? "Bachelor's degree" : "Master's degree")
    : (rng() < 0.6 ? 'Secondary school' : 'Technical college');
  const almaMater = orgRole === 'officer' ? pick(rng, ACADEMIES[countryCode] || ACADEMIES.US) : null;

  return {
    name,
    birthDate,
    gender,
    pronouns: gender === 'female' ? 'she/her' : 'he/him',
    professionCategory,
    professionTitle: skill,
    companyOrOrg: null,
    service,
    orgRole,
    skill,
    dutyStation: place[0],
    educationLevel,
    almaMater,
    city: place[0],
    state: place[1],
    countryCode,
    lat: +(place[2] + (rng() - 0.5) * 0.1).toFixed(4),
    lng: +(place[3] + (rng() - 0.5) * 0.1).toFixed(4),
    bio,
    photos: nextPortrait(culture.race, gender),
    interests,
    prompts,
    lifestyle,
    values,
    datingGoal: pick(rng, DATING_GOALS),
    matchPreferences: { gender: 'everyone', minAge: 22, maxAge: 50 },
    classOfService: cls,
    // Race/culture/branch stay inside the persona blob: admin filters and photo
    // assignment use them, members never see them.
    persona: { greeter: rng() < 0.3, race: culture.race, culture: cultureId, country: countryCode, branch },
    active: true,
    ageDays: 5 + Math.floor(rng() * 300),
  };
}

/**
 * Re-match every existing persona's portraits to their gender and ethnicity,
 * then gate visibility on photo quality: only personas that receive a *unique*
 * face from the pool matching their gender and race stay `npc_active`. The rest
 * are paused with `npc.photoState = 'awaiting_upload'` so an admin can find them
 * (Personas → "Paused only") and upload a real picture. Paused personas still
 * get a matching face where one exists, so re-running after an upload or after
 * the generator grows a pool activates them automatically.
 *
 * Legacy Nigerian personas carry no race marker, so they are treated as Black.
 * Legacy personas are dealt first: the home-market deck keeps the scarce faces,
 * and the new global personas fill in as pools grow.
 */
async function fixPhotos(dryRun) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const res = await fetch(`${REST}/profiles?is_npc=eq.true&select=id,name,gender,photos,npc,created_at,npc_active&order=created_at.asc&limit=2000`, { headers });
  if (!res.ok) throw new Error(`could not list personas (${res.status})`);
  const raw = await res.json();
  // Legacy rows have no `npc.race`; they go first so the Nigerian deck (the
  // home market) keeps the scarce Black faces.
  const rows = raw.slice().sort((a, b) => {
    const legacyA = a.npc?.race ? 1 : 0;
    const legacyB = b.npc?.race ? 1 : 0;
    if (legacyA !== legacyB) return legacyA - legacyB;
    const ta = Date.parse(a.created_at || 0) || 0;
    const tb = Date.parse(b.created_at || 0) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  // Deal the pool in order instead of hashing each id: with a finite pool this
  // guarantees every face is used once before any face repeats, so a persona's
  // own photo only changes when the pool grows (the order is stable).
  const dealt = new Map();
  const plans = rows.map((row) => {
    const npc = row.npc || {};
    const race = npc.race || 'black';
    const gender = row.gender === 'female' ? 'female' : 'male';
    // A human-uploaded photo is final: leave the row exactly as an admin set it
    // and do not consume a pool slot for it.
    if (npc.photoState === 'manual') {
      return {
        id: row.id, name: row.name, race, photos: row.photos || [],
        active: row.npc_active !== false, manual: true,
        npc,
      };
    }
    // Mixed personas share the hispanic pool, so they must share its cursor —
    // otherwise the same face is dealt once as hispanic and once as mixed.
    const poolRace = race === 'mixed' ? 'hispanic' : race;
    const key = `${poolRace}:${gender}`;
    const pool = PHOTO_POOLS?.[poolRace]?.[gender] || [];
    const at = dealt.get(key) || 0;
    dealt.set(key, at + 1);
    const hasUniqueFace = pool.length > 0 && at < pool.length;
    let photos;
    if (pool.length) {
      const url = pool[at % pool.length];
      photos = [url, url.replace(/\.jpg$/, '-alt.jpg')];
    } else {
      photos = fallbackPortrait(gender, `${key}:${at}`);
    }
    return {
      id: row.id, name: row.name, race, photos,
      active: hasUniqueFace,
      wasActive: row.npc_active !== false,
      npc: { ...npc, race, photoState: hasUniqueFace ? 'ready' : 'awaiting_upload' },
    };
  });
  const todo = plans.filter((p, i) => {
    if (p.manual) return false;
    const row = rows[i];
    return JSON.stringify(row.photos || []) !== JSON.stringify(p.photos)
      || (row.npc_active !== false) !== p.active
      || (row.npc || {}).photoState !== p.npc.photoState
      || (row.npc || {}).race !== p.npc.race;
  });
  const ready = plans.filter((p) => p.active).length;
  const paused = plans.length - ready;
  if (!todo.length) {
    console.log(`All ${rows.length} personas are correctly set up (${ready} active, ${paused} paused).`);
    return;
  }
  console.log(`${todo.length} of ${rows.length} personas need changes: ${ready} active with a unique matching face, ${paused} paused awaiting an upload.`);
  const byPool = {};
  for (const p of plans) {
    const key = `${p.race}:${p.npc.photoState}`;
    byPool[key] = (byPool[key] || 0) + 1;
  }
  console.log('  ' + Object.entries(byPool).sort().map(([k, v]) => `${k}=${v}`).join('  '));
  if (dryRun) {
    console.log('(dry run — no writes)');
    return;
  }
  let done = 0;
  for (const plan of todo) {
    const patch = await fetch(`${REST}/profiles?id=eq.${encodeURIComponent(plan.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ photos: plan.photos, npc: plan.npc, npc_active: plan.active, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`photo fix failed for ${plan.name || plan.id} (${patch.status})`);
    done++;
    process.stdout.write(`\rre-matched ${done}/${todo.length}`);
  }
  console.log(`\nDone. ${done} personas updated — ${ready} active with a unique matching portrait, ${paused} paused awaiting upload.`);
}

/**
 * Replace the old twelve-template bios with composed ones. Deterministic per
 * row id, so re-running produces the same text and admin edits made after the
 * rewrite are never touched again (a bio that no longer matches the generated
 * text is left alone on the next run only if it differs — see `--rewrite-bios`
 * docs in the KB).
 */
async function rewriteBios(dryRun) {
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const res = await fetch(`${REST}/profiles?is_npc=eq.true&select=id,name,gender,birth_date,city,country_code,service,skill,class_of_service,interests,npc,bio,prompts&order=created_at.asc&limit=2000`, { headers });
  if (!res.ok) throw new Error(`could not list personas (${res.status})`);
  const rows = await res.json();
  const plans = rows.map((row) => {
    const local = seededRng(row.id);
    const countryCode = row.country_code || 'NG';
    const country = COUNTRIES[countryCode];
    const flavour = country ? country.flavour : NG_FLAVOUR;
    const npc = row.npc || {};
    // Bio templates assume an activity ("hiking", "Sunday roasts"). Legacy rows
    // carry chips like "Nollywood" or "Mosque", which read badly in prose, so the
    // composer draws from the curated pool while the profile chips stay as-is.
    const curated = [];
    while (curated.length < 2) {
      const interest = pick(local, INTERESTS_GLOBAL);
      if (!curated.includes(interest)) curated.push(interest);
    }
    const uniformed = ['military', 'police', 'paramilitary'].includes(row.class_of_service) && row.service;
    let skillWord = lowerTitle(row.skill || 'what I do');
    // Legacy rows sometimes repeat the agency inside the skill ("Road Safety /
    // FRSC" for the FRSC), which reads as a duplicate next to the service name.
    if (uniformed) {
      const servicePattern = String(row.service)
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      skillWord = skillWord
        .replace(new RegExp(`\\s*[/·,-]\\s*${servicePattern}`, 'gi'), '')
        .replace(new RegExp(`^${servicePattern}\\s*[/·,-]\\s*`, 'i'), '')
        .trim() || 'operations';
    }
    const slots = {
      skill: skillWord,
      a: /^[aeiou]/.test(skillWord) ? 'an' : 'a',
      service_phrase: uniformed ? `the ${row.service}` : 'this job',
      city: row.city || 'the city',
      interest1: curated[0].toLowerCase(),
      interest2: curated[1].toLowerCase(),
      food: pick(local, flavour.food),
      place: pick(local, flavour.places),
      habit: pick(local, flavour.habits),
      service: uniformed ? row.service : '',
      years: row.birth_date ? Math.max(2, Math.min(25, ageFromBirthDate(row.birth_date) - 21)) : 5,
    };
    const race = npc.race || 'black';
    return {
      id: row.id,
      name: row.name,
      bio: composeBio(local, slots),
      prompts: composePrompts(local, slots, 3),
      npc: { ...npc, race },
    };
  });
  const todo = plans.filter((p, i) => rows[i].bio !== p.bio || JSON.stringify(rows[i].prompts || []) !== JSON.stringify(p.prompts));
  if (!todo.length) {
    console.log(`All ${rows.length} persona bios are already on the composed engine.`);
    return;
  }
  console.log(`${todo.length} of ${rows.length} personas would receive a rewritten bio.`);
  const sampleSize = Math.max(1, Math.min(todo.length, Number(process.env.SEED_DRY_SAMPLE) || 1));
  for (const s of todo.slice(0, sampleSize)) console.log(`  sample: ${s.name} — ${s.bio}`);
  if (dryRun) {
    console.log('(dry run — no writes)');
    return;
  }
  let done = 0;
  for (const plan of todo) {
    const patch = await fetch(`${REST}/profiles?id=eq.${encodeURIComponent(plan.id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ bio: plan.bio, prompts: plan.prompts, npc: plan.npc, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`bio rewrite failed for ${plan.name || plan.id} (${patch.status})`);
    done++;
    process.stdout.write(`\rrewritten ${done}/${todo.length}`);
  }
  console.log(`\nDone. ${done} persona bios rewritten.`);
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
  if (process.argv.includes('--fix-photos')) {
    await fixPhotos(dryRun);
    return;
  }
  if (process.argv.includes('--rewrite-bios')) {
    await rewriteBios(dryRun);
    return;
  }
  if (process.argv.includes('--backfill')) {
    await backfillDetails();
    return;
  }
  const global = process.argv.includes('--global');
  const countArg = process.argv.find((a) => a.startsWith('--count='));
  const fallback = global ? 500 : 300;
  const count = countArg ? Math.max(1, Math.min(1000, Number(countArg.split('=')[1]) || fallback)) : fallback;

  if (!global) {
    const existing = await fetch(`${REST}/profiles?is_npc=eq.true&select=id&limit=1`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const total = Number((existing.headers.get('content-range') || '0/0').split('/')[1] || 0);
    if (total > 0 && !force && !dryRun) {
      console.log(`${total} NPC profiles already seeded — pass --force to add another deck, or --global for the worldwide deck.`);
      return;
    }
  }

  const profiles = Array.from({ length: count }, (_, i) => (global ? buildGlobalNpc() : buildNpc(i + 1)));
  if (dryRun) {
    // SEED_DRY_SAMPLE lets the mix be audited (race/class/branch spread) without writing.
    const sampleSize = Math.max(1, Math.min(count, Number(process.env.SEED_DRY_SAMPLE) || 2));
    console.log(JSON.stringify(profiles.slice(0, sampleSize), null, 2));
    console.log(`\n(dry run — ${count} ${global ? 'global' : 'Nigerian'} profiles would be seeded)`);
    return;
  }

  let inserted = 0;
  for (let i = 0; i < profiles.length; i += 50) {
    const batch = profiles.slice(i, i + 50);
    inserted += await rpc('/rpc/wassaa_seed_npcs', { p_profiles: batch });
    process.stdout.write(`\rseeded ${inserted}/${profiles.length}`);
  }
  console.log(`\nDone. ${inserted} ${global ? 'global ' : ''}personas are live, verified, and visible in Discover.`);
}

main().catch((err) => { console.error(`\n${err.message}`); process.exit(1); });
