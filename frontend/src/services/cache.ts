import type { CreditPack, MatchItem, SubscriptionTier, UserProfile } from '../types/index.ts';

/**
 * Startup cache.
 *
 * WASSAA is opened dozens of times a day, usually on mobile data, and every
 * launch used to block on three or four round-trips before the first face
 * appeared. This module keeps the last good answer for the screens people land
 * on so the shell can paint with real data immediately while the network
 * revalidates behind them.
 *
 * The cache is deliberately boring:
 *   - entries are namespaced per account, so one member's matches can never be
 *     painted for another;
 *   - every slice carries a timestamp and expires on its own schedule, so a
 *     day-old deck is never shown but a week-old profile still is;
 *   - conversation bodies are never stored, only match summaries;
 *   - every storage failure (private browsing, quota, corrupt JSON) degrades to
 *     "no cache" instead of breaking boot.
 */

const PREFIX = 'wassaa.cache.v1.';
const ACCOUNT_PREFIX = `${PREFIX}account.`;
const LAST_ACCOUNT_KEY = `${PREFIX}last-account`;

/** A whole snapshot older than this is ignored, whatever the slices say. */
export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Per-slice freshness. Discovery moves fastest; identity moves slowest. */
export const SLICE_MAX_AGE_MS = {
  user: 30 * 24 * 60 * 60 * 1000,
  entitlements: 7 * 24 * 60 * 60 * 1000,
  blocked: 7 * 24 * 60 * 60 * 1000,
  matches: 7 * 24 * 60 * 60 * 1000,
  deck: 24 * 60 * 60 * 1000,
  explore: 24 * 60 * 60 * 1000
} as const;

export interface BlockedContact {
  id: string;
  name: string;
  reason?: string;
  date?: string;
}

export interface CachedEntitlements {
  tier: SubscriptionTier;
  credits: number;
  packs: CreditPack[];
  revealLikesCost: number;
}

interface Slice<T> {
  value: T;
  savedAt: number;
}

export interface StartupSnapshot {
  accountId: string;
  savedAt: number;
  user?: Slice<UserProfile>;
  entitlements?: Slice<CachedEntitlements>;
  blocked?: Slice<BlockedContact[]>;
  matches?: Slice<MatchItem[]>;
  deck?: Slice<UserProfile[]>;
  explore?: Slice<UserProfile[]>;
}

/** The slices the app writes. Anything omitted is kept from the last write. */
export interface SnapshotPatch {
  user?: UserProfile;
  entitlements?: CachedEntitlements;
  blocked?: BlockedContact[];
  matches?: MatchItem[];
  deck?: UserProfile[];
  explore?: UserProfile[];
}

// ---------------------------------------------------------------- storage

type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** `undefined` = use the browser; `null` = pretend storage is unavailable. */
let injected: StorageLike | null | undefined;

/** Test seam: swap in a Map-backed store, or null to simulate a locked browser. */
export function setCacheStorage(store: StorageLike | null): void {
  injected = store;
}

function storage(): StorageLike | null {
  if (injected !== undefined) return injected;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded or storage disabled mid-session. The cache is disposable,
    // so clear the stale entry rather than leave a half-valid one behind.
    try { store.removeItem(key); } catch { /* nothing else to try */ }
    return false;
  }
}

// ---------------------------------------------------------------- validation

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isUser = (value: unknown): value is UserProfile =>
  isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * Returns the slice only if it exists, is younger than its own limit and still
 * has the shape the screens expect. A snapshot written by an older build simply
 * disappears instead of rendering half a profile.
 */
function readSlice<T>(
  raw: unknown,
  maxAgeMs: number,
  now: number,
  isValid: (value: unknown) => boolean
): Slice<T> | undefined {
  if (!isObject(raw)) return undefined;
  const savedAt = raw.savedAt;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return undefined;
  const age = now - savedAt;
  if (age < 0 || age > maxAgeMs) return undefined;
  return isValid(raw.value) ? { value: raw.value as T, savedAt } : undefined;
}

function accountKey(accountId: string): string {
  return `${ACCOUNT_PREFIX}${accountId}`;
}

// ---------------------------------------------------------------- public API

/** The account whose snapshot was written most recently, if any. */
export function readLastAccountId(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(LAST_ACCOUNT_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * The snapshot to paint at launch. Pass the signed-in account id when it is
 * known so a leftover snapshot from another account can never be restored.
 */
export function readStartupSnapshot(expectedAccountId?: string, now = Date.now()): StartupSnapshot | null {
  const accountId = expectedAccountId || readLastAccountId();
  if (!accountId) return null;

  const raw = readJson<Record<string, unknown>>(accountKey(accountId));
  if (!raw || raw.accountId !== accountId) return null;
  if (typeof raw.savedAt !== 'number' || now - raw.savedAt > SNAPSHOT_MAX_AGE_MS) return null;

  // Without the member there is nothing to paint, so a snapshot with no user is
  // treated as absent rather than partially restored.
  const user = readSlice<UserProfile>(raw.user, SLICE_MAX_AGE_MS.user, now, isUser);
  if (!user) return null;

  const entitlements = readSlice<CachedEntitlements>(
    raw.entitlements,
    SLICE_MAX_AGE_MS.entitlements,
    now,
    (value) => isObject(value) && typeof value.tier === 'string' && typeof value.credits === 'number' && Array.isArray(value.packs)
  );

  return {
    accountId,
    savedAt: raw.savedAt,
    user,
    entitlements,
    blocked: readSlice<BlockedContact[]>(raw.blocked, SLICE_MAX_AGE_MS.blocked, now, isList),
    matches: readSlice<MatchItem[]>(raw.matches, SLICE_MAX_AGE_MS.matches, now, isList),
    deck: readSlice<UserProfile[]>(raw.deck, SLICE_MAX_AGE_MS.deck, now, isList),
    explore: readSlice<UserProfile[]>(raw.explore, SLICE_MAX_AGE_MS.explore, now, isList)
  };
}

/**
 * Merge slices that just came back from the server into the stored snapshot.
 * The next launch starts from here; slices not in the patch keep their original
 * age rather than being refreshed by an unrelated write.
 */
export function saveStartupSnapshot(patch: SnapshotPatch, now = Date.now()): void {
  const accountId = patch.user?.id || readLastAccountId();
  if (!accountId) return;

  const existing = readStartupSnapshot(accountId, now);

  // Conversation bodies are never cached: the match list only needs the
  // summary, and a shared device must not hold someone else's messages.
  const matches = patch.matches
    ? patch.matches.slice(0, 50).map((match) => ({ ...match, messages: [] }))
    : undefined;

  // Only slices the caller just received are re-stamped; the rest keep their
  // original age, so writing matches today cannot disguise a two-day-old deck.
  const next: StartupSnapshot = {
    accountId,
    savedAt: now,
    user: patch.user ? { value: patch.user, savedAt: now } : existing?.user,
    entitlements: patch.entitlements ? { value: patch.entitlements, savedAt: now } : existing?.entitlements,
    blocked: patch.blocked ? { value: patch.blocked.slice(0, 100), savedAt: now } : existing?.blocked,
    matches: matches ? { value: matches, savedAt: now } : existing?.matches,
    deck: patch.deck ? { value: patch.deck.slice(0, 20), savedAt: now } : existing?.deck,
    explore: patch.explore ? { value: patch.explore.slice(0, 40), savedAt: now } : existing?.explore
  };

  // A snapshot without an identity is never worth restoring.
  if (!next.user) return;
  if (!writeJson(accountKey(accountId), next)) return;
  const store = storage();
  try { store?.setItem(LAST_ACCOUNT_KEY, accountId); } catch { /* snapshot still valid */ }
}

/**
 * Remove every cached snapshot. Sign-out, account deletion and a rejected
 * session all call this: personal data should not outlive the session that
 * produced it, even on a device the member controls.
 */
export function clearStartupSnapshots(): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    /* storage can disappear mid-iteration; nothing more to do */
  }
}

/** Drop expired snapshots. Cheap enough to run once per launch. */
export function pruneStartupSnapshots(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key?.startsWith(ACCOUNT_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const snapshot = readJson<Record<string, unknown>>(key);
      if (!snapshot || typeof snapshot.savedAt !== 'number' || now - snapshot.savedAt > SNAPSHOT_MAX_AGE_MS) {
        store.removeItem(key);
      }
    }
    // Do not leave last-account pointing at a snapshot we just deleted.
    const last = readLastAccountId();
    if (last && !readJson(accountKey(last))) store.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    /* best effort */
  }
}
