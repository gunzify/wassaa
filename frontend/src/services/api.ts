import { UserProfile, UserPrivacySettings, MatchItem, ChatMessage, SubscriptionTier, MatchPreferences, CreditPack } from '../types';
import { clearSession } from './supabase-auth';
import {
  confirmEmailOtp,
  confirmPhoneChange,
  getAccessToken,
  sendEmailOtp,
  sendPhoneChangeCode,
  signInWithGoogleIdToken,
  supabaseApiKey
} from './supabase-auth';

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') || ''}/functions/v1/api`;

export interface ClientProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phoneVerified?: boolean;
  hasPreciseLocation?: boolean;
  birthDate?: string;
  age?: number;
  gender?: 'female' | 'male';
  pronouns?: string;
  professionCategory: string;
  professionTitle?: string;
  companyOrOrg?: string;
  educationLevel?: string;
  almaMater?: string;
  service?: string;
  dutyStation?: string;
  city: string;
  state: string;
  bio: string;
  photos: string[];
  interests: string[];
  prompts?: { id: string; question: string; answer: string }[];
  lifestyle?: UserProfile['lifestyle'];
  values?: UserProfile['values'];
  datingGoal?: string;
  matchPreferences?: MatchPreferences;
  distanceKm?: number;
  classOfService?: 'military' | 'police' | 'paramilitary' | 'civilian';
  orgRole?: 'officer' | 'soldier';
  skill?: string;
  credits?: number;
  accountStatus?: 'active' | 'restricted' | 'banned';
  restrictionReason?: string;
  verification: { status: UserProfile['verification']['status']; verifiedAt?: string };
  privacy: UserPrivacySettings;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseApiKey(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    clearSession();
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const e = new Error(err.error || `HTTP error ${res.status}`) as Error & { code?: string; status?: number };
    e.code = err.code;
    e.status = res.status;
    throw e;
  }
  return res.json();
}

const post = (url: string, body?: unknown) =>
  fetchJson<Record<string, unknown>>(url, { method: 'POST', body: JSON.stringify(body || {}) });

/** Map backend ClientProfile to the app's UserProfile for screens. */
function toUserProfile(p: ClientProfile, fallback?: Partial<UserProfile>): UserProfile {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phoneVerified: p.phoneVerified ?? Boolean(p.phone),
    hasPreciseLocation: p.hasPreciseLocation,
    age: p.age,
    gender: p.gender,
    birthDate: p.birthDate,
    pronouns: p.pronouns,
    professionCategory: (p.professionCategory as UserProfile['professionCategory']) || 'Others',
    professionTitle: p.professionTitle || '',
    companyOrOrg: p.companyOrOrg,
    educationLevel: p.educationLevel,
    almaMater: p.almaMater,
    service: p.service as UserProfile['service'],
    dutyStation: p.dutyStation,
    city: p.city || '',
    state: p.state || '',
    distanceKm: p.distanceKm,
    bio: p.bio || '',
    photos: p.photos?.length ? p.photos : fallback?.photos || [],
    interests: p.interests || [],
    prompts: p.prompts?.length ? p.prompts : undefined,
    lifestyle: p.lifestyle,
    values: p.values,
    intentions: fallback?.intentions || [],
    datingGoal: p.datingGoal as UserProfile['datingGoal'],
    matchPreferences: p.matchPreferences,
    classOfService: p.classOfService,
    orgRole: p.orgRole,
    skill: p.skill,
    credits: p.credits,
    accountStatus: p.accountStatus,
    restrictionReason: p.restrictionReason,
    verification: {
      status: p.verification.status,
      verifiedAt: p.verification.verifiedAt,
      hasGovernmentId: p.verification.status === 'pending',
      hasLiveSelfie: p.verification.status === 'pending',
      documentType: undefined
    },
    privacy: p.privacy
  };
}

export const WassaaApi = {
  // ---- Auth ----
  /** Emails a six-digit code; the account is created on first use. */
  async requestEmailCode(email: string): Promise<{ delivered: boolean; expiresInSeconds: number }> {
    await sendEmailOtp(email);
    return { delivered: true, expiresInSeconds: 300 };
  },
  async signInWithGoogle(credential: string, nonce: string): Promise<{ isNew?: boolean; user?: UserProfile }> {
    await signInWithGoogleIdToken(credential, nonce);
    const user = await WassaaApi.fetchSession();
    return {
      isNew: Boolean(user && user.professionCategory === 'Others' && !user.photos.length),
      user: user || undefined
    };
  },
  async verifyEmailCode(email: string, code: string): Promise<{ isNew: boolean; user: UserProfile }> {
    await confirmEmailOtp(email, code);
    const user = await this.fetchSession();
    if (!user) throw new Error('Email verified, but your Wassaa profile could not be loaded. Try again.');
    return { isNew: user.professionCategory === 'Others' && !user.photos.length, user };
  },
  /** Optional: adds a mobile number to the already signed-in account. */
  async requestPhoneCode(phone: string): Promise<{ delivered: boolean }> {
    await sendPhoneChangeCode(phone);
    return { delivered: true };
  },
  async verifyPhoneCode(phone: string, code: string): Promise<UserProfile> {
    await confirmPhoneChange(phone, code);
    const user = await this.fetchSession();
    if (!user) throw new Error('Your number was confirmed, but your profile could not be refreshed. Reopen this screen.');
    return user;
  },
  async fetchSession(): Promise<UserProfile | null> {
    if (!await getAccessToken()) return null;
    const res = await fetchJson<{ user: ClientProfile }>(`${BASE_URL}/auth/session`);
    return toUserProfile(res.user);
  },

  // ---- Me ----
  async getProfile(): Promise<UserProfile> {
    const res = await fetchJson<{ user: ClientProfile }>(`${BASE_URL}/me/profile`);
    return toUserProfile(res.user);
  },
  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.birthDate !== undefined) body.birthDate = updates.birthDate;
    if (updates.gender !== undefined) body.gender = updates.gender;
    if (updates.pronouns !== undefined) body.pronouns = updates.pronouns;
    if (updates.professionCategory !== undefined) body.professionCategory = updates.professionCategory;
    if (updates.professionTitle !== undefined) body.professionTitle = updates.professionTitle;
    if (updates.companyOrOrg !== undefined) body.companyOrOrg = updates.companyOrOrg;
    if (updates.educationLevel !== undefined) body.educationLevel = updates.educationLevel;
    if (updates.almaMater !== undefined) body.almaMater = updates.almaMater;
    if (updates.service !== undefined) body.service = updates.service;
    if (updates.dutyStation !== undefined) body.dutyStation = updates.dutyStation;
    if (updates.city !== undefined) body.city = updates.city;
    if (updates.state !== undefined) body.state = updates.state;
    if (updates.bio !== undefined) body.bio = updates.bio;
    if (updates.photos !== undefined) body.photos = updates.photos;
    if (updates.interests !== undefined) body.interests = updates.interests;
    // The three blocks onboarding collects on steps 7–9; the API stores them
    // in `prompts`, `lifestyle` and `values_family`.
    if (updates.prompts !== undefined) body.prompts = updates.prompts;
    if (updates.lifestyle !== undefined) body.lifestyle = updates.lifestyle;
    if (updates.values !== undefined) body.values = updates.values;
    if (updates.datingGoal !== undefined) body.datingGoal = updates.datingGoal;
    if (updates.orgRole !== undefined) body.orgRole = updates.orgRole;
    if (updates.skill !== undefined) body.skill = updates.skill;
    const res = await fetchJson<{ user: ClientProfile | null }>(`${BASE_URL}/me/profile`, { method: 'PATCH', body: JSON.stringify(body) });
    return toUserProfile(res.user || (updates as UserProfile));
  },
  async updatePrivacy(privacy: Partial<UserPrivacySettings>): Promise<UserPrivacySettings> {
    const res = await fetchJson<{ privacy: UserPrivacySettings; user: ClientProfile }>(`${BASE_URL}/me/privacy`, { method: 'PATCH', body: JSON.stringify(privacy) });
    return res.privacy;
  },
  async updatePreferences(prefs: Partial<MatchPreferences>): Promise<MatchPreferences> {
    return fetchJson(`${BASE_URL}/me/preferences`, { method: 'PATCH', body: JSON.stringify(prefs) });
  },
  async updateLocation(location: { latitude: number; longitude: number } | null): Promise<void> {
    await fetchJson(`${BASE_URL}/me/location`, { method: 'PATCH', body: JSON.stringify(location
      ? location
      : { latitude: null, longitude: null }) });
  },
  async deleteAccount(): Promise<void> {
    await fetchJson(`${BASE_URL}/me/account`, { method: 'DELETE' });
    clearSession();
  },

  // ---- Discovery ----
  async getDiscovery(params?: { profession?: string; service?: string; city?: string; gender?: string; minAge?: number; maxAge?: number; limit?: number }): Promise<{ profiles: UserProfile[]; total: number }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== '' && v !== 'All') q.set(k, String(v));
    }
    const res = await fetchJson<{ profiles: ClientProfile[]; total: number }>(`${BASE_URL}/discovery?${q.toString()}`);
    return { profiles: res.profiles.map((p) => toUserProfile(p)), total: res.total };
  },

  // ---- Swipes ----
  async like(targetUserId: string, opts?: { superLike?: boolean; note?: string }): Promise<{ isMatch: boolean; match?: { id: string }; balance?: number }> {
    const res = await post(`${BASE_URL}/likes`, { targetUserId, superLike: opts?.superLike, note: opts?.note });
    const match = res.match as { id: string } | undefined;
    return { isMatch: !!res.isMatch, match, balance: typeof res.balance === 'number' ? res.balance : undefined };
  },
  async pass(targetUserId: string): Promise<void> {
    await post(`${BASE_URL}/passes`, { targetUserId });
  },
  async getLikesReceived(opts?: { reveal?: boolean }): Promise<{ likes: UserProfile[]; locked: boolean; cost?: number }> {
    // Without `reveal` the backend only reports the price — no surprise charges.
    const res = await fetchJson<{ likes: ClientProfile[]; locked?: boolean; cost?: number }>(
      `${BASE_URL}/likes/received${opts?.reveal ? '?reveal=1' : ''}`
    );
    return { likes: (res.likes || []).map((l) => toUserProfile(l)), locked: Boolean(res.locked), cost: res.cost };
  },
  async boost(): Promise<{ boostedUntil: string; balance: number }> {
    const res = await post(`${BASE_URL}/me/boost`);
    return { boostedUntil: String(res.boostedUntil || ''), balance: Number(res.balance ?? 0) };
  },

  // ---- Matches & chat ----
  async getMatches(): Promise<MatchItem[]> {
    const res = await fetchJson<{
      matches: { id: string; matchedAt: string; profile: ClientProfile; lastMessage: string; lastMessageTime: string; unread: number }[];
    }>(`${BASE_URL}/matches`);
    return res.matches.map((m) => ({
      id: m.id,
      profile: toUserProfile(m.profile),
      matchedAt: m.matchedAt,
      lastMessage: m.lastMessage,
      lastMessageTime: m.lastMessageTime,
      unreadCount: m.unread,
      messages: []
    }));
  },
  async getMessages(matchId: string, since?: string): Promise<{ messages: ChatMessage[] }> {
    const res = await fetchJson<{ messages: ChatMessage[]; partner: ClientProfile | null }>(
      `${BASE_URL}/matches/${matchId}/messages${since ? `?since=${encodeURIComponent(since)}` : ''}`
    );
    return { messages: res.messages };
  },
  async sendMessage(matchId: string, message: { kind: 'text'; text: string } | { kind: 'photo'; mediaUrl: string; caption?: string }): Promise<{ message: ChatMessage; balance?: number }> {
    const res = await post(`${BASE_URL}/matches/${matchId}/messages`, message);
    return { message: res.message as ChatMessage, balance: typeof res.balance === 'number' ? res.balance : undefined };
  },
  async markRead(matchId: string): Promise<void> {
    await post(`${BASE_URL}/matches/${matchId}/read`);
  },

  // ---- Blocks & reports ----
  async listBlocked(): Promise<{ id: string; name: string; reason?: string; date?: string }[]> {
    const res = await fetchJson<{ blocked: { id: string; name: string; reason?: string; date?: string }[] }>(`${BASE_URL}/blocks`);
    return res.blocked;
  },
  async block(blockedUserId: string, reason?: string): Promise<void> {
    await post(`${BASE_URL}/blocks`, { blockedUserId, reason });
  },
  async unblock(userId: string): Promise<void> {
    await fetchJson(`${BASE_URL}/blocks/${userId}`, { method: 'DELETE' });
  },
  async submitReport(report: { reportedUserId: string; category: string; categoryLabel: string; details: string; alsoBlock: boolean; serviceBranch?: string; matchId?: string; messageId?: string }): Promise<void> {
    await post(`${BASE_URL}/reports`, report);
  },

  // ---- Appeals (after a restriction or ban) ----
  async getAppeals(): Promise<{ id: string; status: 'pending' | 'granted' | 'denied'; note: string; sanctionReason?: string; decisionNote?: string; createdAt: string; decidedAt?: string }[]> {
    const res = await fetchJson<{ appeals: { id: string; status: 'pending' | 'granted' | 'denied'; note: string; sanctionReason?: string; decisionNote?: string; createdAt: string; decidedAt?: string }[] }>(`${BASE_URL}/appeals`);
    return res.appeals || [];
  },
  async submitAppeal(note: string): Promise<{ id: string; status: string }> {
    const res = await post(`${BASE_URL}/appeals`, { note });
    const appeal = res.appeal as { id: string; status: string } | undefined;
    return { id: String(appeal?.id || ''), status: String(appeal?.status || 'pending') };
  },

  // ---- Verification ----
  async submitVerification(payload: {
    documentType: string;
    documentNumber: string;
    idDocKey?: string;
    selfieKey?: string;
  }): Promise<{ status: string; message: string }> {
    const res = await post(`${BASE_URL}/verification/submit`, payload);
    return { status: String(res.status || 'pending'), message: String(res.message || '') };
  },

  /** Presigned direct-to-R2 upload. Media does not travel through API bodies. */
  async uploadImage(kind: 'photo' | 'id_doc' | 'selfie' | 'chat_photo', file: File): Promise<string> {
    const contentType = file.type || 'image/jpeg';
    let target: { uploadUrl: string; key: string; publicUrl?: string | null };
    target = await fetchJson(`${BASE_URL}/uploads/presign`, {
      method: 'POST',
      body: JSON.stringify({ kind, contentType, contentLength: file.size })
    });
    const put = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!put.ok) throw new Error(`Image upload failed (${put.status}). Check the storage CORS policy.`);
    if (kind === 'photo') {
      if (!target.publicUrl) throw new Error('Profile photo delivery requires a public R2 asset domain.');
      return target.publicUrl;
    }
    return target.key;
  },
  async verificationStatus(): Promise<{ status: string; verifiedAt?: string; pendingSubmissionId?: string }> {
    return fetchJson(`${BASE_URL}/verification/status`);
  },

  // ---- Billing (credit packs — KB §18E) ----
  async getPlans(): Promise<{ plans: { id: string; name: string; priceNgn: number; features: string[] }[]; consumables: { id: string; naira: number }[] }> {
    return fetchJson(`${BASE_URL}/billing/plans-public`);
  },
  async checkout(planId: string, email?: string): Promise<{ sandbox: boolean; reference: string; authorizationUrl?: string; amountNaira: number; credits?: number; message?: string }> {
    return fetchJson(`${BASE_URL}/billing/checkout`, { method: 'POST', body: JSON.stringify({ planId, email }) });
  },
  async sandboxComplete(reference: string): Promise<void> {
    await post(`${BASE_URL}/billing/sandbox/complete`, { reference });
  },
  async activate(reference: string): Promise<{ tier: string; credits: number }> {
    const res = await post(`${BASE_URL}/billing/activate`, { reference });
    return { tier: String(res.tier), credits: Number(res.credits ?? 0) };
  },
  async getEntitlements(): Promise<{
    tier: SubscriptionTier; dailyLikes: number; superLikesPerWeek: number; canSeeLikes: boolean;
    canRewind: boolean; incognito: boolean; privateIntroduction: boolean; boostsPerMonth: number; readReceipts: boolean;
    credits: number; revealLikesCost?: number; packs: CreditPack[];
  }> {
    const res = await fetchJson<{ packs?: CreditPack[] } & Record<string, any>>(`${BASE_URL}/billing/entitlements`);
    return { ...res, credits: Number(res.credits ?? 0), packs: res.packs || [] } as any;
  }
};
