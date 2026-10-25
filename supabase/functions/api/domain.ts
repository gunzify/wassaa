type ProfileRecord = Record<string, unknown>;

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

export function ageAt(value: unknown, now = new Date()): number | undefined {
  if (value == null || value === '') return undefined;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (now.getUTCMonth() < date.getUTCMonth() ||
      (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--;
  return age;
}

/** Server-side eligibility gate for discovery and all member conversations. */
export function isOnboardingComplete(profile: ProfileRecord, now = new Date()): boolean {
  const name = clean(profile.name, 60);
  const age = ageAt(profile.birth_date, now);
  const preferences = (profile.match_preferences && typeof profile.match_preferences === 'object'
    ? profile.match_preferences
    : {}) as Record<string, unknown>;
  const interests = Array.isArray(profile.interests) ? profile.interests.filter((item) => clean(item, 80)) : [];
  return name.length >= 2 && name !== 'New member'
    && age != null && age >= 18 && age <= 110
    && ['female', 'male'].includes(String(profile.gender))
    && Array.isArray(profile.photos) && profile.photos.length >= 2
    && Boolean(clean(profile.profession_category, 60) && clean(profile.profession_title, 80))
    && Boolean(clean(profile.city, 100) && clean(profile.state, 100))
    && clean(profile.bio, 1000).length >= 10
    && interests.length >= 3
    && Boolean(clean(profile.dating_goal, 40))
    && ['men', 'women', 'everyone'].includes(String(preferences.gender))
    && Number(preferences.minAge) >= 18
    && Number(preferences.maxAge) >= Number(preferences.minAge);
}

export function greatCircleDistanceKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(latB - latA), dLng = radians(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}
