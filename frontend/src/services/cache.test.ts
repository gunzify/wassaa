import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStartupSnapshots,
  pruneStartupSnapshots,
  readLastAccountId,
  readStartupSnapshot,
  saveStartupSnapshot,
  setCacheStorage,
  SNAPSHOT_MAX_AGE_MS
} from './cache.ts';
import type { MatchItem, UserProfile } from '../types/index.ts';

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse('2026-10-30T10:00:00Z');

/** Minimal Map-backed localStorage stand-in, reset before every test. */
function memoryStorage(options: { writesFail?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.writesFail) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
    removeItem: (key: string) => { map.delete(key); }
  };
}

const member = (id: string, name = `Member ${id}`) => ({ id, name } as UserProfile);
const match = (id: string) => ({
  id,
  profile: member(`partner-${id}`),
  matchedAt: '2026-10-30T09:00:00Z',
  lastMessage: 'Hello',
  lastMessageTime: '2026-10-30T09:30:00Z',
  unreadCount: 0,
  messages: [{ id: 'm1', senderId: 'someone', kind: 'text', text: 'private body', createdAt: '2026-10-30T09:30:00Z' }]
} as MatchItem);

function freshStore() {
  const store = memoryStorage();
  setCacheStorage(store);
  return store;
}

test('restores the member, matches and deck written moments ago', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a'), matches: [match('one')], deck: [member('b')] }, T0);

  const snapshot = readStartupSnapshot('a', T0 + 5_000);
  assert.ok(snapshot);
  assert.equal(snapshot.user?.value.id, 'a');
  assert.equal(snapshot.matches?.value.length, 1);
  assert.equal(snapshot.deck?.value[0].id, 'b');
});

test('drops a stale deck while keeping the older profile', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a'), deck: [member('b')] }, T0);

  const afterADay = readStartupSnapshot('a', T0 + 25 * HOUR);
  assert.ok(afterADay);
  assert.equal(afterADay.user?.value.id, 'a');
  assert.equal(afterADay.deck, undefined, 'a day-old deck must not be shown');

  assert.equal(readStartupSnapshot('a', T0 + SNAPSHOT_MAX_AGE_MS + 1), null, 'whole snapshot expires');
});

test('a partial write does not refresh untouched slices', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a'), deck: [member('b')] }, T0);
  saveStartupSnapshot({ matches: [match('one')] }, T0 + 23 * HOUR);

  const snapshot = readStartupSnapshot('a', T0 + 25 * HOUR);
  assert.ok(snapshot);
  assert.equal(snapshot.deck, undefined, 'deck keeps its own age');
  assert.equal(snapshot.matches?.value.length, 1, 'fresh matches are kept');
});

test('never restores another account snapshot', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a') }, T0);
  assert.equal(readStartupSnapshot('b', T0 + 1_000), null);
  // With no expected id the most recent account is used.
  assert.equal(readStartupSnapshot(undefined, T0 + 1_000)?.accountId, 'a');
});

test('stores match summaries, never conversation bodies', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a'), matches: [match('one')] }, T0);
  const restored = readStartupSnapshot('a', T0 + 1_000);
  assert.deepEqual(restored?.matches?.value[0].messages, []);
  assert.equal(restored?.matches?.value[0].lastMessage, 'Hello');
});

test('corrupt or foreign JSON is ignored instead of throwing', () => {
  const store = freshStore();
  store.setItem('wassaa.cache.v1.account.a', '{not json');
  assert.equal(readStartupSnapshot('a', T0), null);

  store.setItem('wassaa.cache.v1.account.a', JSON.stringify({ accountId: 'a', savedAt: T0, user: { value: { id: 7 }, savedAt: T0 } }));
  assert.equal(readStartupSnapshot('a', T0 + 1_000), null, 'invalid user shape is rejected');
});

test('clear removes every snapshot and the last-account pointer', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a') }, T0);
  saveStartupSnapshot({ user: member('b') }, T0 + 1_000);
  assert.equal(readLastAccountId(), 'b');

  clearStartupSnapshots();
  assert.equal(readLastAccountId(), null);
  assert.equal(readStartupSnapshot('a', T0 + 2_000), null);
  assert.equal(readStartupSnapshot('b', T0 + 2_000), null);
});

test('a disabled or full storage device degrades to no cache', () => {
  setCacheStorage(null);
  assert.doesNotThrow(() => saveStartupSnapshot({ user: member('a') }, T0));
  assert.equal(readStartupSnapshot('a', T0), null);
  assert.doesNotThrow(() => clearStartupSnapshots());

  setCacheStorage(memoryStorage({ writesFail: true }));
  assert.doesNotThrow(() => saveStartupSnapshot({ user: member('a') }, T0));
  assert.equal(readStartupSnapshot('a', T0), null);
});

test('prune removes expired snapshots and dangling pointers', () => {
  freshStore();
  saveStartupSnapshot({ user: member('a') }, T0);
  saveStartupSnapshot({ user: member('b') }, T0 + HOUR);

  const eightDaysOn = T0 + 8 * 24 * HOUR;
  pruneStartupSnapshots(eightDaysOn);
  assert.equal(readStartupSnapshot('a', eightDaysOn), null, 'account a is older than a week');
  assert.equal(readStartupSnapshot('b', eightDaysOn), null, 'account b expires with its snapshot');
  assert.equal(readLastAccountId(), null);
});
