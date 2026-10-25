export type ProfessionCategory =
  | 'Military'
  | 'Police'
  | 'Paramilitary'
  | 'Healthcare'
  | 'Education'
  | 'Engineering'
  | 'Business & Entrepreneurship'
  | 'Law & Government'
  | 'Others';

export type UniformedService =
  | 'Nigerian Army'
  | 'Nigerian Navy'
  | 'Nigerian Air Force'
  | 'Nigerian Police Force'
  | 'NSCDC'
  | 'FRSC'
  | 'Immigration'
  | 'Customs'
  | 'None';

export type VisibilitySetting = 'public' | 'matches' | 'private';

export interface UserPrivacySettings {
  serviceVisibility: VisibilitySetting;
  rankVisibility: VisibilitySetting;
  verificationDisplay: 'badge' | 'service_badge' | 'minimal';
  chatNotifications: boolean;
  twoFactorAuth: boolean;
  privateIntroductionOptIn: boolean;
}

export interface VerificationData {
  status: 'verified' | 'pending' | 'rejected' | 'not_started';
  verifiedAt?: string;
  hasGovernmentId: boolean;
  hasLiveSelfie: boolean;
  documentType?: 'NIN' | 'Passport' | 'DriversLicense' | 'ServiceWarrant';
}

export interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

export interface MatchPreferences {
  gender: 'men' | 'women' | 'everyone';
  minAge: number;
  maxAge: number;
  maxDistanceKm?: number;
  openToRelocation?: boolean;
}

export interface LifestyleHabits {
  exercise?: 'daily' | 'frequently' | 'occasionally' | 'rarely';
  drinking?: 'never' | 'socially' | 'regularly';
  smoking?: 'never' | 'socially' | 'regularly';
  pets?: 'dogs' | 'cats' | 'both' | 'none';
}

export interface ValuesAndFamily {
  faith?: string;
  faithImportance?: 'very_important' | 'somewhat' | 'not_important';
  familyPlans?: 'want_children' | 'open_to_children' | 'have_children_want_more' | 'dont_want_children' | 'not_sure';
  loveLanguage?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  /** Set for the signed-in member only; never exposed on other profiles. */
  email?: string;
  /** True once a mobile number is confirmed on this account (optional). */
  phoneVerified?: boolean;
  age?: number;
  gender?: 'female' | 'male';
  birthDate?: string;
  pronouns?: string;
  professionCategory: ProfessionCategory;
  professionTitle: string; // e.g. "Software Engineer", "Doctor", "Founder", "Lawyer", "Teacher"
  companyOrOrg?: string;
  educationLevel?: string;
  almaMater?: string;
  service?: UniformedService;
  rank?: string;
  dutyStation?: string;
  city: string;
  state: string;
  neighborhood?: string;
  hometown?: string;
  distanceKm?: number;
  /** Only submitted by the member to the API; never returned as raw coordinates. */
  locationCoordinates?: { latitude: number; longitude: number } | null;
  hasPreciseLocation?: boolean;
  bio: string;
  photos: string[];
  interests: string[];
  intentions: string[];
  datingGoal?: 'marriage' | 'long_term' | 'intentional' | 'exploring' | 'not_sure';
  matchPreferences?: MatchPreferences;
  lifestyle?: LifestyleHabits;
  values?: ValuesAndFamily;
  prompts?: ProfilePrompt[];
  verification: VerificationData;
  privacy: UserPrivacySettings;
}

export interface VoiceNoteData {
  durationSeconds: number;
  durationLabel: string;
}

/** Mirrors the backend ChatMessage contract (see backend/src/domain.ts). */
export interface ChatMessage {
  id: string;
  senderId: string;
  kind: 'text' | 'voice' | 'photo' | 'system';
  text?: string;
  createdAt: string;
  voice?: VoiceNoteData;
  mediaUrl?: string;
  caption?: string;
}

export interface MatchItem {
  id: string;
  profile: UserProfile;
  matchedAt: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isFavorite?: boolean;
  isNew?: boolean;
  messages: ChatMessage[];
}

export type SubscriptionTier = 'free' | 'premium' | 'hyper_premium';

export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  priceNgn: number;
  period: 'month' | 'quarter';
  features: string[];
  isPopular?: boolean;
}
