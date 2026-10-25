import { UserProfile } from '../types';

/** The same product requirements are enforced in the client and Edge API. */
export function getProfileCompletion(profile: Partial<UserProfile> | null | undefined): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const name = profile?.name?.trim() || '';
  const birthDate = profile?.birthDate || '';
  const birth = birthDate ? new Date(`${birthDate}T00:00:00Z`) : null;
  let age = birth && !Number.isNaN(birth.getTime()) ? new Date().getUTCFullYear() - birth.getUTCFullYear() : 0;
  if (birth && (new Date().getUTCMonth() < birth.getUTCMonth() ||
      (new Date().getUTCMonth() === birth.getUTCMonth() && new Date().getUTCDate() < birth.getUTCDate()))) age--;

  if (name.length < 2 || name === 'New member') missing.push('name');
  if (!birthDate || age < 18 || age > 110) missing.push('date of birth');
  if (!profile?.gender) missing.push('gender');
  if ((profile?.photos?.length || 0) < 2) missing.push('two profile photos');
  if (!profile?.professionCategory || !profile.professionTitle?.trim()) missing.push('profession');
  if (!profile?.state?.trim() || !profile.city?.trim()) missing.push('city and state');
  if ((profile?.bio?.trim().length || 0) < 10) missing.push('a short bio');
  if ((profile?.interests?.length || 0) < 3) missing.push('three interests');
  if (!profile?.datingGoal) missing.push('dating intention');

  const preferences = profile?.matchPreferences;
  if (!preferences || !['men', 'women', 'everyone'].includes(preferences.gender) ||
      !Number.isFinite(preferences.minAge) || !Number.isFinite(preferences.maxAge) ||
      preferences.minAge < 18 || preferences.maxAge < preferences.minAge) {
    missing.push('match preferences');
  }
  return { complete: missing.length === 0, missing };
}
