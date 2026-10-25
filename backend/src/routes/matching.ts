import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { rateLimit } from '../lib/rate-limit';
import { isStorageKey, presignDownload } from '../lib/storage';
import { DAILY_FREE_LIKES, serializeProfileForViewer } from '../store';
import type { ChatMessage, Profile } from '../domain';

const startOfDayMs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function lastMessageSummary(m: ChatMessage): string {
  switch (m.kind) {
    case 'text': return m.text || '';
    case 'voice': return `Voice note (${m.voice?.durationLabel || ''})`;
    case 'photo': return m.caption ? `Photo: ${m.caption}` : 'Shared a photo';
    default: return m.text || 'You matched';
  }
}

export function createSwipesRouter(store: import('../store').Store): Router {
  const router = createRouter();

  /** Like / super-like. Server-authoritative daily limit & match detection. */
  router.post('/likes', rateLimit({ name: 'like', max: 120, windowMs: 10 * 60 * 1000, by: (req) => req.wassaa?.viewer.id || 'anon' }), async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const targetUserId = String(req.body?.targetUserId || '');
    const kind = req.body?.superLike ? 'super' : 'like';
    const note = req.body?.note ? String(req.body.note).slice(0, 220) : undefined;

    if (targetUserId === viewer.id) { res.status(400).json({ error: 'You cannot like your own profile.' }); return; }
    const target = await store.getProfile(targetUserId);
    if (!target) { res.status(404).json({ error: 'Profile not found.' }); return; }
    if (target.blockedUs) { res.status(400).json({ error: 'This profile is not available.' }); return; }

    // blocked either way?
    const blocked = await store.getBlock(viewer.id, targetUserId) || await store.getBlock(targetUserId, viewer.id);
    if (blocked) { res.status(403).json({ error: 'Unable to interact with this profile.' }); return; }

    // Serialize each member's like writes so simultaneous requests cannot pass
    // the daily or weekly limits together.
    const allowed = await store.recordLikeIfAllowed({
      fromUserId: viewer.id,
      toUserId: targetUserId,
      kind,
      dailyLimit: viewer.tier === 'free' ? DAILY_FREE_LIKES : Number.POSITIVE_INFINITY,
      weeklySuperLikeLimit: viewer.tier === 'hyper_premium' ? 15 : viewer.tier === 'premium' ? 5 : 1,
      now: Date.now()
    });
    if (allowed === 'already') { res.json({ success: true, isMatch: await store.findExistingMatch(viewer.id, targetUserId) !== null, already: true }); return; }
    if (allowed === 'daily_limit') {
      res.status(402).json({ error: 'Daily like limit reached. Upgrade to Premium for unlimited likes.', code: 'LIKE_LIMIT' });
      return;
    }
    if (allowed === 'super_limit') {
      res.status(402).json({ error: 'Your weekly Super Like allowance has been used.', code: 'SUPER_LIMIT' });
      return;
    }

    const match = await store.findOrCreateMatch(viewer.id, targetUserId, new Date().toISOString());
    if (match) {
      const isMutual = true;
      const partner = await store.getProfile(targetUserId);
      res.json({
        success: true,
        isMatch: true,
        match: {
          id: match.id,
          partner: partner ? serializeProfileForViewer(partner, viewer.id, isMutual) : null
        }
      });
      return;
    }
    res.json({ success: true, isMatch: false });
  });

  /** Pass. */
  router.post('/passes', rateLimit({ name: 'pass', max: 300, windowMs: 10 * 60 * 1000, by: (req) => req.wassaa?.viewer.id || 'anon' }), async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const targetUserId = String(req.body?.targetUserId || '');
    if (!targetUserId || targetUserId === viewer.id) { res.status(400).json({ error: 'Invalid pass target.' }); return; }
    const target = await store.getProfile(targetUserId);
    if (!target || target.blockedUs) { res.status(404).json({ error: 'Profile not found.' }); return; }
    await store.recordSwipe({ fromUserId: viewer.id, toUserId: targetUserId, kind: 'pass' });
    res.json({ success: true });
  });

  /** See who liked you (Premium+). */
  router.get('/likes/received', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    if (viewer.tier === 'free') {
      res.status(402).json({ error: 'Upgrade to Premium to see who liked you.', code: 'UPGRADE_NEEDED' });
      return;
    }
    // like-kind swipes onto viewer from profiles the viewer has NOT swiped on
    const swipedByViewer = new Set(await store.listSwipedBy(viewer.id));
    const likes = await store.listLikesReceived(viewer.id);
    const profiles: unknown[] = [];
    for (const uid of likes) {
      if (swipedByViewer.has(uid)) continue;
      const p = await store.getProfile(uid);
      if (!p || p.blockedUs) continue;
      const blocker = await store.getBlock(uid, viewer.id);
      if (blocker) continue;
      profiles.push(serializeProfileForViewer(p, viewer.id, false));
    }
    res.json({ likes: profiles });
  });

  return router;
}

export function createMatchesRouter(store: import('../store').Store): Router {
  const router = createRouter();

  router.get('/matches', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    void viewer;
    const rows = await store.listMatches(viewer.id, 100);
    const matches = rows.map(({ match, partner, unread, lastMessage }) => ({
      id: match.id,
      matchedAt: match.createdAt,
      profile: serializeProfileForViewer(partner, viewer.id, true),
      lastMessage: lastMessage ? lastMessageSummary(lastMessage) : 'You matched',
      lastMessageTime: lastMessage?.createdAt || match.createdAt,
      unread
    }));
    res.json({ matches });
  });

  /** Poll-based message fetch (?since=<iso> for incremental). Replaced by websocket in Phase 2. */
  router.get('/matches/:matchId/messages', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const match = await store.getMatch(req.params.matchId);
    if (!match || (match.userA !== viewer.id && match.userB !== viewer.id)) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }
    const since = req.query.since ? String(req.query.since) : undefined;
    const storedMessages = await store.getMessages(match.id, since);
    const messages = await Promise.all(storedMessages.map(async (message) => {
      if (message.kind !== 'photo' || !message.mediaUrl || !isStorageKey(message.mediaUrl)) return message;
      const ownedByMember = message.mediaUrl.startsWith(`chat/${match.userA}/`) || message.mediaUrl.startsWith(`chat/${match.userB}/`);
      if (!ownedByMember) return { ...message, mediaUrl: undefined };
      try { return { ...message, mediaUrl: await presignDownload(message.mediaUrl, 300) }; }
      catch { return { ...message, mediaUrl: undefined }; }
    }));
    const partnerId = match.userA === viewer.id ? match.userB : match.userA;
    const partner = await store.getProfile(partnerId);
    res.json({ messages, partner: partner ? serializeProfileForViewer(partner, viewer.id, true) : null });
  });

  router.post('/matches/:matchId/messages', rateLimit({ name: 'message', max: 40, windowMs: 60 * 1000, by: (req) => req.wassaa?.viewer.id || 'anon' }), async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const match = await store.getMatch(req.params.matchId);
    if (!match || (match.userA !== viewer.id && match.userB !== viewer.id)) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }

    const body = req.body || {};
    if (!['text', 'photo'].includes(body.kind)) { res.status(415).json({ error: 'This message type is not available.' }); return; }
    const kind = body.kind as 'text' | 'photo';
    const text = body.text != null ? String(body.text).slice(0, 4000) : undefined;
    const mediaUrl = body.mediaUrl != null ? String(body.mediaUrl).slice(0, 500) : undefined;
    const caption = body.caption != null ? String(body.caption).slice(0, 500) : undefined;

    if (kind === 'text' && !text?.trim()) { res.status(400).json({ error: 'Message body required.' }); return; }
    if (kind === 'photo' && (!mediaUrl || !isStorageKey(mediaUrl) || !mediaUrl.startsWith(`chat/${viewer.id}/`))) {
      res.status(400).json({ error: 'Upload a chat photo before sending it.' });
      return;
    }

    // Skip messaging with a blocked counterpart (either direction)
    const partnerId = match.userA === viewer.id ? match.userB : match.userA;
    const blocked = await store.getBlock(viewer.id, partnerId) || await store.getBlock(partnerId, viewer.id);
    if (blocked) { res.status(403).json({ error: 'This conversation is unavailable.' }); return; }

    const message = await store.appendMessage({ matchId: match.id, senderId: viewer.id, kind, text, mediaUrl, caption });
    await store.markRead(match.id, viewer.id);
    if (message.kind === 'photo' && message.mediaUrl) {
      try {
        res.json({ success: true, message: { ...message, mediaUrl: await presignDownload(message.mediaUrl, 300) } });
      } catch {
        res.json({ success: true, message: { ...message, mediaUrl: undefined } });
      }
      return;
    }
    res.json({ success: true, message });
  });

  router.post('/matches/:matchId/read', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const match = await store.getMatch(req.params.matchId);
    if (match && (match.userA === viewer.id || match.userB === viewer.id)) {
      await store.markRead(match.id, viewer.id);
    }
    res.json({ success: true });
  });

  return router;
}

export function createBlocksReportsRouter(store: import('../store').Store): Router {
  const router = createRouter();

  router.post('/blocks', rateLimit({ name: 'block', max: 60, windowMs: 60 * 60 * 1000, by: (req) => req.wassaa?.viewer.id || 'anon' }), async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const blockedId = String(req.body?.blockedUserId || '');
    if (!blockedId || blockedId === viewer.id) { res.status(400).json({ error: 'Invalid block target.' }); return; }
    await store.block(viewer.id, blockedId, req.body?.reason ? String(req.body.reason).slice(0, 255) : undefined);
    res.json({ success: true });
  });

  router.delete('/blocks/:userId', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    await store.unblock(viewer.id, req.params.userId);
    res.json({ success: true });
  });

  router.get('/blocks', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const records = await store.listBlockedBy(viewer.id);
    const out: { id: string; name: string; reason?: string; date?: string }[] = [];
    for (const r of records) {
      const p = await store.getProfile(r.blockedId);
      out.push({ id: r.blockedId, name: p?.name || 'Member', reason: r.reason, date: r.createdAt });
    }
    res.json({ blocked: out });
  });

  router.post('/reports', rateLimit({ name: 'report', max: 10, windowMs: 60 * 60 * 1000, by: (req) => req.wassaa?.viewer.id || 'anon', message: 'Too many reports submitted. Our safety team is reviewing your recent reports.' }), async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const body = req.body || {};
    if (!body.reportedUserId || !body.category || !body.details) {
      res.status(400).json({ error: 'reportedUserId, category and details are required.' });
      return;
    }
    if (String(body.details).length > 2000) { res.status(400).json({ error: 'Details too long.' }); return; }
    const report = await store.createReport({
      reporterId: viewer.id,
      reportedUserId: String(body.reportedUserId),
      category: String(body.category),
      categoryLabel: String(body.categoryLabel || body.category),
      details: String(body.details),
      serviceBranch: body.serviceBranch ? String(body.serviceBranch) : undefined,
      alsoBlocked: !!body.alsoBlock
    });
    if (body.alsoBlock) await store.block(viewer.id, String(body.reportedUserId), `Reported for ${report.categoryLabel}`);
    res.json({ success: true, report: { id: report.id, status: report.status } });
  });

  return router;
}
