#!/usr/bin/env node
/**
 * Generate and host persona portraits (KB §18B, §25E).
 *
 *   node scripts/persona-photos.mjs --dry-run   # print the plan, no network
 *   node scripts/persona-photos.mjs             # generate missing, crop, upload
 *   node scripts/persona-photos.mjs --verify    # HEAD-check every hosted URL
 *   node scripts/persona-photos.mjs --horde-black=200
 *                                               # rebuild the Black pool with
 *                                               # AI Horde (unique faces)
 *
 * Faces come from this-person-does-not-exist.com, which accepts gender, age and
 * ethnicity filters and returns a 1024x1024 AI face. That service's Black model
 * set is tiny (about a dozen distinct faces), so the Black pool is generated
 * with AI Horde's Realistic Vision instead: same synthetic-person guarantee, no
 * watermark, and enough unique faces for a deck of hundreds.
 *
 * Images are hosted in the public R2 bucket and the manifest is written to
 * scripts/persona-photo-pools.json, which seed-npcs.mjs reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { parse } = require('dotenv');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = parse(fs.readFileSync(path.join(root, 'backend', '.env')));

const BUCKET = (env.R2_PUBLIC_BUCKET || '').trim();
const PUBLIC_BASE = (env.R2_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const ENDPOINT = (env.R2_ENDPOINT || '').trim() || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const ACCESS = (env.R2_ACCESS_KEY_ID || '').trim();
const SECRET = (env.R2_SECRET_ACCESS_KEY || '').trim();

const WORK = path.join(root, '.persona-photos');
const RAW = path.join(WORK, 'raw');
const CROP = path.join(WORK, 'crop');
const MANIFEST = path.join(root, 'scripts', 'persona-photo-pools.json');

// [api ethnicity, pool race key, count per gender]
// Sized for a 500-persona global deck: white personas are ~55% of the mix, so
// the white pool needs the most faces. The Black pool is generated separately
// (Horde/Pollinations) because this service only has a dozen Black faces.
const POOLS = [
  ['white', 'white', 170],
  ['black', 'black', 40],
  ['latino_hispanic', 'hispanic', 30],
  ['indian', 'south_asian', 20],
  ['asian', 'east_asian', 18],
  ['middle_eastern', 'mena', 14],
];
const AGES = ['19-25', '26-35', '26-35', '35-50'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateOne(etnic, gender, age) {
  // The service caches by query string, so `time` must change per request or
  // every call with the same filters returns the same face.
  const stamp = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const res = await fetch(`https://this-person-does-not-exist.com/new?time=${stamp}&gender=${gender}&age=${age}&etnic=${etnic}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const json = await res.json();
  if (!json?.src) throw new Error('no src in response');
  const img = await fetch(`https://this-person-does-not-exist.com${json.src}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!img.ok) throw new Error(`image ${img.status}`);
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length < 20000) throw new Error(`suspicious image size ${buf.length}`);
  return buf;
}

async function withRetry(fn, label, tries = 6) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      await sleep(1200 * (i + 1));
    }
  }
  throw new Error(`${label}: ${last?.message || last}`);
}

// ---------------------------------------------------------------------------
// AI Horde: used for the Black pool, where the face service runs out of faces.
// ---------------------------------------------------------------------------
const HORDE = 'https://aihorde.net/api/v2';
const HORDE_KEY = process.env.HORDE_KEY || '0000000000';
const HORDE_HEADERS = { 'Content-Type': 'application/json', apikey: HORDE_KEY, 'Client-Agent': 'wassaa-portraits:1.0:dev' };
const HORDE_COMMON_NEG = 'close-up, cropped head, cut off head, cropped forehead, cartoon, illustration, painting, 3d render, cgi, airbrushed, plastic skin, deformed, disfigured, mutated, extra limbs, extra fingers, blurry, low quality, text, watermark, signature, bad anatomy, child, teen, nude, nsfw';
const HORDE_NEG = {
  female: `${HORDE_COMMON_NEG}, male, man, boy, beard, mustache, facial hair, androgynous, masculine jaw`,
  male: `${HORDE_COMMON_NEG}, female, woman, girl, feminine, makeup, lipstick`,
};

const HORDE_AGES = ['in her early 20s', 'in her mid 20s', 'in her late 20s', 'in her early 30s', 'in her mid 30s', 'in her late 30s', 'in her early 40s'];
const HORDE_AGES_M = ['in his early 20s', 'in his mid 20s', 'in his late 20s', 'in his early 30s', 'in his mid 30s', 'in his late 30s', 'in his early 40s'];
const HORDE_HAIR_F = ['short natural hair', 'long box braids', 'a full afro', 'a patterned headwrap', 'shoulder-length twists', 'two-strand twists', 'a short tapered cut', 'a braided updo'];
const HORDE_HAIR_M = ['a short fade', 'a clean-shaven head', 'a full afro', 'short dreadlocks', 'a neat low cut', 'a short beard and fade', 'a shaved head with a trimmed beard'];
const HORDE_SETTING = [
  'plain neutral studio background',
  'soft grey studio background',
  'blurred green outdoor background',
  'blurred city street background',
  'warm indoor window light',
  'blurred office background',
];
const HORDE_EXPRESSION = ['a calm neutral expression', 'a slight confident smile', 'a warm relaxed smile', 'a thoughtful expression'];
const HORDE_SKIN = ['deep brown skin', 'dark brown skin', 'rich brown skin', 'warm brown skin'];
const HORDE_CLOTHES_F = ['a plain cotton t-shirt', 'a light blouse', 'a denim jacket over a top', 'a fine-knit sweater', 'a collared shirt'];
const HORDE_CLOTHES_M = ['a plain cotton t-shirt', 'a collared shirt', 'a denim jacket', 'a fine-knit sweater', 'a polo shirt'];

/** Build a varied portrait prompt for a given race/gender. */
function hordePrompt(race, gender, index, token) {
  const female = gender === 'female';
  const pick = (arr, n) => arr[n % arr.length];
  const look = GEN_LOOK[race] || GEN_LOOK.white;
  const age = pick(female ? HORDE_AGES : HORDE_AGES_M, index);
  const hair = pick(female ? HORDE_HAIR_F : HORDE_HAIR_M, Math.floor(index / 7));
  const skin = pick(look.skin, Math.floor(index / 3));
  const setting = pick(HORDE_SETTING, index * 3 + (female ? 1 : 0));
  const expression = pick(HORDE_EXPRESSION, index * 5);
  const clothes = pick(female ? HORDE_CLOTHES_F : HORDE_CLOTHES_M, index * 7);
  const who = look.who[female ? 0 : 1];
  // `reference` keeps Horde's prompt cache from replaying an earlier face.
  return `professional portrait photograph, head and shoulders, upper body visible, of a ${who} ${age} with ${skin}, ${hair}, ${expression}, wearing ${clothes}, ${setting}, looking at the camera, natural skin texture, soft lighting, 85mm lens, sharp focus, high detail, reference ${token}`;
}

/** Ask AI Horde for one portrait and return the JPEG bytes. */
async function hordeOne(race, gender, index) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${HORDE}/generate/async`, {
    method: 'POST',
    headers: HORDE_HEADERS,
    body: JSON.stringify({
      prompt: hordePrompt(race, gender, index, token),
      params: { width: 640, height: 640, steps: 34, sampler_name: 'k_dpmpp_2m', cfg_scale: 7, n: 1, seed: Math.floor(Math.random() * 2 ** 31), negative_prompt: HORDE_NEG[gender] },
      nsfw: false, r2: false, models: ['Realistic Vision'],
    }),
  });
  if (!res.ok) throw new Error(`horde submit ${res.status}`);
  const { id } = await res.json();
  if (!id) throw new Error('horde returned no job id');
  for (let i = 0; i < 150; i++) {
    await sleep(4000);
    const check = await (await fetch(`${HORDE}/generate/check/${id}`, { headers: HORDE_HEADERS })).json();
    if (check.faulted) throw new Error('horde job faulted');
    if (!check.done) continue;
    const status = await (await fetch(`${HORDE}/generate/status/${id}`, { headers: HORDE_HEADERS })).json();
    const b64 = status.generations?.[0]?.img;
    if (!b64) throw new Error('horde returned no image');
    // Horde serves WebP; System.Drawing (the cropper) cannot read it, so it is
    // converted to JPEG here with ffmpeg. Unique names keep concurrent jobs apart.
    const stem = path.join(WORK, `horde-${process.pid}-${Math.random().toString(36).slice(2)}`);
    const tmp = `${stem}.webp`;
    const out = `${stem}.jpg`;
    fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-q:v', '2', out]);
    const jpg = fs.readFileSync(out);
    fs.unlinkSync(tmp); fs.unlinkSync(out);
    if (jpg.length < 15000) throw new Error(`suspicious image size ${jpg.length}`);
    return jpg;
  }
  throw new Error('horde job timed out');
}

/** Rebuild the Black pool with `perGender` unique faces (overwrites 01..N). */
async function generateBlackPool(perGender) {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(RAW, { recursive: true });
  const concurrency = Math.max(1, Number(process.env.HORDE_CONCURRENCY) || 4);
  const jobs = [];
  for (const gender of ['female', 'male']) {
    for (let i = 1; i <= perGender; i++) jobs.push({ gender, i });
  }
  let cursor = 0, done = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const { gender, i } = jobs[cursor++];
      const name = `black-${gender}-${String(i).padStart(2, '0')}.jpg`;
      const file = path.join(RAW, name);
      if (fs.existsSync(file) && fs.statSync(file).size > 15000) { done++; continue; }
      try {
        const buf = await withRetry(() => hordeOne(gender, i - 1), name, 4);
        fs.writeFileSync(file, buf);
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${jobs.length} portraits`);
      } catch (e) {
        console.error(`\n  FAIL ${name}: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`  black pool: ${done}/${jobs.length}`);
}

// ---------------------------------------------------------------------------
// Pollinations (Flux): the unlimited-quantity source, throttled by an anonymous
// budget (~1 image per 40s). Its cache is keyed by prompt, so every request
// carries a random token — without it the server replays the same face.
// ---------------------------------------------------------------------------
const GEN_LOOK = {
  black:        { who: ['Black African woman', 'Black African man'], skin: ['deep brown skin', 'dark brown skin', 'rich brown skin', 'warm brown skin'] },
  white:        { who: ['white European woman', 'white European man'], skin: ['fair skin', 'light skin with freckles', 'pale skin', 'warm fair skin'] },
  hispanic:     { who: ['Latina woman', 'Latino man'], skin: ['olive skin', 'light brown skin', 'warm tan skin'] },
  south_asian:  { who: ['South Asian Indian woman', 'South Asian Indian man'], skin: ['medium brown skin', 'warm brown skin', 'olive brown skin'] },
  east_asian:   { who: ['East Asian woman', 'East Asian man'], skin: ['light skin', 'warm light skin'] },
  mena:         { who: ['Middle Eastern North African woman', 'Middle Eastern North African man'], skin: ['olive skin', 'warm olive skin', 'light brown skin'] },
};

function genPrompt(race, gender, token) {
  const female = gender === 'female';
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const look = GEN_LOOK[race] || GEN_LOOK.white;
  const age = pick(female ? HORDE_AGES : HORDE_AGES_M);
  const hair = pick(female ? HORDE_HAIR_F : HORDE_HAIR_M);
  const setting = pick(HORDE_SETTING);
  const expression = pick(HORDE_EXPRESSION);
  const clothes = pick(female ? HORDE_CLOTHES_F : HORDE_CLOTHES_M);
  return `documentary photograph, head and shoulders portrait, ${look.who[female ? 0 : 1]} ${age} with ${pick(look.skin)}, ${hair}, ${expression}, wearing ${clothes}, ${setting}, looking at the camera, natural skin texture, no makeup, soft window light, 35mm lens, sharp focus, reference ${token}`;
}

async function genOne(race, gender, token) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(genPrompt(race, gender, token))}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 1e9)}&model=flux`;
  for (let attempt = 0; attempt < 8; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    } catch (e) {
      await sleep(15000);
      continue;
    }
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 15000) throw new Error(`suspicious image size ${buf.length}`);
      return buf;
    }
    if (res.status === 402 || res.status === 429) { await sleep(30000 + attempt * 4000); continue; }
    if (res.status >= 500) { await sleep(12000); continue; }
    throw new Error(`pollinations ${res.status} ${type}`);
  }
  return null;
}

/**
 * Top up pools to a target count per race+gender using Pollinations.
 * `specs` is "race-gender:target,race-gender:target". Existing files count
 * toward the target, duplicates are rejected by content hash.
 */
async function fillPools(specs) {
  fs.mkdirSync(RAW, { recursive: true });
  const hashOf = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
  const seen = new Set();
  const counters = new Map();
  for (const file of fs.readdirSync(RAW).filter((f) => f.endsWith('.jpg'))) {
    const buf = fs.readFileSync(path.join(RAW, file));
    seen.add(hashOf(buf));
    const m = file.match(/^([a-z_]+)-(female|male)-(\d+)\.jpg$/);
    if (m) counters.set(`${m[1]}:${m[2]}`, Math.max(counters.get(`${m[1]}:${m[2]}`) || 0, Number(m[3])));
  }
  const jobs = specs.split(',').map((part) => {
    const [key, target] = part.split(':');
    const [race, gender] = key.split('-');
    if (!race || (gender !== 'female' && gender !== 'male')) throw new Error(`bad spec: ${part}`);
    return { race, gender, target: Number(target) };
  });
  let added = 0;
  for (const { race, gender, target } of jobs) {
    const key = `${race}:${gender}`;
    let have = fs.readdirSync(RAW).filter((f) => f.startsWith(`${race}-${gender}-`) && f.endsWith('.jpg')
      && !f.includes('-alt') && fs.statSync(path.join(RAW, f)).size > 15000).length;
    let failures = 0;
    console.log(`  ${race} ${gender}: ${have}/${target}`);
    while (have < target) {
      const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const buf = await genOne(race, gender, token);
      if (!buf) {
        console.error(`\n  budget exhausted for ${race} ${gender} at ${have}/${target}`);
        break;
      }
      const hash = hashOf(buf);
      if (seen.has(hash)) { failures++; await sleep(6000); if (failures > 12) { console.error('\n  too many duplicates'); break; } continue; }
      seen.add(hash);
      failures = 0;
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      fs.writeFileSync(path.join(RAW, `${race}-${gender}-${String(next).padStart(2, '0')}.jpg`), buf);
      have++; added++;
      if (have % 5 === 0) console.log(`  ${race} ${gender}: ${have}/${target}`);
      await sleep(9000);
    }
  }
  console.log(`  pollinations added ${added} portraits`);
}

function cropAll(match = '') {
  fs.mkdirSync(CROP, { recursive: true });
  const script = path.join(WORK, 'crop.ps1');
  fs.writeFileSync(script, [
    'param([string]$inDir,[string]$outDir,[string]$match)',
    'Add-Type -AssemblyName System.Drawing',
    'Get-ChildItem $inDir -Filter *.jpg | Where-Object { $match -eq "" -or $_.Name -like "$match*" } | ForEach-Object {',
    '  $name = $_.BaseName',
    '  $img = [System.Drawing.Image]::FromFile($_.FullName)',
    '  $w = $img.Width',
    '  if ($w -ge 1000) {',
    '    # this-person-does-not-exist: watermark in the top or bottom band.',
    '    $jobs = @(',
    '      @{ suffix = ""; x = 52; y = 60; size = 915 },',
    '      @{ suffix = "-alt"; x = 112; y = 120; size = 795 }',
    '    )',
    '  } elseif ($w -ge 800) {',
    '    # Pollinations arrives at 768px with a "pollinations.ai" mark in the',
    '    # bottom-right (measured at y>=738 on a 768 frame), so the crop must end',
    '    # above that band while staying centred on the face.',
    '    $mainSize = $w - 68',
    '    $mainX = [int](($w - $mainSize) / 2)',
    '    $mainY = [int]($w * 0.04)',
    '    $altSize = [int]($w * 0.86)',
    '    $altX = [int](($w - $altSize) / 2)',
    '    $altY = [int]($w * 0.08)',
    '    $jobs = @(',
    '      @{ suffix = ""; x = $mainX; y = $mainY; size = $mainSize },',
    '      @{ suffix = "-alt"; x = $altX; y = $altY; size = $altSize }',
    '    )',
    '  } else {',
    '    # AI Horde frames carry no watermark: keep the whole head, then take a',
    '    # slightly tighter, centred second shot of the same face.',
    '    $altSize = [int]($w * 0.86)',
    '    $altX = [int](($w - $altSize) / 2)',
    '    $altY = [int]($w * 0.06)',
    '    $jobs = @(',
    '      @{ suffix = ""; x = 0; y = 0; size = $w },',
    '      @{ suffix = "-alt"; x = $altX; y = $altY; size = $altSize }',
    '    )',
    '  }',
    '  foreach ($job in $jobs) {',
    '    $bmp = New-Object System.Drawing.Bitmap 800,800',
    '    $g = [System.Drawing.Graphics]::FromImage($bmp)',
    '    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '    $dest = New-Object System.Drawing.Rectangle 0,0,800,800',
    '    $src = New-Object System.Drawing.Rectangle $job.x,$job.y,$job.size,$job.size',
    '    $g.DrawImage($img, $dest, $src, [System.Drawing.GraphicsUnit]::Pixel)',
    '    $out = Join-Path $outDir ($name + $job.suffix + ".jpg")',
    '    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)',
    '    $g.Dispose(); $bmp.Dispose()',
    '  }',
    '  $img.Dispose()',
    '}',
  ].join('\n'));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-inDir', RAW, '-outDir', CROP, '-match', match], { stdio: 'inherit' });
}

async function uploadAll(match = '') {
  if (!BUCKET || !PUBLIC_BASE || !ACCESS || !SECRET) throw new Error('R2 public bucket is not configured in backend/.env');
  const s3 = new S3Client({ region: 'auto', endpoint: ENDPOINT, credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET } });
  const files = fs.readdirSync(CROP).filter((f) => f.endsWith('.jpg') && (!match || f.startsWith(match)));
  let done = 0;
  for (const file of files) {
    const key = `personas/${file}`;
    const body = fs.readFileSync(path.join(CROP, file));
    await withRetry(() => s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: body, ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    })), `upload ${file}`);
    done++;
    if (done % 25 === 0) console.log(`  uploaded ${done}/${files.length}`);
  }
  console.log(`  uploaded ${done}/${files.length}`);
}

function writeManifest() {
  const pools = {};
  for (const [, race] of POOLS) pools[race] = { female: [], male: [] };
  for (const file of fs.readdirSync(CROP).filter((f) => f.endsWith('.jpg') && !f.includes('-alt'))) {
    const m = file.match(/^([a-z_]+)-(female|male)-(\d+)\.jpg$/);
    if (!m) continue;
    const [, race, gender] = m;
    if (pools[race]) pools[race][gender].push(`${PUBLIC_BASE}/personas/${file}`);
  }
  for (const race of Object.keys(pools)) {
    pools[race].female.sort();
    pools[race].male.sort();
  }
  // Mixed-race personas draw from the Latino/Hispanic pool: it is the closest
  // visual range for Brazilian pardo, Cape Coloured and Māori personas.
  pools.mixed = { female: [...pools.hispanic.female], male: [...pools.hispanic.male] };
  fs.writeFileSync(MANIFEST, JSON.stringify(pools, null, 2));
  const total = Object.values(pools).reduce((n, g) => n + g.female.length + g.male.length, 0);
  console.log(`manifest: ${MANIFEST} (${total} portraits)`);
}

async function verify() {
  const pools = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let bad = 0;
  let checked = 0;
  for (const [race, byGender] of Object.entries(pools)) {
    for (const [gender, urls] of Object.entries(byGender)) {
      for (const url of urls) {
        checked++;
        const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
        if (!res || res.status !== 200) { bad++; console.log(`  BAD ${race}/${gender}: ${url} (${res?.status})`); }
      }
    }
  }
  console.log(`verify: ${checked} URLs, ${bad} bad`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--verify')) return verify();
  if (args.has('--dry-run')) {
    for (const [etnic, race, count] of POOLS) console.log(`${race.padEnd(12)} ${String(count * 2).padStart(3)} portraits  (api: ${etnic})`);
    console.log(`total ${POOLS.reduce((n, [, , c]) => n + c * 2, 0)} portraits + alt crops`);
    console.log('--horde-black=<n> regenerates the Black pool with AI Horde (n per gender)');
    return;
  }
  if (!BUCKET || !PUBLIC_BASE) throw new Error('R2_PUBLIC_BUCKET / R2_PUBLIC_BASE_URL missing from backend/.env');

  const hordeArg = process.argv.slice(2).find((a) => a.startsWith('--horde-black'));
  if (hordeArg) {
    const perGender = Number(hordeArg.split('=')[1] || 0);
    if (!Number.isInteger(perGender) || perGender < 1) throw new Error('Use --horde-black=<count per gender>');
    console.log(`generating the Black pool with AI Horde: ${perGender} per gender…`);
    await generateBlackPool(perGender);
    console.log('\ncropping Black pool…');
    cropAll('black-');
    console.log('uploading Black pool…');
    await uploadAll('black-');
    writeManifest();
    return;
  }

  const genArg = process.argv.slice(2).find((a) => a.startsWith('--gen-pool='));
  if (genArg) {
    const specs = genArg.split('=')[1] || '';
    if (!specs) throw new Error('Use --gen-pool=black-male:40,black-female:20');
    console.log(`filling pools with Pollinations: ${specs}…`);
    await fillPools(specs);
    if (!process.argv.slice(2).includes('--fetch-only')) {
      console.log('\ncropping…');
      cropAll();
      console.log('uploading…');
      await uploadAll();
      writeManifest();
    }
    return;
  }

  if (process.argv.slice(2).includes('--host-only')) {
    console.log('host-only: cropping, uploading and writing the manifest…');
    cropAll();
    await uploadAll();
    writeManifest();
    return;
  }

  fs.mkdirSync(RAW, { recursive: true });
  const siteConcurrency = Math.max(1, Number(process.env.SITE_CONCURRENCY) || 3);
  const siteJobs = [];
  for (const [etnic, race, count] of POOLS) {
    for (const gender of ['female', 'male']) {
      for (let i = 0; i < count; i++) {
        const name = `${race}-${gender}-${String(i + 1).padStart(2, '0')}.jpg`;
        const file = path.join(RAW, name);
        if (fs.existsSync(file) && fs.statSync(file).size > 20000) continue;
        siteJobs.push({ etnic, race, gender, i, name, file });
      }
    }
  }
  console.log(`${siteJobs.length} portraits to fetch (${siteConcurrency} at a time)…`);
  let siteCursor = 0, siteDone = 0;
  const siteWorker = async () => {
    while (siteCursor < siteJobs.length) {
      const { etnic, race, gender, i, name, file } = siteJobs[siteCursor++];
      const age = AGES[(i + (gender === 'male' ? 1 : 0)) % AGES.length];
      try {
        const buf = await withRetry(() => generateOne(etnic, gender, age), name);
        fs.writeFileSync(file, buf);
        siteDone++;
        if (siteDone % 10 === 0) console.log(`  ${siteDone}/${siteJobs.length} (${race})`);
      } catch (e) {
        console.error(`\n  FAIL ${name}: ${e.message}`);
      }
      await sleep(300);
    }
  };
  await Promise.all(Array.from({ length: siteConcurrency }, siteWorker));
  console.log(`  fetched ${siteDone}/${siteJobs.length}`);
  if (process.argv.slice(2).includes('--fetch-only')) {
    console.log('fetch-only: skipping crop/upload');
    return;
  }
  console.log('\ncropping…');
  cropAll();
  console.log('uploading…');
  await uploadAll();
  writeManifest();
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
