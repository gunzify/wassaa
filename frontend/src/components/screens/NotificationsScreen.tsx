import React, { useState, useCallback, useEffect } from 'react';
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  Megaphone,
  MessageSquare,
  SlidersHorizontal,
  X
} from 'lucide-react';
import {
  type NotificationKind,
  type UserNotificationSummary,
  type UserNotificationPreferences,
  fetchNotifications,
  markNotificationsRead,
  markThreadRead,
  markAllNotificationsRead,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  fetchMutedThreads,
  unmuteThread
} from '../../services/notifications';

type Filter = 'all' | NotificationKind;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'match', label: 'Matches' },
  { key: 'message', label: 'Messages' },
  { key: 'like', label: 'Likes' },
  { key: 'system', label: 'Updates' }
];

const KIND_LABEL: Record<NotificationKind, string> = {
  match: 'Matched',
  message: 'Message',
  like: 'Like',
  system: 'WASSAA'
};

/** "now", "4m", "3h", "Tue", "12 Oct" — short enough for a right-hand stamp. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  const date = new Date(then);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `${Math.floor(diff / 3_600_000)}h`;
  }
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function dayBucket(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Earlier';
}

function kindGlyph(kind: NotificationKind, className: string) {
  if (kind === 'message') return <MessageSquare className={className} strokeWidth={2} />;
  if (kind === 'system') return <Megaphone className={className} strokeWidth={2} />;
  return <Heart className={className} strokeWidth={2} />;
}

function phrase(n: UserNotificationSummary): { lead: string; rest: string } {
  const who = n.actorName || (n.kind === 'system' ? 'WASSAA' : 'Someone');
  if (n.kind === 'match') return { lead: who, rest: 'and you matched' };
  if (n.kind === 'like') return { lead: who, rest: 'liked your profile' };
  if (n.kind === 'system') return { lead: 'WASSAA', rest: n.messagePreview || 'sent you an update' };
  return { lead: who, rest: n.messagePreview || 'sent you a message' };
}

interface NotificationsScreenProps {
  currentUser: { id: string; name: string } | null;
  unreadCount: number;
  onUnreadCountChange?: (count: number) => void;
  onOpenThread?: (threadId: string) => void;
  onOpenProfile?: (actorId: string) => void;
  onBack?: () => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  currentUser,
  unreadCount,
  onUnreadCountChange,
  onOpenThread,
  onOpenProfile,
  onBack
}) => {
  const [notifications, setNotifications] = useState<UserNotificationSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [muted, setMuted] = useState<Array<{ threadId: string; partnerName: string }>>([]);
  const [mutedLoading, setMutedLoading] = useState(false);

  const publishCount = useCallback((count: number) => {
    onUnreadCountChange?.(Math.max(0, count));
  }, [onUnreadCountChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications({ limit: 50, offset: 0 });
      setNotifications(res.notifications);
      publishCount(res.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, [publishCount]);

  useEffect(() => { void load(); }, [load]);

  const openPreferences = useCallback(async () => {
    setShowPreferences(true);
    setPreferencesError(null);
    setMutedLoading(true);
    try {
      const [prefs, mutedThreads] = await Promise.all([
        fetchNotificationPreferences(),
        fetchMutedThreads()
      ]);
      setPreferences(prefs);
      setMuted(mutedThreads.map((m) => ({ threadId: m.threadId, partnerName: m.partnerName })));
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : 'Could not load your settings');
    } finally {
      setMutedLoading(false);
    }
  }, []);

  const togglePreference = useCallback(async (key: keyof UserNotificationPreferences) => {
    if (!preferences) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setPreferencesError(null);
    try {
      const saved = await updateNotificationPreferences(next);
      setPreferences((prev) => (prev ? { ...prev, ...saved } : saved));
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : 'Could not save that change');
      setPreferences(preferences);
    }
  }, [preferences]);

  const handleUnmute = useCallback(async (threadId: string) => {
    try {
      await unmuteThread(threadId);
      setMuted((prev) => prev.filter((m) => m.threadId !== threadId));
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : 'Could not unmute that conversation');
    }
  }, []);

  const markOneRead = useCallback(async (n: UserNotificationSummary) => {
    if (n.readAt) return;
    // Optimistic: the row must stop looking new the instant it is opened.
    setNotifications((prev) => prev.map((m) => (m.id === n.id ? { ...m, readAt: new Date().toISOString() } : m)));
    const remaining = notifications.filter((m) => !m.readAt && m.id !== n.id).length;
    publishCount(remaining);
    try {
      if (n.threadId) await markThreadRead(n.threadId);
      else await markNotificationsRead([n.id]);
    } catch {
      /* read state is best-effort; the next load reconciles it */
    }
  }, [notifications, publishCount]);

  const markEverythingRead = useCallback(async () => {
    if (busy || unreadCount === 0) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((m) => (m.readAt ? m : { ...m, readAt: now })));
      publishCount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark everything read');
    } finally {
      setBusy(false);
    }
  }, [busy, unreadCount, publishCount]);

  const openNotification = useCallback((n: UserNotificationSummary) => {
    void markOneRead(n);
    if (n.threadId) onOpenThread?.(n.threadId);
    else if (n.actorId) onOpenProfile?.(n.actorId);
  }, [markOneRead, onOpenThread, onOpenProfile]);

  if (!currentUser) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
        <Bell className="mb-3 h-10 w-10 text-brand" />
        <h2 className="t-title">Sign in for updates</h2>
        <p className="t-meta mt-1 max-w-[17rem]">Matches, messages and likes appear here once you are signed in.</p>
        {onBack && (
          <button type="button" onClick={onBack} className="btn btn-secondary btn-sm mt-4">Back</button>
        )}
      </div>
    );
  }

  const visible = filter === 'all' ? notifications : notifications.filter((n) => n.kind === filter);
  const groups: Array<{ label: string; rows: UserNotificationSummary[] }> = [];
  for (const n of visible) {
    const label = dayBucket(n.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(n);
    else groups.push({ label, rows: [n] });
  }

  return (
    <div className="w-full pb-2">
      {/* ---- Header ------------------------------------------------------ */}
      <header className="flex items-start justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-start gap-1.5">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="icon-btn icon-btn-ghost -ml-1 shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="t-title">Notifications</h1>
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <p className="t-meta mt-0.5">
              {unreadCount > 0 ? `${unreadCount} waiting for you` : 'You are all caught up'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void markEverythingRead()}
            disabled={unreadCount === 0 || busy}
            className="icon-btn icon-btn-ghost disabled:opacity-40"
            aria-label="Mark all as read"
            title="Mark all as read"
          >
            <CheckCheck className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void openPreferences()}
            className="icon-btn icon-btn-ghost"
            aria-label="Notification settings"
            title="Notification settings"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ---- Filters ----------------------------------------------------- */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = key === 'all' ? unreadCount : notifications.filter((n) => n.kind === key && !n.readAt).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={active}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors ${
                active ? 'bg-brand text-white' : 'bg-surface text-ink-soft border border-line hover:text-ink'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`ml-1.5 text-[0.6875rem] font-bold ${active ? 'text-white/80' : 'text-brand'}`}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Feed -------------------------------------------------------- */}
      {error && (
        <div className="card mt-3 flex items-center justify-between gap-3 px-4 py-3 text-[0.8125rem] text-ink-soft">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold text-brand">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <BellOff className="h-6 w-6" />
          </div>
          <h2 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">
            {filter === 'all' ? 'Nothing yet' : 'Nothing here'}
          </h2>
          <p className="t-meta mt-1.5 max-w-[18rem]">
            {filter === 'all'
              ? 'New matches, messages and likes land here — no need to refresh.'
              : 'Try another filter, or check back after your next match.'}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-5">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="t-section mb-2">{group.label}</h2>
              <ul className="card card-flush divide-y divide-line-soft">
                {group.rows.map((n) => {
                  const unread = !n.readAt;
                  const { lead, rest } = phrase(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className={`row !min-h-[4.25rem] ${unread ? 'bg-brand-tint/40' : ''}`}
                      >
                        <span className="relative shrink-0">
                          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-surface-subtle ring-1 ring-line">
                            {n.actorPhoto ? (
                              <img src={n.actorPhoto} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                            ) : n.kind === 'system' ? (
                              <Megaphone className="h-4.5 w-4.5 text-brand" />
                            ) : (
                              <span className="text-sm font-semibold text-ink-muted">
                                {(n.actorName || '?').charAt(0).toUpperCase()}
                              </span>
                            )}
                          </span>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-surface ${
                              n.kind === 'like' ? 'bg-brand text-white' : 'bg-surface-subtle text-ink-soft'
                            }`}
                          >
                            {kindGlyph(n.kind, 'h-2.5 w-2.5')}
                          </span>
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[0.9375rem] font-semibold text-ink">{lead}</span>
                            <span className="shrink-0 text-[0.6875rem] text-ink-muted">{relativeTime(n.createdAt)}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[0.8125rem] text-ink-soft">{rest}</span>
                          <span className="mt-0.5 block text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                            {KIND_LABEL[n.kind]}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1.5">
                          {unread && <span className="h-2 w-2 rounded-full bg-brand" />}
                          {n.threadId && <ChevronRight className="h-4 w-4 text-ink-muted" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* ---- Preferences sheet ------------------------------------------- */}
      {showPreferences && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setShowPreferences(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Notification settings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="modal-title">Notifications</h2>
              <button
                type="button"
                onClick={() => setShowPreferences(false)}
                className="icon-btn icon-btn-ghost"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="t-meta mb-3">Choose what reaches you. Replies never notify you twice.</p>

            {preferencesError && (
              <p className="mb-3 rounded-xl bg-danger-tint px-3 py-2 text-[0.8125rem] text-danger">{preferencesError}</p>
            )}

            {!preferences && mutedLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              </div>
            ) : (
              <>
                <div className="card card-flush">
                  {([
                    ['match', 'New matches', 'When a like turns mutual.'],
                    ['message', 'Messages', 'When someone writes to you.'],
                    ['like', 'Likes', 'When someone likes your profile.'],
                    ['acknowledgementRequired', 'Require acknowledgement', 'Keep a message unread until you open the thread.']
                  ] as const).map(([key, title, sub]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void togglePreference(key)}
                      className="switch-hit"
                      role="switch"
                      aria-checked={Boolean(preferences?.[key])}
                      disabled={!preferences}
                    >
                      <span className="min-w-0">
                        <span className="block text-[0.9375rem] font-semibold text-ink">{title}</span>
                        <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-muted">{sub}</span>
                      </span>
                      <span className={`switch ${preferences?.[key] ? 'switch-on' : ''}`} aria-hidden="true">
                        <span className="switch-knob" />
                      </span>
                    </button>
                  ))}
                </div>

                <h3 className="t-section mt-5 mb-2">Muted conversations</h3>
                {mutedLoading ? (
                  <p className="t-tiny">Checking…</p>
                ) : muted.length === 0 ? (
                  <p className="t-tiny">Nothing muted. Muted chats stay quiet without hiding the conversation.</p>
                ) : (
                  <ul className="card card-flush">
                    {muted.map((m) => (
                      <li key={m.threadId} className="row">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9375rem] font-semibold text-ink">{m.partnerName}</span>
                          <span className="text-[0.75rem] text-ink-muted">Muted</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleUnmute(m.threadId)}
                          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.75rem] font-semibold text-ink-soft"
                        >
                          Unmute
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsScreen;
