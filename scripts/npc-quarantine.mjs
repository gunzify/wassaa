#!/usr/bin/env node
/**
 * Quarantine personas whose photos read as generated, without needing the
 * admin console. Mirrors `POST /admin/npcs/:id/quarantine`: the persona is
 * flagged, paused, and left out of discovery until a human photo replaces it.
 *
 * Two modes:
 *   node scripts/npc-quarantine.mjs --duplicates
 *     The objective case: two active personas wearing the same face. One keeps
 *     the photo; the rest are quarantined. This is the strongest "not a real
 *     person" signal the data can prove without a vision pass.
 *
 *   node scripts/npc-quarantine.mjs --ids <uuid,uuid,...> [--reason "…"]
 *     Quarantine a reviewed list. Get ids from the admin console or from
 *     `--duplicates --list`.
 *
 *   node scripts/npc-quarantine.mjs --release --ids <uuid,...>
 *     Clear the flag after replacing the photos. Release never re-activates;
 *     flip `npc_active` in the console when the replacement is ready.
 *
 * Add `--list` to print the plan and write nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const LIST_ONLY = args.includes('--list');
const RELEASE = args.includes('--release');

function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function loadEnv(file) {
  const out = {};
  let raw = '';
  try { raw = readFileSync(join(ROOT, file), 'utf8'); } catch { return out; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
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
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${response.status} ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(query) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await api(`${query}&offset=${offset}&limit=1000`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const reason = (argValue('--reason') || '').trim() || 'Photo shared with another persona';

async function apply(ids, quarantine) {
  if (!ids.length) { console.log('Nothing to change.'); return; }
  const patch = quarantine
    ? { npc_photo_review: 'quarantine', npc_active: false, npc_quarantine_reason: reason, npc_quarantined_at: new Date().toISOString() }
    : { npc_photo_review: 'ok', npc_quarantine_reason: null, npc_quarantined_at: null };
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    await api(`profiles?id=in.(${chunk.join(',')})&is_npc=eq.true`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
  console.log(`${quarantine ? 'Quarantined' : 'Released'} ${ids.length} persona${ids.length === 1 ? '' : 's'}.`);
}

async function duplicates() {
  const rows = await fetchAll('profiles?select=id,name,photos,created_at&is_npc=eq.true&npc_active=eq.true&order=created_at.asc');
  const groups = new Map();
  for (const row of rows) {
    const photo = (row.photos || [])[0];
    if (!photo) continue;
    if (!groups.has(photo)) groups.set(photo, []);
    groups.get(photo).push(row);
  }
  const extras = [];
  for (const [photo, list] of groups) {
    if (list.length < 2) continue;
    // Keep the oldest profile on that face; quarantine the later clones.
    for (const row of list.slice(1)) extras.push({ ...row, photo });
  }
  console.log(`${rows.length} active personas on ${groups.size} distinct photos; ${extras.length} share a face with an active persona.`);
  for (const row of extras.slice(0, 40)) {
    console.log(`  ${row.photo.split('/').pop().padEnd(28)} ${row.name}`);
  }
  if (extras.length > 40) console.log(`  …and ${extras.length - 40} more`);
  if (!LIST_ONLY) await apply(extras.map((r) => r.id), true);
  return extras;
}

async function main() {
  const idsArg = argValue('--ids');
  if (idsArg) {
    const ids = idsArg.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !/^[0-9a-f-]{36}$/i.test(id));
    if (bad.length) { console.error(`Not a persona id: ${bad.join(', ')}`); process.exit(1); }
    if (!LIST_ONLY) await apply(ids, !RELEASE);
    else console.log(`${RELEASE ? 'Would release' : 'Would quarantine'} ${ids.length} ids.`);
    return;
  }
  if (args.includes('--duplicates')) { await duplicates(); return; }
  console.log('Usage: --duplicates [--list] | --ids <uuid,…> [--release] [--reason "…"]');
}

main().catch((error) => { console.error(error.message); process.exit(1); });
