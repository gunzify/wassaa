#!/usr/bin/env node
/**
 * Curate a small, human-reviewable NPC set.
 *
 * The original deck was seeded from a photo pool with far fewer faces than
 * personas, so the same person appears dozens of times. That repetition is the
 * tell that makes the deck read as fake. This script pauses every persona and
 * stages a hand-sized set — 20 Nigeria, 15 US, three each for the ten other
 * markets — chosen for distinct photos, complete details and internally
 * consistent service/city/rank data. A human then opens each profile in the console and
 * makes the final call.
 *
 *   node scripts/npc-curate.mjs                  # dry run: print the plan
 *   node scripts/npc-curate.mjs --apply          # pause the whole deck and
 *                                                # stage the picks (they stay
 *                                                # paused until you edit them)
 *   node scripts/npc-curate.mjs --apply --activate
 *                                                # also put the photo-clean
 *                                                # picks live right away
 *   node scripts/npc-curate.mjs --apply --keep-live
 *                                                # leave the current actives
 *                                                # alone, just stage the picks
 *   node scripts/npc-curate.mjs --apply --reset-curated
 *                                                # drop the flag from profiles
 *                                                # no longer selected (also
 *                                                # clears console additions)
 *   node scripts/npc-curate.mjs --ng 20 --us 15 --per-other 3
 *   node scripts/npc-curate.mjs --other-countries GB,CA,AU,DE,BR,IT,ZA,FR,IE,ES
 *
 * Picks are deterministic: the same database always produces the same list, so
 * running it again after an edit never reshuffles the set. Each pick is tagged
 * `npc.curated`, which the console can filter on (Personas -> Curated set only).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const KEEP_LIVE = args.includes('--keep-live');

function argValue(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const TARGET_NG = argValue('--ng', 20);
const TARGET_US = argValue('--us', 15);
// Three per country outside Nigeria and the US, for the ten markets the deck
// actually serves. `--per-other 0` drops them.
const PER_OTHER = argValue('--per-other', 3);
const OTHER_COUNTRIES = (() => {
  const i = args.indexOf('--other-countries');
  if (i >= 0 && args[i + 1]) return args[i + 1].split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  return ['GB', 'CA', 'AU', 'DE', 'BR', 'IT', 'ZA', 'FR', 'IE', 'ES'];
})();

function loadEnv(file) {
  const out = {};
  let raw = '';
  try { raw = readFileSync(resolve(ROOT, file), 'utf8'); } catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv('frontend/.env'), ...loadEnv('.env') };
const URL_BASE = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_BASE || !KEY) {
  console.error('Missing VITE_SUPABASE_URL (frontend/.env) or SUPABASE_SERVICE_ROLE_KEY (.env).');
  process.exit(1);
}

async function request(path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(init.headers || {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const SELECT = [
  'id', 'name', 'gender', 'birth_date', 'city', 'state', 'country_code',
  'profession_category', 'profession_title', 'company_or_org', 'service', 'rank',
  'duty_station', 'class_of_service', 'bio', 'photos', 'interests', 'prompts',
  'dating_goal', 'npc', 'npc_active', 'npc_photo_review', 'npc_quarantine_reason',
  'verification_status', 'location_lat', 'location_lng'
].join(',');

const rows = await request(`profiles?is_npc=eq.true&deleted_at=is.null&select=${SELECT}&limit=1000`);

// ---- data checks -----------------------------------------------------------

const PLACEHOLDER = /\{\{|lorem|tbd|placeholder|example\.com|test user|\bnpc\b/i;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

function photoFile(profile) {
  const url = Array.isArray(profile.photos) ? profile.photos[0] : '';
  if (!url) return '';
  return String(url).split('/').pop().split('?')[0].replace(/-alt\.(jpe?g|png|webp)$/i, '');
}

function bioOpener(profile) {
  const first = String(profile.bio || '').split(SENTENCE_SPLIT)[0] || '';
  return first.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

// A department that names a city has to be in that city: "NYPD · Phoenix" is
// the kind of detail that gives the deck away.
const CITY_DEPARTMENTS = [
  ['NYPD', 'new york'],
  ['LAPD', 'los angeles'],
  ['Chicago Police Department', 'chicago'],
  ['Houston Police Department', 'houston'],
  ['Atlanta Police Department', 'atlanta'],
  ['Miami-Dade Police Department', 'miami'],
  ['Dallas Police Department', 'dallas'],
  ['Seattle Police Department', 'seattle'],
  ['Boston Police Department', 'boston'],
  ['Philadelphia Police Department', 'philadelphia'],
  ['Phoenix Police Department', 'phoenix'],
  ['Denver Police Department', 'denver'],
  ['San Diego Police Department', 'san diego'],
  ['Metropolitan Police Department (DC)', 'washington']
];

function cityMismatch(profile) {
  const hay = `${profile.service || ''} ${profile.company_or_org || ''} ${profile.duty_station || ''}`;
  for (const [department, city] of CITY_DEPARTMENTS) {
    if (!hay.toLowerCase().includes(department.toLowerCase())) continue;
    const where = String(profile.city || '').toLowerCase();
    return where.includes(city) ? null : `${department} in ${profile.city}`;
  }
  return null;
}

// Police-only ranks on a military or paramilitary profile, and military-only
// ranks on a police profile, are the second most common "details are wrong".
const POLICE_RANKS = ['constable', 'chief inspector', 'assistant superintendent', 'deputy commissioner', 'commissioner', 'inspector', 'superintendent'];
const MILITARY_RANKS = ['private', 'lance corporal', 'corporal', 'sergeant', 'staff sergeant', 'warrant officer', 'lieutenant', 'captain', 'major', 'lieutenant colonel', 'colonel', 'brigadier', 'general', 'admiral', 'air marshal', 'wing commander', 'flight lieutenant', 'squadron leader', 'petty officer', 'able seaman'];

function rankMismatch(profile) {
  const rank = String(profile.rank || '').toLowerCase();
  if (!rank) return null;
  const cls = profile.class_of_service;
  if (POLICE_RANKS.includes(rank) && (cls === 'military' || cls === 'paramilitary')) {
    return `${profile.rank} on a ${cls} profile`;
  }
  if (MILITARY_RANKS.includes(rank) && cls === 'police') {
    return `${profile.rank} on a police profile`;
  }
  // A branch-specific rank on the wrong branch, e.g. "Wing Commander" in the Navy.
  const service = String(profile.service || '').toLowerCase();
  if (/wing commander|flight lieutenant|squadron leader|air marshal/.test(rank) && service.includes('navy')) {
    return `${profile.rank} in the ${profile.service}`;
  }
  if (/admiral|petty officer|able seaman/.test(rank) && (service.includes('army') || service.includes('air force'))) {
    return `${profile.rank} in the ${profile.service}`;
  }
  return null;
}

// The older Nigerian seed wrote a rank into `profession_title` (a police
// inspector "serving" in the Air Force). The specialisation actually lives in
// the bio, so the repair reads it back from there and falls back to the class
// pool. `rank` is never shown by the product, so it stays empty.
const NG_SKILLS = {
  military: ['Nursing / Medical', 'Engineering', 'Software / IT', 'Communications / Signals', 'Logistics / Supply', 'Aviation', 'Legal / JAG', 'Education / Training', 'Admin / Personnel', 'Armourer / Technical', 'Driver / Fleet', 'Environmental Health'],
  police: ['Investigations', 'Forensics', 'Cybercrime / IT', 'Traffic / Road Safety', 'Public Order', 'Nursing / Medical', 'Logistics / Supply', 'Legal / Prosecution', 'Admin / Personnel', 'K9 / Tactical', 'Communications', 'Community Relations'],
  // Agency names ("Road Safety / FRSC") are deliberately absent: they only make
  // sense when the persona already serves in that agency.
  paramilitary: ['Nursing / Medical', 'Engineering', 'Software / IT', 'Logistics / Supply', 'Admin / Personnel', 'Legal', 'Border Operations', 'Corrections', 'Fire / Rescue', 'Security Operations']
};

const AGENCY_TOKENS = [
  ['FRSC', /\bfrsc\b|\broad safety\b/i],
  ['NSCDC', /\bnscdc\b/i],
  ['Immigration', /\bimmigration\b/i],
  ['Customs', /\bcustoms\b/i],
  ['Police', /\bpolice\b/i],
  ['Army', /\barmy\b/i],
  ['Navy', /\bnavy\b/i],
  ['Air Force', /\bair force\b/i],
  ['Marine Corps', /\bmarine corps\b/i],
  ['Coast Guard', /\bcoast guard\b/i],
  ['Border Patrol', /\bborder patrol\b/i],
  ['Fire Service', /\bfire service\b/i]
];

/** A bio that talks about a different agency than the profile serves in. */
function agencyMismatch(profile) {
  const bio = String(profile.bio || '');
  const service = String(profile.service || '');
  for (const [label, re] of AGENCY_TOKENS) {
    if (!re.test(bio)) continue;
    if (re.test(service)) continue;
    // "Police" appears inside legitimate specialisations (Military Police), and
    // inside the phrase "police check"; only treat it as an agency for a
    // uniformed profile whose bio names another force.
    if (label === 'Police') {
      if (profile.class_of_service === 'civilian') continue;
      if (/military police|naval police|air police|police check/i.test(bio)) continue;
    }
    return `bio mentions ${label}, profile serves in ${service || 'nothing'}`;
  }
  return null;
}

// A sailor in a landlocked city is the clearest geography error in the deck.
// Navy and coast-guard postings are coastal, or the national capital where the
// service headquarters sits.
const NAVY_CITIES = {
  NG: ['ajah', 'ikorodu', 'ikeja', 'surulere', 'victoria island', 'lagos', 'port harcourt', 'calabar', 'warri', 'abuja', 'yenagoa'],
  GB: ['portsmouth', 'plymouth', 'faslane', 'helensburgh', 'london', 'belfast', 'cardiff', 'liverpool', 'edinburgh', 'glasgow', 'newcastle'],
  CA: ['halifax', 'esquimalt', 'victoria', 'ottawa', 'vancouver', 'quebec', 'saint john'],
  AU: ['sydney', 'perth', 'darwin', 'hobart', 'canberra', 'brisbane', 'adelaide', 'melbourne', 'jervis bay'],
  DE: ['kiel', 'wilhelmshaven', 'rostock', 'berlin', 'hamburg', 'eckernförde', 'eckernforde'],
  BR: ['rio de janeiro', 'salvador', 'natal', 'brasília', 'brasilia', 'belém', 'belem', 'florianópolis', 'florianopolis', 'porto alegre', 'santos'],
  IT: ['taranto', 'la spezia', 'naples', 'napoli', 'rome', 'roma', 'brindisi', 'ancona', 'augusta', 'genoa', 'genova', 'venice', 'venezia'],
  ZA: ['cape town', "simon's town", 'simons town', 'durban', 'port elizabeth', 'gqeberha', 'pretoria', 'saldanha'],
  FR: ['toulon', 'brest', 'cherbourg', 'paris', 'lorient', 'rochefort', 'saint-mandrier'],
  IE: ['cork', 'dublin', 'waterford', 'galway', 'limerick', 'cobh'],
  ES: ['madrid', 'ferrol', 'rota', 'cartagena', 'cádiz', 'cadiz', 'las palmas', 'valencia', 'barcelona']
};
const US_COASTAL_STATES = ['california', 'washington', 'virginia', 'florida', 'hawaii', 'south carolina', 'georgia', 'texas', 'massachusetts', 'maine', 'connecticut', 'rhode island', 'new jersey', 'new york', 'maryland', 'north carolina', 'louisiana', 'mississippi', 'alabama', 'oregon', 'alaska'];

function geographyMismatch(profile) {
  const service = String(profile.service || '').toLowerCase();
  if (!/navy|coast guard/.test(service)) return null;
  const city = String(profile.city || '').toLowerCase();
  const state = String(profile.state || '').toLowerCase();
  if (profile.country_code === 'US') {
    return US_COASTAL_STATES.some((s) => state.includes(s)) ? null : `${profile.service} in ${profile.state}`;
  }
  const allowed = NAVY_CITIES[profile.country_code];
  if (allowed) {
    return allowed.some((c) => city.includes(c)) ? null : `${profile.service} in ${profile.city}`;
  }
  return null;
}

// "Texas Department of Public Safety" in Philadelphia.
const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];

function stateAgencyMismatch(profile) {
  if (profile.country_code !== 'US') return null;
  const hay = `${profile.service || ''} ${profile.company_or_org || ''}`;
  const named = US_STATES.find((s) => new RegExp(`\\b${s}\\b`).test(hay));
  if (!named) return null;
  const where = String(profile.state || '');
  return where.toLowerCase().includes(named.toLowerCase()) ? null : `${profile.service} in ${profile.state}`;
}

// The same rule outside the US: a force that names its region has to be in it.
const REGION_DEPARTMENTS = [
  ['Toronto Police Service', ['toronto'], 'city'],
  ['Ottawa Police', ['ottawa'], 'city'],
  ['Vancouver Police', ['vancouver'], 'city'],
  ['Calgary Police', ['calgary'], 'city'],
  ['Edmonton Police', ['edmonton'], 'city'],
  ['Metropolitan Police', ['london'], 'city'],
  ['Police Scotland', ['scotland'], 'state'],
  ['Police Service of Northern Ireland', ['northern ireland', 'belfast'], 'state'],
  ['Bavarian State Police', ['bavaria'], 'state'],
  ['Hessian State Police', ['hesse'], 'state'],
  ['New South Wales Police', ['new south wales'], 'state'],
  ['Queensland Police', ['queensland'], 'state'],
  ['Victoria Police', ['victoria'], 'state'],
  ['South Australia Police', ['south australia'], 'state'],
  ['Western Australia Police', ['western australia'], 'state'],
  ['Tasmania Police', ['tasmania'], 'state']
];

function regionDepartmentMismatch(profile) {
  const hay = `${profile.service || ''} ${profile.company_or_org || ''}`.toLowerCase();
  const where = `${profile.city || ''} ${profile.state || ''}`.toLowerCase();
  for (const [department, allowed] of REGION_DEPARTMENTS) {
    if (!hay.includes(department.toLowerCase())) continue;
    return allowed.some((token) => where.includes(token)) ? null : `${department} in ${profile.city}`;
  }
  return null;
}

/** Best specialisation for a uniformed persona: what the bio already says. */
function tradesFor(profile) {
  if (profile.class_of_service === 'paramilitary') {
    const service = String(profile.service || '').toLowerCase();
    if (/immigration/.test(service)) return ['Border Operations', 'Logistics / Supply', 'Admin / Personnel', 'Legal', 'Software / IT', 'Nursing / Medical'];
    if (/customs/.test(service)) return ['Border Operations', 'Logistics / Supply', 'Admin / Personnel', 'Legal', 'Software / IT'];
    if (/frsc|road safety/.test(service)) return ['Road Safety', 'Logistics / Supply', 'Admin / Personnel', 'Engineering', 'Nursing / Medical'];
    if (/nscdc/.test(service)) return ['Security Operations', 'Logistics / Supply', 'Admin / Personnel', 'Legal'];
    if (/fire/.test(service)) return ['Fire / Rescue', 'Engineering', 'Nursing / Medical', 'Logistics / Supply'];
    if (/correction/.test(service)) return ['Corrections', 'Admin / Personnel', 'Legal', 'Logistics / Supply'];
  }
  return NG_SKILLS[profile.class_of_service] || NG_SKILLS.military;
}

function specialisationFor(profile) {
  const pool = tradesFor(profile);
  const bio = String(profile.bio || '').toLowerCase();
  const found = pool
    .filter((skill) => bio.includes(skill.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (found) return found;
  let h = 0;
  for (const ch of String(profile.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}


const faceUse = new Map();
const FLAGGED_FACES = new Set();
for (const p of rows) {
  const file = photoFile(p);
  if (!file) continue;
  faceUse.set(file, (faceUse.get(file) || 0) + 1);
  if (p.npc_photo_review === 'quarantine') FLAGGED_FACES.add(file);
}

function score(profile) {
  let s = 0;
  const bio = String(profile.bio || '');
  if (bio.length >= 140 && bio.length <= 700) s += 24;
  else if (bio.length >= 90) s += 10;
  if (Array.isArray(profile.prompts) && profile.prompts.length >= 3) s += 16;
  else if (Array.isArray(profile.prompts) && profile.prompts.length === 2) s += 8;
  if (Array.isArray(profile.interests) && profile.interests.length >= 4) s += 12;
  else if (Array.isArray(profile.interests) && profile.interests.length >= 2) s += 6;
  if (profile.birth_date) s += 4;
  if (profile.city && profile.state) s += 6;
  if (typeof profile.location_lat === 'number' && typeof profile.location_lng === 'number') s += 6;
  // Reuse across the whole deck does not matter once the deck is paused: only
  // repeats inside the curated set would look wrong, and `pick` already forbids
  // those. Scoring on rarity skews the set toward the smallest photo pools.
  // A photo a reviewer already flagged is usable only as a placeholder.
  if (FLAGGED_FACES.has(photoFile(profile))) s -= 120;
  if (profile.class_of_service && profile.class_of_service !== 'civilian') {
    if (profile.service) s += 6;
  } else if (profile.profession_title) {
    s += 6;
  }
  if (profile.verification_status === 'verified') s += 2;
  if (profile.dating_goal) s += 2;
  if (PLACEHOLDER.test(bio) || PLACEHOLDER.test(String(profile.name || ''))) s -= 60;
  return s;
}

function eligible(profile) {
  if (!profile.name || PLACEHOLDER.test(profile.name)) return false;
  if (!profile.birth_date) return false;
  if (!profile.city || !profile.state) return false;
  if (!Array.isArray(profile.interests) || profile.interests.length < 2) return false;
  if (!Array.isArray(profile.prompts) || profile.prompts.length < 2) return false;
  const bio = String(profile.bio || '');
  if (bio.length < 100 || PLACEHOLDER.test(bio)) return false;
  if (!photoFile(profile)) return false;
  if (cityMismatch(profile)) return false;
  if (stateAgencyMismatch(profile)) return false;
  if (regionDepartmentMismatch(profile)) return false;
  if (rankMismatch(profile)) return false;
  if (agencyMismatch(profile)) return false;
  if (geographyMismatch(profile)) return false;
  return true;
}

/**
 * Greedy pick under diversity constraints. Strict pass first (unique face,
 * unique opener, city and gender caps); a second pass relaxes the city/class
 * caps; a third only requires a face nobody else in the set is using.
 */
function pick(group, count, { maxPerCity = 2, maxPerClass = 99, usedFaces = new Set() } = {}) {
  const pool = group.filter(eligible).sort((a, b) => score(b) - score(a));
  const chosen = [];
  const openers = new Map();
  const cityCount = new Map();
  const classCount = new Map();
  const firstNames = new Set();
  const genderCount = { female: 0, male: 0 };
  const genderCap = Math.ceil(count / 2);

  const firstName = (p) => String(p.name || '').split(' ')[0].toLowerCase();

  const take = (p) => {
    chosen.push(p);
    usedFaces.add(photoFile(p));
    const o = bioOpener(p);
    openers.set(o, (openers.get(o) || 0) + 1);
    cityCount.set(p.city, (cityCount.get(p.city) || 0) + 1);
    const cls = p.class_of_service || 'civilian';
    classCount.set(cls, (classCount.get(cls) || 0) + 1);
    firstNames.add(firstName(p));
    if (p.gender === 'female' || p.gender === 'male') genderCount[p.gender] += 1;
  };

  const passes = [
    { city: true, class: true, name: true, gender: true },
    { city: true, class: false, name: true, gender: true },
    { city: false, class: false, name: true, gender: true },
    { city: false, class: false, name: false, gender: false }
  ];
  for (const rules of passes) {
    for (const p of pool) {
      if (chosen.length >= count) break;
      if (chosen.includes(p)) continue;
      if (usedFaces.has(photoFile(p))) continue;
      // Two personas may share an opener at most; more than that reads as a
      // template, which is exactly what the curated set is fixing.
      if ((openers.get(bioOpener(p)) || 0) >= 2) continue;
      if (rules.name && firstNames.has(firstName(p))) continue;
      if (rules.city && (cityCount.get(p.city) || 0) >= maxPerCity) continue;
      if (rules.class && (classCount.get(p.class_of_service || 'civilian') || 0) >= maxPerClass) continue;
      if (rules.gender && (p.gender === 'female' || p.gender === 'male') && genderCount[p.gender] >= genderCap) continue;
      take(p);
    }
    if (process.env.DEBUG_PICK) console.error(`[pick] pass ${JSON.stringify(rules)} -> ${chosen.length}/${count}`);
    if (chosen.length >= count) break;
  }
  if (process.env.DEBUG_PICK) console.error(`[pick] ${count} -> ${chosen.length}, pool ${pool.length}, cities ${[...new Set(chosen.map((p) => p.city))].join('/')}`);
  return chosen;
}

const ngPool = rows.filter((p) => p.country_code === 'NG');
const usPool = rows.filter((p) => p.country_code === 'US');
const otherCodes = [...new Set(rows.map((p) => p.country_code).filter((c) => c && c !== 'NG' && c !== 'US'))];

// One shared face registry across every group: the whole deck reads as fake if
// the same person shows up in Lagos and in Leeds.
const usedFaces = new Set();

const ng = pick(ngPool, TARGET_NG, { maxPerCity: 2, usedFaces });
const us = pick(usPool, TARGET_US, { maxPerCity: 2, usedFaces });

// The ten target markets come first, in the order the console shows them, so
// each gets its three personas before the remainder of the pool is considered.
const otherRanked = otherCodes
  .map((code) => ({ code, size: rows.filter((p) => p.country_code === code).length }))
  .sort((a, b) => b.size - a.size);
// The pinned markets come first; any pinned code without personas is skipped,
// and the largest remaining countries fill the gap.
const otherOrder = [
  ...OTHER_COUNTRIES.filter((code) => otherCodes.includes(code)),
  ...otherRanked.map((entry) => entry.code).filter((code) => !OTHER_COUNTRIES.includes(code))
];
// Ten markets, three personas each (by default); the extras stay available in
// the paused pool for the console's "add from pool" flow.
const targetOtherCodes = otherOrder.slice(0, OTHER_COUNTRIES.length);
const others = targetOtherCodes.flatMap((code) =>
  pick(rows.filter((p) => p.country_code === code), PER_OTHER, { maxPerCity: 2, usedFaces })
);
const TARGET_TOTAL = TARGET_NG + TARGET_US + targetOtherCodes.length * PER_OTHER;

const picks = [...ng, ...us, ...others];

function describe(p) {
  const fix = needsDetailFix(p) ? specialisationFor(p) : null;
  return {
    id: p.id,
    name: p.name,
    where: [p.city, p.state, p.country_code].filter(Boolean).join(', '),
    gender: p.gender,
    role: p.service ? `${p.rank || ''} ${p.service}`.trim() : (p.profession_title || p.profession_category || ''),
    photo: photoFile(p),
    photoReuse: faceUse.get(photoFile(p)) || 0,
    photoFlagged: FLAGGED_FACES.has(photoFile(p)),
    score: score(p),
    fix
  };
}

/** True when `profession_title` holds a rank instead of a trade. Only the old
 * Nigerian seed did this; the global seed wrote a real specialisation. */
function needsDetailFix(p) {
  if (p.country_code !== 'NG') return false;
  if (!p.class_of_service || p.class_of_service === 'civilian') return false;
  return !tradesFor(p).includes(p.profession_title);
}

console.log(`deck: ${rows.length} personas, ${rows.filter((p) => p.npc_active).length} active\n`);

const groups = [
  ['Nigeria', ng],
  ['United States', us],
  ['Rest of the world', others]
];
for (const [label, list] of groups) {
  console.log(`\n== ${label} (${list.length}) ==`);
  for (const p of list) {
    const d = describe(p);
    console.log(
      `${d.name.padEnd(24)} ${d.where.padEnd(34)} ${String(d.gender).padEnd(6)} ${d.role.padEnd(34)} ` +
      `${d.photo}${d.photoFlagged ? '  [PHOTO FLAGGED]' : ''}${d.photoReuse > 1 ? `  [face used ${d.photoReuse}x]` : ''}` +
      `${d.fix ? `  [trade -> ${d.fix}]` : ''}`
    );
  }
}

const faces = picks.map(photoFile);
console.log(`\nselected ${picks.length}: ${ng.length} NG, ${us.length} US, ${others.length} other countries`);
console.log(`distinct photos: ${new Set(faces).size}/${picks.length}`);
const repeated = [...faces.reduce((m, f) => m.set(f, (m.get(f) || 0) + 1), new Map())].filter(([, n]) => n > 1);
if (repeated.length) console.log(`shared faces inside the set: ${repeated.map(([f, n]) => `${f} x${n}`).join(', ')}`);
console.log(`countries: ${new Set(picks.map((p) => p.country_code)).size}`);
console.log(`gender: ${picks.filter((p) => p.gender === 'female').length} female, ${picks.filter((p) => p.gender === 'male').length} male`);
const flagged = picks.filter((p) => FLAGGED_FACES.has(photoFile(p)));
console.log(`photos a reviewer flagged: ${flagged.length}${flagged.length ? ' — replace these before going live' : ''}`);
const fixes = picks.filter(needsDetailFix);
console.log(`trades stored as ranks (repaired on apply): ${fixes.length}`);

if (picks.length < TARGET_TOTAL) {
  console.log(`Note: the pool could not fill every slot (${picks.length} of ${TARGET_TOTAL}); the list above is everything that passed.`);
}

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to pause the whole deck and stage this set.');
  process.exit(0);
}

// ---- apply -----------------------------------------------------------------

if (!KEEP_LIVE) {
  await request('profiles?is_npc=eq.true&npc_active=eq.true', {
    method: 'PATCH',
    body: JSON.stringify({ npc_active: false, updated_at: new Date().toISOString() })
  });
}

// Claim the shortlist as exactly this run's picks. Only useful on the first
// pass or after a deliberate rebuild: it also clears flags added by hand in the
// console, which is why it is opt-in and not part of `--apply`.
if (args.includes('--reset-curated')) {
  const keep = new Set(picks.map((p) => p.id));
  const stale = rows.filter((p) => p.npc && p.npc.curated && !keep.has(p.id));
  for (const p of stale) {
    const persona = { ...(p.npc || {}) };
    delete persona.curated;
    delete persona.curatedAt;
    await request(`profiles?id=eq.${encodeURIComponent(p.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ npc: persona, updated_at: new Date().toISOString() })
    });
  }
  console.log(`\ncleared the curated flag on ${stale.length} profiles no longer selected`);
}

// Staging is the default: the deck goes quiet while the picks are edited. Each
// pick carries `npc.curated` so the console can show the shortlist on its own.
// A curated persona stays paused even after a photo upload; the curator presses
// Activate in the console to put it live. `--activate` does that now for every
// pick whose photo is not quarantined.
const ACTIVATE = args.includes('--activate');
const now = new Date().toISOString();
let repaired = 0;
let activated = 0;
let heldBack = 0;

for (const p of picks) {
  const patch = {
    npc: { ...(p.npc || {}), curated: true, curatedAt: now },
    updated_at: now
  };
  // Seeding marks a persona `awaiting_upload` when the auto-dealer had no spare
  // face. A pick that came in with a usable face kept that flag, so the deck hid
  // it and activation refused it even though the profile had photos. Clearing
  // the flag is the whole reason for staging a pick that already looks real.
  const face = photoFile(p);
  const faceUsable = Boolean(face) && p.npc_photo_review !== 'quarantine' && !FLAGGED_FACES.has(face);
  if (faceUsable && patch.npc.photoState === 'awaiting_upload') patch.npc.photoState = 'ready';
  if (needsDetailFix(p)) {
    const trade = specialisationFor(p);
    patch.profession_title = trade;
    patch.skill = trade;
    patch.rank = null;
    patch.duty_station = p.duty_station || p.city;
    repaired += 1;
  }
  if (ACTIVATE) {
    if (FLAGGED_FACES.has(photoFile(p))) {
      heldBack += 1; // a face a reviewer rejected never goes live; replace it first
    } else {
      patch.npc_active = true;
      activated += 1;
    }
  }
  await request(`profiles?id=eq.${encodeURIComponent(p.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
}

const after = await request('profiles?is_npc=eq.true&npc_active=eq.true&select=id,country_code');
const liveIds = new Set(after.map((p) => p.id));
console.log(`\nactive personas now: ${after.length}`);
const byCountry = {};
for (const p of after) byCountry[p.country_code] = (byCountry[p.country_code] || 0) + 1;
console.log('active by country:', byCountry);
console.log(`staged ${picks.length} curated profiles; repaired ${repaired} trades`);
if (ACTIVATE) console.log(`activated ${activated}; held back ${heldBack} with a flagged photo`);

// A receipt the console can be checked against when the edge deploy is behind.
const liveNow = picks.filter((p) => liveIds.has(p.id)).length;
const needsFace = picks.filter((p) => FLAGGED_FACES.has(photoFile(p))).length;
const lines = [
  '# Curated personas',
  '',
  `Generated ${now.slice(0, 10)} by \`scripts/npc-curate.mjs\`. ${picks.length} profiles are tagged`,
  `\`npc.curated\`: ${liveNow} live, ${picks.length - liveNow} paused, ${needsFace} still using a face a`,
  'reviewer flagged. In the console, filter Personas by **Curated set only**, edit a',
  'profile, then press **Activate** to put it live and **Pause** to take it out. A',
  'photo upload clears an automated photo flag but leaves a curated persona paused',
  'until you activate it.',
  '',
  '| Country | Name | City | Class | Role | Photo | Live | Needs a photo |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |'
];
for (const group of [ng, us, others]) {
  for (const p of group) {
    const face = photoFile(p);
    const role = p.service ? `${p.rank || ''} ${p.service}`.trim() : (p.profession_title || p.profession_category || '');
    lines.push(`| ${p.country_code} | ${p.name} | ${p.city}, ${p.state} | ${p.class_of_service || ''} | ${role} | ${face} | ${liveIds.has(p.id) ? 'live' : 'paused'} | ${FLAGGED_FACES.has(face) ? 'yes' : ''} |`);
  }
}
writeFileSync(resolve(ROOT, 'docs/npc-curated.md'), lines.join('\n') + '\n', 'utf8');
console.log('wrote docs/npc-curated.md');
console.log('\nCurated ids (filter Personas -> Curated set in the console):');
console.log(picks.map((p) => `${p.id}  ${p.name}`).join('\n'));
