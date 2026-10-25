import type {
  AdminAction,
  BlockRecord,
  CandidateFilters,
  ChatMessage,
  Match,
  MatchPreferences,
  OtpSession,
  Payment,
  PrivacySettings,
  Profile,
  SafetyReport,
  Swipe,
  VerificationSubmission
} from '../domain';
import type { Store } from '../store';

const DEFAULT_PRIVACY: PrivacySettings = {
  serviceVisibility: 'matches',
  rankVisibility: 'private',
  verificationDisplay: 'badge',
  chatNotifications: true,
  twoFactorAuth: false,
  privateIntroductionOptIn: true
};

/** Internal mutable state of the in-memory store. */
interface MemoryData {
  profiles: Map<string, Profile>;
  otpSessions: Map<string, OtpSession>;
  swipes: Swipe[];
  matches: Map<string, Match>;
  messages: Map<string, ChatMessage[]>;
  matchRead: Map<string, Record<string, string>>; // matchId -> userId -> lastRead iso
  blocks: BlockRecord[];
  reports: SafetyReport[];
  verificationSubs: VerificationSubmission[];
  payments: Map<string, Payment>;
  adminActions: AdminAction[];
}

const ms: MemoryData = {
  profiles: new Map<string, Profile>(),
  otpSessions: new Map<string, OtpSession>(),
  swipes: [],
  matches: new Map<string, Match>(),
  messages: new Map<string, ChatMessage[]>(),
  matchRead: new Map<string, Record<string, string>>(), // matchId -> userId -> lastRead iso
  blocks: [],
  reports: [],
  verificationSubs: [],
  payments: new Map<string, Payment>(),
  adminActions: []
};

// ---------- Seeded demo data (dev/preview only) ----------

export interface SeedUser {
  id: string;
  phone: string;
  name: string;
  birthDate: string;
  gender: 'female' | 'male';
  professionCategory: string;
  professionTitle: string;
  service?: string;
  rank?: string;
  dutyStation?: string;
  city: string;
  state: string;
  bio: string;
  photos: string[];
  interests: string[];
  datingGoal?: string;
  tier: Profile['tier'];
  documentType?: string;
  privacy?: Partial<PrivacySettings>;
}

export const DEMO_SEED: SeedUser[] = [
  {
    id: 'user-chinwe',
    phone: '+2348010000001',
    name: 'Chinwe',
    birthDate: '2000-04-12',
    gender: 'female',
    professionCategory: 'Healthcare',
    professionTitle: 'Healthcare Specialist',
    dutyStation: 'Lagos Island Maternity Hospital',
    city: 'Lagos',
    state: 'Lagos',
    bio: "Kind heart, big dreams. Let's build something real.",
    photos: ['/demo-photos/chinwe.jpg'],
    interests: ['Travel', 'Good Food', 'Fitness'],
    datingGoal: 'long_term',
    tier: 'free',
    documentType: 'NIN'
  },
  {
    id: 'user-tunde',
    phone: '+2348010000002',
    name: 'Tunde',
    birthDate: '1997-08-30',
    gender: 'male',
    professionCategory: 'Military',
    professionTitle: 'Military',
    service: 'Nigerian Army',
    rank: 'Lieutenant',
    dutyStation: 'Bonny Camp, Victoria Island',
    city: 'Lagos',
    state: 'Lagos',
    bio: 'Disciplined in service, easygoing with family and friends. Good conversation over suya, and a genuine partner who values integrity.',
    photos: ['/demo-photos/tunde.jpg', '/demo-photos/tunde-2.jpg'],
    interests: ['Fitness', 'Travel', 'Good Food', 'Reading', 'Football'],
    datingGoal: 'long_term',
    tier: 'premium',
    documentType: 'ServiceID'
  },
  {
    id: 'user-amara',
    phone: '+2348010000003',
    name: 'Amara',
    birthDate: '1999-01-14',
    gender: 'female',
    professionCategory: 'Healthcare',
    professionTitle: 'Nurse',
    dutyStation: 'National Hospital Abuja',
    city: 'Abuja',
    state: 'FCT',
    bio: "Caring, ambitious and fun-loving. I enjoy good conversations, new experiences and building something meaningful.",
    photos: ['/demo-photos/amara.jpg'],
    interests: ['Travel', 'Movies', 'Fitness', 'Cooking'],
    datingGoal: 'long_term',
    tier: 'free',
    documentType: 'NIN',
    privacy: { serviceVisibility: 'public', rankVisibility: 'public' }
  },
  {
    id: 'user-blessing',
    phone: '+2348010000004',
    name: 'Blessing',
    birthDate: '1995-06-02',
    gender: 'female',
    professionCategory: 'Police',
    professionTitle: 'Police',
    service: 'Nigeria Police Force',
    rank: 'ASP',
    dutyStation: 'Rivers State Police Command',
    city: 'Port Harcourt',
    state: 'Rivers',
    bio: 'Public safety officer by day, salsa dancer and podcast fan by night. Looking for someone grounded who values open communication.',
    photos: ['/demo-photos/blessing.jpg'],
    interests: ['Salsa', 'Podcasts', 'Beach Walks', 'Fine Dining'],
    datingGoal: 'long_term',
    tier: 'free',
    documentType: 'ServiceID'
  },
  {
    id: 'user-efe',
    phone: '+2348010000005',
    name: 'Efe',
    birthDate: '2000-11-25',
    gender: 'male',
    professionCategory: 'Engineering',
    professionTitle: 'Engineer',
    dutyStation: 'Petrochemical Infrastructure',
    city: 'Uyo',
    state: 'Akwa Ibom',
    bio: 'Software & mechanical systems engineer. Fan of Afrobeats, tech startups, serene landscapes, and spicy native delicacies.',
    photos: ['/demo-photos/efe.jpg'],
    interests: ['Technology', 'Music', 'Road Trips', 'Cooking'],
    datingGoal: 'exploring',
    tier: 'free',
    documentType: 'NIN',
    privacy: { serviceVisibility: 'public', rankVisibility: 'public' }
  },
  {
    id: 'user-amina',
    phone: '+2348010000006',
    name: 'Amina',
    birthDate: '1998-03-08',
    gender: 'female',
    professionCategory: 'Military',
    professionTitle: 'Military',
    service: 'Nigerian Navy',
    rank: 'Sub-Lieutenant',
    dutyStation: 'Western Naval Command',
    city: 'Lagos',
    state: 'Lagos',
    bio: 'Naval officer with a love for ocean breezes, architectural photography, and peaceful waterfront restaurants.',
    photos: ['/demo-photos/amina.jpg'],
    interests: ['Swimming', 'Photography', 'Jazz', 'Waterfront Cafes'],
    datingGoal: 'long_term',
    tier: 'free',
    documentType: 'ServiceID'
  },
  {
    id: 'user-zara',
    phone: '+2348010000007',
    name: 'Zara',
    birthDate: '1998-09-19',
    gender: 'female',
    professionCategory: 'Education',
    professionTitle: 'Teacher',
    dutyStation: 'Federal Academy Kaduna',
    city: 'Kaduna',
    state: 'Kaduna',
    bio: 'Literature educator with a deep love for poetry, acoustic guitar, quiet picnics, and Northern cuisine.',
    photos: ['/demo-photos/zara.jpg'],
    interests: ['Literature', 'Acoustic Music', 'Baking', 'Volunteering'],
    datingGoal: 'marriage',
    tier: 'free',
    documentType: 'Passport',
    privacy: { serviceVisibility: 'public', rankVisibility: 'public' }
  }
];

export function seedProfile(s: SeedUser): Profile {
  return {
    id: s.id,
    phone: s.phone,
    name: s.name,
    birthDate: s.birthDate,
    gender: s.gender,
    professionCategory: s.professionCategory,
    professionTitle: s.professionTitle,
    service: s.service,
    rank: s.rank,
    dutyStation: s.dutyStation,
    city: s.city,
    state: s.state,
    bio: s.bio,
    photos: s.photos,
    interests: s.interests,
    datingGoal: s.datingGoal,
    tier: s.tier,
    verificationStatus: 'verified',
    verifiedAt: '2026-10-02',
    documentType: s.documentType,
    privacy: { ...DEFAULT_PRIVACY, ...(s.privacy || {}) },
    blockedUs: false,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-02T10:00:00.000Z'
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function initMemory(): void {
  for (const s of DEMO_SEED) ms.profiles.set(s.id, seedProfile(s));
}

export function getMemoryStore(): Store {

  return {
    async init(): Promise<void> {
      if (ms.profiles.size === 0) initMemory();
    },

    async createOtpSession(phone: string, code: string, ttlMs: number, now: number): Promise<OtpSession> {
      const session: OtpSession = { phone, code, expiresAt: now + ttlMs, attempts: 0, lastRequestId: now };
      ms.otpSessions.set(phone, session);
      return session;
    },
    async getOtpSession(phone: string): Promise<OtpSession | null> {
      return ms.otpSessions.get(phone) || null;
    },
    async updateOtpSession(phone: string, patch: Partial<OtpSession>): Promise<void> {
      const s = ms.otpSessions.get(phone);
      if (s) Object.assign(s, patch);
    },
    async deleteOtpSession(phone: string): Promise<void> {
      ms.otpSessions.delete(phone);
    },

    async findProfileByPhone(phone: string): Promise<Profile | null> {
      for (const p of ms.profiles.values()) if (p.phone === phone) return p;
      return null;
    },
    async findProfileByGoogleSub(googleSub: string): Promise<Profile | null> {
      for (const p of ms.profiles.values()) if (p.googleSub === googleSub) return p;
      return null;
    },
    async linkGoogleIdentity(id: string, googleSub: string, email: string): Promise<boolean> {
      const profile = ms.profiles.get(id);
      if (!profile) return false;
      for (const other of ms.profiles.values()) {
        if (other.id !== id && other.googleSub === googleSub) return false;
      }
      if (profile.googleSub && profile.googleSub !== googleSub) return false;
      profile.googleSub = googleSub;
      profile.googleEmail = email;
      profile.updatedAt = nowIso();
      return true;
    },
    async createProfile(phone: string, name?: string): Promise<Profile> {
      const profile: Profile = {
        id: `u-${crypto.randomUUID()}`,
        phone,
        name: name || 'New member',
        professionCategory: 'Others',
        city: '',
        state: '',
        bio: '',
        photos: [],
        interests: [],
        tier: 'free',
        verificationStatus: 'not_started',
        privacy: { ...DEFAULT_PRIVACY },
        blockedUs: false,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      ms.profiles.set(profile.id, profile);
      return profile;
    },
    async getProfile(id: string): Promise<Profile | null> {
      return ms.profiles.get(id) || null;
    },
    async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null> {
      const p = ms.profiles.get(id);
      if (!p) return null;
      // tier / verification / id are never settable through the profile-edit path
      const { id: _i, tier: _t, verificationStatus: _v, verifiedAt: _va, phone: _p, ...safePatch } = patch as Profile;
      Object.assign(p, safePatch, { updatedAt: nowIso() });
      return p;
    },
    async softDeleteProfile(id: string): Promise<void> {
      ms.profiles.delete(id);
    },
    async setVerificationStatus(id: string, status: Profile['verificationStatus'], verifiedAt?: string | null): Promise<void> {
      const p = ms.profiles.get(id);
      if (!p) return;
      p.verificationStatus = status;
      p.verifiedAt = verifiedAt === null ? undefined : (verifiedAt ?? p.verifiedAt);
      p.updatedAt = nowIso();
    },
    async setTier(id: string, tier: Profile['tier']): Promise<void> {
      const p = ms.profiles.get(id);
      if (p) p.tier = tier;
    },
    async setPrivacy(id: string, privacy: PrivacySettings): Promise<void> {
      const p = ms.profiles.get(id);
      if (p) p.privacy = privacy;
    },
    async setPreferences(id: string, prefs: MatchPreferences): Promise<void> {
      const p = ms.profiles.get(id);
      if (p) p.matchPreferences = prefs;
    },
    async listCandidates(filters: CandidateFilters): Promise<Profile[]> {
      const all = [...ms.profiles.values()];
      const out = all.filter((p) => {
        if (p.id === filters.excludeIds.find((x) => true)) return false; // caller pre-excludes; filter below too
        if (filters.excludeIds.includes(p.id)) return false;
        if (!p.photos.length) return false;
        if (filters.profession && filters.profession !== 'All' && p.professionCategory !== filters.profession) return false;
        if (filters.service && filters.service !== 'All' && p.service !== filters.service) return false;
        if (filters.city && filters.city !== 'All' && p.city.toLowerCase() !== filters.city.toLowerCase()) return false;
        if (filters.gender && p.gender !== filters.gender) return false;
        if (filters.minAge != null || filters.maxAge != null) {
          const age = p.birthDate
            ? Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
            : undefined;
          if (age == null) return false;
          if (filters.minAge != null && age < filters.minAge) return false;
          if (filters.maxAge != null && age > filters.maxAge) return false;
        }
        return true;
      });
      // Demo distanceKm based on city heuristics (tests/demo only)
      return out.slice(0, filters.limit);
    },

    async listSwipedBy(userId: string): Promise<string[]> {
      return [...new Set(ms.swipes.filter((s) => s.fromUserId === userId).map((s) => s.toUserId))];
    },
    async listLikesReceived(userId: string): Promise<string[]> {
      return [...new Set(ms.swipes.filter((s) => s.toUserId === userId && s.kind !== 'pass').map((s) => s.fromUserId))];
    },
    async recordSwipe(swipe: Omit<Swipe, 'createdAt'>): Promise<void> {
      const s: Swipe = { ...swipe, createdAt: nowIso() };
      if (!ms.swipes.some((x) => x.fromUserId === s.fromUserId && x.toUserId === s.toUserId)) {
        ms.swipes.push(s);
      }
    },
    async recordLikeIfAllowed(input): Promise<'recorded' | 'already' | 'daily_limit' | 'super_limit'> {
      if (ms.swipes.some((s) => s.fromUserId === input.fromUserId && s.toUserId === input.toUserId)) return 'already';
      const dayStart = new Date(input.now);
      dayStart.setHours(0, 0, 0, 0);
      const likesToday = ms.swipes.filter((s) => s.fromUserId === input.fromUserId && s.kind !== 'pass' && Date.parse(s.createdAt) >= dayStart.getTime()).length;
      if (likesToday >= input.dailyLimit) return 'daily_limit';
      const supersThisWeek = ms.swipes.filter((s) => s.fromUserId === input.fromUserId && s.kind === 'super' && Date.parse(s.createdAt) >= input.now - 7 * 24 * 60 * 60 * 1000).length;
      if (input.kind === 'super' && supersThisWeek >= input.weeklySuperLikeLimit) return 'super_limit';
      ms.swipes.push({ fromUserId: input.fromUserId, toUserId: input.toUserId, kind: input.kind, createdAt: new Date(input.now).toISOString() });
      return 'recorded';
    },
    async getSwipe(fromUserId: string, toUserId: string): Promise<Swipe | null> {
      return ms.swipes.find((s) => s.fromUserId === fromUserId && s.toUserId === toUserId) || null;
    },
    async countLikesToday(userId: string, startOfDayMs: number): Promise<number> {
      return ms.swipes.filter((s) => s.fromUserId === userId && s.kind !== 'pass' && new Date(s.createdAt).getTime() >= startOfDayMs).length;
    },
    async countSuperLikesSince(userId: string, sinceMs: number): Promise<number> {
      return ms.swipes.filter((s) => s.fromUserId === userId && s.kind === 'super' && new Date(s.createdAt).getTime() >= sinceMs).length;
    },
    async findOrCreateMatch(a: string, b: string): Promise<Match | null> {
      const mutual = ms.swipes.some((s) => s.fromUserId === b && s.toUserId === a && s.kind !== 'pass');
      const existing = [...ms.matches.values()].find((m) => (m.userA === a && m.userB === b) || (m.userA === b && m.userB === a));
      if (existing) return existing;
      if (!mutual) return null;
      const me = ms.profiles.get(a) || ms.profiles.get(b) as Profile;
      const [idA, idB] = [a, b].sort();
      const match: Match = { id: `m-${crypto.randomUUID()}`, userA: idA, userB: idB, createdAt: nowIso() };
      ms.matches.set(match.id, match);
      ms.messages.set(match.id, [
        {
          id: 'sys',
          matchId: match.id,
          senderId: 'system',
          kind: 'system',
          text: `You matched! Be kind, be safe — say hello to ${me.name}.`,
          createdAt: nowIso()
        }
      ]);
      return match;
    },
    async isMutualMatched(a: string, b: string): Promise<boolean> {
      return [...ms.matches.values()].some((m) => (m.userA === a && m.userB === b) || (m.userA === b && m.userB === a));
    },
    async findExistingMatch(a: string, b: string): Promise<Match | null> {
      return [...ms.matches.values()].find((m) => (m.userA === a && m.userB === b) || (m.userA === b && m.userB === a)) || null;
    },
    async getMatch(id: string): Promise<Match | null> {
      return ms.matches.get(id) || null;
    },
    async listMatches(userId: string, limit: number): Promise<{ match: Match; partner: Profile; unread: number; lastMessage: ChatMessage | null }[]> {
      const out: { match: Match; partner: Profile; unread: number; lastMessage: ChatMessage | null }[] = [];
      for (const m of ms.matches.values()) {
        if (m.userA !== userId && m.userB !== userId) continue;
        const partnerId = m.userA === userId ? m.userB : m.userA;
        const partner = ms.profiles.get(partnerId);
        if (!partner) continue;
        const msgs = ms.messages.get(m.id) || [];
        const unread = msgs.filter((x) => x.senderId === partnerId && x.kind !== 'system' && new Date(x.createdAt) > new Date(ms.matchRead.get(m.id)?.[userId] || m.createdAt)).length;
        out.push({ match: m, partner, unread, lastMessage: msgs[msgs.length - 1] || null });
        if (out.length >= limit) break;
      }
      return out;
    },

    async appendMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
      const full: ChatMessage = { ...msg, id: `msg-${crypto.randomUUID()}`, createdAt: nowIso() };
      const list = ms.messages.get(full.matchId) || [];
      list.push(full);
      ms.messages.set(full.matchId, list);
      return full;
    },
    async getMessages(matchId: string, since?: string): Promise<ChatMessage[]> {
      const list = ms.messages.get(matchId) || [];
      if (!since) return list;
      return list.filter((m) => m.createdAt > since);
    },
    async markRead(matchId: string, userId: string): Promise<void> {
      const map = ms.matchRead.get(matchId) || {};
      map[userId] = nowIso();
      ms.matchRead.set(matchId, map);
    },

    async block(blockerId: string, blockedId: string, reason?: string): Promise<void> {
      const id = `${blockerId}__${blockedId}`;
      if (ms.blocks.some((b) => b.id === id)) return;
      ms.blocks.push({ id, blockerId, blockedId, reason, createdAt: nowIso() });
    },
    async getBlock(blockerId: string, blockedId: string): Promise<BlockRecord | null> {
      return ms.blocks.find((b) => b.blockerId === blockerId && b.blockedId === blockedId) || null;
    },
    async unblock(blockerId: string, blockedId: string): Promise<void> {
      ms.blocks = ms.blocks.filter((b) => !(b.blockerId === blockerId && b.blockedId === blockedId));
    },
    async listBlockedBy(blockerId: string): Promise<BlockRecord[]> {
      return ms.blocks.filter((b) => b.blockerId === blockerId);
    },

    async createReport(report: Omit<SafetyReport, 'id' | 'createdAt' | 'status'>): Promise<SafetyReport> {
      const r: SafetyReport = { ...report, id: `rep-${crypto.randomUUID()}`, status: 'pending_review', createdAt: nowIso() };
      ms.reports.push(r);
      return r;
    },
    async listReports(status?: SafetyReport['status']): Promise<SafetyReport[]> {
      const all = [...ms.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return status ? all.filter((r) => r.status === status) : all;
    },
    async getReport(id: string): Promise<SafetyReport | null> {
      return ms.reports.find((r) => r.id === id) || null;
    },
    async updateReportStatus(id: string, status: SafetyReport['status']): Promise<SafetyReport | null> {
      const r = ms.reports.find((x) => x.id === id);
      if (!r) return null;
      r.status = status;
      return r;
    },

    // ---------- Admin ----------
    async setUserBlocked(userId: string, blocked: boolean): Promise<void> {
      const p = ms.profiles.get(userId);
      if (p) p.blockedUs = blocked;
    },
    async recordAdminAction(action: string, adminId: string, targetId?: string, detail?: Record<string, unknown>): Promise<void> {
      ms.adminActions.push({ id: `adm-${crypto.randomUUID()}`, action, adminId, targetId, detail, createdAt: nowIso() });
    },
    async listAdminActions(limit = 100): Promise<AdminAction[]> {
      return [...ms.adminActions].reverse().slice(0, limit);
    },
    async close(): Promise<void> {
      /* nothing to release */
    },

    async createVerificationSubmission(sub: Omit<VerificationSubmission, 'id' | 'submittedAt'>): Promise<VerificationSubmission> {
      const full: VerificationSubmission = { ...sub, id: `ver-${crypto.randomUUID()}`, submittedAt: nowIso() };
      ms.verificationSubs.push(full);
      return full;
    },
    async getVerificationSubmission(id: string): Promise<VerificationSubmission | null> {
      return ms.verificationSubs.find((v) => v.id === id) || null;
    },
    async listPendingVerifications(): Promise<VerificationSubmission[]> {
      return ms.verificationSubs.filter((v) => v.status === 'pending');
    },
    async resolveVerificationSubmission(id: string, approve: boolean, adminId: string, note?: string): Promise<VerificationSubmission | null> {
      const v = ms.verificationSubs.find((x) => x.id === id);
      if (!v) return null;
      v.status = approve ? 'verified' : 'rejected';
      v.reviewedAt = nowIso();
      v.reviewedBy = adminId;
      v.reviewNote = note;
      const p = ms.profiles.get(v.userId);
      if (p) {
        p.verificationStatus = approve ? 'verified' : 'rejected';
        if (approve) p.verifiedAt = nowIso().slice(0, 10);
      }
      // Purge binaries immediately after decision (zero-retention policy)
      v.idDocUrl = undefined;
      v.selfieUrl = undefined;
      return v;
    },

    async createPayment(payment: Payment): Promise<void> {
      ms.payments.set(payment.reference, payment);
    },
    async getPayment(reference: string): Promise<Payment | null> {
      return ms.payments.get(reference) || null;
    },
    async resolvePayment(reference: string, status: 'success' | 'failed', meta?: { channel?: string }): Promise<Payment | null> {
      const p = ms.payments.get(reference);
      if (!p) return null;
      p.status = status;
      p.channel = meta?.channel;
      if (status === 'success') p.paidAt = nowIso();
      return p;
    },
    async listPaymentsForUser(userId: string): Promise<Payment[]> {
      return [...ms.payments.values()].filter((p) => p.userId === userId);
    }
  };
}
