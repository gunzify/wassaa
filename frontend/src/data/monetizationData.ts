import { SubscriptionPlan } from '../types';

export const WASSAA_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Basic features',
    priceNgn: 0,
    period: 'month',
    features: [
      'Browse profiles',
      'Like & match',
      'Limited chat'
    ]
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'More connections',
    priceNgn: 1500,
    period: 'month',
    isPopular: true,
    features: [
      'Unlimited likes',
      'See who liked you',
      'Advanced filters',
      'Unlimited chat',
      'Rewind last pass'
    ]
  },
  {
    id: 'hyper_premium',
    name: 'Hyper Premium',
    tagline: 'Ultimate discretion',
    priceNgn: 5000,
    period: 'month',
    features: [
      'Anonymous messaging (Private Introduction)',
      'View private profiles (consent-based)',
      'Priority in matches',
      'Read receipts',
      'Exclusive features & Incognito controls',
      'Three monthly profile boosts'
    ]
  }
];

export const ONE_TIME_VERIFICATION_FEE = 1500; // ₦1,500 one-time verification fee

export const FULL_PRD_DOCUMENT = {
  title: 'WASSAA — Complete Product Requirements Document & Technical System Architecture',
  subtitle: 'Nationwide Nigeria launch | PWA, Android and iOS | Version 1.0 | 18 October 2026',
  documentControl: {
    product: 'WASSAA',
    version: '1.0',
    status: 'Proposed source of truth for design and implementation',
    initialMarket: 'Nigeria, nationwide',
    futureMarkets: 'Ghana and other countries through country configuration and local compliance review',
    platforms: 'Responsive PWA, Android and iOS',
    primaryAudience: 'Adults across professions, including uniformed services and civilian professions',
    commercialModel: 'One-time verification fee, Free/Premium/Hyper Premium memberships, optional consumable purchases'
  },
  executiveSummary: `WASSAA is a verified, profession-aware dating platform for adults. It supports serious relationships, long-term partnership or marriage, casual dating and discreet connections. Members can discover all professions or filter by profession, service, location and other preferences. Uniformed service members can choose whether to disclose their service affiliation and rank. The platform must never expose hidden rank or service details merely because a member has paid for a higher tier.

WASSAA will launch across Nigeria rather than only Lagos and Abuja. Its first release includes account creation, identity verification, profession directory, profile creation, discovery, likes, mutual matching, text chat, images, voice notes, reporting, blocking, subscriptions, payment reconciliation and a secure admin portal. A consent-based Private Introduction is a Hyper Premium feature, subject to explicit recipient controls and store-policy review.`,
  principles: [
    { title: 'Profession-inclusive', desc: 'A nurse, soldier, police officer, doctor, teacher, engineer or entrepreneur can join the same platform.' },
    { title: 'Consent first', desc: 'No paid tier can override a decline, block, eligibility rule or recipient privacy setting.' },
    { title: 'Privacy by default', desc: 'Exact rank is private; service is visible to matches only; verification display is a general badge.' },
    { title: 'Simple navigation', desc: 'Five primary destinations, clear actions and progressive onboarding.' },
    { title: 'Nationwide by design', desc: 'No hard-coded Lagos or Abuja assumptions; supports all 36 Nigerian states and the FCT.' },
    { title: 'No false trust claims', desc: 'Identity verification, service verification and rank verification are distinct.' },
    { title: 'No paywall on safety', desc: 'Report, block, unmatch, privacy controls and account deletion are available to all users.' },
    { title: 'Reliable money handling', desc: 'Verify payments server-side via Paystack, reconcile transactions and make fulfilment idempotent.' }
  ],
  sections: [
    {
      id: 'onboarding',
      heading: 'Full Onboarding & Verification Flow',
      content: `The onboarding journey follows a 10-step progressive flow:
1. Welcome: Create account or sign in with Terms and Privacy agreement.
2. Phone verification: +234 Nigerian E.164 phone number, 6-digit OTP verification with brute-force protection.
3. Age & basic details: Date of birth (18+ strict gate), gender, discovery preferences.
4. Profession: Searchable taxonomy across Military, Police, Paramilitary, Healthcare, Education, Engineering, Business, etc.
5. Service & Rank: Optional uniformed service selection (Army, Navy, Air Force, Police, NSCDC, FRSC, Immigration, Customs).
6. Intentions: Long-term relationship, Marriage, Casual dating, or Discreet connections.
7. Discovery preferences: Age range, location radius, and profession discovery preferences.
8. Complete Profile: Display name, profile photo, bio, and interest tags.
9. Identity Verification: Upload valid Government ID (e.g. NIN, Passport) + Live Biometric Selfie. Zero-storage policy guarantees ID images are processed in-memory and immediately destroyed.
10. Activation: Successful verification and one-time ₦1,500 verification fee activates full discovery.`
    },
    {
      id: 'privacy',
      heading: 'Professional Identity & Privacy Defaults',
      content: `Defaults enforce strict member protection:
- Service visibility: Defaults to 'matches' (hidden in open discovery; only visible after mutual match).
- Rank/Grade visibility: Defaults to 'private' (never shown publicly or to matches unless explicitly toggled).
- Verification display: Defaults to 'badge' (a general verified checkmark, never leaking military rank or government credentials).
- Private Introduction: Recipient must explicitly opt-in; no media or text can be sent until accepted.`
    },
    {
      id: 'tech_arch',
      heading: 'Technical System Architecture',
      content: `• Mobile App: React Native + Expo + TypeScript (shared iOS/Android code).
• Web App / PWA: Next.js + React + Tailwind CSS.
• Backend: NestJS + TypeScript modular monolith with REST API and WebSocket gateway.
• Database: PostgreSQL + PostGIS for radius and geospatial queries.
• Payment Processing: Paystack integration for web and native store billing adapters.
• Media: Private S3-compatible object storage with signed short-lived URLs. EXIF metadata stripped on upload.`
    }
  ]
};
