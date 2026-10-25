import type {
  AdminAction,
  BlockRecord,
  ChatMessage,
  Match,
  Payment,
  PrivacySettings,
  Profile,
  SafetyReport,
  Swipe,
  VerificationSubmission,
  CandidateFilters,
  MatchPreferences,
  OtpSession
} from './domain';

export interface Store {
  init(): Promise<void>;

  // OTP
  createOtpSession(phone: string, code: string, ttlMs: number, now: number): Promise<OtpSession>;
  getOtpSession(phone: string): Promise<OtpSession | null>;
  updateOtpSession(phone: string, patch: Partial<OtpSession>): Promise<void>;
  deleteOtpSession(phone: string): Promise<void>;

  // Profiles
  findProfileByPhone(phone: string): Promise<Profile | null>;
  findProfileByGoogleSub(googleSub: string): Promise<Profile | null>;
  linkGoogleIdentity(id: string, googleSub: string, email: string): Promise<boolean>;
  createProfile(phone: string, name?: string): Promise<Profile>;
  getProfile(id: string): Promise<Profile | null>;
  updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | null>;
  softDeleteProfile(id: string): Promise<void>;
  setTier(id: string, tier: Profile['tier']): Promise<void>;
  setVerificationStatus(id: string, status: Profile['verificationStatus'], verifiedAt?: string | null): Promise<void>;
  setPrivacy(id: string, privacy: PrivacySettings): Promise<void>;
  setPreferences(id: string, prefs: MatchPreferences): Promise<void>;
  listCandidates(filters: CandidateFilters): Promise<Profile[]>;

  // Swipes / matches
  listSwipedBy(userId: string): Promise<string[]>; // ids the userId has swiped on
  listLikesReceived(userId: string): Promise<string[]>; // ids who liked userId (any like-kind)
  recordSwipe(swipe: Omit<Swipe, 'createdAt'>): Promise<void>;
  recordLikeIfAllowed(input: {
    fromUserId: string;
    toUserId: string;
    kind: 'like' | 'super';
    dailyLimit: number;
    weeklySuperLikeLimit: number;
    now: number;
  }): Promise<'recorded' | 'already' | 'daily_limit' | 'super_limit'>;
  getSwipe(fromUserId: string, toUserId: string): Promise<Swipe | null>;
  countLikesToday(userId: string, startOfDayMs: number): Promise<number>;
  countSuperLikesSince(userId: string, sinceMs: number): Promise<number>;
  findOrCreateMatch(a: string, b: string, now: string): Promise<Match | null>; // null if no mutual like
  isMutualMatched(a: string, b: string): Promise<boolean>;
  findExistingMatch(a: string, b: string): Promise<Match | null>;
  getMatch(id: string): Promise<Match | null>;
  listMatches(userId: string, limit: number): Promise<{ match: Match; partner: Profile; unread: number; lastMessage: ChatMessage | null }[]>;

  // Chat
  appendMessage(msg: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  getMessages(matchId: string, since?: string): Promise<ChatMessage[]>;
  markRead(matchId: string, userId: string): Promise<void>;

  // Blocks
  block(blockerId: string, blockedId: string, reason?: string): Promise<void>;
  getBlock(blockerId: string, blockedId: string): Promise<BlockRecord | null>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  listBlockedBy(blockerId: string): Promise<BlockRecord[]>;

  // Reports
  createReport(report: Omit<SafetyReport, 'id' | 'createdAt' | 'status'>): Promise<SafetyReport>;
  listReports(status?: SafetyReport['status']): Promise<SafetyReport[]>;
  getReport(id: string): Promise<SafetyReport | null>;
  updateReportStatus(id: string, status: SafetyReport['status']): Promise<SafetyReport | null>;

  // Admin
  setUserBlocked(userId: string, blocked: boolean): Promise<void>;
  recordAdminAction(action: string, adminId: string, targetId?: string, detail?: Record<string, unknown>): Promise<void>;
  listAdminActions(limit?: number): Promise<AdminAction[]>;

  /** Release pooled resources (graceful shutdown). */
  close(): Promise<void>;

  // Verification submissions
  createVerificationSubmission(sub: Omit<VerificationSubmission, 'id' | 'submittedAt'>): Promise<VerificationSubmission>;
  getVerificationSubmission(id: string): Promise<VerificationSubmission | null>;
  listPendingVerifications(): Promise<VerificationSubmission[]>;
  resolveVerificationSubmission(id: string, approve: boolean, adminId: string, note?: string): Promise<VerificationSubmission | null>;

  // Payments
  createPayment(payment: Payment): Promise<void>;
  getPayment(reference: string): Promise<Payment | null>;
  resolvePayment(reference: string, status: 'success' | 'failed', meta?: { channel?: string }): Promise<Payment | null>;
  listPaymentsForUser(userId: string): Promise<Payment[]>;
}

// ---------- Entitlements (server-authoritative) ----------

export const DAILY_FREE_LIKES = 30;

export interface ClientProfile {
  id: string;
  name: string;
  birthDate?: string;
  age?: number;
  gender?: Profile['gender'];
  pronouns?: string;
  professionCategory: string;
  professionTitle?: string;
  companyOrOrg?: string;
  service?: string;
  rank?: string;
  dutyStation?: string;
  city: string;
  state: string;
  bio: string;
  photos: string[];
  interests: string[];
  datingGoal?: string;
  matchPreferences?: MatchPreferences;
  distanceKm?: number;
  verification: { status: Profile['verificationStatus']; verifiedAt?: string };
  privacy: PrivacySettings;
}

function ageFrom(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate).getTime();
  if (Number.isNaN(b)) return undefined;
  const diff = Date.now() - b;
  return Math.max(18, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

/** Serialize a profile for an external viewer enforcing privacy defaults:
 *  service/rank hidden unless public or mutual match; never policy: paid tiers
 *  can never override the target user's visibility choice. */
export function serializeProfileForViewer(profile: Profile, viewerId: string, isMutual: boolean, distanceKm?: number): ClientProfile {
  let service = profile.service;
  let rank = profile.rank;
  if (profile.privacy.serviceVisibility === 'private' || (profile.privacy.serviceVisibility === 'matches' && !isMutual)) service = undefined;
  if (profile.privacy.rankVisibility === 'private' || (profile.privacy.rankVisibility === 'matches' && !isMutual)) rank = undefined;

  return {
    id: profile.id,
    name: profile.name,
    ...(profile.id === viewerId && profile.birthDate ? { birthDate: profile.birthDate } : {}),
    age: ageFrom(profile.birthDate),
    gender: profile.gender,
    pronouns: profile.pronouns,
    professionCategory: profile.professionCategory,
    professionTitle: profile.professionTitle,
    companyOrOrg: profile.companyOrOrg,
    service,
    rank,
    dutyStation: profile.privacy.rankVisibility === 'private' ? undefined : profile.dutyStation,
    city: profile.city,
    state: profile.state,
    bio: profile.bio,
    photos: profile.photos,
    interests: profile.interests,
    datingGoal: profile.datingGoal,
    matchPreferences: profile.matchPreferences,
    distanceKm,
    verification: { status: profile.verificationStatus, verifiedAt: profile.verifiedAt },
    privacy: profile.privacy
  };
}
