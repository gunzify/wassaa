/**
 * Notification routes (in-app, poll-based).
 *
 * Contract is intentionally simple: the client polls the feed + the match
 * summaries it already polls. There is no push in this release; when we add
 * push later we re-use these same tables as the source of truth and only add
 * a delivery helper.
 *
 * Tables (created by migration 20261107030000):
 * - notification_reads       (user_id, notification_id, read_at)
 * - notification_mutes        (user_id, thread_id, muted_at)
 * - notification_events       (id, user_id, kind, thread_id, actor_id, message_preview, created_at, acknowledgement_required)
 *
 * The feed uses a database view `notification_summaries` built from
 * notification_events + match metadata so we can return a short, stable
 * preview without the client fetching message bodies.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { json, err, cleanString, isUuid, bodyJson, type Row } from './index.ts';

type Db = ReturnType<typeof createClient>;

// `system` is how staff notices arrive (outages, policy changes, one-off
// nudges). It belongs in the member feed, so treat it as a first-class kind.
const KIND_MEMBER = ['match', 'message', 'like', 'system'] as const;

export async function notificationsRoute(
  db: Db,
  profile: Row,
  uid: string,
  path: string,
  req: Request,
  origin: string | null
): Promise<Response | null> {
  const url = new URL(req.url);
  const q = url.searchParams;

  // ---- member feed ----
  if (path === '/notifications' && req.method === 'GET') {
    const since = q.get('since') || undefined;
    const until = q.get('until') || undefined;
    const kind = q.get('kind') || undefined;
    const unreadOnly = q.get('unreadOnly') === '1';
    const limit = Math.min(50, Math.max(1, Number(q.get('limit')) || 20));
    const offset = Math.max(0, Number(q.get('offset')) || 0);

    if (since && Number.isNaN(Date.parse(since))) return err('Invalid "since" timestamp.', 400, origin);
    if (until && Number.isNaN(Date.parse(until))) return err('Invalid "until" timestamp.', 400, origin);
    if (kind && !KIND_MEMBER.includes(kind as any)) return err('kind must be match, message, like or system.', 400, origin);

    // Query the view directly: the Edge runs with the service role, so the
    // policy that keeps anon out does not get in the way, and the view already
    // joins each event to its read row. That makes unreadOnly and the exact
    // unread count a normal filter instead of a second RPC.
    let feed = db
      .from('notification_summaries')
      .select('*', { count: 'exact' })
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);
    if (kind) feed = feed.eq('kind', kind);
    if (since) feed = feed.gt('created_at', since);
    if (until) feed = feed.lte('created_at', until);
    if (unreadOnly) feed = feed.is('read_at', null);

    const [{ data, error }, { count: unreadCount }] = await Promise.all([
      feed,
      db
        .from('notification_summaries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null)
    ]);
    if (error) return err('Could not load notifications.', 500, origin);

    const rows = (data || []) as any[];
    // `range` is inclusive, so asking for limit + 1 rows tells us there is
    // another page without a second count.
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // The screen renders "Name · preview", so resolve the handful of actors on
    // this page in one query instead of making the client fan out per row.
    const actorIds = [...new Set(page.map((n: any) => n.actor_id).filter(Boolean))];
    const actors = new Map<string, { name: string; photo?: string }>();
    if (actorIds.length) {
      const { data: rows } = await db.from('profiles').select('id,name,photos').in('id', actorIds);
      for (const a of (rows || [])) {
        actors.set(String(a.id), {
          name: String(a.name || 'Someone'),
          photo: Array.isArray(a.photos) ? a.photos[0] : undefined
        });
      }
    }

    const notifications = page.map((n: any) => {
      const actor = actors.get(String(n.actor_id));
      return {
        id: n.id,
        kind: n.kind as any,
        actorId: n.actor_id,
        actorName: actor?.name || '',
        actorPhoto: actor?.photo || undefined,
        threadId: n.thread_id || undefined,
        messagePreview: n.message_preview || undefined,
        createdAt: n.created_at,
        readAt: n.read_at || undefined,
        acknowledgementRequired: Boolean(n.acknowledgement_required)
      };
    });

    return json({
      notifications,
      unreadCount: unreadCount ?? 0,
      hasMore,
      limit,
      offset
    }, 200, origin);
  }

  // ---- mark read ----
  if (path === '/notifications' && req.method === 'POST') {
    const body = await bodyJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.filter(isUuid) : [];
    if (!ids.length) return err('ids must be a non-empty array of notification ids.', 400, origin);

    const now = new Date().toISOString();
    const rows = ids.map((id) => ({ user_id: uid, notification_id: id, read_at: now }));
    const { error } = await db
      .from('notification_reads')
      .upsert(rows, { onConflict: 'user_id,notification_id' });

    if (error) return err('Could not mark notifications read.', 500, origin);
    return json({ success: true, read: ids.length }, 200, origin);
  }

  if (path === '/notifications/mark-read' && req.method === 'POST') {
    const body = await bodyJson(req);

    // Read state is one row per notification: the primary key is
    // (user_id, notification_id), so a "mark everything read" row with a null
    // id cannot exist. Expand the request into the events it actually covers.
    let eventQuery = db.from('notification_events').select('id').eq('user_id', uid);
    if (body.all !== true) {
      if (!body.threadId || !isUuid(body.threadId)) return err('Pass { all: true } or { threadId: "<uuid>" }.', 400, origin);
      const { data: thread } = await db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`).eq('id', body.threadId).maybeSingle();
      if (!thread) return err('Thread not found.', 404, origin);
      eventQuery = eventQuery.eq('thread_id', body.threadId);
    }
    const { data: events, error: listError } = await eventQuery;
    if (listError) return err('Could not mark notifications read.', 500, origin);

    const now = new Date().toISOString();
    const rows = (events || []).map((e: any) => ({ user_id: uid, notification_id: e.id, read_at: now }));
    if (rows.length) {
      const { error } = await db.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id' });
      if (error) return err('Could not mark notifications read.', 500, origin);
    }
    return json({ success: true, read: rows.length }, 200, origin);
  }

  // ---- preferences ----
  if (path === '/notifications/preferences' && req.method === 'GET') {
    const prefs = (profile.notifications || {}) as Record<string, any>;
    return json({
      message: Boolean(prefs.message ?? true),
      match: Boolean(prefs.match ?? true),
      like: Boolean(prefs.like ?? true),
      acknowledgementRequired: Boolean(prefs.acknowledgementRequired ?? true)
    }, 200, origin);
  }

  if (path === '/notifications/preferences' && req.method === 'PATCH') {
    const body = await bodyJson(req);
    const old = (profile.notifications || {}) as Record<string, any>;
    const patch: Record<string, any> = {};
    if (body.message !== undefined) patch.message = typeof body.message === 'boolean' ? body.message : (old.message ?? true);
    if (body.match !== undefined) patch.match = typeof body.match === 'boolean' ? body.match : (old.match ?? true);
    if (body.like !== undefined) patch.like = typeof body.like === 'boolean' ? body.like : (old.like ?? true);
    if (body.acknowledgementRequired !== undefined) patch.acknowledgementRequired = typeof body.acknowledgementRequired === 'boolean' ? body.acknowledgementRequired : (old.acknowledgementRequired ?? true);
    if (!Object.keys(patch).length) return json({ success: true, preferences: old }, 200, origin);
    // Merge over the stored object: writing `patch` alone would drop every key
    // the request did not mention, silently resetting the other toggles.
    const merged = { ...old, ...patch };
    const { data, error } = await db.from('profiles').update({ notifications: merged, updated_at: new Date().toISOString() }).eq('id', uid).select('notifications').single();
    if (error) return err('Could not update notification preferences.', 500, origin);
    return json({ success: true, preferences: data?.notifications || old }, 200, origin);
  }

  // ---- mute ----
  if (path === '/notifications/mute-thread' && req.method === 'POST') {
    const body = await bodyJson(req);
    const threadId = String(body.threadId || '');
    if (!isUuid(threadId)) return err('threadId is required.', 400, origin);
    const match = await db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`).eq('id', threadId).maybeSingle();
    if (!match) return err('Thread not found.', 404, origin);
    const { error } = await db.from('notification_mutes').upsert({ user_id: uid, thread_id: threadId, muted_at: new Date().toISOString() }, { onConflict: 'user_id,thread_id' });
    if (error) return err('Could not mute this conversation.', 500, origin);
    return json({ success: true, muting: true }, 200, origin);
  }

  const unmuteMatch = path.match(/^\/notifications\/unmute-thread\/([0-9a-f-]+)$/i);
  if (unmuteMatch && req.method === 'DELETE') {
    const threadId = unmuteMatch[1];
    if (!threadId || !isUuid(threadId)) return err('threadId is required.', 400, origin);
    const match = await db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`).eq('id', threadId).maybeSingle();
    if (!match) return err('Thread not found.', 404, origin);
    const { error } = await db.from('notification_mutes').delete().eq('user_id', uid).eq('thread_id', threadId);
    if (error) return err('Could not unmute this conversation.', 500, origin);
    return json({ success: true, muting: false }, 200, origin);
  }

  if (path === '/notifications/muted-threads' && req.method === 'GET') {
    const { data: mutes } = await db.from('notification_mutes').select('thread_id,muted_at').eq('user_id', uid).order('muted_at', { ascending: false });
    const ids = (mutes || []).map((m: any) => m.thread_id);
    if (!ids.length) return json({ muted: [] }, 200, origin);

    const { data: threads } = await db.from('matches').select('id,user_a,user_b').in('id', ids).or(`user_a.eq.${uid},user_b.eq.${uid}`);
    const threadIds = new Set((threads || []).map((t: any) => t.id));
    const muted = (mutes || []).filter((m: any) => threadIds.has(m.thread_id));

    // load partner names — keyed by *thread*, because the feed is a list of
    // threads and the old lookup used the profile map with a thread id, which
    // rendered every muted entry as "Member".
    const partnerByThread = new Map<string, string>();
    for (const t of threads || []) {
      partnerByThread.set(String(t.id), String(t.user_a === uid ? t.user_b : t.user_a));
    }
    const partnerIds = new Set<string>(partnerByThread.values());
    const partnerNames: Map<string, string> = new Map();
    if (partnerIds.size) {
      const { data: profiles } = await db.from('profiles').select('id,name').in('id', [...partnerIds]);
      for (const p of (profiles || [])) partnerNames.set(String(p.id), String(p.name || 'Member'));
    }

    return json({
      muted: muted.map((m: any) => ({
        threadId: m.thread_id,
        mutedAt: m.muted_at,
        partnerName: partnerNames.get(partnerByThread.get(String(m.thread_id)) || '') || 'Member'
      }))
    }, 200, origin);
  }

  return null;
}
