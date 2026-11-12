import { readSession, getAccessToken, supabaseApiKey } from './supabase-auth';

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || ''}/functions/v1/api`;

export type NotificationKind = 'match' | 'message' | 'like' | 'system';

export interface UserNotificationSummary {
  id: string;
  kind: NotificationKind;
  actorId: string;
  actorName: string;
  /** First profile photo of the actor, when there is one. */
  actorPhoto?: string;
  threadId?: string;
  messagePreview?: string;
  createdAt: string;
  readAt: string | null;
  /**
   * True when this notification is awaiting an acknowledgement that the
   * recipient carries out in-app (mark-read), not an out-of-band channel such
   * as a push or email that the backend sends on its own.
   */
  acknowledgementRequired: boolean;
}

export interface UserNotificationList {
  notifications: UserNotificationSummary[];
  unreadCount: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export type NotificationKindFilter = NotificationKind | undefined;

export interface UserNotificationPreferences {
  message: boolean;
  match: boolean;
  like: boolean;
  acknowledgementRequired: boolean;
}

export async function fetchNotifications(params?: {
  since?: string;
  until?: string;
  kind?: NotificationKindFilter;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<UserNotificationList> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to view notifications.');
  const q = new URLSearchParams();
  params?.since && q.set('since', params.since);
  params?.until && q.set('until', params.until);
  params?.kind && q.set('kind', params.kind);
  if (params?.unreadOnly) q.set('unreadOnly', '1');
  q.set('limit', String(params?.limit ?? 20));
  q.set('offset', String(params?.offset ?? 0));
  const res = await fetchJson<UserNotificationList>(`${BASE_URL}/notifications?${q.toString()}`);
  return res;
}

export async function markNotificationsRead(ids: string[]): Promise<{ read: number }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to mark notifications read.');
  return fetchJson<{ read: number }>(`${BASE_URL}/notifications`, {
    method: 'POST',
    body: JSON.stringify({ ids })
  });
}

export async function markThreadRead(threadId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to mark notifications read.');
  await fetchJson(`${BASE_URL}/notifications/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ threadId })
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to mark notifications read.');
  await fetchJson(`${BASE_URL}/notifications/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ all: true })
  });
}

export async function fetchNotificationPreferences(): Promise<UserNotificationPreferences> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to view notification preferences.');
  return fetchJson<UserNotificationPreferences>(`${BASE_URL}/notifications/preferences`);
}

export async function updateNotificationPreferences(prefs: Partial<UserNotificationPreferences>): Promise<UserNotificationPreferences> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to update notification preferences.');
  return fetchJson<UserNotificationPreferences>(`${BASE_URL}/notifications/preferences`, {
    method: 'PATCH',
    body: JSON.stringify(prefs)
  });
}

export async function muteThread(threadId: string): Promise<{ muting: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to mute this conversation.');
  return fetchJson<{ muting: boolean }>(`${BASE_URL}/notifications/mute-thread`, {
    method: 'POST',
    body: JSON.stringify({ threadId })
  });
}

export async function unmuteThread(threadId: string): Promise<{ muting: boolean }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to unmute this conversation.');
  await fetchJson(`${BASE_URL}/notifications/unmute-thread/${encodeURIComponent(threadId)}`, {
    method: 'DELETE'
  });
  return { muting: false };
}

export async function fetchMutedThreads(): Promise<Array<{ threadId: string; mutedAt: string; partnerName: string }>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Sign in to view muted conversations.');
  const res = await fetchJson<{ muted?: Array<{ threadId: string; mutedAt: string; partnerName: string }> }>(`${BASE_URL}/notifications/muted-threads`);
  return Array.isArray(res?.muted) ? res.muted : [];
}

// ---- low-level helper ----
async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseApiKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    readSession();
    throw new Error('Session expired. Sign in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }
  return res.json();
}
