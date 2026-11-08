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

const KIND_MEMBER = ['match', 'message', 'like'] as const;
const KIND_ADMIN = ['match', 'message', 'like', 'system'] as const;

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
    if (kind && !KIND_MEMBER.includes(kind as any)) return err('kind must be match, message or like.', 400, origin);

    // The feed reads the checked RPC, not the view: the RPC filters by user and
    // returns one extra row so the caller can tell whether another page exists.
    const { data, error } = await db.rpc('wassaa_notification_summaries', {
      p_user: uid,
      p_since: since || null,
      p_until: until || null,
      p_kind: kind || null,
      p_limit: limit + 1,
      p_offset: offset
    });
    if (error) return err('Could not load notifications.', 500, origin);

    const rows = (data || []) as any[];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const unreadCount = page.filter((n: any) => !n.read_at).length;

    // The screen renders "Name · preview", so resolve the handful of actors on
    // this page in one query instead of making the client fan out per row.
    const actorIds = [...new Set(page.map((n: any) => n.actor_id).filter(Boolean))];
    const actorNames = new Map<string, string>();
    if (actorIds.length) {
      const { data: actors } = await db.from('profiles').select('id,name').in('id', actorIds);
      for (const a of (actors || [])) actorNames.set(String(a.id), String(a.name || 'Someone'));
    }

    const notifications = page.map((n: any) => ({
      id: n.id,
      kind: n.kind as any,
      actorId: n.actor_id,
      actorName: actorNames.get(String(n.actor_id)) || '',
      threadId: n.thread_id || undefined,
      messagePreview: n.message_preview || undefined,
      createdAt: n.created_at,
      readAt: n.read_at || undefined,
      acknowledgementRequired: Boolean(n.acknowledgement_required)
    }));

    return json({ notifications, unreadCount, hasMore, limit, offset }, 200, origin);
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
    patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from('profiles').update({ notifications: patch, updated_at: new Date().toISOString() }).eq('id', uid).select('notifications').single();
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

  if (path === '/notifications/unmute-thread' && req.method === 'DELETE') {
    const threadId = (url.pathname.match(/^\/notifications\/unmute-thread\/([0-9a-f-]+)$/i) || [])[1];
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

    // load partner names
    const partnerIds = new Set<string>();
    for (const t of threads || []) {
      if (t.user_a !== uid) partnerIds.add(String(t.user_a));
      if (t.user_b !== uid) partnerIds.add(String(t.user_b));
    }
    let partnerNames: Map<string, string> = new Map();
    if (partnerIds.size) {
      const { data: profiles } = await db.from('profiles').select('id,name').in('id', [...partnerIds]);
      for (const p of (profiles || [])) partnerNames.set(String(p.id), String(p.name || 'Member'));
    }

    return json({
      muted: muted.map((m: any) => ({
        threadId: m.thread_id,
        mutedAt: m.muted_at,
        partnerName: partnerNames.get(m.thread_id) || 'Member'
      }))
    }, 200, origin);
  }

  return null;
}

export async function adminNotificationsRoute(
  db: Db,
  user: Row,
  profile: Row,
  uid: string,
  path: string,
  req: Request,
  origin: string | null,
  actor: string
): Promise<Response | null> {
  const url = new URL(req.url);
  const q = url.searchParams;

  // ---- admin own inbox ----
  if (path === '/admin/notifications' && req.method === 'GET') {
    const limit = Math.min(50, Math.max(1, Number(q.get('limit')) || 20));
    const offset = Math.max(0, Number(q.get('offset')) || 0);
    const unreadOnly = q.get('unreadOnly') === '1';
    const kind = q.get('kind') || undefined;
    if (kind && !KIND_ADMIN.includes(kind as any)) return err('kind must be match, message, like or system.', 400, origin);

    let base = db.from('notification_events').select('*').eq('user_id', uid).order('created_at', { ascending: false }).range(offset, offset + limit);
    if (kind) base = base.eq('kind', kind);
    const { data, error } = await base;
    if (error) return err('Could not load notifications.', 500, origin);

    const rows = (data || []) as any[];
    const unreadCount = rows.filter((n: any) => !n.read_at).length;
    return json({
      notifications: rows.map((n: any) => ({
        id: n.id,
        kind: n.kind,
        actorId: n.actor_id || undefined,
        threadId: n.thread_id || undefined,
        messagePreview: n.message_preview || undefined,
        createdAt: n.created_at,
        readAt: n.read_at || undefined,
        acknowledgementRequired: Boolean(n.acknowledgement_required)
      })),
      unreadCount,
      hasMore: rows.length === limit,
      limit,
      offset
    }, 200, origin);
  }

  // ---- admin mark read ----
  if (path === '/admin/notifications/mark-read' && req.method === 'POST') {
    const body = await bodyJson(req);
    if (body.all === true) {
      const { data: events } = await db.from('notification_events').select('id').eq('user_id', uid);
      const now = new Date().toISOString();
      const rows = (events || []).map((e: any) => ({ user_id: uid, notification_id: e.id, read_at: now }));
      if (rows.length) {
        const { error } = await db.from('notification_reads').upsert(rows, { onConflict: 'user_id,notification_id' });
        if (error) return err('Could not mark notifications read.', 500, origin);
      }
      return json({ success: true }, 200, origin);
    }
    if (body.id && isUuid(body.id)) {
      const { error } = await db.from('notification_reads').upsert({ user_id: uid, notification_id: body.id, read_at: new Date().toISOString() }, { onConflict: 'user_id,notification_id' });
      if (error) return err('Could not mark notification read.', 500, origin);
      return json({ success: true }, 200, origin);
    }
    return err('Pass { all: true } or { id: "<uuid>" }.', 400, origin);
  }

  // ---- admin queue (acknowledgement required) ----
  if (path === '/admin/notifications/queue' && req.method === 'GET') {
    const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50));
    const offset = Math.max(0, Number(q.get('offset')) || 0);
    const kind = q.get('kind') || undefined;
    let base = db.from('notification_events').select('*').eq('acknowledgement_required', true).order('created_at', { ascending: false }).range(offset, offset + limit);
    if (kind && kind !== 'all') base = base.eq('kind', kind);
    const { data, error } = await base;
    if (error) return err('Could not load notification queue.', 500, origin);
    const rows = (data || []) as any[];
    return json({
      notifications: rows.map((n: any) => ({
        id: n.id,
        kind: n.kind,
        actorId: n.actor_id || undefined,
        threadId: n.thread_id || undefined,
        messagePreview: n.message_preview || undefined,
        createdAt: n.created_at,
        readAt: n.read_at || undefined,
        acknowledgementRequired: Boolean(n.acknowledgement_required)
      })),
      hasMore: rows.length === limit,
      limit,
      offset
    }, 200, origin);
  }

  // ---- admin deliver to member ----
  if (path === '/admin/notifications/deliver' && req.method === 'POST') {
    const body = await bodyJson(req);
    const recipientId = String(body.recipientId || '');
    if (!isUuid(recipientId)) return err('recipientId is required.', 400, origin);
    const kind = String(body.kind || 'system');
    if (!KIND_ADMIN.includes(kind as any)) return err('kind must be match, message, like or system.', 400, origin);
    const threadId = isUuid(body.threadId) ? body.threadId : null;
    const messagePreview = cleanString(body.text || body.messagePreview || '', 300);
    const now = new Date().toISOString();

    const { error } = await db.from('notification_events').insert({
      user_id: recipientId,
      kind,
      thread_id: threadId,
      actor_id: uid,
      message_preview: messagePreview || null,
      created_at: now,
      acknowledgement_required: Boolean(body.acknowledgementRequired)
    }).select('id').single();

    if (error) return err('Could not create notification.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'notification.delivered', target_id: recipientId, detail: { kind, threadId: threadId || null } });
    return json({ success: true }, 200, origin);
  }

  // ---- admin muted threads (staff view of a member's mutes) ----
  if (path === '/admin/notifications/muted-threads' && req.method === 'GET') {
    // staff can inspect mutes for a given member when reviewing a thread
    const targetId = q.get('userId') || uid;
    if (!isUuid(targetId)) return err('userId is required.', 400, origin);
    const { data: mutes } = await db.from('notification_mutes').select('thread_id,muted_at').eq('user_id', targetId).order('muted_at', { ascending: false });
    const ids = (mutes || []).map((m: any) => m.thread_id);
    if (!ids.length) return json({ muted: [] }, 200, origin);
    const { data: threads } = await db.from('matches').select('id,user_a,user_b').in('id', ids);
    const muted = (mutes || []).filter((m: any) => (threads || []).some((t: any) => t.id === m.thread_id));
    const partnerIds = new Set<string>();
    for (const t of threads || []) {
      if (t.user_a !== targetId) partnerIds.add(String(t.user_a));
      if (t.user_b !== targetId) partnerIds.add(String(t.user_b));
    }
    let partnerNames = new Map<string, string>();
    if (partnerIds.size) {
      const { data: profiles } = await db.from('profiles').select('id,name').in('id', [...partnerIds]);
      for (const p of (profiles || [])) partnerNames.set(String(p.id), String(p.name || 'Member'));
    }
    return json({
      muted: muted.map((m: any) => ({
        threadId: m.thread_id,
        mutedAt: m.muted_at,
        partnerName: partnerNames.get(m.thread_id) || 'Member'
      }))
    }, 200, origin);
  }

  return null;
}
