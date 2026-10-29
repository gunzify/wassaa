/**
 * NPC conversation engine — decides when an NPC greets or replies.
 *
 * The engine is *lazy*: it runs inside the Edge API when a member loads their
 * match list or a conversation (the client already polls those), so no cron
 * infrastructure is required. Actual writes go through the `wassaa_npc_reply`
 * RPC (budget + state transitions) or a conditional claim update, which makes
 * concurrent ticks safe.
 *
 * Thread states (matches.auto_state, KB §18C):
 *   none        → greeting pending; only personas flagged `greeter` open
 *   active      → auto replies while the 15-message lifetime budget lasts
 *   quiet       → budget spent: NPC stays silent, member messages are free
 *   admin_owned → staff answers personally (after a credit purchase)
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildContext, classifyIntent, pickGreeting, pickReply, type PersonaContext } from './npc-content.ts';

type Db = ReturnType<typeof createClient>;
type Row = Record<string, any>;

const REPLY_BUDGET = 15;
const GREETING_MIN_S = 60;    // feels human: opener lands 1–3 min after the match
const GREETING_MAX_S = 180;

/** Deterministic per-NPC delay so a seed run gives every thread its own rhythm. */
function hashDelay(id: string, minSec: number, maxSec: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return minSec + (h % (maxSec - minSec + 1));
}

async function loadSides(db: Db, match: Row): Promise<{ npc: Row | null; member: Row | null }> {
  const { data } = await db.from('profiles')
    .select('id,name,city,skill,profession_title,interests,is_npc,npc_active,npc,deleted_at')
    .in('id', [match.user_a, match.user_b]);
  const npc = (data || []).find((p: Row) => p.is_npc && p.npc_active && !p.deleted_at) || null;
  const member = (data || []).find((p: Row) => p.id !== (npc?.id)) || null;
  return { npc, member };
}

function contextFor(member: Row | null, npc: Row): PersonaContext {
  return buildContext(member?.name || 'there', {
    name: npc.name, city: npc.city, skill: npc.skill,
    professionTitle: npc.profession_title, interests: npc.interests || [],
  });
}

async function runEngine(db: Db, match: Row, npc: Row, member: Row | null): Promise<void> {
  const state = match.auto_state || 'none';
  if (state !== 'none' && state !== 'active') return;
  const persona: Row = npc.npc || {};

  if (state === 'none') {
    // Only some NPCs open a conversation; the rest wait to be spoken to first.
    if (!persona.greeter) return;
    const dueAt = Date.parse(match.created_at) + hashDelay(npc.id, GREETING_MIN_S, GREETING_MAX_S) * 1000;
    if (Date.now() < dueAt) return;
    // Claim the thread: only one concurrent tick wins the greeting.
    const { data: claimed } = await db.from('matches')
      .update({ auto_state: 'active' })
      .eq('id', match.id).eq('auto_state', 'none').select('id').maybeSingle();
    if (!claimed) return;
    await db.rpc('wassaa_npc_reply', { p_match: match.id, p_text: pickGreeting(contextFor(member, npc)) });
    return;
  }

  // state === 'active': reply only when a reply window is open.
  if (!match.auto_next_at) return;
  if (Date.now() < Date.parse(match.auto_next_at)) return;
  if ((match.auto_spent || 0) >= REPLY_BUDGET) {
    await db.from('matches').update({ auto_state: 'quiet', auto_next_at: null }).eq('id', match.id);
    return;
  }

  const { data: recent } = await db.from('messages')
    .select('sender_id,kind,text,caption,created_at').eq('match_id', match.id)
    .order('created_at', { ascending: false }).limit(10);
  const rows: Row[] = [...(recent || [])].reverse();
  let lastNpc: Row | null = null, lastHuman: Row | null = null;
  for (const m of rows) {
    if (!lastNpc && m.sender_id === npc.id) lastNpc = m;
    if (!lastHuman && m.sender_id !== npc.id && m.kind !== 'system') lastHuman = m;
  }
  if (!lastHuman) return;
  if (lastNpc && Date.parse(lastNpc.created_at) >= Date.parse(lastHuman.created_at)) return;

  // Claim the open reply window before answering (concurrent-tick guard).
  const { data: claimed } = await db.from('matches')
    .update({ auto_next_at: null })
    .eq('id', match.id).eq('auto_next_at', match.auto_next_at).select('id').maybeSingle();
  if (!claimed) return;

  const body = String(lastHuman.text || lastHuman.caption || '').trim();
  const intent = lastHuman.kind === 'photo' && !body ? 'smalltalk' : classifyIntent(body);
  await db.rpc('wassaa_npc_reply', { p_match: match.id, p_text: pickReply(intent, contextFor(member, npc)) });
}

/** Tick one conversation. Returns the partner's fresh thread state when the partner is an NPC, else null. */
export async function tickMatch(db: Db, matchId: string): Promise<string | null> {
  const { data: match } = await db.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (!match) return null;
  const { npc, member } = await loadSides(db, match);
  if (!npc) return null;
  try {
    await runEngine(db, match, npc, member);
  } catch (e) {
    console.error('[wassaa-npc] thread tick failed', { matchId, message: e instanceof Error ? e.message : 'unknown' });
  }
  const { data: fresh } = await db.from('matches').select('auto_state').eq('id', matchId).maybeSingle();
  return fresh?.auto_state || match.auto_state || null;
}

/** Tick every conversation of this member that might be due (match-list loads). */
export async function tickUserThreads(db: Db, userId: string): Promise<void> {
  try {
    const { data: rows } = await db.from('matches')
      .select('id,user_a,user_b,auto_state,auto_next_at,created_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('created_at', { ascending: false }).limit(200);
    const candidates = (rows || []).filter((m: Row) => m.auto_state === 'none' || m.auto_state === 'active');
    if (!candidates.length) return;
    // Batch-load the profile sides (chunks keep PostgREST URLs short).
    const sideIds = [...new Set(candidates.flatMap((m: Row) => [m.user_a, m.user_b]))];
    const sides = new Map<string, Row>();
    for (let i = 0; i < sideIds.length; i += 100) {
      const { data } = await db.from('profiles')
        .select('id,name,city,skill,profession_title,interests,is_npc,npc_active,npc,deleted_at')
        .in('id', sideIds.slice(i, i + 100));
      for (const p of data || []) sides.set(p.id, p);
    }
    for (const match of candidates) {
      const npc = sides.get(match.user_a)?.is_npc && sides.get(match.user_a)?.npc_active && !sides.get(match.user_a)?.deleted_at
        ? sides.get(match.user_a)
        : sides.get(match.user_b)?.is_npc && sides.get(match.user_b)?.npc_active && !sides.get(match.user_b)?.deleted_at
          ? sides.get(match.user_b) : null;
      if (!npc) continue;
      const member = sides.get(match.user_a === npc.id ? match.user_b : match.user_a) || null;
      await runEngine(db, match, npc, member);
    }
  } catch (e) {
    console.error('[wassaa-npc] user thread tick failed', { userId, message: e instanceof Error ? e.message : 'unknown' });
  }
}
