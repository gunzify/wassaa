// WASSAA backend domain types
export type Gender = 'female' | 'male';

export type Tier = 'free' | 'premium' | 'hyper_premium';

export type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'not_started';

export interface PrivacySettings {
  serviceVisibility: 'public' | 'matches' | 'private';
  rankVisibility: 'public' | 'matches' | 'private';
  verificationDisplay: 'badge' | 'service_badge' | 'minimal';
  chatNotifications: boolean;
  twoFactorAuth: boolean;
  privateIntroductionOptIn: boolean;
}

export interface MatchPreferences {
  gender: 'men' | 'women' | 'everyone';
  minAge: number;
  maxAge: number;
  maxDistanceKm?: number;
}

export interface Profile {
  id: string;
  phone: string;
  googleSub?: string;
  googleEmail?: string;
  name: string;
  birthDate?: string; // ISO date
  gender?: Gender;
  pronouns?: string;
  professionCategory: string;
  professionTitle?: string;
  companyOrOrg?: string;
  service?: string; // uniformed service branch
  rank?: string;
  dutyStation?: string;
  city: string;
  state: string;
  bio: string;
  photos: string[];
  interests: string[];
  datingGoal?: string;
  matchPreferences?: MatchPreferences;
  tier: Tier;
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  documentType?: string;
  privacy: PrivacySettings;
  blockedUs: boolean; // admin blocked account
  createdAt: string;
  updatedAt: string;
}

export interface Swipe {
  fromUserId: string;
  toUserId: string;
  kind: 'like' | 'pass' | 'super';
  createdAt: string;
}

export interface Match {
  id: string;
  userA: string; // lexicographically smaller id
  userB: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  matchId: string;
  senderId: string;
  kind: 'text' | 'voice' | 'photo' | 'system';
  text?: string;
  mediaUrl?: string;
  caption?: string;
  voice?: {
    durationSeconds: number;
    durationLabel: string;
  };
  createdAt: string;
}

export interface OtpSession {
  phone: string;
  code: string;
  expiresAt: number; // epoch ms
  attempts: number;
  lastRequestId: number; // epoch ms of last dispatch (for rate limiting)
}

export interface Payment {
  reference: string;
  userId: string;
  planId: string; // premium | hyper_premium | verification_fee | boost_1 | ...
  amountKobo: number;
  currency: 'NGN';
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
  paidAt?: string;
  channel?: string;
}

export interface VerificationSubmission {
  id: string;
  userId: string;
  documentType: string; // NIN | Passport | DriversLicense | ServiceID
  documentNumberMasked: string;
  idDocUrl?: string; // gallery path (private bucket) - review only, purged after decision
  selfieUrl?: string;
  status: 'pending' | 'verified' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string; // admin id
  reviewNote?: string;
}

export interface AdminAction {
  id: string;
  adminId: string;
  action: string; // verification.approved | verification.rejected | user.blocked | report.status
  targetId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface SafetyReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  category: string;
  categoryLabel: string;
  details: string;
  serviceBranch?: string;
  alsoBlocked: boolean;
  status: 'pending_review' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface BlockRecord {
  id: string; // `${a}__${b}`
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: string;
}

// Filters accepted by listCandidates.
// viewerId: current user. excludeIds: profiles the viewer already swiped on.
// Blocks between viewer and candidate are applied inside the store.
export interface CandidateFilters {
  viewerId: string;
  excludeIds: string[];
  profession?: string;
  service?: string;
  city?: string;
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  limit: number;
}
