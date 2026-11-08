import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Bell, MessageSquare, Heart, Check, CheckCheck, ChevronRight, BellOff, SlidersHorizontal, Trash2 } from 'lucide-react';
import { UserNotificationSummary, UserNotificationPreferences, fetchNotifications, markNotificationsRead, markThreadRead, markAllNotificationsRead, fetchNotificationPreferences, updateNotificationPreferences, muteThread, unmuteThread, fetchMutedThreads } from '../../services/notifications';
import { UserProfile } from '../../types';

type NotificationKind = 'match' | 'message' | 'like';
type NotificationKindFilter = NotificationKind | 'all';

function formatStamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days >= 0 && days < 6) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case 'match': return <Heart className="h-4 w-4 shrink-0" />;
    case 'message': return <MessageSquare className="h-4 w-4 shrink-0" />;
    case 'like': return <Heart className="h-4 w-4 shrink-0 fill-[#B85A3C]" />;
  }
}

function actorRow(actorId: string, actorName: string, threadId?: string, onSelectActor?: (id: string) => void, onSelectThread?: (id: string) => void) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 shrink-0"
      onClick={() => {
        if (threadId) onSelectThread?.(threadId);
      }}
      aria-label={actorName}
    >
      <span className="h-7 w-7 shrink-0 rounded-full bg-surface-subtle ring-1 ring-line flex items-center justify-center overflow-hidden">
        {actorName ? actorName.charAt(0).toUpperCase() : '?'}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{actorName}</span>
      {threadId && onSelectThread && (
        <ChevronRight className="h-4 w-4 text-ink-muted shrink-0" />
      )}
    </button>
  );
}

interface NotificationsScreenProps {
  currentUser: { id: string; name: string } | null;
  unreadCount: number;
  onUnreadCountChange?: (count: number) => void;
  onSelectNotification?: (notification: UserNotificationSummary) => void;
  onSelectThread?: (threadId: string) => void;
  onSelectActor?: (actorId: string) => void;
  onBack?: () => void;
}

export const NotificationsScreen: React.FC<NotificationsScreenProps> = ({
  currentUser,
  unreadCount: initialUnread,
  onUnreadCountChange,
  onSelectNotification,
  onSelectThread,
  onSelectActor,
  onBack,
}) => {
  const [filter, setFilter] = useState<NotificationKindFilter>('all');
  const [notifications, setNotifications] = useState<UserNotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnread ?? 0);
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [mutedThreads, setMutedThreads] = useState<Array<{ threadId: string; mutedAt: string; partnerName: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [mutedLoading, setMutedLoading] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [mutedError, setMutedError] = useState<string | null>(null);
  const abortRef = useRef<string | null>(null);

  const load = useCallback(async (kind?: NotificationKindFilter, force = false) => {
    if (abortRef.current === kind && !force) return;
    abortRef.current = kind;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNotifications({ kind: kind === 'all' ? undefined : kind, limit: 50, offset: 0 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
      onUnreadCountChange?.(res.unreadCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [onUnreadCountChange]);

  const loadPreferences = useCallback(async () => {
    setPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const prefs = await fetchNotificationPreferences();
      setPreferences(prefs);
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : 'Could not load notification preferences');
    } finally {
      setPreferencesLoading(false);
    }
  }, []);

  const loadMuted = useCallback(async () => {
    setMutedLoading(true);
    setMutedError(null);
    try {
      const muted = await fetchMutedThreads();
      setMutedThreads(muted);
    } catch (e) {
      setMutedError(e instanceof Error ? e.message : 'Could not load muted conversations');
    } finally {
      setMutedLoading(false);
    }
  }, []);

  useEffect(() => { void load('all'); }, [load]);
  useEffect(() => { void loadPreferences(); }, [loadPreferences]);
  useEffect(() => { void loadMuted(); }, [loadMuted]);

  const markOneRead = useCallback(async (n: UserNotificationSummary) => {
    if (n.readAt) return;
    try {
      if (n.acknowledgementRequired && n.threadId) {
        await markThreadRead(n.threadId);
      } else {
        await markNotificationsRead([n.id]);
      }
      setNotifications((prev) => prev.map((m) => (m.id === n.id ? { ...m, readAt: new Date().toISOString() } : m)));
      setUnreadCount((c) => Math.max(0, c - 1));
      onUnreadCountChange?.(Math.max(0, unreadCount - 1));
    } catch { /* best-effort */ }
  }, [onUnreadCountChange, unreadCount]);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((m) => ({ ...m, readAt: m.readAt || new Date().toISOString() })));
      const next = 0;
      setUnreadCount(next);
      onUnreadCountChange?.(next);
    } catch { /* best-effort */ }
  }, [onUnreadCountChange]);

  const togglePreference = useCallback(async (key: keyof UserNotificationPreferences, value: boolean) => {
    if (!preferences) return;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setPreferencesError(null);
    try {
      await updateNotificationPreferences(next);
      setPreferences(next);
    } catch (e) {
      setPreferencesError(e instanceof Error ? e.message : 'Could not save preferences');
      setPreferences(preferences);
    }
  }, [preferences]);

  const toggleMute = useCallback(async (threadId: string, currentlyMuted: boolean) => {
    setMutedError(null);
    try {
      if (currentlyMuted) {
        await unmuteThread(threadId);
        setMutedThreads((prev) => prev.filter((m) => m.threadId !== threadId));
      } else {
        await muteThread(threadId);
        const partnerName = new Date().toISOString(); // placeholder; partner name not sent by mute endpoint
        setMutedThreads((prev) => {
          if (prev.some((m) => m.threadId === threadId)) return prev.map((m) => (m.threadId === threadId ? { ...m, mutedAt: new Date().toISOString() } : m));
          return [...prev, { threadId, mutedAt: new Date().toISOString(), partnerName }];
        });
      }
    } catch (e) {
      setMutedError(e instanceof Error ? e.message : 'Could not update mute');
    }
  }, []);

  const selectNotification = useCallback((n: UserNotificationSummary) => {
    if (n.readAt) return;
    void markOneRead(n);
    onSelectNotification?.(n);
  }, [markOneRead, onSelectNotification]);

  const selectThreadFromNotification = useCallback((threadId: string) => {
    onSelectThread?.(threadId);
  }, [onSelectThread]);

  if (!currentUser) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#F7F5F0]">
        <div className="text-center">
          <Bell className="h-10 w-10 mx-auto mb-3 text-[#B85A3C]" />
          <h2 className="font-['Cormorant_Garamond',serif] text-xl font-semibold text-ink">Sign in to check notifications</h2>
          <p className="mt-1 text-sm text-ink-soft">You need to be signed in to see updates here.</p>
          {onBack && <button type="button" onClick={onBack} className="mt-4 underline text-brand">Back</button>}
        </div>
      </div>
    );
  }

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.kind === filter);
  const unreadFiltered = filtered.filter((n) => !n.readAt).length;

  return (
    <div className="min-h-[100dvh] bg-[#F7F5F0] text-[#1A1816] flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8D9CE]">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-[#B85A3C]" />
          <h1 className="t-title">Notifications</h1>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand text-white text-[0.6875rem] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={markAllRead} className="btn btn-ghost btn-sm flex items-center gap-1.5">
            <CheckCheck className="h-4 w-4" />
            <span className="text-[0.8125rem]">Mark all read</span>
          </button>
          {onBack && (
            <button type="button" onClick={onBack} className="btn btn-ghost btn-sm" aria-label="Back">
              <ChevronRight className="h-5 w-5 -scale-x-100" />
            </button>
          )}
        </div>
      </div>

      {/* filter pills */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['all', 'match', 'message', 'like'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => { void load(kind, true); }}
              className={`px-3 py-1.5 rounded-full text-[0.75rem] font-semibold transition-colors ${
                filter === kind
                  ? 'bg-[#B85A3C] text-white'
                  : 'bg-[#FBEFE6] text-[#8A4B32] hover:bg-[#F3E3D7]'
              }`}
            >
              {kind === 'all' ? 'All' : kind.charAt(0).toUpperCase() + kind.slice(1)}
              {kind !== 'all' && unreadFiltered > 0 && (
                <span className="ml-1 h-4 min-w-[1rem] inline-flex items-center justify-center rounded-full bg-white/30 px-1 text-[0.625rem]">
                  {unreadFiltered > 9 ? '9+' : unreadFiltered}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {error && (
          <div className="mx-4 mt-3 rounded-xl bg-[#FBEFE6] px-4 py-3 text-sm text-[#8A4B32]">
            <span className="font-semibold">Could not load notifications.</span>
            <button
              type="button"
              onClick={() => void load('all', true)}
              className="ml-2 underline font-normal"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-[#B85A3C] border-t-transparent animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <BellOff className="h-10 w-10 text-[#D8C9BC] mb-3" />
            <h2 className="font-['Cormorant_Garamond',serif] text-xl font-semibold text-ink">No notifications yet</h2>
            <p className="mt-1 text-sm text-ink-soft max-w-[18rem]">
              {filter === 'all'
                ? 'Matches, messages and likes will show up here.'
                : `No ${filter} notifications right now.`}
            </p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-[#E8D9CE]">
            {filtered.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => selectNotification(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-subtle ${
                    n.readAt ? 'bg-transparent' : 'bg-[#FBEFE6]'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className={`text-[0.6875rem] font-semibold uppercase tracking-[0.05em] ${n.readAt ? 'text-ink-muted' : 'text-brand'}`}>
                        {n.kind}
                      </span>
                      <span className="text-[0.6875rem] text-ink-muted">{formatStamp(n.createdAt)}</span>
                      {!n.readAt && <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />}
                    </div>
                    <p className="mt-0.5 text-sm text-ink">
                      {n.messagePreview ? (
                        <>
                          <span className="font-semibold">{n.actorName}</span>
                          {' '}
                          <span className="text-ink-soft">{n.messagePreview}</span>
                        </>
                      ) : (
                        <span className="font-semibold">{n.actorName}</span>
                      )}
                      {n.kind === 'match' && ' matched with you.'}
                      {n.kind === 'like' && ' liked your profile.'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    {n.kind !== 'match' && (
                      <ChevronRight className="h-4 w-4 text-ink-muted" />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* preferences footer */}
      <div className="border-t border-[#E8D9CE] px-4 py-3 bg-[#F7F5F0]">
        <button
          type="button"
          onClick={() => setPreferences((prev) => prev ?? preferences)}
          className="btn btn-ghost btn-sm flex items-center gap-2 w-full justify-between"
        >
          <span className="flex items-center gap-1.5 text-[0.8125rem]">
            <SlidersHorizontal className="h-4 w-4 text-ink-muted" />
            Notification preferences
          </span>
          {preferences && (
            <span className="text-[#8A4B32] text-[0.625rem] font-semibold uppercase tracking-[0.05em]">
              {preferences.message && preferences.match && preferences.like ? 'All on' : 'Customized'}
            </span>
          )}
        </button>
        {preferences && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['message', 'match', 'like'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between text-[0.75rem] text-ink">
                <span className="capitalize">{key} notifications</span>
                <button
                  type="button"
                  onClick={() => togglePreference(key, !preferences[key])}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-ink-muted transition-colors ${
                    preferences[key] ? 'bg-brand border-brand' : 'bg-surface-subtle border-ink-muted'
                  }`}
                  role="switch"
                  aria-checked={preferences[key]}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                    preferences[key] ? 'translate-x-[13px]' : 'translate-x-[1px]'
                  }`} />
                </button>
              </label>
            ))}
            <label className="flex items-center justify-between text-[0.75rem] text-ink col-span-2">
              <span>Require acknowledgement for messages</span>
              <button
                type="button"
                onClick={() => togglePreference('acknowledgementRequired', !preferences.acknowledgementRequired)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-ink-muted transition-colors ${
                  preferences.acknowledgementRequired ? 'bg-brand border-brand' : 'bg-surface-subtle border-ink-muted'
                }`}
                role="switch"
                aria-checked={preferences.acknowledgementRequired}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                  preferences.acknowledgementRequired ? 'translate-x-[13px]' : 'translate-x-[1px]'
                }`} />
              </button>
            </label>
          </div>
        )}
        {preferencesError && (
          <p className="mt-2 text-[0.75rem] text-[#8A4B32]">{preferencesError}</p>
        )}
      </div>
    </div>
  );
};

export default NotificationsScreen;
