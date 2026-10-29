import type { UserProfile } from '../types';
import { isUniformedCategory } from '../constants/career';

/**
 * WASSAA shows service affiliation and cadre — never rank.
 *
 * Every screen that puts a member's name on a card, row or header uses these
 * helpers so the order stays identical everywhere:
 *
 *   name, age → affiliation → location → their words → interests
 *
 * Uniformed members are described by their service (which their privacy
 * setting can withhold) and, for the military, commissioned vs
 * non-commissioned cadre. A withheld service falls back to the category so a
 * card never reads as a bare job title like "Major".
 */

type ProfileLike = Pick<
  UserProfile,
  'professionCategory' | 'professionTitle' | 'companyOrOrg' | 'service' | 'orgRole' | 'city' | 'state' | 'neighborhood'
>;

export const isUniformed = (profile: Pick<UserProfile, 'professionCategory'>) =>
  isUniformedCategory(profile.professionCategory);

/** Commissioned vs non-commissioned — the only service distinction we show. */
export function cadreLabel(role?: 'officer' | 'soldier'): string | null {
  if (role === 'officer') return 'Commissioned officer';
  if (role === 'soldier') return 'Non-commissioned officer';
  return null;
}

/** Short form for dense rows (grid tiles, chat headers). */
export function cadreShort(role?: 'officer' | 'soldier'): string | null {
  if (role === 'officer') return 'Commissioned';
  if (role === 'soldier') return 'Non-commissioned';
  return null;
}

/**
 * The line directly beneath the name.
 *
 * - Military: "Nigerian Army · Commissioned officer" once affiliation is visible.
 * - Police / paramilitary: the service or organisation only — no cadre.
 * - Civilian: job title, with employer when there is one.
 */
/** Older rows store the class ('Military') instead of a branch name. */
function displayService(raw: string | null | undefined): string | null {
  if (!raw || raw === 'None') return null;
  if (raw === 'Military') return 'Armed forces';
  if (raw === 'Police') return 'Nigerian Police Force';
  if (raw === 'Paramilitary') return 'Paramilitary service';
  return raw;
}

export function affiliationLine(profile: ProfileLike): string {
  const service = displayService(profile.service);

  if (profile.professionCategory === 'Military') {
    const cadre = cadreLabel(profile.orgRole);
    const org = service || 'Armed forces';
    return cadre ? `${org} · ${cadre}` : org;
  }

  if (profile.professionCategory === 'Police') {
    return service || 'Nigerian Police Force';
  }

  if (profile.professionCategory === 'Paramilitary') {
    return service || 'Paramilitary service';
  }

  return [profile.professionTitle, profile.companyOrOrg].filter(Boolean).join(' · ') || 'Member';
}

/** City first, then state — never a street address. */
export function locationLine(profile: ProfileLike): string {
  return [profile.city, profile.state && profile.state !== profile.city ? profile.state : null]
    .filter(Boolean)
    .join(', ');
}

/** Their own words: the bio, or the first answered prompt. */
export function quoteLine(profile: Pick<UserProfile, 'bio' | 'prompts'>): string {
  if (profile.bio?.trim()) return profile.bio.trim();
  const answered = (profile.prompts || []).find((p) => p.answer?.trim());
  return answered?.answer?.trim() || '';
}

/** Hobbies, de-duplicated and capped for a card. */
export function interestChips(profile: Pick<UserProfile, 'interests'>, max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of profile.interests || []) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === max) break;
  }
  return out;
}

/** "Amaka Obi, 29" — the name line used on every card. */
export function nameLine(profile: Pick<UserProfile, 'name' | 'age'>): string {
  return profile.age ? `${profile.name}, ${profile.age}` : profile.name;
}

/** "Nigerian Army" → "Army"; anything unrecognised keeps its own name. */
function branchName(service: string | null): string | null {
  if (!service) return null;
  if (/army/i.test(service)) return 'Army';
  if (/navy|naval/i.test(service)) return 'Navy';
  if (/air force|airforce/i.test(service)) return 'Air Force';
  return service;
}

/**
 * One or two words for a dense surface — a list row, a grid tile — where the
 * full service line would truncate. Civilian members are described by their
 * job, uniformed members by their organisation.
 */
export function serviceShort(profile: ProfileLike): string {
  const service = displayService(profile.service);
  if (profile.professionCategory === 'Military') return branchName(service) || 'Armed forces';
  if (profile.professionCategory === 'Police') return service || 'Police';
  if (profile.professionCategory === 'Paramilitary') return service || 'Paramilitary';
  return profile.professionTitle || 'Member';
}

/**
 * The dominant line under the name on a Discover card.
 *
 * - Military: the branch plus cadre — "Army officer", "Army soldier".
 * - Police and paramilitary: the organisation, never a cadre.
 * - Civilian: the job, with the employer when there is one.
 */
export function serviceLine(profile: ProfileLike): string {
  const service = displayService(profile.service);

  if (profile.professionCategory === 'Military') {
    const branch = branchName(service);
    const cadre = profile.orgRole === 'officer' ? 'officer' : profile.orgRole === 'soldier' ? 'soldier' : null;
    if (!branch) return cadre ? `Armed forces · ${cadre}` : 'Armed forces';
    return cadre ? `${branch} ${cadre}` : branch;
  }

  if (profile.professionCategory === 'Police') return service || 'Police';
  if (profile.professionCategory === 'Paramilitary') return service || 'Paramilitary';

  return [profile.professionTitle, profile.companyOrOrg].filter(Boolean).join(' · ') || 'Member';
}
