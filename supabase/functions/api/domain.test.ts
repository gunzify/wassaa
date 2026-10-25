import test from 'node:test';
import assert from 'node:assert/strict';
import { ageAt, greatCircleDistanceKm, isOnboardingComplete } from './domain.ts';

const now = new Date('2026-10-24T12:00:00Z');
const completeProfile = {
  name: 'Amina Example', birth_date: '1995-10-25', gender: 'female',
  photos: ['one', 'two'], profession_category: 'Medical', profession_title: 'Nurse',
  city: 'Lagos', state: 'Lagos', bio: 'Looking for a kind and thoughtful partner.',
  interests: ['reading', 'travel', 'fitness'], dating_goal: 'long_term',
  match_preferences: { gender: 'men', minAge: 25, maxAge: 45 },
};

test('ageAt uses the UTC birthday boundary and rejects invalid dates', () => {
  assert.equal(ageAt('1995-10-25', now), 30);
  assert.equal(ageAt('1995-10-23', now), 31);
  assert.equal(ageAt('not-a-date', now), undefined);
});

test('onboarding requires every minimum field and an adult member', () => {
  assert.equal(isOnboardingComplete(completeProfile, now), true);
  assert.equal(isOnboardingComplete({ ...completeProfile, birth_date: '2010-01-01' }, now), false);
  assert.equal(isOnboardingComplete({ ...completeProfile, photos: ['one'] }, now), false);
  assert.equal(isOnboardingComplete({ ...completeProfile, match_preferences: { gender: 'men', minAge: 45, maxAge: 25 } }, now), false);
});

test('great-circle distance handles known and identical points', () => {
  assert.equal(greatCircleDistanceKm(0, 0, 0, 0), 0);
  assert.ok(Math.abs(greatCircleDistanceKm(0, 0, 0, 1) - 111.195) < 0.2);
});
