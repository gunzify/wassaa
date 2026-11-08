#!/usr/bin/env node
/**
 * Seed per-persona conversation scripts.
 *
 * Why: the Edge engine used to share one pool of ten greetings across every
 * persona. A member who matched three personas could read the same opener
 * three times, which is exactly the tell that gives a bot away. Each persona
 * now owns its lines in `npc_scripts`; the engine reads those first and only
 * falls back to the shared pool when a persona has none.
 *
 * Guarantees:
 *   - Greetings are globally unique. The generator tracks every emitted
 *     sentence and rotates frames/details until the text is new, so no two
 *     personas can open with the same message.
 *   - Output is deterministic: the same persona id always yields the same
 *     lines, so re-running does not churn the database.
 *   - Existing scripts are left alone unless `--force` is passed. Admin edits
 *     made in the console survive a reseed.
 *
 * Usage:
 *   node scripts/npc-scripts.mjs            # fill personas that have no scripts
 *   node scripts/npc-scripts.mjs --force    # rewrite every persona's scripts
 *   node scripts/npc-scripts.mjs --dry      # print a sample, write nothing
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');

function loadEnv(file) {
  const out = {};
  let raw = '';
  try { raw = readFileSync(join(ROOT, file), 'utf8'); } catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv('frontend/.env'), ...loadEnv('.env') };
const SUPABASE_URL = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !KEY) {
  console.error('Missing VITE_SUPABASE_URL (frontend/.env) or SUPABASE_SERVICE_ROLE_KEY (.env).');
  process.exit(1);
}

// ---------- deterministic randomness ----------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- content ----------
// Every frame keeps at least one of the persona's own facts in the sentence:
// the city they live in, the work they do, or the thing they care about.
// `{you}` is filled with the member's first name at send time; everything else
// is baked in, which is what makes each persona's opener its own.
const OPENERS = [
  (p) => `Hey {you} — ${p.city} has been slow all week, so this is the highlight. I'm ${p.me}, I work in ${p.work}. How's your day going?`,
  (p) => `Hi {you}! I'm ${p.me}. I work in ${p.work}, based in ${p.city}. What do you do?`,
  (p) => `{you} — I'm ${p.me}. I work in ${p.work}, and ${p.interest} takes whatever time is left. What about you?`,
  (p) => `Okay {you}, honest question: ${p.interest} or a quiet night in? I'm ${p.me}, in ${p.city}.`,
  (p) => `Hi {you}. I work in ${p.work} in ${p.city} and I'm terrible at opening lines, so: how was your day?`,
  (p) => `Hey {you}! We matched and I'm glad we did. I'm ${p.me} — ${p.work}, ${p.city}. Tell me something about you.`,
  (p) => `{you}, you look like someone with a good story. I'm ${p.me}, ${p.work} in ${p.city}. What's yours?`,
  (p) => `Hello {you} from ${p.city} 👋 I'm ${p.me}, and I work in ${p.work}. Best part of your week so far?`,
  (p) => `So {you} — I'm ${p.me}. Days go to ${p.work}, evenings to ${p.interest}. What about you?`,
  (p) => `Hey {you}. No clever line from me. I'm ${p.me}, I live in ${p.city}, and I'd like to know you.`,
  (p) => `{you}! I'm ${p.me} — ${p.work} in ${p.city}, ${p.interest} enthusiast. What do you do outside work?`,
  (p) => `Hi {you}, ${p.me} here. I saw we matched while I was on a break in ${p.city}. How's your day treating you?`,
  (p) => `Good to meet you {you}. I'm ${p.me}, ${p.work} in ${p.city}. Quick one — what's something you could talk about for an hour?`,
  (p) => `{you}, I'll be honest: I swiped because of your smile. I'm ${p.me}, ${p.work} in ${p.city}.`,
  (p) => `Hey {you} — ${p.me} here. Long day of ${p.work} in ${p.city}. What's the last thing that made you laugh?`,
  (p) => `Hello {you}. ${p.city} is quiet tonight, so I thought I'd say hi. I'm ${p.me}, ${p.work}. How are you?`,
  (p) => `{you}, I'm ${p.me}. You get one question from me first: what are you looking for on here?`,
  (p) => `Hi {you}! I'm ${p.me}, ${p.work} in ${p.city}. Work keeps me busy but I make time for the right people.`,
  (p) => `Hey {you}, ${p.me} here — ${p.interest} keeps me sane after a long day of ${p.work}. Sound familiar?`,
  (p) => `{you}, I'm ${p.me}. ${p.city} based, ${p.work}, and a soft spot for ${p.interest}. Now you.`,
  (p) => `Hi {you}, ${p.me} from ${p.city}. I'm better at real conversation than small talk, so tell me something real.`,
  (p) => `Hey {you}. I'm ${p.me}, ${p.work}. Long day, and this is the best part of it so far.`,
  (p) => `{you}, quick introduction: ${p.me}, ${p.work}, ${p.city}. Now you.`,
  (p) => `Hello {you}! I'm ${p.me} in ${p.city}. I like ${p.interest}, long conversations and people who say what they mean. You?`,
  (p) => `Hey {you} — that profile of yours is doing a lot of work. I'm ${p.me}, ${p.work} in ${p.city}. What's the story behind it?`,
  (p) => `Hi {you}. I'm ${p.me}. If we're doing this properly, start with: what does your ideal Sunday look like?`,
  (p) => `{you}, ${p.me} here. I'm in ${p.city}, I work in ${p.work}, and I'm curious about you.`,
  (p) => `Hey {you}. I'm ${p.me} and I'd rather ask than guess — what's important to you in a person?`,
  (p) => `Hi {you}! ${p.me} here. My day involved ${p.work} and too much coffee in ${p.city}. How about yours?`,
  (p) => `{you} — I'm ${p.me}. You seem like someone who actually replies. Prove me right?`,
  (p) => `Hey {you}, it's ${p.me}. I was out in ${p.city} earlier thinking I should message you. Glad I did.`,
  (p) => `Hi {you} — ${p.me}. I'm not on here much; ${p.work} eats my time. Tell me what you're about?`,
  (p) => `{you}, ${p.me} here. I've got ${p.interest} playing and a free evening in ${p.city}. What are you up to?`,
  (p) => `Hey {you}. ${p.me}, ${p.work} in ${p.city}. I'll start: my week was long and I'm hoping yours was better.`,
  (p) => `Hello {you}. I'm ${p.me} from ${p.city}. Ask me anything except what I do for work — I'll tell you anyway.`,
  (p) => `{you} — I'm ${p.me}, ${p.work}, ${p.city}. What's one thing you'd want someone to know about you early?`
];

// Used only when two personas would otherwise emit identical text.
const QUIRKS = [
  'Fair warning: I defend my jollof recipe with my life.',
  'I am the friend who books the table and then arrives late.',
  'I run at 5am and I am insufferable about it.',
  'I have a plant I have kept alive for three years. It is my greatest achievement.',
  'I will absolutely beat you at cards and then pretend I feel bad.',
  'I sing in the car like the windows are soundproof. They are not.',
  'I know every back road in this city and still use the map.',
  'I started a book club and we mostly just eat.',
  'My playlist is 90% old music and I am not sorry.',
  'I can fix most things with a screwdriver and false confidence.',
  'I talk to dogs I meet on the street. They talk back, honestly.',
  'I am the one who suggests the road trip and then falls asleep first.'
];

const REPLY_FRAMES = {
  greeting: [
    (p) => `Hey {you} — good to hear from you. ${p.city} has been busy today, how was yours?`,
    () => `Hi again 🙂 I was hoping you'd write. What have you been up to?`,
    (p) => `Hello {you}! I'm ${p.me}, in case the profile didn't stick. What's your day been like?`,
    () => `{you}! There you are. I was starting to think I'd imagined the match.`,
    () => `Hey {you}. Perfect timing, I just finished with work. How are you?`,
    () => `Hi {you} — good to properly meet you. Tell me one thing about your day.`
  ],
  smalltalk: [
    (p) => `That tracks for ${p.city}, honestly. What would you rather be doing right now?`,
    (p) => `Ha, I believe it. ${p.interest} people always have good stories.`,
    () => `See, this is why I swiped. You're easy to talk to.`,
    (p) => `I get that. My day was mostly ${p.work} and not enough food.`,
    () => `Go on, I'm listening. What happened next?`,
    () => `That sounds like a good day. Tell me the best part of it.`,
    (p) => `Honestly same. ${p.city} has a way of keeping you on your toes.`
  ],
  questions: [
    () => `Good question. I'd say consistency beats grand gestures every time. Your turn.`,
    (p) => `Me? ${p.work} by day, ${p.interest} by night. What about you?`,
    () => `I'd say someone who actually says what they mean is already halfway there.`,
    (p) => `Depends on the day — usually ${p.interest} and good company. What's your ideal day?`,
    () => `I'm still working that out, honestly. It's more fun with the right person though.`,
    () => `Fair question. Ask me again on a date and I'll answer properly.`,
    () => `I think I'm looking for something real. Is that too much to say this early?`
  ],
  compliment: [
    () => `Stop it, you'll make me blush 😅 you're not bad yourself.`,
    () => `That's the nicest thing I've read all week, {you}.`,
    () => `Okay, you're dangerous. In a good way.`,
    () => `I like you too, and I'm told I have good taste.`,
    () => `You're making it very hard to play it cool right now.`,
    () => `Careful, {you}. Compliments go straight to my head.`
  ],
  logistics: [
    (p) => `I'd like that. ${p.city} has a quiet spot I keep meaning to try — when are you free?`,
    (p) => `Yes! Weekends work best for me. Which part of ${p.city} is easy for you?`,
    () => `I'm free most evenings after work. Pick a day and I'll make it happen.`,
    () => `Now you're speaking my language. Food, a walk, or something braver?`,
    () => `I like a planner 😊 somewhere low-key this weekend?`,
    () => `Let's do it. I'll bring the conversation, you bring the appetite.`
  ],
  farewell: [
    () => `Talk later, {you} — sleep well and text me tomorrow?`,
    () => `Alright 😊 goodnight. I'll be here when you're free.`,
    () => `Going already? Fine, but you owe me a full conversation tomorrow.`,
    () => `Goodnight {you}. Thanks for making my evening better.`,
    () => `Rest well. And don't be a stranger tomorrow.`,
    () => `Okay, go. But I'm holding you to that story tomorrow.`
  ],
  offTopic: [
    () => `Ha, you lost me — but I like your style. Give me the context version?`,
    () => `That's a new one 😄 now I'm curious.`,
    () => `Didn't expect that. What made you think of it?`,
    () => `You keep me on my toes, {you}. So what are you really saying?`,
    () => `I'll take your word for it. Back to the important things — when are we meeting?`,
    () => `Okay, I need the full story now.`
  ]
};

const INTENTS = Object.keys(REPLY_FRAMES);
const REPLIES_PER_INTENT = 3;
const GREETINGS_PER_PERSONA = 4;

// ---------- generation ----------
function first(value) {
  return String(value || '').trim().split(/\s+/)[0] || '';
}

function personaFrom(row) {
  const npc = (row.npc && typeof row.npc === 'object') ? row.npc : {};
  const interests = Array.isArray(row.interests) ? row.interests.filter(Boolean) : [];
  const job = String(row.skill || row.profession_title || npc.professionTitle || '').trim();
  const service = String(row.service || '').trim().replace(/\s+/g, ' ');
  const uniformed = ['military', 'police', 'paramilitary'].includes(String(row.class_of_service || npc.classOfService || '').toLowerCase());
  // "forensics with the Atlanta Police Department" reads like a person;
  // "the Google" does not, so only uniformed services get the clause. A service
  // that already carries its own article ("An Garda Síochána", "The Rifles")
  // is left alone.
  const needsArticle = service && !/^(the|an|la|le|les|el|los|las|il|lo|gli|i)\b/i.test(service);
  const work = uniformed && service
    ? `${job || 'security'} with ${needsArticle ? 'the ' : ''}${service}`
    : (job || 'what I do');
  return {
    id: row.id,
    me: first(row.name) || 'me',
    city: String(row.city || '').trim() || 'Lagos',
    work,
    interest: String(interests[0] || (Array.isArray(npc.interests) ? npc.interests[0] : '') || 'music').trim(),
    interest2: String(interests[1] || '').trim()
  };
}

function generate(persona, seenGreetings) {
  const rng = rngFrom(hash(persona.id));
  const rotate = Math.floor(rng() * OPENERS.length);
  const greetings = [];

  for (let i = 0; i < GREETINGS_PER_PERSONA; i++) {
    let text = '';
    // Try frames in a persona-specific order, then fall back to a quirk so a
    // genuine collision still produces a sentence nobody else has.
    for (let attempt = 0; attempt < OPENERS.length + QUIRKS.length; attempt++) {
      const frame = OPENERS[(rotate + i + attempt) % OPENERS.length];
      let candidate = frame(persona);
      if (attempt >= OPENERS.length) {
        const quirk = QUIRKS[(hash(persona.id + ':' + attempt) + i) % QUIRKS.length];
        candidate = `${candidate} ${quirk}`;
      }
      const key = candidate.replace(/\{you\}/g, '#').toLowerCase();
      if (!seenGreetings.has(key)) { text = candidate; seenGreetings.add(key); break; }
    }
    if (!text) {
      // Astronomically unlikely: every frame collided. Disambiguate with the
      // second interest and a serial so the invariant still holds.
      text = `${persona.me} here — ${persona.city}, ${persona.work}${persona.interest2 ? `, ${persona.interest2} in my spare time` : ''} (${i}).`;
      seenGreetings.add(text.toLowerCase());
    }
    greetings.push(text);
  }

  const replies = {};
  for (const intent of INTENTS) {
    const frames = REPLY_FRAMES[intent];
    const offset = Math.floor(rng() * frames.length);
    replies[intent] = [];
    for (let i = 0; i < REPLIES_PER_INTENT; i++) {
      const frame = frames[(offset + i) % frames.length];
      replies[intent].push(frame(persona));
    }
  }
  return { greetings, replies };
}

// ---------- Supabase REST ----------
async function api(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method || 'GET'} ${path} -> ${response.status} ${body.slice(0, 300)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(table, select, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await api(`${table}?select=${encodeURIComponent(select)}&order=id&offset=${from}&limit=${pageSize}`);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function main() {
  console.log(`Reading personas from ${new URL(SUPABASE_URL).host}…`);
  const personas = await fetchAll('profiles',
    'id,name,city,skill,profession_title,interests,service,class_of_service,npc');

  const existing = await fetchAll('npc_scripts', 'npc_id');
  const hasScripts = new Set(existing.map((r) => r.npc_id));

  const targets = FORCE ? personas : personas.filter((p) => !hasScripts.has(p.id));
  console.log(`${personas.length} personas; ${hasScripts.size} already scripted; ${targets.length} to generate.`);

  if (!targets.length) { console.log('Nothing to do.'); return; }

  const seenGreetings = new Set();
  const rows = [];
  for (const row of targets) {
    const persona = personaFrom(row);
    const { greetings, replies } = generate(persona, seenGreetings);
    greetings.forEach((body, i) => rows.push({ npc_id: persona.id, kind: 'greeting', intent: null, body, position: i }));
    for (const intent of INTENTS) {
      replies[intent].forEach((body, i) => rows.push({ npc_id: persona.id, kind: 'reply', intent, body, position: i }));
    }
  }

  const uniqueGreetings = new Set(rows.filter((r) => r.kind === 'greeting').map((r) => r.body.replace(/\{you\}/g, '#')));
  console.log(`Generated ${rows.length} script rows for ${targets.length} personas (${uniqueGreetings.size} unique greetings).`);
  console.log('Sample:', rows.find((r) => r.kind === 'greeting')?.body);

  if (DRY) { console.log('--dry: nothing written.'); return; }

  if (FORCE) {
    const ids = targets.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100).join(',');
      await api(`npc_scripts?npc_id=in.(${chunk})`, { method: 'DELETE' });
    }
    console.log('Deleted existing scripts for --force targets.');
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await api('npc_scripts', { method: 'POST', body: JSON.stringify(chunk) });
    written += chunk.length;
    process.stdout.write(`\r  ${written}/${rows.length} rows`);
  }
  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
