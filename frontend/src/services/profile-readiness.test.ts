import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfileCompletion } from './profile-readiness';

const complete = {
  name: 'Amina Example', birthDate: '1995-10-25', gender: 'female' as const,
  photos: ['one', 'two'], professionCategory: 'Healthcare' as const, professionTitle: 'Nurse',
  city: 'Lagos', state: 'Lagos', bio: 'Looking for a kind and thoughtful partner.',
  interests: ['reading', 'travel', 'fitness'], datingGoal: 'long_term' as const,
  matchPreferences: { gender: 'men' as const, minAge: 25, maxAge: 45 },
};

test('client readiness allows a complete adult profile', () => {
  assert.deepEqual(getProfileCompletion(complete), { complete: true, missing: [] });
});

test('client readiness identifies missing requirements and rejects minors', () => {
  assert.equal(getProfileCompletion({ ...complete, photos: ['one'] }).complete, false);
  assert.ok(getProfileCompletion({ ...complete, bio: '' }).missing.includes('a short bio'));
  assert.ok(getProfileCompletion({ ...complete, birthDate: '2010-01-01' }).missing.includes('date of birth'));
});
