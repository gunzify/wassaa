import type { Router, Request, Response } from 'express';
import { createRouter } from '../lib/router';
import { DAILY_FREE_LIKES, serializeProfileForViewer } from '../store';
import type { CandidateFilters, Profile } from '../domain';

export function createDiscoveryRouter(store: import('../store').Store): Router {
  const router = createRouter();

  const ageAt = (birthDate?: string): number | undefined => {
    if (!birthDate) return undefined;
    const born = new Date(birthDate);
    if (Number.isNaN(born.getTime())) return undefined;
    const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
    return age;
  };

  router.get('/discovery', async (req: Request, res: Response) => {
    const viewer = req.wassaa?.viewer as Profile;
    const prefs = viewer.matchPreferences;

    // Exclude everyone the viewer already swiped on
    const excludeIds: string[] = [viewer.id, ...((await store.listSwipedBy(viewer.id)))];

    const filters: CandidateFilters = {
      viewerId: viewer.id,
      excludeIds,
      profession: req.query.profession ? String(req.query.profession) : undefined,
      service: req.query.service ? String(req.query.service) : undefined,
      city: req.query.city ? String(req.query.city) : undefined,
      gender: req.query.gender === 'male' || req.query.gender === 'female' ? req.query.gender : undefined,
      minAge: req.query.minAge ? Number(req.query.minAge) : prefs?.minAge,
      maxAge: req.query.maxAge ? Number(req.query.maxAge) : prefs?.maxAge,
      limit: Math.min(30, Number(req.query.limit) || 15)
    };

    let candidates = await store.listCandidates(filters);

    // A candidate must also be open to the viewer's gender and age. Applying
    // this here keeps one-sided preferences out of the discovery deck.
    const viewerAge = ageAt(viewer.birthDate);
    candidates = candidates.filter((candidate) => {
      const wantedGender = candidate.matchPreferences?.gender;
      if (wantedGender && viewer.gender) {
        if (wantedGender === 'men' && viewer.gender !== 'male') return false;
        if (wantedGender === 'women' && viewer.gender !== 'female') return false;
      }
      const minAge = candidate.matchPreferences?.minAge;
      const maxAge = candidate.matchPreferences?.maxAge;
      if (viewerAge !== undefined && minAge !== undefined && viewerAge < minAge) return false;
      if (viewerAge !== undefined && maxAge !== undefined && viewerAge > maxAge) return false;
      return true;
    });

    // Client preference gender mapping (men/women/everyone)
    if (!req.query.gender) {
      if (prefs?.gender === 'men') candidates = candidates.filter((p) => p.gender === 'male');
      else if (prefs?.gender === 'women') candidates = candidates.filter((p) => p.gender === 'female');
    }

    const serialized = [];
    for (const c of candidates) {
      const isMutual = await store.isMutualMatched(viewer.id, c.id);
      serialized.push(serializeProfileForViewer(c, viewer.id, isMutual));
    }
    res.json({ profiles: serialized, total: serialized.length });
  });

  return router;
}
