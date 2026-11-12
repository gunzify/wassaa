import { createClient } from 'npm:@supabase/supabase-js@2';
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { ageAt, greatCircleDistanceKm, isOnboardingComplete } from './domain.ts';
import { tickMatch, tickUserThreads } from './npc.ts';
import { notificationsRoute } from './notifications.ts';

export type Row = Record<string, any>;
const allowedOrigins = (Deno.env.get('APP_ORIGINS') || 'https://wassaa.app,http://localhost:5173,http://localhost:5174,http://localhost:4173').split(',').map((s) => s.trim());
// Credit packs replace the retired tier plans (KB §18E): text messages cost 5
// credits (photos 10), replies are free, real-matched chat stays free, credits
// never expire.
//
// Prices live in the `credit_packs` / `credit_pack_prices` tables so they can be
// retuned without redeploying this function. The three bands (Nigeria, rest of
// Africa, global) are resolved per country by `wassaa_credit_packs_for`. This
// list is only the offline fallback, priced at the Nigerian band.
const FALLBACK_PACKS = [
  { id: 'credit_150', name: 'Starter', tagline: 'Start strong', priceNgn: 2000, credits: 150, period: 'one-time', isPopular: false, displayCurrency: 'NGN', displayPrice: 2000, band: 'ng', features: ['150 credits', 'About 30 text messages', 'Credits never expire'] },
  { id: 'credit_450', name: 'Standard', tagline: 'Most members pick this', priceNgn: 5000, credits: 450, period: 'one-time', isPopular: true, displayCurrency: 'NGN', displayPrice: 5000, band: 'ng', features: ['450 credits', 'About 90 text messages', 'Credits never expire'] },
  { id: 'credit_1200', name: 'Best Value', tagline: 'Never run dry', priceNgn: 12000, credits: 1200, period: 'one-time', isPopular: false, displayCurrency: 'NGN', displayPrice: 12000, band: 'ng', features: ['1,200 credits', 'About 240 text messages', 'Credits never expire'] }
];
const FREE_PLAN = { id: 'free', name: 'Free', tagline: 'Meet the community', priceNgn: 0, period: 'free', displayCurrency: 'NGN', displayPrice: 0, features: ['Browse profiles', '20 free swipes per day, then 1 credit per swipe', '25 free credits on signup', 'Message directly from any profile'] };
// Pricing v2 (KB §18E): texts are 5 credits, photos 10, in a mutually liked
// thread. A cold thread — you have messaged them, they have not liked you
// back yet — doubles every outgoing message; once they like back, pricing
// drops to normal automatically (computed on send). 20 free right-swipes a
// day, then 1 credit per extra swipe. Super Like stays 3 credits, see-who-
// liked-you stays 15.
const PRICING = {
  text: 5,
  photo: 10,
  // Cold outreach escalates: 10, 15, 20 for text (media doubles the base, so
  // 20, 25, 30) and stops at three messages until the partner likes back.
  coldBase: 10,
  coldStep: 5,
  coldMax: 3,
  freeDailySwipes: 20,
  paidSwipe: 1,
  revealLikes: 15,
  boost: 100
} as const;
const DEFAULT_PRIVACY = { serviceVisibility: 'matches', rankVisibility: 'private', verificationDisplay: 'badge', chatNotifications: true, twoFactorAuth: false, privateIntroductionOptIn: true };
const MAX_JSON_BYTES = 1_500_000;
/** Intent buckets a persona reply can target (npc-content.ts REPLIES keys). */
const SCRIPT_INTENTS = ['greeting', 'smalltalk', 'questions', 'compliment', 'logistics', 'farewell', 'offTopic'];
// Paystack charges international cards in the merchant's settlement currency
// (NGN here) and the cardholder's bank converts, so a card from any of 195+
// countries can buy a pack. Credit packs are therefore sold everywhere and
// free chat no longer exists. These helpers stay because the client reads the
// fields and because the database functions derive from the same policy.
const creditRegionSupported = (_code: string | null | undefined) => true;
const isFreeChat = (_p: Row) => false;
const dailyCreditAllowance = (_p: Row) => 1;

/** Pack catalogue priced for this member's country. Falls back to the NG band. */
async function packsForCountry(db: ReturnType<typeof createClient>, country: string | null | undefined): Promise<Row[]> {
  const { data, error } = await db.rpc('wassaa_credit_packs_for', { p_country: (country || 'NG').toUpperCase() });
  if (error || !Array.isArray(data) || !data.length) return FALLBACK_PACKS;
  return data as Row[];
}

function headers(origin: string | null): HeadersInit {
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : 'https://wassaa.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-paystack-signature',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}
export function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
}
export function err(message: string, status = 400, origin: string | null = null, code?: string): Response {
  return json({ error: message, ...(code ? { code } : {}) }, status, origin);
}
export function cleanString(value: unknown, max = 500): string { return String(value ?? '').trim().slice(0, max); }
// IDs that reach PostgREST filters (`.or(...)`) must be canonical UUIDs, never
// free text: a filter string is a query language of its own, so anything else
// could reshape the predicate. Values read from the database are already UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);
const ageOf = ageAt;

// ---------------------------------------------------------------- profile detail
// One contract for members and personas: the three optional blocks onboarding
// collects (prompts, lifestyle, values) are validated the same way on every
// write path so a persona can never hold a shape a member could not.
const PROFESSION_CATEGORIES = ['Military', 'Police', 'Paramilitary', 'Healthcare', 'Education', 'Engineering', 'Business & Entrepreneurship', 'Law & Government', 'Others'];
const DATING_GOALS = ['marriage', 'long_term', 'intentional', 'exploring', 'not_sure'];
const LIFESTYLE_ENUMS: Record<string, string[]> = {
  exercise: ['daily', 'frequently', 'occasionally', 'rarely'],
  drinking: ['never', 'socially', 'regularly'],
  smoking: ['never', 'socially', 'regularly'],
  pets: ['dogs', 'cats', 'both', 'none']
};
const FAITH_IMPORTANCE = ['very_important', 'somewhat', 'not_important'];
const FAMILY_PLANS = ['want_children', 'open_to_children', 'have_children_want_more', 'dont_want_children', 'not_sure'];

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  const v = String(value ?? '');
  return (allowed as readonly string[]).includes(v) ? v as T : undefined;
}
/** Q&A cards → [{id, question, answer}], empty pairs dropped, max 3. */
function cleanPrompts(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((raw, i) => {
    const row = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Row;
    return {
      id: cleanString(row.id, 24) || `p${i}`,
      question: cleanString(row.question, 60),
      answer: cleanString(row.answer, 220)
    };
  }).filter((p) => p.question && p.answer);
}
function cleanLifestyle(value: unknown): Row | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = value as Row, out: Row = {};
  for (const [key, allowed] of Object.entries(LIFESTYLE_ENUMS)) {
    const v = enumValue(src[key], allowed);
    if (v) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}
function cleanValuesFamily(value: unknown): Row | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = value as Row, out: Row = {};
  const faith = cleanString(src.faith, 40);
  const faithImportance = enumValue(src.faithImportance, FAITH_IMPORTANCE);
  const familyPlans = enumValue(src.familyPlans, FAMILY_PLANS);
  if (faith) out.faith = faith;
  if (faithImportance) out.faithImportance = faithImportance;
  if (familyPlans) out.familyPlans = familyPlans;
  return Object.keys(out).length ? out : null;
}
/**
 * One definition of account standing.
 *
 * `profiles.blocked_us` is the legacy staff block and `account_status` is the
 * newer sanction field; both are read by different routes (deck, likes, gate).
 * A row where only one is set used to mean "banned in one place, active in
 * another". They are kept in sync by the admin routes, and this helper makes
 * every reader agree even for rows written before the sync existed.
 */
function accountStatusOf(p: Row): 'active' | 'restricted' | 'banned' {
  if (p.account_status === 'banned' || p.blocked_us) return 'banned';
  return p.account_status === 'restricted' ? 'restricted' : 'active';
}

/**
 * The deck hides banned accounts and personas without an approved face, but a
 * stale card or a direct id could still be liked, passed or cold-messaged.
 * Every write route uses this same predicate so the deck's visibility is the
 * real rule, not just a query hint.
 */
function isReachableProfile(p: Row): boolean {
  if (!p || p.deleted_at || p.blocked_us || accountStatusOf(p) === 'banned') return false;
  if (!p.is_npc) return true;
  return Boolean(p.npc_active)
    && p.npc_photo_review !== 'quarantine'
    && (p.npc?.photoState ?? 'ready') !== 'awaiting_upload';
}

function profileForViewer(p: Row, viewerId: string, mutual = false, distanceKm?: number) {
  const privacy = p.privacy || DEFAULT_PRIVACY;
  // Q&A cards: real members keep them in the prompts column; seeded personas
  // keep them inside persona.prompts ({ q, a } shape).
  const rawPrompts: Row[] = Array.isArray(p.prompts) && p.prompts.length
    ? p.prompts
    : p.is_npc && Array.isArray(p.npc?.prompts) ? p.npc.prompts : [];
  const prompts = rawPrompts
    .map((pr: Row, i: number) => ({ id: String(pr.id ?? i), question: String(pr.question ?? pr.q ?? ''), answer: String(pr.answer ?? pr.a ?? '') }))
    .filter((pr) => pr.question.trim() && pr.answer.trim());
  // Detail blocks come from the same columns for everyone; the persona blob is
  // only a fallback for rows seeded before the columns existed.
  const lifestyle = (p.lifestyle && typeof p.lifestyle === 'object' && Object.keys(p.lifestyle).length)
    ? p.lifestyle
    : (p.is_npc && p.npc?.lifestyle && typeof p.npc.lifestyle === 'object' && Object.keys(p.npc.lifestyle).length ? p.npc.lifestyle : null);
  const valuesFamily = (p.values_family && typeof p.values_family === 'object' && Object.keys(p.values_family).length)
    ? p.values_family
    : (p.is_npc && p.npc?.values && typeof p.npc.values === 'object' && Object.keys(p.npc.values).length ? p.npc.values : null);
  return {
    id: p.id, name: p.name || 'New member',
    ...(p.id === viewerId ? { email: p.email || undefined, phone: p.phone || undefined, hasPreciseLocation: p.location_lat != null && p.location_lng != null, credits: p.credits ?? 0, accountStatus: accountStatusOf(p), restrictionReason: p.restriction_reason || undefined, creditRegionSupported: creditRegionSupported(p.country_code), freeChat: isFreeChat(p), dailyCreditAllowance: dailyCreditAllowance(p) } : {}),
    phoneVerified: Boolean(p.phone),
    ...(p.id === viewerId && p.birth_date ? { birthDate: p.birth_date } : {}), age: ageOf(p.birth_date),
    gender: p.gender || undefined, pronouns: p.pronouns || undefined,
    professionCategory: p.profession_category || 'Others', professionTitle: p.profession_title || undefined,
    classOfService: p.class_of_service || undefined, orgRole: p.org_role || undefined, skill: p.skill || undefined,
    companyOrOrg: p.company_or_org || undefined,
    educationLevel: p.education_level || undefined, almaMater: p.alma_mater || undefined,
    service: privacy.serviceVisibility === 'private' || (privacy.serviceVisibility === 'matches' && !mutual) ? undefined : p.service || undefined,
    // Rank is never part of the contract — cadre (org_role) replaced it, and
    // duty station follows the same visibility control as the service itself.
    dutyStation: privacy.serviceVisibility === 'private' || (privacy.serviceVisibility === 'matches' && !mutual) ? undefined : p.duty_station || undefined,
    city: p.city || '', state: p.state || '', countryCode: p.country_code || 'NG', bio: p.bio || '', photos: p.photos || [], interests: p.interests || [],
    ...(distanceKm != null ? { distanceKm } : {}),
    datingGoal: p.dating_goal || undefined, matchPreferences: p.match_preferences || undefined,
    ...(prompts.length ? { prompts } : {}),
    ...(lifestyle ? { lifestyle } : {}),
    ...(valuesFamily ? { values: valuesFamily } : {}),
    // No isNpc field in client payloads — members must never tell personas apart.
    verification: { status: p.verification_status || 'not_started', verifiedAt: p.verified_at || undefined }, privacy
  };
}
function profilePayload(p: Row) { return profileForViewer(p, p.id, true); }
function messageRow(r: Row) {
  const secs = r.voice_duration == null ? undefined : Number(r.voice_duration);
  return { id: r.id, matchId: r.match_id, senderId: r.sender_id, kind: r.kind, text: r.text || undefined,
    mediaUrl: r.media_url || undefined, caption: r.caption || undefined,
    voice: secs == null ? undefined : { durationSeconds: secs, durationLabel: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` }, createdAt: r.created_at };
}
function scriptRow(r: Row) {
  return { id: r.id, npcId: r.npc_id, kind: r.kind, intent: r.intent || undefined, body: r.body,
    position: r.position ?? 0, enabled: Boolean(r.enabled), updatedAt: r.updated_at };
}
function reportRow(r: Row) {
  return { id: r.id, reporterId: r.reporter_id, reportedUserId: r.reported_user_id, category: r.category, categoryLabel: r.category_label,
    details: r.details, serviceBranch: r.service_branch || undefined, alsoBlocked: r.also_blocked, status: r.status,
    matchId: r.match_id || undefined, messageId: r.message_id || undefined,
    reviewNote: r.review_note || undefined, reviewedAt: r.reviewed_at || undefined, createdAt: r.created_at };
}
export async function bodyJson(req: Request): Promise<Row> {
  const raw = await req.text();
  if (raw.length > MAX_JSON_BYTES) throw new Error('Request body is too large.');
  if (!raw) return {};
  return JSON.parse(raw) as Row;
}
async function s3Client(): Promise<S3Client | null> {
  const id = Deno.env.get('R2_ACCOUNT_ID'), access = Deno.env.get('R2_ACCESS_KEY_ID'), secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!id || !access || !secret) return null;
  return new S3Client({ region: 'auto', endpoint: Deno.env.get('R2_ENDPOINT') || `https://${id}.r2.cloudflarestorage.com`, credentials: { accessKeyId: access, secretAccessKey: secret }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
}
function objectKey(kind: string, userId: string, contentType: string) {
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[contentType] || 'jpg';
  const prefix = kind === 'photo' ? 'photos' : kind === 'chat_photo' ? 'chat' : 'verification';
  return `${prefix}/${userId}/${crypto.randomUUID()}.${ext}`;
}
function isStorageKey(key: unknown): key is string { return typeof key === 'string' && !!key && !/^https?:\/\//i.test(key) && !key.startsWith('data:') && !key.includes('..'); }
/** Public asset base for legacy profile-photo URLs. */
const photoBaseUrl = () => (Deno.env.get('R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '');
/**
 * Profile photos are client-supplied, so every entry must point at the owner's
 * own upload prefix (`photos/<id>/…`). Full public URLs are accepted only on
 * the configured R2 asset host, and values already stored on the row are kept
 * (so legacy records can be re-saved). Anything else — a foreign host, another
 * member's key, a traversal attempt — is dropped. This closes the IDOR where a
 * member could paste someone else's photo URL into their own profile.
 */
function ownedPhotoValues(ownerId: string, values: unknown[], existing: unknown[] = []): string[] {
  const keep = new Set((existing || []).map((value) => String(value)));
  const base = photoBaseUrl();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanString(raw, 600);
    if (!value) continue;
    if (keep.has(value)) { out.push(value); continue; }
    if (isStorageKey(value) && value.startsWith(`photos/${ownerId}/`)) { out.push(value); continue; }
    if (base && value.startsWith(`${base}/photos/${ownerId}/`)) { out.push(value); continue; }
  }
  return [...new Set(out)].slice(0, 8);
}
/** Keys the given member owns: their profile photos, ID documents, and sent chat media. */
function ownedMediaKeys(uid: string, keys: unknown[]): string[] {
  return keys.filter((key): key is string =>
    isStorageKey(key) &&
    (key.startsWith(`photos/${uid}/`) || key.startsWith(`verification/${uid}/`) || key.startsWith(`chat/${uid}/`))
  );
}
async function presignedGet(key: string) {
  const client = await s3Client(), bucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET');
  if (!client || !bucket) return null;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 300 });
}
async function deleteStorageKeys(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(isStorageKey))];
  if (!unique.length) return;
  const client = await s3Client(), privateBucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET'), publicBucket = Deno.env.get('R2_PUBLIC_BUCKET');
  if (!client) throw new Error('Object storage is not configured.');
  const groups = new Map<string, string[]>();
  for (const key of unique) {
    const bucket = key.startsWith('photos/') ? publicBucket : privateBucket;
    if (!bucket) throw new Error('Object storage bucket is not configured.');
    groups.set(bucket, [...(groups.get(bucket) || []), key]);
  }
  for (const [bucket, bucketKeys] of groups) {
    for (let i = 0; i < bucketKeys.length; i += 1000) {
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: bucketKeys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
      if (result.Errors?.length) throw new Error('Some account media could not be deleted.');
    }
  }
}
async function deleteStoragePrefix(prefix: string, bucket: string): Promise<void> {
  const client = await s3Client();
  if (!client) throw new Error('Object storage is not configured.');
  let continuationToken: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }));
    const keys = (page.Contents || []).flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
    if (keys.length) {
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
      if (result.Errors?.length) throw new Error('Some member media could not be deleted.');
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

// Shared media purge for account deletion (admin sanction path; the member
// self-delete path keeps its own inline copy with more specific messaging).
type MediaPurgeResult = 'ok' | 'failed' | 'no_storage';
async function purgeAccountMedia(db: ReturnType<typeof createClient>, p: Row): Promise<MediaPurgeResult> {
  const uid = p.id as string;
  const client = await s3Client();
  const [{ data: matches }, { data: submissions }] = await Promise.all([
    db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`),
    db.from('verification_submissions').select('id_doc_url,selfie_url').eq('user_id', uid)
  ]);
  const matchIds = (matches || []).map((m: Row) => m.id);
  // Only media this member sent. Chat photos live under chat/<sender-id>/, so
  // selecting every message in the thread would delete the partner's photos.
  const { data: messages } = matchIds.length
    ? await db.from('messages').select('media_url').in('match_id', matchIds).eq('sender_id', uid)
    : { data: [] as Row[] };
  const keys = ownedMediaKeys(uid, [
    ...(messages || []).map((m: Row) => m.media_url),
    ...(submissions || []).flatMap((s: Row) => [s.id_doc_url, s.selfie_url])
  ]);
  if (!client) return ((p.photos || []).length > 0 || keys.length > 0) ? 'no_storage' : 'ok';
  try {
    if (keys.length) await deleteStorageKeys(keys);
    const privateBucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET');
    const publicBucket = Deno.env.get('R2_PUBLIC_BUCKET');
    if (!privateBucket || !publicBucket) throw new Error('Object storage buckets are not configured.');
    await deleteStoragePrefix(`photos/${uid}/`, publicBucket);
    await deleteStoragePrefix(`verification/${uid}/`, privateBucket);
    await deleteStoragePrefix(`chat/${uid}/`, privateBucket);
    return 'ok';
  } catch {
    return 'failed';
  }
}

// Constant-time string compare so a signature guess leaks no timing information.
function signatureMatches(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(algorithm: 'SHA-256' | 'SHA-512', keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  // `Uint8Array<ArrayBufferLike>` narrows to `BufferSource` only after the
  // SharedArrayBuffer branch is excluded; the value is always plain bytes here.
  const key = await crypto.subtle.importKey('raw', keyBytes as unknown as BufferSource, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const encoder = new TextEncoder();

/**
 * Paystack accepts two webhook signature schemes:
 * - legacy `x-paystack-signature`: hex HMAC-SHA512 of the raw body, keyed with the
 *   secret key (and, once a signing secret exists, with that secret).
 * - Standard Webhooks (`webhook-id` / `webhook-timestamp` / `webhook-signature`):
 *   base64 HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed with the base64
 *   decoded `whsec_` signing secret. Newer dashboards activate this scheme, so
 *   both are accepted and either must match.
 */
async function verifyPaystackWebhookSignature(raw: string, headers: Headers): Promise<boolean> {
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') || '';
  const signingSecret = (Deno.env.get('PAYSTACK_WEBHOOK_SECRET') || '').replace(/^whsec_/, '');
  const legacy = headers.get('x-paystack-signature') || '';

  if (legacy) {
    for (const secret of [secretKey, signingSecret].filter(Boolean)) {
      const expected = toHex(await hmac('SHA-512', encoder.encode(secret), raw));
      if (signatureMatches(expected, legacy)) return true;
    }
  }

  const standard = headers.get('webhook-signature') || '';
  const id = headers.get('webhook-id') || '';
  const timestamp = headers.get('webhook-timestamp') || '';
  if (standard && id && timestamp && signingSecret) {
    // Reject stale deliveries (replay window).
    const skew = Math.abs(Date.now() / 1000 - Number(timestamp || '0'));
    if (!Number.isFinite(skew) || skew > 300) return false;
    let keyBytes: Uint8Array;
    try { keyBytes = Uint8Array.from(atob(signingSecret), (c) => c.charCodeAt(0)); }
    catch { keyBytes = encoder.encode(signingSecret); }
    const expected = toBase64(await hmac('SHA-256', keyBytes, `${id}.${timestamp}.${raw}`));
    for (const candidate of standard.split(' ')) {
      const value = candidate.includes(',') ? candidate.slice(candidate.indexOf(',') + 1) : candidate;
      if (signatureMatches(expected, value)) return true;
    }
  }

  return false;
}

async function handlePaystackWebhook(req: Request): Promise<Response> {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('Invalid webhook signature', { status: 401 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response('Payload too large', { status: 413 });
  if (!(await verifyPaystackWebhookSignature(raw, req.headers))) return new Response('Invalid webhook signature', { status: 401 });
  let event: Row; try { event = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (event.event === 'charge.success' && event.data?.status === 'success' && event.data?.reference) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !service) return new Response('Server configuration error', { status: 503 });
    const db = createClient(supabaseUrl, service, { auth: { persistSession: false } });
    const { data: payment } = await db.from('payments').select('*').eq('reference', event.data.reference).maybeSingle();
    if (payment && payment.status === 'pending') {
      const verified = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(payment.reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
      const result = await verified.json().catch(() => ({}));
      if (!verified.ok || !result.status || result.data?.status !== 'success' || Number(result.data?.amount) !== payment.amount_kobo || result.data?.currency !== payment.currency) return new Response('Payment verification failed', { status: 400 });
      const { error: fulfillmentError } = await db.rpc('wassaa_fulfill_payment', { p_reference: payment.reference, p_channel: cleanString(result.data.channel, 40) || 'paystack' });
      if (fulfillmentError) return new Response('Payment fulfillment failed', { status: 500 });
    }
  }
  return Response.json({ received: true });
}

async function adminRoute(db: ReturnType<typeof createClient>, user: Row, path: string, req: Request, origin: string | null): Promise<Response> {
  const { data: admin } = await db.from('wassaa_admin_users').select('display_name').eq('user_id', user.id).maybeSingle();
  if (!admin) return err('Admin access is not enabled for this account.', 403, origin);
  // Audit rows name the operator by display name. Declared here because the
  // routes below use it before the older handlers that also log actions.
  const actor = cleanString(admin.display_name, 60) || user.id;
  if (path === '/admin/session' && req.method === 'GET') return json({ ok: true, storage: Boolean(await s3Client()) }, 200, origin);
  // One call powers the console header: every queue that needs a human, plus
  // persona and paid-member counts.
  if (path === '/admin/overview' && req.method === 'GET') {
    const countOf = async (table: string, build?: (q: any) => any) => {
      let q = db.from(table).select('id', { count: 'exact', head: true });
      if (build) q = build(q);
      const { count } = await q;
      return count ?? 0;
    };
    const [pendingVerifications, openReports, pendingAppeals, adminOwnedThreads, personas, activePersonas, curatedPersonas] = await Promise.all([
      countOf('verification_submissions', (q) => q.eq('status', 'pending')),
      countOf('reports', (q) => q.in('status', ['pending_review', 'investigating'])),
      countOf('appeals', (q) => q.eq('status', 'pending')),
      countOf('matches', (q) => q.eq('auto_state', 'admin_owned')),
      countOf('profiles', (q) => q.eq('is_npc', true)),
      countOf('profiles', (q) => q.eq('is_npc', true).eq('npc_active', true)),
      countOf('profiles', (q) => q.eq('is_npc', true).eq('npc->>curated', 'true')),
    ]);
    const { data: paidRows } = await db.rpc('wassaa_admin_paid_members');
    return json({ pendingVerifications, openReports, pendingAppeals, adminOwnedThreads, personas, activePersonas, curatedPersonas, paidMembers: (paidRows || []).length }, 200, origin);
  }

  // The console bell: the same queues the overview counts, plus who is waiting
  // and what just landed. Derived from live tables, so it cannot drift.
  if (path === '/admin/activity' && req.method === 'GET') {
    const countOf = async (table: string, build?: (q: any) => any) => {
      let q = db.from(table).select('id', { count: 'exact', head: true });
      if (build) q = build(q);
      const { count } = await q;
      return count ?? 0;
    };
    const [verifications, reports, appeals, members, pendingVerifications, openReports, pendingAppeals] = await Promise.all([
      db.from('verification_submissions').select('id,user_id,status,submitted_at').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(8),
      db.from('reports').select('id,reporter_id,reported_user_id,category_label,status,created_at').in('status', ['pending_review', 'investigating']).order('created_at', { ascending: false }).limit(8),
      db.from('appeals').select('id,profile_id,status,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(8),
      db.from('profiles').select('id,name,photos,created_at,verification_status').eq('is_npc', false).is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
      countOf('verification_submissions', (q) => q.eq('status', 'pending')),
      countOf('reports', (q) => q.in('status', ['pending_review', 'investigating'])),
      countOf('appeals', (q) => q.eq('status', 'pending')),
    ]);

    const ids = new Set<string>();
    for (const r of verifications.data || []) ids.add(r.user_id);
    for (const r of reports.data || []) { ids.add(r.reporter_id); ids.add(r.reported_user_id); }
    for (const r of appeals.data || []) ids.add(r.profile_id);
    for (const r of members.data || []) ids.add(r.id);
    const names = new Map<string, string>();
    if (ids.size) {
      const { data: people } = await db.from('profiles').select('id,name').in('id', [...ids]);
      for (const p of people || []) names.set(p.id, String(p.name || 'Member'));
    }

    return json({
      counts: { verifications: pendingVerifications, reports: openReports, appeals: pendingAppeals },
      verifications: (verifications.data || []).map((v: Row) => ({
        id: v.id, tab: 'verifications', at: v.submitted_at,
        title: names.get(v.user_id) || 'Member', detail: 'ID verification waiting'
      })),
      reports: (reports.data || []).map((r: Row) => ({
        id: r.id, tab: 'reports', at: r.created_at,
        title: names.get(r.reported_user_id) || 'Member',
        detail: `${r.category_label || 'Safety report'} — reported by ${names.get(r.reporter_id) || 'a member'}`
      })),
      appeals: (appeals.data || []).map((a: Row) => ({
        id: a.id, tab: 'appeals', at: a.created_at,
        title: names.get(a.profile_id) || 'Member', detail: 'Appeal waiting for a decision'
      })),
      newMembers: (members.data || []).map((m: Row) => ({
        id: m.id, at: m.created_at,
        title: String(m.name || 'Member'),
        detail: m.verification_status === 'verified' ? 'Verified member joined' : 'New member joined'
      }))
    }, 200, origin);
  }

  // Staff can send a one-off notification to a member (outage, nudge, apology).
  if (path === '/admin/notifications/deliver' && req.method === 'POST') {
    const body = await bodyJson(req);
    const recipientId = cleanString(body.recipientId, 40);
    if (!isUuid(recipientId)) return err('Choose the member to notify.', 400, origin);
    const kind = cleanString(body.kind, 20) || 'system';
    if (!['match', 'message', 'like', 'system'].includes(kind)) return err('kind must be match, message, like or system.', 400, origin);
    const text = cleanString(body.text || body.messagePreview, 300);
    if (!text) return err('Write the notification text.', 400, origin);
    const threadId = isUuid(body.threadId) ? body.threadId : null;
    const { data: target } = await db.from('profiles').select('id').eq('id', recipientId).maybeSingle();
    if (!target) return err('That member does not exist.', 404, origin);
    const { error } = await db.from('notification_events').insert({
      user_id: recipientId,
      kind,
      thread_id: threadId,
      actor_id: null,
      message_preview: text,
      acknowledgement_required: Boolean(body.acknowledgementRequired)
    });
    if (error) return err('Could not deliver the notification.', 500, origin);
    await db.from('admin_audit').insert({
      admin_id: actor,
      action: 'notification.delivered',
      target_id: recipientId,
      detail: { kind, threadId, preview: text.slice(0, 80) }
    });
    return json({ success: true }, 200, origin);
  }
  const idMatch = path.match(/^\/admin\/verifications\/([0-9a-f-]+)\/review$/i);
  const reportMatch = path.match(/^\/admin\/reports\/([0-9a-f-]+)\/status$/i);
  const reportContextMatch = path.match(/^\/admin\/reports\/([0-9a-f-]+)\/context$/i);
  const blockMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)\/block$/i);
  const sanctionMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)\/sanction$/i);
  const userDetailMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)$/i);
  const appealDecisionMatch = path.match(/^\/admin\/appeals\/(\d+)\/decision$/i);
  const npcOneMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)$/i);
  const npcPresignMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)\/photo-presign$/i);
  const npcPhotosMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)\/photos$/i);
  const npcScriptsMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)\/scripts$/i);
  const npcScriptOneMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)\/scripts\/([0-9a-f-]+)$/i);
  const npcQuarantineMatch = path.match(/^\/admin\/npcs\/([0-9a-f-]+)\/quarantine$/i);
  const threadMessagesMatch = path.match(/^\/admin\/threads\/([0-9a-f-]+)\/messages$/i);
  if (path === '/admin/verifications' && req.method === 'GET') {
    const { data: queue, error } = await db.from('verification_submissions').select('*').eq('status', 'pending').order('submitted_at', { ascending: true }).limit(200);
    if (error) return err('Could not load verification queue.', 500, origin);
    const userIds = [...new Set((queue || []).map((s: Row) => s.user_id))];
    const { data: profiles } = userIds.length ? await db.from('profiles').select('id,name,birth_date,gender,phone,city,state,profession_title,profession_category,verification_status,photos,country_code,region_attested_code').in('id', userIds) : { data: [] as Row[] };
    const byId = new Map<string, Row>((profiles || []).map((p: Row): [string, Row] => [p.id, p]));
    return json({ queue: await Promise.all((queue || []).map(async (s: Row) => {
      const getMedia = async (key: string | null) => {
        if (!key) return null;
        if (!isStorageKey(key)) return key;
        return await presignedGet(key);
      };
      const p = byId.get(s.user_id);
      return { id: s.id, submittedAt: s.submitted_at, documentType: s.document_type, documentNumberMasked: s.document_number_masked,
        idDocUrl: await getMedia(s.id_doc_url), selfieUrl: await getMedia(s.selfie_url),
        profile: p ? { id: p.id, name: p.name, birthDate: p.birth_date, age: ageOf(p.birth_date), gender: p.gender, phone: p.phone, city: p.city, state: p.state, professionTitle: p.profession_title, professionCategory: p.profession_category, verificationStatus: p.verification_status, photos: p.photos, countryCode: p.country_code, regionAttestedCode: p.region_attested_code } : null };
    })), storage: Boolean(await s3Client()) }, 200, origin);
  }
  if (idMatch && req.method === 'POST') {
    const b = await bodyJson(req);
    // Privileged decisions are parsed strictly: Boolean("false") is true, so a
    // stringified rejection used to approve the submission instead.
    if (typeof b.approve !== 'boolean') return err('approve must be true or false.', 400, origin);
    const approve = b.approve, note = cleanString(b.note, 500) || null;
    const { data: sub } = await db.from('verification_submissions').select('*').eq('id', idMatch[1]).maybeSingle();
    if (!sub) return err('Submission not found.', 404, origin);
    if (sub.status !== 'pending') return err('This submission has already been reviewed.', 409, origin);
    // Identity documents are RETAINED in the private bucket (short-lived signed
    // URLs are the only way out) so reviewers can re-check face-vs-ID when this
    // account is later reported (KB §18B). Only the owner prefix is validated.
    const mediaKeys = [sub.id_doc_url, sub.selfie_url].filter((key: unknown): key is string => isStorageKey(key));
    if (mediaKeys.some((key) => !key.startsWith(`verification/${sub.user_id}/`))) return err('Verification media ownership check failed.', 403, origin);
    const now = new Date().toISOString();
    const { data: resolved, error } = await db.from('verification_submissions').update({ status: approve ? 'verified' : 'rejected', reviewed_at: now, reviewed_by: actor, review_note: note }).eq('id', idMatch[1]).eq('status', 'pending').select('*').maybeSingle();
    if (error) return err('Could not resolve verification.', 500, origin);
    if (!resolved) return err('This submission has already been reviewed.', 409, origin);
    // Approving also attests the country the reviewer saw. Free chat requires
    // region_attested_code = country_code, so a later self-service country edit
    // invalidates the grant until the member is reviewed again.
    const { data: reviewedProfile } = await db.from('profiles').select('country_code').eq('id', sub.user_id).maybeSingle();
    const { error: profileError } = await db.from('profiles').update({
      verification_status: approve ? 'verified' : 'rejected',
      verified_at: approve ? now.slice(0, 10) : null,
      region_attested_at: approve ? now : null,
      region_attested_code: approve ? (reviewedProfile?.country_code || null) : null,
      updated_at: now
    }).eq('id', sub.user_id);
    if (profileError) {
      // The submission is already marked reviewed; without this compensation
      // the member's status would stay pending forever and the admin could not
      // re-review it (409). Put it back in the queue.
      await db.from('verification_submissions').update({ status: 'pending', reviewed_at: null, reviewed_by: null, review_note: null }).eq('id', resolved.id);
      return err('Could not apply the verification decision. Nothing changed; retry.', 500, origin);
    }
    await db.from('admin_audit').insert({ admin_id: actor, action: approve ? 'verification.approved' : 'verification.rejected', target_id: resolved.id, detail: { userId: sub.user_id, note, regionAttested: approve ? reviewedProfile?.country_code || null : null } });
    const { data: p } = await db.from('profiles').select('id,name,verification_status').eq('id', sub.user_id).maybeSingle();
    return json({ success: true, submission: { id: resolved.id, status: resolved.status, reviewedAt: resolved.reviewed_at }, user: p }, 200, origin);
  }
  if (path === '/admin/reports' && req.method === 'GET') {
    const status = reqUrl(req).searchParams.get('status') || 'all';
    let q = db.from('reports').select('*').order('created_at', { ascending: false }).limit(200);
    if (['pending_review','investigating','resolved','dismissed'].includes(status)) q = q.eq('status', status);
    const { data: reports, error } = await q;
    if (error) return err('Could not load reports.', 500, origin);
    const ids = [...new Set((reports || []).flatMap((r: Row) => [r.reporter_id, r.reported_user_id]).filter(Boolean))];
    const { data: profiles } = ids.length ? await db.from('profiles').select('id,name,blocked_us,account_status,verification_status').in('id', ids) : { data: [] as Row[] };
    const byId = new Map<string, Row>((profiles || []).map((p: Row): [string, Row] => [p.id, p]));
    return json({ reports: (reports || []).map((r: Row) => ({ ...reportRow(r), reporter: byId.get(r.reporter_id) ? { id: r.reporter_id, name: byId.get(r.reporter_id).name } : null, reported: byId.get(r.reported_user_id) ? { id: r.reported_user_id, name: byId.get(r.reported_user_id).name, blocked: accountStatusOf(byId.get(r.reported_user_id)) === 'banned', verificationStatus: byId.get(r.reported_user_id).verification_status } : null })) }, 200, origin);
  }
  if (reportMatch && req.method === 'POST') {
    const b = await bodyJson(req), status = String(b.status);
    if (!['pending_review','investigating','resolved','dismissed'].includes(status)) return err('Invalid report status.', 400, origin);
    const patch: Row = { status };
    if (b.reviewNote !== undefined) { patch.review_note = cleanString(b.reviewNote, 1000) || null; patch.reviewed_at = new Date().toISOString(); }
    const { data: report, error } = await db.from('reports').update(patch).eq('id', reportMatch[1]).select('*').maybeSingle();
    if (error) return err('Could not update report.', 500, origin);
    if (!report) return err('Report not found.', 404, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'report.status', target_id: report.id, detail: { status, reviewNote: patch.review_note || undefined } });
    return json({ success: true, report: reportRow(report) }, 200, origin);
  }
  if (blockMatch && req.method === 'POST') {
    const b = await bodyJson(req);
    if (typeof b.blocked !== 'boolean') return err('blocked must be true or false.', 400, origin);
    const blocked = b.blocked;
    const reason = cleanString(b.reason, 500) || 'Blocked by staff after a report review.';
    const { data: target } = await db.from('profiles').select('id,name,account_status').eq('id', blockMatch[1]).maybeSingle();
    if (!target) return err('Profile not found.', 404, origin);
    const now = new Date().toISOString();
    // `blocked_us` is the historical flag the deck and the report queue read;
    // keep it and the sanction field in lockstep so "Block" and "Ban" are one
    // state instead of two half-states that disagree.
    const patch: Row = blocked
      ? { blocked_us: true, account_status: 'banned', restriction_reason: reason, restricted_at: now, restricted_by: actor, updated_at: now }
      : { blocked_us: false, account_status: 'active', restriction_reason: null, restricted_at: null, restricted_by: null, updated_at: now };
    const { error } = await db.from('profiles').update(patch).eq('id', target.id);
    if (error) return err('Could not update the block.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: blocked ? 'user.blocked' : 'user.unblocked', target_id: target.id, detail: { reason: blocked ? reason : null } });
    return json({ success: true, user: { id: target.id, name: target.name, blocked, accountStatus: blocked ? 'banned' : 'active' } }, 200, origin);
  }
  if (path === '/admin/audit' && req.method === 'GET') {
    const limit = Math.min(200, Math.max(1, Number(reqUrl(req).searchParams.get('limit')) || 50));
    const { data, error } = await db.from('admin_audit').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) return err('Could not load audit history.', 500, origin);
    return json({ actions: (data || []).map((r: Row) => ({ id: String(r.id), adminId: r.admin_id, action: r.action, targetId: r.target_id || undefined, detail: r.detail || undefined, createdAt: r.created_at })) }, 200, origin);
  }
  // ---- Full account view: everything a reviewer needs to judge a report ----
  if (userDetailMatch && req.method === 'GET') {
    const { data: p } = await db.from('profiles').select('*').eq('id', userDetailMatch[1]).maybeSingle();
    if (!p) return err('Profile not found.', 404, origin);
    const [{ data: subs }, { data: reports }, { data: appeals }, matchCountResult] = await Promise.all([
      db.from('verification_submissions').select('*').eq('user_id', p.id).order('submitted_at', { ascending: false }).limit(10),
      db.from('reports').select('*').or(`reported_user_id.eq.${p.id},reporter_id.eq.${p.id}`).order('created_at', { ascending: false }).limit(50),
      db.from('appeals').select('*').eq('profile_id', p.id).order('created_at', { ascending: false }).limit(10),
      db.from('matches').select('id', { count: 'exact', head: true }).or(`user_a.eq.${p.id},user_b.eq.${p.id}`)
    ]);
    const getMedia = async (key: string | null) => (!key ? null : !isStorageKey(key) ? key : await presignedGet(key));
    const verification = await Promise.all((subs || []).map(async (s: Row) => ({
      id: s.id, status: s.status, documentType: s.document_type, documentNumberMasked: s.document_number_masked,
      submittedAt: s.submitted_at, reviewedAt: s.reviewed_at, reviewNote: s.review_note,
      idDocUrl: await getMedia(s.id_doc_url), selfieUrl: await getMedia(s.selfie_url)
    })));
    return json({
      user: { ...p },
      verification,
      reports: (reports || []).map((r: Row) => reportRow(r)),
      appeals: (appeals || []).map((a: Row) => ({ id: a.id, status: a.status, note: a.note, sanctionReason: a.sanction_reason, createdAt: a.created_at, decidedAt: a.decided_at, decisionNote: a.decision_note })),
      stats: { matches: matchCountResult.count ?? 0 }
    }, 200, origin);
  }
  // ---- Restrict / ban / lift / delete, always with a stored reason ----
  if (sanctionMatch && req.method === 'POST') {
    const b = await bodyJson(req), action = String(b.action || '');
    if (!['restrict','ban','lift','delete'].includes(action)) return err('action must be restrict, ban, lift or delete.', 400, origin);
    const reason = cleanString(b.reason, 500);
    if ((action === 'restrict' || action === 'ban') && reason.length < 5) return err('A reason (at least 5 characters) is required to restrict or ban an account.', 400, origin);
    const { data: target } = await db.from('profiles').select('*').eq('id', sanctionMatch[1]).maybeSingle();
    if (!target) return err('Profile not found.', 404, origin);
    if (action === 'delete') {
      const purge = await purgeAccountMedia(db, target);
      if (purge !== 'ok') return err('Account media could not be securely deleted; nothing was removed. Retry.', 502, origin);
      const { error: reportRedactionError } = await db.from('reports').update({ reported_user_id: null, details: '[Report subject account deleted]', service_branch: null }).eq('reported_user_id', target.id);
      if (reportRedactionError) return err('Account could not be deleted.', 500, origin);
      await db.from('admin_audit').insert({ admin_id: actor, action: 'user.deleted', target_id: target.id, detail: { reason: reason || null } });
      await db.rpc('wassaa_anonymize_admin_audit', { p_user: target.id });
      const { error: deleteError } = await db.from('profiles').delete().eq('id', target.id);
      if (deleteError) return err('Account could not be deleted.', 500, origin);
      if (target.auth_user_id) { try { await db.auth.admin.deleteUser(target.auth_user_id); } catch { /* profile already gone */ } }
      return json({ success: true, action }, 200, origin);
    }
    const now = new Date().toISOString();
    // Restrictions and bans are different rungs, not independent flags. A
    // "restrict" on a banned account used to silently widen access to
    // read-only; require an explicit lift first.
    if (action === 'restrict' && accountStatusOf(target) === 'banned') {
      return err('This account is banned. Lift the ban before applying a restriction.', 409, origin);
    }
    const patch: Row = action === 'lift'
      ? { blocked_us: false, account_status: 'active', restriction_reason: null, restricted_at: null, restricted_by: null, updated_at: now }
      : {
          // `blocked_us` stays in lockstep with the sanction so both the deck
          // and the report queue read the same standing.
          blocked_us: action === 'ban',
          account_status: action === 'ban' ? 'banned' : 'restricted',
          restriction_reason: reason,
          restricted_at: now,
          restricted_by: actor,
          updated_at: now
        };
    const { data: updated, error } = await db.from('profiles').update(patch).eq('id', target.id).select('id,account_status').maybeSingle();
    if (error || !updated) return err('Could not apply the account action.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: `user.${action}`, target_id: target.id, detail: { reason: reason || null } });
    return json({ success: true, action, accountStatus: updated.account_status }, 200, origin);
  }
  // ---- Report review context: full accounts + face-vs-ID + complete DM history ----
  if (reportContextMatch && req.method === 'GET') {
    const { data: report } = await db.from('reports').select('*').eq('id', reportContextMatch[1]).maybeSingle();
    if (!report) return err('Report not found.', 404, origin);
    const reporterResult = report.reporter_id ? await db.from('profiles').select('*').eq('id', report.reporter_id).maybeSingle() : { data: null };
    const reportedResult = report.reported_user_id ? await db.from('profiles').select('*').eq('id', report.reported_user_id).maybeSingle() : { data: null };
    const reported = reportedResult.data as Row | null;
    let verification: Row[] = [];
    if (reported) {
      const { data: subs } = await db.from('verification_submissions').select('*').eq('user_id', reported.id).order('submitted_at', { ascending: false }).limit(3);
      verification = await Promise.all((subs || []).map(async (s: Row) => ({
        id: s.id, status: s.status, documentType: s.document_type, documentNumberMasked: s.document_number_masked, submittedAt: s.submitted_at,
        idDocUrl: s.id_doc_url && isStorageKey(s.id_doc_url) ? await presignedGet(s.id_doc_url) : null,
        selfieUrl: s.selfie_url && isStorageKey(s.selfie_url) ? await presignedGet(s.selfie_url) : null
      })));
    }
    let matchId: string | null = report.match_id || null;
    if (!matchId && report.message_id) {
      const { data: m } = await db.from('messages').select('match_id').eq('id', report.message_id).maybeSingle();
      matchId = m?.match_id || null;
    }
    if (!matchId && report.reporter_id && report.reported_user_id) {
      const { data: m } = await db.from('matches').select('id')
        .or(`and(user_a.eq.${report.reporter_id},user_b.eq.${report.reported_user_id}),and(user_a.eq.${report.reported_user_id},user_b.eq.${report.reporter_id})`).maybeSingle();
      matchId = m?.id || null;
    }
    let conversation: Row[] = [];
    if (matchId) {
      const { data: msgs } = await db.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(500);
      conversation = await Promise.all((msgs || []).map(async (m: Row) => {
        const row = messageRow(m);
        if (m.kind === 'photo' && isStorageKey(m.media_url)) row.mediaUrl = await presignedGet(m.media_url) || undefined;
        return { ...row, flagged: Boolean(report.message_id) && m.id === report.message_id };
      }));
    }
    const shape = (p: Row | null) => p ? ({
      id: p.id, name: p.name, birthDate: p.birth_date, age: ageOf(p.birth_date), gender: p.gender, city: p.city, state: p.state,
      professionCategory: p.profession_category, professionTitle: p.profession_title, classOfService: p.class_of_service,
      orgRole: p.org_role, skill: p.skill, service: p.service, photos: p.photos, interests: p.interests, bio: p.bio,
      email: p.email, phone: p.phone, verificationStatus: p.verification_status, verifiedAt: p.verified_at,
      accountStatus: accountStatusOf(p), restrictionReason: p.restriction_reason || undefined,
      blockedUs: p.blocked_us, isNpc: Boolean(p.is_npc), credits: p.credits ?? 0, createdAt: p.created_at
    }) : null;
    return json({
      report: reportRow(report),
      reporter: shape(reporterResult.data as Row | null),
      reported: shape(reported),
      verification,
      conversation: { matchId: matchId || undefined, messages: conversation, reportedMessageId: report.message_id || undefined }
    }, 200, origin);
  }
  // ---- Appeals: pending queue + decisions (grant reinstates the account) ----
  if (path === '/admin/appeals' && req.method === 'GET') {
    const status = reqUrl(req).searchParams.get('status') || 'pending';
    let q = db.from('appeals').select('*').order('created_at', { ascending: false }).limit(200);
    if (['pending','granted','denied'].includes(status)) q = q.eq('status', status);
    const { data: appeals, error } = await q;
    if (error) return err('Could not load appeals.', 500, origin);
    const ids = [...new Set((appeals || []).map((a: Row) => a.profile_id))];
    const { data: profiles } = ids.length ? await db.from('profiles').select('id,name,blocked_us,account_status,restriction_reason,verification_status,photos,created_at').in('id', ids) : { data: [] as Row[] };
    const byId = new Map<string, Row>((profiles || []).map((p: Row): [string, Row] => [p.id, p]));
    return json({ appeals: (appeals || []).map((a: Row) => {
      const p = byId.get(a.profile_id);
      return { id: a.id, status: a.status, note: a.note, sanctionReason: a.sanction_reason, decisionNote: a.decision_note,
        decidedBy: a.decided_by, decidedAt: a.decided_at, createdAt: a.created_at,
        profile: p ? { id: p.id, name: p.name, accountStatus: accountStatusOf(p), restrictionReason: p.restriction_reason, verificationStatus: p.verification_status, photos: p.photos, createdAt: p.created_at } : null };
    }) }, 200, origin);
  }
  if (appealDecisionMatch && req.method === 'POST') {
    const b = await bodyJson(req);
    if (typeof b.grant !== 'boolean') return err('grant must be true or false.', 400, origin);
    const grant = b.grant, note = cleanString(b.note, 500) || null;
    const { data: appeal } = await db.from('appeals').select('*').eq('id', Number(appealDecisionMatch[1])).maybeSingle();
    if (!appeal) return err('Appeal not found.', 404, origin);
    if (appeal.status !== 'pending') return err('This appeal has already been decided.', 409, origin);
    const now = new Date().toISOString();
    const { error } = await db.from('appeals').update({ status: grant ? 'granted' : 'denied', decision_note: note, decided_by: actor, decided_at: now }).eq('id', appeal.id);
    if (error) return err('Could not record the appeal decision.', 500, origin);
    if (grant) {
      // Clearing only `account_status` left legacy `blocked_us` rows locked
      // out even after a granted appeal. Reinstate both, and keep the appeal
      // pending if the profile write fails so the queue cannot lose it.
      const { error: restoreError } = await db.from('profiles').update({ blocked_us: false, account_status: 'active', restriction_reason: null, restricted_at: null, restricted_by: null, updated_at: now }).eq('id', appeal.profile_id);
      if (restoreError) {
        await db.from('appeals').update({ status: 'pending', decision_note: null, decided_by: null, decided_at: null }).eq('id', appeal.id);
        return err('The account could not be reinstated; the appeal is still pending. Retry.', 500, origin);
      }
    }
    await db.from('admin_audit').insert({ admin_id: actor, action: grant ? 'appeal.granted' : 'appeal.denied', target_id: appeal.profile_id, detail: { appealId: appeal.id, note } });
    return json({ success: true, status: grant ? 'granted' : 'denied' }, 200, origin);
  }
  // ---- NPC threads: monitor + send as the NPC (staff-operated conversations) ----
  if (path === '/admin/threads' && req.method === 'GET') {
    const params = reqUrl(req).searchParams;
    const state = params.get('state') || '';
    const onlyPaid = params.get('paid') === '1';
    let q = db.from('matches').select('*').order('created_at', { ascending: false }).limit(200);
    if (['none','active','quiet','admin_owned'].includes(state)) q = q.eq('auto_state', state);
    const { data: matches, error } = await q;
    if (error) return err('Could not load threads.', 500, origin);
    const sideIds = [...new Set((matches || []).flatMap((m: Row) => [m.user_a, m.user_b]))];
    const profiles = new Map<string, Row>();
    for (let i = 0; i < sideIds.length; i += 100) {
      const { data } = await db.from('profiles').select('id,name,is_npc,npc_active,deleted_at,country_code,verification_status').in('id', sideIds.slice(i, i + 100));
      for (const p of data || []) profiles.set(p.id, p);
    }
    // Paying members are the owner's priority: their persona threads sort first.
    const { data: paidRows } = await db.rpc('wassaa_admin_paid_members');
    const paid = new Map<string, Row>((paidRows || []).map((r: Row) => [String(r.profile_id), r]));
    let threads = (matches || []).flatMap((m: Row) => {
      const a = profiles.get(m.user_a), b = profiles.get(m.user_b);
      const npc = a?.is_npc ? a : b?.is_npc ? b : null;
      if (!npc) return [];
      const member = npc.id === m.user_a ? b : a;
      if (!member) return [];
      const pay = paid.get(member.id);
      return [{ id: m.id, autoState: m.auto_state, takenOverBy: m.taken_over_by || undefined, createdAt: m.created_at,
        autoSpent: m.auto_spent || 0, lastMessageAt: m.last_message_at || m.created_at,
        paid: Boolean(pay), purchasedAt: pay?.purchased_at || undefined, creditsBought: Number(pay?.credits_bought || 0),
        member: { id: member.id, name: member.name, countryCode: member.country_code || 'NG', verified: member.verification_status === 'verified' },
        npc: { id: npc.id, name: npc.name } }];
    });
    if (onlyPaid) threads = threads.filter((t) => t.paid);
    threads.sort((x, y) => (Number(y.paid) - Number(x.paid)) || (Date.parse(y.lastMessageAt) - Date.parse(x.lastMessageAt)));
    return json({ threads, paidCount: threads.filter((t) => t.paid).length }, 200, origin);
  }
  if (threadMessagesMatch && (req.method === 'GET' || req.method === 'POST')) {
    const matchId = threadMessagesMatch[1];
    const { data: match } = await db.from('matches').select('*').eq('id', matchId).maybeSingle();
    if (!match) return err('Thread not found.', 404, origin);
    const { data: sides } = await db.from('profiles').select('id,name,is_npc,deleted_at').in('id', [match.user_a, match.user_b]);
    const npc = (sides || []).find((p: Row) => p.is_npc && !p.deleted_at);
    const member = (sides || []).find((p: Row) => p.id !== npc?.id);
    if (!npc) return err('This thread has no NPC participant.', 409, origin);
    if (req.method === 'GET') {
      const since = reqUrl(req).searchParams.get('since');
      let q = db.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(500);
      if (since && !Number.isNaN(Date.parse(since))) q = q.gt('created_at', new Date(since).toISOString());
      const { data: msgs, error } = await q;
      if (error) return err('Could not load messages.', 500, origin);
      return json({
        messages: await Promise.all((msgs || []).map(async (m: Row) => {
          if (m.kind === 'photo' && isStorageKey(m.media_url)) return { ...messageRow(m), mediaUrl: await presignedGet(m.media_url) || undefined };
          return messageRow(m);
        })),
        npc: { id: npc.id, name: npc.name }, member: member ? { id: member.id, name: member.name } : null, autoState: match.auto_state
      }, 200, origin);
    }
    const b = await bodyJson(req), text = cleanString(b.text, 4000);
    if (!text.trim()) return err('Message body required.', 400, origin);
    const { data: msg, error } = await db.from('messages').insert({ match_id: matchId, sender_id: npc.id, kind: 'text', text }).select('*').single();
    if (error) return err('Could not send message.', 500, origin);
    return json({ success: true, message: messageRow(msg) }, 200, origin);
  }
  // ---- NPC manager: list, edit persona, replace photos ----
  if (path === '/admin/npcs' && req.method === 'GET') {
    const params = reqUrl(req).searchParams;
    const search = (params.get('search') || '').trim();
    const country = (params.get('country') || '').trim().toUpperCase();
    const cls = (params.get('class') || '').trim();
    const service = (params.get('service') || '').trim();
    const gender = (params.get('gender') || '').trim();
    const active = (params.get('active') || '').trim();
    const review = (params.get('review') || '').trim();
    const limit = Math.min(200, Math.max(20, Number(params.get('limit')) || 60));
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    let q = db.from('profiles').select('id,name,birth_date,gender,pronouns,company_or_org,duty_station,education_level,alma_mater,city,state,country_code,profession_category,profession_title,service,org_role,skill,class_of_service,bio,photos,interests,dating_goal,prompts,lifestyle,values_family,verification_status,npc_active,npc_ai_enabled,npc_photo_review,npc_quarantine_reason,npc,created_at', { count: 'exact' })
      .eq('is_npc', true);
    if (search) q = q.ilike('name', `%${search.replace(/[%_]/g, '')}%`);
    if (/^[A-Z]{2}$/.test(country)) q = q.eq('country_code', country);
    if (['military','police','paramilitary','civilian'].includes(cls)) q = q.eq('class_of_service', cls);
    if (gender === 'female' || gender === 'male') q = q.eq('gender', gender);
    if (active === '1') q = q.eq('npc_active', true);
    if (active === '0') q = q.eq('npc_active', false);
    if (params.get('curated') === '1') q = q.eq('npc->>curated', 'true');
    if (review === 'quarantine') q = q.eq('npc_photo_review', 'quarantine');
    if (review === 'ok') q = q.eq('npc_photo_review', 'ok');
    if (service) q = q.ilike('service', `%${service.replace(/[%_]/g, '')}%`);
    const { data: npcs, error, count } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) return err('Could not load NPCs.', 500, origin);
    return json({ npcs: (npcs || []).map((p: Row) => ({
      id: p.id, name: p.name, age: ageOf(p.birth_date), birthDate: p.birth_date, gender: p.gender, pronouns: p.pronouns,
      city: p.city, state: p.state, countryCode: p.country_code || 'NG', companyOrOrg: p.company_or_org, dutyStation: p.duty_station,
      educationLevel: p.education_level, almaMater: p.alma_mater,
      professionCategory: p.profession_category, professionTitle: p.profession_title, classOfService: p.class_of_service,
      orgRole: p.org_role, skill: p.skill, service: p.service, bio: p.bio, photos: p.photos, interests: p.interests,
      datingGoal: p.dating_goal, prompts: p.prompts || [], lifestyle: p.lifestyle || null, values: p.values_family || null,
      verificationStatus: p.verification_status, active: p.npc_active, persona: p.npc || {},
      curated: Boolean((p.npc || {}).curated),
      aiEnabled: Boolean(p.npc_ai_enabled), photoReview: p.npc_photo_review || 'ok',
      quarantineReason: p.npc_quarantine_reason || undefined, createdAt: p.created_at
    })), total: count ?? 0, limit, offset }, 200, origin);
  }
  // Facets for the persona filters: every country, class, service and gender in
  // the deck with a count, so the console never hardcodes a list.
  if (path === '/admin/npc-facets' && req.method === 'GET') {
    const { data, error } = await db.from('profiles').select('country_code,class_of_service,service,gender,npc_active').eq('is_npc', true).limit(3000);
    if (error) return err('Could not load persona facets.', 500, origin);
    const tally = (values: (string | null)[]) => {
      const map = new Map<string, number>();
      for (const value of values) if (value) map.set(value, (map.get(value) || 0) + 1);
      return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    };
    return json({
      countries: tally((data || []).map((r: Row) => r.country_code || 'NG')),
      classes: tally((data || []).map((r: Row) => r.class_of_service)),
      services: tally((data || []).map((r: Row) => r.service)),
      genders: tally((data || []).map((r: Row) => r.gender)),
      active: (data || []).filter((r: Row) => r.npc_active).length,
      total: (data || []).length,
    }, 200, origin);
  }
  if (npcOneMatch && req.method === 'PATCH') {
    const b = await bodyJson(req);
    const { data: npc } = await db.from('profiles').select('id,is_npc,org_role,class_of_service,npc,photos,npc_photo_review').eq('id', npcOneMatch[1]).maybeSingle();
    if (!npc) return err('NPC not found.', 404, origin);
    if (!npc.is_npc) return err('This profile is not an NPC.', 409, origin);
    const update: Row = {};
    // Personas are edited with the same rules a member's own PATCH follows, so
    // nothing can be typed here that the member side could not produce.
    // bio / city / state are NOT NULL DEFAULT '' — clearing them writes ''.
    const setText = (key: string, column: string, max: number, nullable = true) => {
      if (typeof b[key] !== 'string') return;
      const value = cleanString(b[key], max);
      update[column] = value || (nullable ? null : '');
    };
    if (typeof b.name === 'string') {
      const name = cleanString(b.name, 60);
      if (name.length < 2) return err('Give the persona a name with at least 2 characters.', 400, origin);
      update.name = name;
    }
    setText('bio', 'bio', 1000, false); setText('city', 'city', 100, false); setText('state', 'state', 100, false);
    setText('pronouns', 'pronouns', 40); setText('companyOrOrg', 'company_or_org', 120);
    setText('educationLevel', 'education_level', 80); setText('almaMater', 'alma_mater', 120);
    setText('professionTitle', 'profession_title', 80); setText('service', 'service', 80);
    setText('skill', 'skill', 60); setText('dutyStation', 'duty_station', 120);
    if (typeof b.countryCode === 'string') {
      const code = b.countryCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) return err('Country must be a two-letter ISO code.', 400, origin);
      update.country_code = code;
    }
    if (b.gender !== undefined) {
      const gender = enumValue(b.gender, ['female', 'male']);
      if (!gender) return err('Choose a valid gender.', 400, origin);
      update.gender = gender;
    }
    if (typeof b.birthDate === 'string') {
      const birth = b.birthDate, age = ageOf(birth);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || age == null || age < 18 || age > 110) return err('Enter a valid date of birth (18 or older).', 400, origin);
      update.birth_date = birth;
    }
    if (typeof b.professionCategory === 'string') {
      const category = enumValue(b.professionCategory, PROFESSION_CATEGORIES);
      if (!category) return err('Choose a valid profession category.', 400, origin);
      update.profession_category = category;
      update.class_of_service = category === 'Military' ? 'military'
        : category === 'Police' ? 'police'
        : category === 'Paramilitary' ? 'paramilitary' : 'civilian';
      if (update.class_of_service === 'civilian') update.org_role = null;
    }
    if (b.orgRole !== undefined) {
      if (b.orgRole === null || b.orgRole === '') update.org_role = null;
      else {
        const role = enumValue(b.orgRole, ['officer', 'soldier']);
        if (!role) return err('Cadre must be officer or soldier.', 400, origin);
        update.org_role = role;
      }
    }
    if (typeof b.datingGoal === 'string') {
      if (b.datingGoal === '') update.dating_goal = null;
      else {
        const goal = enumValue(b.datingGoal, DATING_GOALS);
        if (!goal) return err('Choose a valid dating intention.', 400, origin);
        update.dating_goal = goal;
      }
    }
    if (typeof b.verificationStatus === 'string') {
      const status = enumValue(b.verificationStatus, ['verified', 'pending', 'not_started']);
      if (!status) return err('Choose a valid verification state.', 400, origin);
      update.verification_status = status;
      update.verified_at = status === 'verified' ? new Date().toISOString().slice(0, 10) : null;
    }
    if (typeof b.active === 'boolean') {
      // A quarantined photo or a persona that never received a human-chosen
      // face is hidden by the deck even when the row says active. Refuse the
      // write instead of letting the console show "Active" on a persona
      // members can never see.
      if (b.active && npc.npc_photo_review === 'quarantine' && b.photoReview !== 'ok') {
        return err('Release the quarantined photo before activating this persona.', 409, origin);
      }
      if (b.active) {
        const persona = { ...(npc.npc || {}), ...((b.persona && typeof b.persona === 'object' && !Array.isArray(b.persona)) ? b.persona as Row : {}) };
        const photos = Array.isArray(npc.photos) ? npc.photos : [];
        if (!photos.length || persona.photoState === 'awaiting_upload') {
          return err('Upload a photo for this persona before activating it.', 409, origin);
        }
      }
      update.npc_active = b.active;
    }
    if (typeof b.aiEnabled === 'boolean') update.npc_ai_enabled = b.aiEnabled;
    if (typeof b.photoReview === 'string') {
      if (b.photoReview !== 'ok' && b.photoReview !== 'quarantine') return err('photoReview must be ok or quarantine.', 400, origin);
      update.npc_photo_review = b.photoReview;
      update.npc_quarantined_at = b.photoReview === 'quarantine' ? new Date().toISOString() : null;
      if (b.photoReview === 'quarantine') update.npc_active = false;
    }
    if (b.persona && typeof b.persona === 'object' && !Array.isArray(b.persona)) {
      // Merge, don't replace. `npc` holds `curated`, `photoState` and other
      // flags the edit form does not send; replacing it silently un-curated the
      // profile and made the persona look ready when it had no chosen face.
      update.npc = { ...(npc.npc || {}), ...(b.persona as Row) };
    }
    // The curated set is a flag inside the persona document, not a column. It
    // marks the hand-vetted profiles the deck ships with; the rest of the pool
    // stays paused underneath so the console can pull one in at any time.
    if (typeof b.curated === 'boolean') {
      const persona = { ...((update.npc as Row) || (npc.npc as Row) || {}) };
      if (b.curated) {
        persona.curated = true;
        persona.curatedAt = new Date().toISOString();
      } else {
        delete persona.curated;
        delete persona.curatedAt;
      }
      update.npc = persona;
    }
    if (Array.isArray(b.interests)) update.interests = b.interests.map((v: unknown) => cleanString(v, 80)).filter(Boolean).slice(0, 8);
    if (Array.isArray(b.prompts)) update.prompts = cleanPrompts(b.prompts);
    if (b.lifestyle !== undefined) update.lifestyle = cleanLifestyle(b.lifestyle);
    if (b.values !== undefined) update.values_family = cleanValuesFamily(b.values);
    const resultingClass = update.class_of_service ?? npc.class_of_service;
    // The cadre control still holds its old value when only the category
    // changed; a civilian must never end up with one.
    if (resultingClass === 'civilian' && update.org_role) update.org_role = null;
    const resultingRole = update.org_role !== undefined ? update.org_role : npc.org_role;
    if (resultingClass && resultingClass !== 'civilian' && !resultingRole) {
      return err('Uniformed personas need a cadre — choose officer or soldier.', 400, origin);
    }
    if (!Object.keys(update).length) return json({ success: true }, 200, origin);
    update.updated_at = new Date().toISOString();
    const { data: updated, error } = await db.from('profiles').update(update).eq('id', npcOneMatch[1]).select('id').maybeSingle();
    if (error || !updated) return err('Could not update NPC.', 500, origin);
    const auditAction = typeof b.curated === 'boolean' ? (b.curated ? 'npc.curated' : 'npc.uncurated') : 'npc.updated';
    await db.from('admin_audit').insert({ admin_id: actor, action: auditAction, target_id: npcOneMatch[1], detail: { fields: Object.keys(update).filter((k) => k !== 'updated_at') } });
    return json({ success: true }, 200, origin);
  }
  if (npcPresignMatch && req.method === 'POST') {
    const b = await bodyJson(req), contentType = String(b.contentType || 'image/jpeg').toLowerCase();
    if (!['image/jpeg','image/png','image/webp'].includes(contentType)) return err('Only JPEG, PNG or WebP images are accepted.', 415, origin);
    const contentLength = Number(b.contentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > 6 * 1024 * 1024) return err('Image size must be between 1 byte and 6 MB.', 413, origin);
    const { data: npc } = await db.from('profiles').select('id,is_npc').eq('id', npcPresignMatch[1]).maybeSingle();
    if (!npc?.is_npc) return err('NPC not found.', 404, origin);
    const client = await s3Client(), publicBucket = Deno.env.get('R2_PUBLIC_BUCKET');
    if (!client || !publicBucket) return err('Object storage is not configured.', 503, origin);
    const key = objectKey('photo', npc.id, contentType);
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: publicBucket, Key: key, ContentType: contentType, ContentLength: contentLength }), { expiresIn: 300 });
    const base = (Deno.env.get('R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '');
    return json({ uploadUrl, key, expiresIn: 300, publicUrl: base ? `${base}/${key}` : null }, 200, origin);
  }
  if (npcPhotosMatch && req.method === 'POST') {
    const b = await bodyJson(req);
    if (!Array.isArray(b.photos)) return err('photos must be an array of image URLs or keys.', 400, origin);
    const { data: npc } = await db.from('profiles').select('id,is_npc,npc,photos,npc_active').eq('id', npcPhotosMatch[1]).maybeSingle();
    // Same ownership rule as member photos: only this persona's own upload
    // prefix (or a value already on the row) can be saved.
    const photos = ownedPhotoValues(npcPhotosMatch[1], b.photos, npc?.photos || []);
    if (!npc?.is_npc) return err('NPC not found.', 404, origin);
    // A photo uploaded by a human is the final word: mark the persona `manual`
    // so the automatic pool dealer never re-deals over it.
    const persona = { ...(npc.npc || {}) };
    const hasPhotos = photos.length > 0;
    persona.photoState = hasPhotos ? 'manual' : 'awaiting_upload';
    const update: Row = { photos, npc: persona, updated_at: new Date().toISOString() };
    // A person chose this face, so an automated quarantine no longer applies.
    // Clearing the photo list sends the persona back to the pool instead.
    if (hasPhotos) {
      update.npc_photo_review = 'ok';
      update.npc_quarantine_reason = null;
      update.npc_quarantined_at = null;
    }
    // Curated profiles stay staged while they are being edited; the curator
    // pushes them live with Activate. Pool personas still go live on upload.
    update.npc_active = persona.curated ? (hasPhotos ? Boolean(npc.npc_active) : false) : hasPhotos;
    const { error } = await db.from('profiles').update(update).eq('id', npc.id);
    if (error) return err('Could not update NPC photos.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'npc.photos', target_id: npc.id, detail: { count: photos.length, active: update.npc_active, review: hasPhotos ? 'ok' : undefined } });
    return json({ success: true, photos }, 200, origin);
  }
  // ---- Persona scripts: every line a persona can say, editable by staff ----
  // The persona engine reads these rows first and only falls back to the
  // built-in pools when a persona has none, so this is the whole vocabulary of
  // an NPC.
  if (npcScriptsMatch && (req.method === 'GET' || req.method === 'POST')) {
    const npcId = npcScriptsMatch[1];
    const { data: npc } = await db.from('profiles').select('id,is_npc').eq('id', npcId).maybeSingle();
    if (!npc?.is_npc) return err('NPC not found.', 404, origin);

    if (req.method === 'GET') {
      const { data, error } = await db.from('npc_scripts').select('*').eq('npc_id', npcId)
        .order('kind', { ascending: true }).order('intent', { ascending: true }).order('position', { ascending: true });
      if (error) return err('Could not load persona scripts.', 500, origin);
      return json({ scripts: (data || []).map(scriptRow) }, 200, origin);
    }

    const b = await bodyJson(req);
    const kind = String(b.kind || '');
    if (kind !== 'greeting' && kind !== 'reply') return err('kind must be greeting or reply.', 400, origin);
    const intent = kind === 'reply' ? String(b.intent || 'smalltalk') : null;
    if (intent && !SCRIPT_INTENTS.includes(intent)) return err('Unknown intent.', 400, origin);
    const text = cleanString(b.body, 600);
    if (!text) return err('Message body required.', 400, origin);
    const position = Number.isFinite(Number(b.position)) ? Math.trunc(Number(b.position)) : 0;
    const { data: inserted, error } = await db.from('npc_scripts')
      .insert({ npc_id: npcId, kind, intent, body: text, position })
      .select('id').single();
    if (error) return err('Could not save persona script.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'npc.script_created', target_id: npcId, detail: { kind, intent } });
    return json({ success: true, id: inserted?.id }, 200, origin);
  }
  if (npcScriptOneMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const [, npcId, scriptId] = npcScriptOneMatch;
    const { data: existing } = await db.from('npc_scripts').select('id,npc_id').eq('id', scriptId).eq('npc_id', npcId).maybeSingle();
    if (!existing) return err('Script not found.', 404, origin);
    if (req.method === 'DELETE') {
      const { error } = await db.from('npc_scripts').delete().eq('id', scriptId).eq('npc_id', npcId);
      if (error) return err('Could not delete script.', 500, origin);
      await db.from('admin_audit').insert({ admin_id: actor, action: 'npc.script_deleted', target_id: npcId, detail: { scriptId } });
      return json({ success: true }, 200, origin);
    }
    const b = await bodyJson(req);
    const patch: Row = { updated_at: new Date().toISOString() };
    if (b.body !== undefined) {
      const text = cleanString(b.body, 600);
      if (!text) return err('Message body required.', 400, origin);
      patch.body = text;
    }
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== 'boolean') return err('enabled must be true or false.', 400, origin);
      patch.enabled = b.enabled;
    }
    if (b.intent !== undefined) {
      const intent = String(b.intent);
      if (!SCRIPT_INTENTS.includes(intent)) return err('Unknown intent.', 400, origin);
      patch.intent = intent;
    }
    if (b.position !== undefined) {
      const position = Number(b.position);
      if (!Number.isFinite(position)) return err('position must be a number.', 400, origin);
      patch.position = Math.trunc(position);
    }
    if (Object.keys(patch).length === 1) return err('Nothing to update.', 400, origin);
    const { error } = await db.from('npc_scripts').update(patch).eq('id', scriptId).eq('npc_id', npcId);
    if (error) return err('Could not update script.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'npc.script_updated', target_id: npcId, detail: { scriptId, fields: Object.keys(patch) } });
    return json({ success: true }, 200, origin);
  }

  // ---- Photo review: quarantine a persona that reads as generated ----
  if (npcQuarantineMatch && req.method === 'POST') {
    const npcId = npcQuarantineMatch[1];
    const b = await bodyJson(req);
    if (typeof b.quarantine !== 'boolean') return err('quarantine must be true or false.', 400, origin);
    const { data: npc } = await db.from('profiles').select('id,is_npc').eq('id', npcId).maybeSingle();
    if (!npc?.is_npc) return err('NPC not found.', 404, origin);
    const reason = b.quarantine ? (cleanString(b.reason, 200) || 'Photo reads as generated') : null;
    const patch: Row = {
      npc_photo_review: b.quarantine ? 'quarantine' : 'ok',
      npc_quarantine_reason: reason,
      npc_quarantined_at: b.quarantine ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    // Quarantine always pauses. Releasing does not auto-activate: staff decide
    // when the replacement photo is ready.
    if (b.quarantine) patch.npc_active = false;
    const { error } = await db.from('profiles').update(patch).eq('id', npcId);
    if (error) return err('Could not update photo review.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: b.quarantine ? 'npc.quarantined' : 'npc.released', target_id: npcId, detail: { reason } });
    return json({ success: true, quarantined: b.quarantine, active: b.quarantine ? false : undefined }, 200, origin);
  }
  if (path === '/admin/npc-quarantine' && req.method === 'POST') {
    const b = await bodyJson(req);
    const ids = Array.isArray(b.ids) ? b.ids.filter(isUuid) : [];
    if (!ids.length) return err('ids must be a non-empty array of persona ids.', 400, origin);
    if (typeof b.quarantine !== 'boolean') return err('quarantine must be true or false.', 400, origin);
    const reason = b.quarantine ? (cleanString(b.reason, 200) || 'Photo reads as generated') : null;
    const patch: Row = {
      npc_photo_review: b.quarantine ? 'quarantine' : 'ok',
      npc_quarantine_reason: reason,
      npc_quarantined_at: b.quarantine ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    if (b.quarantine) patch.npc_active = false;
    const { error, count } = await db.from('profiles').update(patch, { count: 'exact' }).in('id', ids).eq('is_npc', true);
    if (error) return err('Could not update photo review.', 500, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: b.quarantine ? 'npc.quarantined_bulk' : 'npc.released_bulk', target_id: null, detail: { count: count || ids.length } });
    return json({ success: true, updated: count || ids.length, quarantined: b.quarantine }, 200, origin);
  }

  return err('Not found.', 404, origin);
}

function reqUrl(req: Request): URL { return new URL(req.url); }
function functionRoutePath(pathname: string): string {
  // Supabase Edge Functions may expose the original pathname with the
  // function name (`/api/...`) or the full gateway prefix. Remove either form
  // before matching the routes declared below.
  const path = pathname
    .replace(/^\/functions\/v1/, '')
    .replace(/^\/api(?=\/|$)/, '')
    .replace(/\/+$/, '');
  return path || '/';
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (origin && !allowedOrigins.includes(origin)) return err('Origin not allowed.', 403, origin);
  const url = new URL(req.url);
  const path = functionRoutePath(url.pathname);
  const supabaseUrl = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (path === '/health' && req.method === 'GET') return json({ ok: true, service: 'wassaa-supabase-edge-api', time: new Date().toISOString() }, 200, origin);
  if ((path === '/billing/plans-public' || path === '/billing/plans') && req.method === 'GET') {
    // Public catalogue, priced for `?country=` when given. Signed-in members get
    // their own band from /billing/entitlements.
    const country = (cleanString(url.searchParams.get('country') || 'NG', 2) || 'NG').toUpperCase();
    if (supabaseUrl && service) {
      const catalogDb = createClient(supabaseUrl, service, { auth: { persistSession: false } });
      const packs = await packsForCountry(catalogDb, country);
      return json({ plans: [FREE_PLAN, ...packs], consumables: [], country, band: packs[0]?.band || 'ng' }, 200, origin);
    }
    return json({ plans: [FREE_PLAN, ...FALLBACK_PACKS], consumables: [], country }, 200, origin);
  }
  if (!supabaseUrl || !anon || !service) return err('Server configuration is incomplete.', 503, origin);
  if (path === '/public-config' && req.method === 'GET') return json({ supabaseUrl, publishableKey: anon, googleClientId: Deno.env.get('GOOGLE_CLIENT_ID') || '' }, 200, origin);
  if (path === '/billing/webhook') return handlePaystackWebhook(req);

  const bearer = req.headers.get('Authorization') || '';
  const jwt = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';
  if (!jwt) return err('Sign in to continue.', 401, origin);
  const authClient = createClient(supabaseUrl, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
  if (authError || !user) return err('Session expired. Sign in again.', 401, origin);
  const db = createClient(supabaseUrl, service, { auth: { persistSession: false, autoRefreshToken: false } });
  if (path.startsWith('/admin/')) {
    try { return await adminRoute(db, user, path, req, origin); }
    catch (e) { console.error('[wassaa-admin-edge] request failed', { path, message: e instanceof Error ? e.message : 'unknown' }); return err('Admin operation failed.', 500, origin); }
  }
  const { data: profile, error: profileError } = await db.from('profiles').select('*').eq('auth_user_id', user.id).maybeSingle();
  if (profileError) return err('Could not load your account.', 500, origin);
  if (!profile || profile.deleted_at) return err('Account unavailable.', 403, origin);
  const uid = profile.id as string;
  // Sanctions (KB §18D): banned = only session + appeal + erasure; restricted =
  // read-only, mutations rejected. The stored reason rides along in the message
  // body so the client can display it next to the ACCOUNT_* code.
  const accountStatus = accountStatusOf(profile);
  const sanctionReason = profile.restriction_reason || undefined;
  // Account erasure is a legal right and must stay reachable even after a ban.
  const sanctionAllowed = path === '/appeals' || path === '/auth/session' || path === '/me/account';
  if (accountStatus === 'banned' && !sanctionAllowed) return err(sanctionReason || 'This account has been banned by the platform.', 403, origin, 'ACCOUNT_BANNED');
  if (accountStatus === 'restricted' && req.method !== 'GET' && !sanctionAllowed) return err(sanctionReason || 'This account is restricted. Submit an appeal to have it reviewed.', 403, origin, 'ACCOUNT_RESTRICTED');
  const onboardingRoutes = new Set(['/auth/session', '/me/profile', '/me/preferences', '/me/location', '/uploads/presign', '/me/account', '/appeals']);
  if (!isOnboardingComplete(profile) && !onboardingRoutes.has(path)) {
    return err('Complete your required profile setup before using discovery or messaging.', 409, origin, 'ONBOARDING_REQUIRED');
  }
  const { data: withinLimit, error: limitError } = await db.rpc('wassaa_consume_rate_limit', { p_actor: uid, p_bucket: 'api', p_max: 300, p_window_seconds: 60 });
  if (limitError) return err('Request could not be processed.', 503, origin);
  if (!withinLimit) return err('Request limit reached. Try again shortly.', 429, origin);
  const allowAction = async (bucket: string, max: number, seconds: number): Promise<Response | null> => {
    const { data, error } = await db.rpc('wassaa_consume_rate_limit', { p_actor: uid, p_bucket: bucket, p_max: max, p_window_seconds: seconds });
    if (error) return err('Request could not be processed.', 503, origin);
    return data ? null : err('Too many attempts. Try again later.', 429, origin);
  };

  try {
    let body: Row | undefined;
    const getBody = async () => body ??= await bodyJson(req);

    // Session and own-profile operations
    if (path === '/auth/session' && req.method === 'GET') {
      // Lazy daily credit drip: applied once per calendar day at session load.
      const { data: balance } = await db.rpc('wassaa_daily_drip', { p_profile: uid });
      const fresh = typeof balance === 'number' && balance >= 0 ? { ...profile, credits: balance } : profile;
      return json({ user: profilePayload(fresh) }, 200, origin);
    }
    if (path === '/me/profile' && req.method === 'GET') return json({ user: profilePayload(profile) }, 200, origin);
    if (path === '/me/profile' && req.method === 'PATCH') {
      const b = await getBody(); const fields: Record<string, string> = { name: 'name', birthDate: 'birth_date', gender: 'gender', pronouns: 'pronouns', professionCategory: 'profession_category', professionTitle: 'profession_title', companyOrOrg: 'company_or_org', service: 'service', dutyStation: 'duty_station', educationLevel: 'education_level', almaMater: 'alma_mater', city: 'city', state: 'state', countryCode: 'country_code', bio: 'bio', datingGoal: 'dating_goal', orgRole: 'org_role', skill: 'skill' };
      const update: Row = {};
      for (const [key, column] of Object.entries(fields)) if (b[key] !== undefined && typeof b[key] === 'string') update[column] = cleanString(b[key], ({ name: 60, bio: 1000, service: 80, profession_title: 80, city: 100, state: 100, duty_station: 120, education_level: 80, alma_mater: 120, org_role: 20, skill: 60 } as Record<string, number>)[column] || 150);
      // Role/skill taxonomy (KB §18A): empty strings clear back to null.
      for (const col of ['org_role', 'skill']) if (update[col] === '') update[col] = null;
      if (update.country_code !== undefined) {
        const code = String(update.country_code).toUpperCase();
        if (!/^[A-Z]{2}$/.test(code)) return err('Choose a valid country.', 400, origin);
        update.country_code = code;
      }
      if (update.org_role != null && !['officer', 'soldier'].includes(update.org_role)) return err('Choose either Officer or Soldier.', 400, origin);
      if (update.skill != null && !/^[A-Za-z0-9 &/+-]{1,60}$/.test(update.skill)) return err('Choose a skill from the list.', 400, origin);
      // The class of service is derived server-side from the profession category
      // so the two can never disagree.
      if (update.profession_category !== undefined) {
        update.class_of_service = update.profession_category === 'Military' ? 'military'
          : update.profession_category === 'Police' ? 'police'
          : update.profession_category === 'Paramilitary' ? 'paramilitary' : 'civilian';
        if (update.class_of_service === 'civilian') { update.org_role = null; update.skill = update.skill ?? null; }
      }
      if (update.birth_date) {
        const birth = new Date(`${update.birth_date}T00:00:00Z`);
        const age = ageOf(update.birth_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(update.birth_date) || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== update.birth_date) return err('Enter a valid date of birth.', 400, origin);
        if (age == null || age < 18 || age > 110) return err('You must be at least 18 years old to use Wassaa.', 400, origin);
      }
      if (update.gender !== undefined && !['female','male'].includes(update.gender)) return err('Choose a valid gender.', 400, origin);
      if (update.name !== undefined && !update.name) return err('Name cannot be empty.', 400, origin);
      if (Array.isArray(b.photos)) update.photos = ownedPhotoValues(uid, b.photos, profile.photos || []);
      if (Array.isArray(b.interests)) update.interests = b.interests.map((v: unknown) => cleanString(v, 80)).filter(Boolean).slice(0, 8);
      // Onboarding steps 7–9: these used to be collected and thrown away.
      if (Array.isArray(b.prompts)) update.prompts = cleanPrompts(b.prompts);
      if (b.lifestyle !== undefined) update.lifestyle = cleanLifestyle(b.lifestyle);
      if (b.values !== undefined) update.values_family = cleanValuesFamily(b.values);
      if (!Object.keys(update).length) return json({ success: true, user: profilePayload(profile) }, 200, origin);
      update.updated_at = new Date().toISOString();
      const { data, error } = await db.from('profiles').update(update).eq('id', uid).select('*').single();
      if (error) return err('Could not update profile.', 400, origin);
      return json({ success: true, user: profilePayload(data) }, 200, origin);
    }
    if (path === '/me/privacy' && req.method === 'PATCH') {
      const b = await getBody(), old = profile.privacy || DEFAULT_PRIVACY;
      const enumValue = (value: unknown, allowed: string[], fallback: string) => allowed.includes(String(value)) ? value : fallback;
      const next = { serviceVisibility: enumValue(b.serviceVisibility, ['public','matches','private'], old.serviceVisibility), rankVisibility: enumValue(b.rankVisibility, ['public','matches','private'], old.rankVisibility), verificationDisplay: enumValue(b.verificationDisplay, ['badge','service_badge','minimal'], old.verificationDisplay), chatNotifications: typeof b.chatNotifications === 'boolean' ? b.chatNotifications : old.chatNotifications, twoFactorAuth: typeof b.twoFactorAuth === 'boolean' ? b.twoFactorAuth : old.twoFactorAuth, privateIntroductionOptIn: typeof b.privateIntroductionOptIn === 'boolean' ? b.privateIntroductionOptIn : old.privateIntroductionOptIn };
      const { data, error } = await db.from('profiles').update({ privacy: next, updated_at: new Date().toISOString() }).eq('id', uid).select('*').single();
      if (error) return err('Could not update privacy settings.', 500, origin);
      return json({ success: true, privacy: next, user: profilePayload(data) }, 200, origin);
    }
    if (path === '/me/preferences' && req.method === 'PATCH') {
      const b = await getBody(); const minAge = Math.min(80, Math.max(18, Number(b.minAge) || 18)), maxAge = Math.min(99, Math.max(18, Number(b.maxAge) || 60));
      if (minAge > maxAge) return err('minAge cannot exceed maxAge.', 400, origin);
      const preferences: Row = { gender: ['men','women','everyone'].includes(String(b.gender)) ? b.gender : 'everyone', minAge, maxAge };
      if (b.maxDistanceKm != null) {
        const distance = Number(b.maxDistanceKm);
        if (!Number.isFinite(distance) || distance < 5 || distance > 500) return err('Choose a distance between 5 and 500 km.', 400, origin);
        if (profile.location_lat == null || profile.location_lng == null) return err('Set your device location before choosing a distance limit.', 409, origin, 'LOCATION_REQUIRED');
        preferences.maxDistanceKm = Math.round(distance);
      }
      const { error } = await db.from('profiles').update({ match_preferences: preferences, updated_at: new Date().toISOString() }).eq('id', uid);
      if (error) return err('Could not update preferences.', 500, origin);
      return json({ success: true, preferences }, 200, origin);
    }
    if (path === '/me/location' && req.method === 'PATCH') {
      const b = await getBody();
      const clearLocation = b.latitude === null && b.longitude === null;
      const latitude = b.latitude, longitude = b.longitude;
      if (!clearLocation && (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
        return err('Provide valid latitude and longitude coordinates.', 400, origin);
      }
      // Clearing the device location must also clear the distance limit in the
      // same write. As two statements, a failure between them left the member
      // with a radius but no coordinates — a deck that matches nothing.
      const update: Row = {
        location_lat: clearLocation ? null : latitude,
        location_lng: clearLocation ? null : longitude,
        updated_at: new Date().toISOString()
      };
      if (clearLocation && profile.match_preferences?.maxDistanceKm) {
        const preferences = { ...profile.match_preferences };
        delete preferences.maxDistanceKm;
        update.match_preferences = preferences;
      }
      const { error } = await db.from('profiles').update(update).eq('id', uid);
      if (error) return err('Could not update location settings.', 500, origin);
      return json({ success: true, hasPreciseLocation: !clearLocation }, 200, origin);
    }
    if (path === '/me/boost' && req.method === 'POST') {
      const limited = await allowAction('boost', 5, 3600); if (limited) return limited;
      // Spend + extend happen in one locked transition: the old three-step
      // read/charge/write could charge twice for one hour or lose the credits
      // when the final write failed.
      const { data: result, error: boostError } = await db.rpc('wassaa_start_boost', { p_profile: uid, p_cost: PRICING.boost });
      if (boostError) return err('Could not start the Boost.', 500, origin);
      const outcome = Array.isArray(result) ? result[0] : result;
      if (outcome?.error === 'no_credits') return err(`You need ${PRICING.boost} credits for a Boost.`, 402, origin, 'CREDITS_NEEDED');
      if (outcome?.error === 'unavailable') return err('Account unavailable.', 403, origin);
      if (outcome?.error || !outcome?.boostedUntil) return err('Could not start the Boost.', 500, origin);
      return json({ success: true, boostedUntil: outcome.boostedUntil, balance: outcome.balance }, 200, origin);
    }
    if (path === '/me/account' && req.method === 'DELETE') {
      const client = await s3Client();
      if (client) {
        try {
          const [{ data: matches }, { data: submissions }] = await Promise.all([
            db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`),
            db.from('verification_submissions').select('id_doc_url,selfie_url').eq('user_id', uid)
          ]);
          const matchIds = (matches || []).map((m: Row) => m.id);
          const { data: messages } = matchIds.length
            ? await db.from('messages').select('media_url').in('match_id', matchIds).eq('sender_id', uid)
            : { data: [] as Row[] };
          const keys = ownedMediaKeys(uid, [
            ...(messages || []).map((m: Row) => m.media_url),
            ...(submissions || []).flatMap((s: Row) => [s.id_doc_url, s.selfie_url])
          ]);
          await deleteStorageKeys(keys);
          const privateBucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET');
          const publicBucket = Deno.env.get('R2_PUBLIC_BUCKET');
          if (!privateBucket || !publicBucket) throw new Error('Object storage buckets are not configured.');
          await deleteStoragePrefix(`photos/${uid}/`, publicBucket);
          await deleteStoragePrefix(`verification/${uid}/`, privateBucket);
          await deleteStoragePrefix(`chat/${uid}/`, privateBucket);
        } catch {
          return err('Could not securely delete all account media. Nothing else was removed; retry or contact support.', 502, origin);
        }
      } else {
        const [{ data: matches }, { data: submissions }] = await Promise.all([
          db.from('matches').select('id').or(`user_a.eq.${uid},user_b.eq.${uid}`),
          db.from('verification_submissions').select('id_doc_url,selfie_url').eq('user_id', uid)
        ]);
        const matchIds = (matches || []).map((m: Row) => m.id);
        const { data: messages } = matchIds.length ? await db.from('messages').select('media_url').in('match_id', matchIds) : { data: [] as Row[] };
        const hasMedia = (profile.photos || []).length > 0 || (submissions || []).some((s: Row) => isStorageKey(s.id_doc_url) || isStorageKey(s.selfie_url)) || (messages || []).some((m: Row) => isStorageKey(m.media_url));
        if (hasMedia) return err('Object storage is unavailable, so account media cannot be securely deleted yet.', 503, origin);
      }
      const { error: reportRedactionError } = await db.from('reports').update({ reported_user_id: null, details: '[Report subject account deleted]', service_branch: null }).eq('reported_user_id', uid);
      if (reportRedactionError) return err('Account could not be deleted safely. Retry or contact support.', 500, origin);
      const { error: auditRedactionError } = await db.rpc('wassaa_anonymize_admin_audit', { p_user: uid });
      if (auditRedactionError) return err('Account could not be deleted safely. Retry or contact support.', 500, origin);
      const { error: deleteProfileError } = await db.from('profiles').delete().eq('id', uid);
      if (deleteProfileError) return err('Account could not be deleted. Contact support.', 500, origin);
      const { error: deleteAuthError } = await db.auth.admin.deleteUser(user.id);
      if (deleteAuthError) return err('Profile was removed, but sign-in credentials could not be removed. Contact support.', 500, origin);
      return json({ success: true, message: 'Account and associated profile data have been deleted.' }, 200, origin);
    }

    // Discovery: one server-side query. Filtering in SQL keeps the swipe
    // exclusion list out of the request URL (PostgREST rejects long URLs once a
    // member has a few hundred swipes) and applies reciprocal preferences before
    // the row limit.
    if (path === '/discovery' && req.method === 'GET') {
      const num = (name: string): number | null => {
        const raw = url.searchParams.get(name);
        if (raw == null || raw === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      };
      // A radius only applies when this member actually has coordinates, and a
      // bogus stored value (null coerces to 0) must degrade to unfiltered
      // discovery — never to an empty deck. `wassaa_discovery` returns nothing
      // when a radius is set but distances cannot be measured.
      const storedRadius = Number(profile.match_preferences?.maxDistanceKm);
      const radiusKm = profile.location_lat != null && profile.location_lng != null
        && Number.isFinite(storedRadius) && storedRadius >= 5
        ? Math.round(storedRadius)
        : null;
      const { data: candidates, error } = await db.rpc('wassaa_discovery', {
        p_viewer: uid,
        p_limit: num('limit') ?? 15,
        p_profession: url.searchParams.get('profession'),
        p_service: url.searchParams.get('service'),
        p_city: url.searchParams.get('city'),
        p_gender: url.searchParams.get('gender'),
        p_min_age: num('minAge'),
        p_max_age: num('maxAge'),
        p_max_distance_km: radiusKm
      });
      if (error) return err('Could not load discovery profiles.', 500, origin);
      const result = (candidates || []).map((c: Row) => {
        const canMeasureDistance = profile.location_lat != null && profile.location_lng != null && c.location_lat != null && c.location_lng != null;
        const preciseDistance = canMeasureDistance
          ? greatCircleDistanceKm(Number(profile.location_lat), Number(profile.location_lng), Number(c.location_lat), Number(c.location_lng))
          : undefined;
        const distanceKm = preciseDistance == null ? undefined : Math.round(preciseDistance / 5) * 5;
        return profileForViewer(c, uid, false, distanceKm);
      });
      return json({ profiles: result, total: result.length }, 200, origin);
    }

    // Likes, passes, received likes
    if (path === '/likes' && req.method === 'POST') {
      const limited = await allowAction('like', 120, 600); if (limited) return limited;
      const b = await getBody(), targetId = cleanString(b.targetUserId, 64);
      if (!isUuid(targetId) || targetId === uid) return err('You cannot like your own profile.', 400, origin);
      const { data: target } = await db.from('profiles').select('*').eq('id', targetId).is('deleted_at', null).maybeSingle();
      if (!target || !isReachableProfile(target)) return err('Profile not found.', 404, origin);
      // 20 free right-swipes a day for every tier, then 1 credit per extra
      // swipe — exhausted swipers can pay their way past the cap. The charge is
      // taken first and refunded if the swipe does not land.
      let paidSwipe = false; // 1-credit charge for a swipe past the daily cap
      const refund = async () => {
        if (paidSwipe) await db.rpc('wassaa_grant_credit', { p_profile: uid, p_delta: PRICING.paidSwipe, p_reason: 'refund', p_reference: targetId });
      };
      let outcome: Row | string | null = null;
      let error = null as unknown;
      ({ data: outcome, error } = await db.rpc('wassaa_record_like', { p_from: uid, p_to: targetId, p_kind: 'like', p_daily_limit: PRICING.freeDailySwipes, p_weekly_super_limit: -1 }));
      if (outcome === 'daily_limit') {
        // Cap reached: 1 credit buys this swipe past the limit.
        const { data: swipeBalance, error: swipeError } = await db.rpc('wassaa_spend_credit', { p_profile: uid, p_delta: PRICING.paidSwipe, p_reason: 'extra_swipe', p_reference: targetId });
        if (swipeError) { await refund(); return err('Could not charge for the extra swipe. Try again.', 500, origin); }
        if (typeof swipeBalance !== 'number' || swipeBalance < 0) {
          await refund();
          return err(`Daily swipe limit reached — ${PRICING.paidSwipe} credit per extra swipe. Top up to keep swiping.`, 402, origin, 'CREDITS_NEEDED');
        }
        paidSwipe = true;
        ({ data: outcome, error } = await db.rpc('wassaa_record_like', { p_from: uid, p_to: targetId, p_kind: 'like', p_daily_limit: -1, p_weekly_super_limit: -1 }));
      }
      if (error) { await refund(); return err('Could not save this like.', 500, origin); }
      if (outcome === 'blocked') { await refund(); return err('Unable to interact with this profile.', 403, origin); }
      if (outcome === 'daily_limit') { await refund(); return err('Daily like limit reached. Try again tomorrow.', 402, origin, 'LIKE_LIMIT'); }
      if (outcome === 'already') await refund();
      // Persona reciprocity (KB §18C). Seeded personas never act on their own,
      // and a match needs a swipe in both directions, so without this a member
      // could like all 300 personas and never match one — no greeting, no
      // conversation, and nothing for credits to spend on. About a third of
      // likes to an active persona are met with a like back, which is the same
      // shape as a real member deciding to match. The swipe row is the only
      // trace and is never exposed to clients.
      if (outcome === 'recorded' && target.is_npc && isReachableProfile(target)) {
        const { data: existingNpcLike } = await db.from('swipes').select('id')
          .eq('from_user_id', targetId).eq('to_user_id', uid).maybeSingle();
        if (!existingNpcLike && Math.random() < 0.32) {
          await db.from('swipes').upsert(
            { from_user_id: targetId, to_user_id: uid, kind: 'like' },
            { onConflict: 'from_user_id,to_user_id', ignoreDuplicates: true }
          );
        }
      }
      const { data: matchId } = await db.rpc('wassaa_find_or_create_match', { p_a: uid, p_b: targetId });
      let balance: number | undefined;
      if (paidSwipe) { const { data: fresh } = await db.from('profiles').select('credits').eq('id', uid).maybeSingle(); balance = fresh?.credits; }
      return json({ success: true, isMatch: Boolean(matchId), ...(balance != null ? { balance } : {}), ...(matchId ? { match: { id: matchId, partner: profileForViewer(target, uid, true) } } : {}), ...(outcome === 'already' ? { already: true } : {}) }, 200, origin);
    }
    // Cold opens: a member may message someone they have not matched with.
    // The thread lives in `matches` like any other thread but carries no
    // "You matched" system line — that belongs to genuine mutual swipes —
    // and cold pricing escalates 10 → 15 → 20 for text (media 20 → 25 → 30),
    // capped at three messages until the partner likes back. Pricing is
    // computed at send time by wassaa_send_message, so it drops to the normal
    // 5/10 the moment they do. Blocks, deleted and self targets are kept
    // out; 15 opened threads per hour keeps mass-cold-messaging down.
    if (path === '/direct-threads' && req.method === 'POST') {
      const limited = await allowAction('dm_open', 15, 3600); if (limited) return limited;
      const b = await getBody(), targetId = cleanString(b.profileId || b.targetUserId, 64);
      if (!isUuid(targetId) || targetId === uid) return err('Invalid message target.', 400, origin);
      const { data: target } = await db.from('profiles').select('*').eq('id', targetId).is('deleted_at', null).maybeSingle();
      if (!target || !isReachableProfile(target)) return err('Profile not found.', 404, origin);
      const { data: block } = await db.from('blocks').select('id').or(`and(blocker_id.eq.${uid},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${uid})`).limit(1);
      if (block?.length) return err('Unable to message this member.', 403, origin);
      const a = uid < targetId ? uid : targetId, c = uid < targetId ? targetId : uid;
      const { data: existingThread } = await db.from('matches').select('id').eq('user_a', a).eq('user_b', c).maybeSingle();
      let matchId: string | undefined = existingThread?.id;
      if (!matchId) {
        const { data: created, error: createError } = await db.from('matches').insert({ user_a: a, user_b: c, origin: 'cold' }).select('id').single();
        if (createError) {
          // unique(user_a,user_b) race — a concurrent like or open won it
          const { data: again } = await db.from('matches').select('id').eq('user_a', a).eq('user_b', c).maybeSingle();
          matchId = again?.id;
          if (!matchId) return err('Could not open the chat.', 500, origin);
        } else matchId = created.id;
      }
      return json({ success: true, matchId, partner: profileForViewer(target, uid, true) }, 200, origin);
    }
    if (path === '/passes' && req.method === 'POST') {
      const limited = await allowAction('pass', 300, 600); if (limited) return limited;
      const b = await getBody(), targetId = cleanString(b.targetUserId, 64);
      if (!isUuid(targetId) || targetId === uid) return err('Invalid pass target.', 400, origin);
      // A pass is not an interaction: never strand a deck on a stale card just
      // because the profile was hidden/paused after it was fetched.
      const { data: target } = await db.from('profiles').select('id').eq('id', targetId).is('deleted_at', null).maybeSingle();
      if (!target) return err('Profile not found.', 404, origin);
      const { data: block } = await db.from('blocks').select('id').or(`and(blocker_id.eq.${uid},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${uid})`).limit(1);
      if (block?.length) return err('Unable to interact with this profile.', 403, origin);
      const { error } = await db.from('swipes').upsert({ from_user_id: uid, to_user_id: targetId, kind: 'pass' }, { onConflict: 'from_user_id,to_user_id', ignoreDuplicates: true });
      if (error) return err('Could not save pass.', 500, origin);
      return json({ success: true }, 200, origin);
    }
    if (path === '/likes/received' && req.method === 'GET') {
      // Reveal costs 15 credits and stays unlocked for 24h. Without ?reveal=1
      // the response only reports the price — never a surprise charge.
      const revealed = Boolean(profile.revealed_likes_at) && Date.now() - Date.parse(profile.revealed_likes_at) < 24 * 3600 * 1000;
      const wantsReveal = url.searchParams.get('reveal') === '1';
      if (!revealed && !wantsReveal) return json({ likes: [], locked: true, cost: 15 }, 200, origin);
      const [{ data: likes }, { data: swiped }, { data: blockRows }] = await Promise.all([
        db.from('swipes').select('from_user_id').eq('to_user_id', uid).neq('kind', 'pass'),
        db.from('swipes').select('to_user_id').eq('from_user_id', uid),
        db.from('blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`)
      ]);
      const exclude = new Set([...(swiped || []).map((x: Row) => x.to_user_id), ...(blockRows || []).map((x: Row) => x.blocker_id === uid ? x.blocked_id : x.blocker_id)]);
      const ids = [...new Set((likes || []).map((x: Row) => x.from_user_id).filter((id: string) => !exclude.has(id)))];
      if (!ids.length) return json({ likes: [] }, 200, origin);
      // Resolve who is actually still visible before charging: a like from a
      // since-banned or erased account must not cost 15 credits to discover
      // there is nothing to show.
      const { data: profiles } = await db.from('profiles').select('*').in('id', ids).eq('blocked_us', false).neq('account_status', 'banned').is('deleted_at', null);
      if (!(profiles || []).length) return json({ likes: [] }, 200, origin);
      let balance: number | undefined;
      if (!revealed) {
        // Spend + stamp in one locked RPC; a failed stamp used to charge again
        // on the next tap.
        const { data: result, error: revealError } = await db.rpc('wassaa_reveal_likes', { p_profile: uid, p_cost: 15 });
        if (revealError) return err('Could not unlock likes.', 500, origin);
        const outcome = Array.isArray(result) ? result[0] : result;
        if (outcome?.error === 'no_credits') return err('You need 15 credits to see who liked you.', 402, origin, 'CREDITS_NEEDED');
        if (outcome?.error) return err('Could not unlock likes.', 500, origin);
        if (typeof outcome?.balance === 'number') balance = outcome.balance;
      }
      return json({ likes: (profiles || []).map((p: Row) => profileForViewer(p, uid, false)), ...(balance != null ? { balance } : {}) }, 200, origin);
    }

    // Match list and chat
    const msgMatch = path.match(/^\/matches\/([0-9a-f-]+)\/messages$/i), readMatch = path.match(/^\/matches\/([0-9a-f-]+)\/read$/i);
    if (path === '/matches' && req.method === 'GET') {
      await tickUserThreads(db, uid); // run due NPC greetings/replies before summarising
      const { data: matches, error } = await db.rpc('wassaa_match_summaries', { p_user: uid, p_limit: 100 });
      if (error) return err('Could not load matches.', 500, origin);
      const partnerIds = (matches || []).map((m: Row) => m.partner_id);
      const { data: partners } = partnerIds.length ? await db.from('profiles').select('*').in('id', partnerIds) : { data: [] as Row[] };
      const partnerMap = new Map<string, Row>((partners || []).map((p: Row): [string, Row] => [p.id, p]));
      const output = (matches || []).flatMap((m: Row) => {
        const partner = partnerMap.get(m.partner_id);
        if (!partner) return [];
        const cold = m.origin === 'cold';
        const lastMessage = !m.last_kind
          ? (cold ? 'You started this conversation' : 'You matched')
          : m.last_kind === 'photo'
            ? (m.last_caption ? `Photo: ${m.last_caption}` : 'Shared a photo')
            : m.last_text || (cold ? 'You started this conversation' : 'You matched');
        return [{
          id: m.match_id,
          matchedAt: m.matched_at,
          profile: profileForViewer(partner, uid, true),
          lastMessage,
          lastMessageTime: m.last_created_at || m.matched_at,
          unread: Number(m.unread_count) || 0,
          // Cold outreach stays out of the matches list; it is a conversation,
          // not a match, until the other side likes back.
          cold,
          mutual: Boolean(m.mutual)
        }];
      });
      return json({ matches: output }, 200, origin);
    }
    if (msgMatch && (req.method === 'GET' || req.method === 'POST')) {
      if (req.method === 'POST') { const limited = await allowAction('message', 40, 60); if (limited) return limited; }
      const matchId = msgMatch[1];
      const { data: match } = await db.from('matches').select('*').eq('id', matchId).or(`user_a.eq.${uid},user_b.eq.${uid}`).maybeSingle();
      if (!match) return err('Match not found.', 404, origin);
      if (req.method === 'GET') {
        await tickMatch(db, matchId); // a due persona reply lands in this fetch; its state stays server-side
        const since = url.searchParams.get('since');
        if (since && Number.isNaN(Date.parse(since))) return err('Invalid "since" timestamp.', 400, origin);
        let q = db.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(500);
        if (since) q = q.gt('created_at', new Date(since).toISOString());
        const { data: msgs, error: messagesError } = await q;
        if (messagesError) return err('Could not load messages.', 500, origin);
        const partnerId = match.user_a === uid ? match.user_b : match.user_a;
        const { data: partner } = await db.from('profiles').select('*').eq('id', partnerId).maybeSingle();
        return json({ messages: await Promise.all((msgs || []).map(async (m: Row) => {
          if (m.kind === 'photo' && isStorageKey(m.media_url)) {
            if (!m.media_url.startsWith(`chat/${match.user_a}/`) && !m.media_url.startsWith(`chat/${match.user_b}/`)) return { ...messageRow(m), mediaUrl: undefined };
            return { ...messageRow(m), mediaUrl: await presignedGet(m.media_url) || undefined };
          }
          return messageRow(m);
        })), partner: partner ? profileForViewer(partner, uid, true) : null }, 200, origin);
      }
      const b = await getBody(), kind = b.kind;
      if (kind !== 'text' && kind !== 'photo') return err('This message type is not available.', 415, origin);
      const text = b.text == null ? null : cleanString(b.text, 4000), media = b.mediaUrl == null ? null : cleanString(b.mediaUrl, 500), caption = b.caption == null ? null : cleanString(b.caption, 500);
      if (kind === 'text' && !text?.trim()) return err('Message body required.', 400, origin);
      if (kind === 'photo' && (!isStorageKey(media) || !media.startsWith(`chat/${uid}/`))) return err('Upload a chat photo before sending it.', 400, origin);
      const partnerId = match.user_a === uid ? match.user_b : match.user_a;
      const { data: block } = await db.from('blocks').select('id').or(`and(blocker_id.eq.${uid},blocked_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},blocked_id.eq.${uid})`).limit(1);
      if (block?.length) return err('This conversation is unavailable.', 403, origin);
      // Every message costs 1 credit — persona or real member (KB §18E). One
      // atomic RPC does spend + insert + persona reply window, so a failed
      // spend never leaves a message behind.
      const { data: result, error: sendError } = await db.rpc('wassaa_send_message', {
        p_match: matchId, p_sender: uid, p_kind: kind, p_text: text, p_media_url: media, p_caption: caption
      });
      if (sendError) return err('Could not send message.', 500, origin);
      const outcome = Array.isArray(result) ? result[0] : result;
      if (outcome?.error === 'no_credits') return err('You are out of credits. Top up to keep chatting.', 402, origin, 'CREDITS_NEEDED');
      if (outcome?.error === 'cold_limit') return err(String(outcome.message || 'You can send up to 3 messages before they like you back.'), 403, origin, 'COLD_LIMIT');
      if (outcome?.error === 'blocked' || outcome?.error === 'forbidden' || outcome?.error === 'unavailable') return err('This conversation is unavailable.', 403, origin);
      if (outcome?.error) return err('Could not send message.', 500, origin);
      const { data: sent } = await db.from('messages').select('*').eq('id', outcome.messageId).maybeSingle();
      await db.from('match_reads').upsert({ user_id: uid, match_id: matchId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,match_id' });
      const mapped = sent ? messageRow(sent) : null;
      if (mapped && kind === 'photo' && media) mapped.mediaUrl = await presignedGet(media) || undefined;
      return json({ success: true, message: mapped, balance: typeof outcome.balance === 'number' ? outcome.balance : undefined, free: Boolean(outcome.free) }, 200, origin);
    }
    if (readMatch && req.method === 'POST') {
      const matchId = readMatch[1], { data: match } = await db.from('matches').select('id').eq('id', matchId).or(`user_a.eq.${uid},user_b.eq.${uid}`).maybeSingle();
      if (match) await db.from('match_reads').upsert({ user_id: uid, match_id: matchId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,match_id' });
      return json({ success: true }, 200, origin);
    }

    // Blocks and safety reports
    if (path === '/blocks' && req.method === 'GET') {
      const { data: rows } = await db.from('blocks').select('blocked_id,reason,created_at').eq('blocker_id', uid);
      const ids = (rows || []).map((x: Row) => x.blocked_id);
      const { data: people } = ids.length ? await db.from('profiles').select('id,name').in('id', ids) : { data: [] as Row[] };
      const names = new Map<string, string>((people || []).map((p: Row): [string, string] => [p.id, p.name]));
      return json({ blocked: (rows || []).map((r: Row) => ({ id: r.blocked_id, name: names.get(r.blocked_id) || 'Member', reason: r.reason || undefined, date: r.created_at })) }, 200, origin);
    }
    if (path === '/blocks' && req.method === 'POST') {
      const limited = await allowAction('block', 60, 3600); if (limited) return limited;
      const b = await getBody(), target = cleanString(b.blockedUserId, 64);
      if (!target || target === uid) return err('Invalid block target.', 400, origin);
      const { data: blockedProfile } = await db.from('profiles').select('id').eq('id', target).is('deleted_at', null).maybeSingle();
      if (!blockedProfile) return err('Profile not found.', 404, origin);
      const { error } = await db.from('blocks').upsert({ blocker_id: uid, blocked_id: target, reason: cleanString(b.reason, 255) || null }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      return error ? err('Could not block this member.', 500, origin) : json({ success: true }, 200, origin);
    }
    const unblock = path.match(/^\/blocks\/([0-9a-f-]+)$/i);
    if (unblock && req.method === 'DELETE') { await db.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', unblock[1]); return json({ success: true }, 200, origin); }
    if (path === '/reports' && req.method === 'POST') {
      const limited = await allowAction('report', 10, 3600); if (limited) return err('Too many reports submitted. Our safety team is reviewing your recent reports.', 429, origin);
      const b = await getBody(), reported = cleanString(b.reportedUserId, 64), category = cleanString(b.category, 80), rawDetails = String(b.details ?? '');
      if (rawDetails.length > 2000) return err('Details too long.', 400, origin);
      const details = cleanString(rawDetails, 2000);
      if (!reported || !category || !details) return err('reportedUserId, category and details are required.', 400, origin);
      if (reported === uid) return err('You cannot report your own profile.', 400, origin);
      const { data: reportedProfile } = await db.from('profiles').select('id').eq('id', reported).is('deleted_at', null).maybeSingle();
      if (!reportedProfile) return err('Profile not found.', 404, origin);
      // Attach the conversation evidence when the report comes from chat (KB §18D):
      // the match/message refs must actually belong to this reporter and target.
      let matchIdOut: string | null = null, messageIdOut: string | null = null;
      const validateMatch = async (id: string): Promise<string | null> => {
        if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
        const { data: m } = await db.from('matches').select('id,user_a,user_b').eq('id', id).maybeSingle();
        if (!m) return null;
        const members = [m.user_a, m.user_b];
        return members.includes(uid) && members.includes(reported) ? m.id : null;
      };
      if (b.matchId) matchIdOut = await validateMatch(cleanString(b.matchId, 64));
      if (b.messageId) {
        const { data: m } = await db.from('messages').select('id,match_id').eq('id', cleanString(b.messageId, 64)).maybeSingle();
        if (m) {
          const fromMessage = await validateMatch(m.match_id);
          if (fromMessage && (!matchIdOut || fromMessage === matchIdOut)) { matchIdOut = fromMessage; messageIdOut = m.id; }
        }
      }
      const categoryLabel = cleanString(b.categoryLabel, 100) || category;
      // Block first, report second: if the block is written but the report fails
      // the member is still protected; the old order could file "reported and
      // blocked" while the block row was missing.
      if (b.alsoBlock) {
        const { error: blockError } = await db.from('blocks').upsert({ blocker_id: uid, blocked_id: reported, reason: `Reported for ${categoryLabel}` }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
        if (blockError) return err('Could not block this member. No report was filed; try again.', 500, origin);
      }
      const { data: report, error } = await db.from('reports').insert({ reporter_id: uid, reported_user_id: reported, category, category_label: categoryLabel, details, service_branch: cleanString(b.serviceBranch, 100) || null, also_blocked: Boolean(b.alsoBlock), match_id: matchIdOut, message_id: messageIdOut }).select('*').single();
      if (error) return err('Could not submit report.', 500, origin);
      return json({ success: true, report: { id: report.id, status: report.status } }, 200, origin);
    }

    // Appeals: restricted/banned members ask for review (KB §18D). The guard
    // above lets this route through for sanctioned accounts only.
    if (path === '/appeals' && req.method === 'GET') {
      const { data: appeals } = await db.from('appeals').select('*').eq('profile_id', uid).order('created_at', { ascending: false }).limit(5);
      return json({ appeals: (appeals || []).map((a: Row) => ({ id: a.id, status: a.status, note: a.note, sanctionReason: a.sanction_reason || undefined, decisionNote: a.decision_note || undefined, createdAt: a.created_at, decidedAt: a.decided_at || undefined })) }, 200, origin);
    }
    if (path === '/appeals' && req.method === 'POST') {
      const limited = await allowAction('appeal', 3, 86400); if (limited) return limited;
      if (accountStatusOf(profile) === 'active') return err('Your account is in good standing — no appeal is needed.', 409, origin);
      const b = await getBody(), note = cleanString(b.note, 1000);
      if (note.length < 10) return err('Tell us a bit more (at least 10 characters).', 400, origin);
      const { data: pending } = await db.from('appeals').select('id').eq('profile_id', uid).eq('status', 'pending').maybeSingle();
      if (pending) return err('You already have an appeal under review.', 409, origin, 'APPEAL_PENDING');
      const { data: appeal, error } = await db.from('appeals').insert({ profile_id: uid, sanction_reason: profile.restriction_reason || null, note }).select('*').single();
      if (error) return err('Could not submit your appeal.', 500, origin);
      return json({ success: true, appeal: { id: appeal.id, status: appeal.status, createdAt: appeal.created_at } }, 200, origin);
    }

    // Verification submission, status, and short-lived uploads
    if (path === '/verification/status' && req.method === 'GET') {
      const { data: pending } = await db.from('verification_submissions').select('id').eq('user_id', uid).eq('status', 'pending').order('submitted_at', { ascending: false }).limit(1).maybeSingle();
      return json({ status: profile.verification_status, verifiedAt: profile.verified_at, documentType: profile.document_type, pendingSubmissionId: pending?.id }, 200, origin);
    }
    if (path === '/verification/submit' && req.method === 'POST') {
      const limited = await allowAction('verification', 5, 86400); if (limited) return err('Verification submission limit reached. Contact support if your documents keep being rejected.', 429, origin);
      const b = await getBody(), types = ['NIN','Passport','DriversLicense','ServiceID'];
      if (!types.includes(String(b.documentType))) return err('documentType must be NIN, Passport, DriversLicense or ServiceID.', 400, origin);
      const idDoc = b.idDocKey || b.idDocDataUrl, selfie = b.selfieKey || b.selfieDataUrl;
      if (!isStorageKey(idDoc) || !String(idDoc).startsWith(`verification/${uid}/`) || !isStorageKey(selfie) || !String(selfie).startsWith(`verification/${uid}/`)) return err('Upload the ID and selfie through secure storage first.', 400, origin);
      // Deliberate privacy decision (KB 2026-11-05): the product captures no
      // document number at all, so the stored mask stays empty. Keep the RPC
      // argument explicit rather than accepting a client-supplied mask.
      const { data: submission, error } = await db.rpc('wassaa_submit_verification', { p_user: uid, p_document_type: b.documentType, p_document_number_masked: '', p_id_doc_url: idDoc, p_selfie_url: selfie });
      if (error) return err('Could not submit verification.', 500, origin);
      const outcome = Array.isArray(submission) ? submission[0] : submission;
      if (outcome?.result === 'verified') return err('This account is already verified.', 409, origin);
      if (outcome?.result === 'pending') return err('You already have a verification under review.', 409, origin);
      if (outcome?.result !== 'created') return err('Account not found.', 404, origin);
      const { data: updated } = await db.from('profiles').select('*').eq('id', uid).single();
      return json({ success: true, status: 'pending', submissionId: outcome.submission_id, message: 'Verification submitted.', user: updated ? profilePayload(updated) : null }, 200, origin);
    }
    if (path === '/uploads/presign' && req.method === 'POST') {
      const limited = await allowAction('upload', 40, 3600); if (limited) return limited;
      const b = await getBody(), kind = String(b.kind), contentType = String(b.contentType || 'image/jpeg').toLowerCase();
      if (!['photo','id_doc','selfie','chat_photo'].includes(kind)) return err('Invalid upload kind.', 400, origin);
      if (!['image/jpeg','image/png','image/webp'].includes(contentType)) return err('Only JPEG, PNG or WebP images are accepted.', 415, origin);
      const contentLength = Number(b.contentLength), maxBytes = kind === 'id_doc' || kind === 'selfie' ? 10 * 1024 * 1024 : 6 * 1024 * 1024;
      if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > maxBytes) return err(`Image size must be between 1 byte and ${Math.floor(maxBytes / 1024 / 1024)} MB.`, 413, origin);
      const client = await s3Client(), privateBucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET'), publicBucket = Deno.env.get('R2_PUBLIC_BUCKET');
      if (!client || !privateBucket || (kind === 'photo' && !publicBucket)) return err('Object storage is not configured.', 503, origin);
      const key = objectKey(kind, uid, contentType), bucket = kind === 'photo' ? publicBucket! : privateBucket;
      const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), { expiresIn: 300 });
      const base = (Deno.env.get('R2_PUBLIC_BASE_URL') || '').replace(/\/$/, '');
      return json({ uploadUrl, key, expiresIn: 300, publicUrl: kind === 'photo' && base ? `${base}/${key}` : null, storage: true }, 200, origin);
    }

    // Billing, with provider-verified fulfillment only.
    if (path === '/billing/entitlements' && req.method === 'GET') {
      const tier = profile.tier || 'free';
      const base = tier === 'hyper_premium' ? { tier, dailyLikes: -1, canSeeLikes: true, canRewind: true, incognito: true, privateIntroduction: true, boostsPerMonth: 3, readReceipts: true } : tier === 'premium' ? { tier, dailyLikes: -1, canSeeLikes: true, canRewind: true, incognito: false, privateIntroduction: false, boostsPerMonth: 1, readReceipts: false } : { tier: 'free', dailyLikes: PRICING.freeDailySwipes, canSeeLikes: false, canRewind: false, incognito: false, privateIntroduction: false, boostsPerMonth: 0, readReceipts: false };
      const { data: fresh } = await db.from('profiles').select('credits,revealed_likes_at').eq('id', uid).maybeSingle();
      const credits = fresh?.credits ?? profile.credits ?? 0;
      // "See who liked you" is a credit feature now: unlocked for 24h per reveal.
      const revealed = Boolean(fresh?.revealed_likes_at) && Date.now() - Date.parse(fresh.revealed_likes_at) < 24 * 3600 * 1000;
      const countryCode = (profile.country_code || 'NG').toUpperCase();
      const packs = await packsForCountry(db, countryCode);
      return json({ ...base, canSeeLikes: revealed, credits, revealLikesCost: 15, pricing: { text: PRICING.text, photo: PRICING.photo, coldBase: PRICING.coldBase, coldStep: PRICING.coldStep, coldMax: PRICING.coldMax, freeDailySwipes: PRICING.freeDailySwipes, paidSwipe: PRICING.paidSwipe, revealLikes: PRICING.revealLikes }, freeChat: isFreeChat(profile), creditRegionSupported: creditRegionSupported(countryCode), dailyCreditAllowance: dailyCreditAllowance(profile), countryCode, packBand: packs[0]?.band || 'ng', settlementCurrency: 'NGN', packs }, 200, origin);
    }
    if (path === '/billing/checkout' && req.method === 'POST') {
      const limited = await allowAction('checkout', 5, 600); if (limited) return limited;
      const b = await getBody(), planId = cleanString(b.planId, 40);
      // Price is authoritative on the server: the client sends a pack code, the
      // band comes from the member's country, and `amount_minor` is what is
      // charged. A client-supplied price is never trusted.
      const { data: packRow, error: packError } = await db.rpc('wassaa_credit_pack', { p_code: planId, p_country: (profile.country_code || 'NG').toUpperCase() });
      const plan = (!packError && packRow ? packRow : null) as Row | null;
      if (!plan || !plan.amountMinor || !plan.credits) return err('Unknown credit pack.', 400, origin);
      const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
      if (!paystackKey) return err('Payments are not configured.', 503, origin);
      const amountMinor = Number(plan.amountMinor), currency = String(plan.currency || 'NGN');
      const reference = `wss_${crypto.randomUUID().replace(/-/g,'')}`;
      const fallbackEmail = `${String(profile.phone || '').replace(/\D/g, '') || 'member'}@guest.wassaa.ng`;
      const email = cleanString(b.email || user.email || profile.email || fallbackEmail, 200);
      if (!email || !email.includes('@')) return err('A valid email address is required for checkout.', 400, origin);
      const { error: paymentError } = await db.from('payments').insert({ reference, user_id: uid, plan_id: planId, amount_kobo: amountMinor, currency, status: 'pending', credits_amount: plan.credits });
      if (paymentError) return err('Could not create payment record.', 500, origin);
      // The callback must land on the deployed app, never on a developer's
      // machine. A localhost value in the secret used to send production
      // payers to an unreachable page, so it is rejected here and replaced
      // with the HTTPS app origin + /payment/callback (a static page that
      // closes the checkout popup; the opener polls /billing/activate).
      const configuredCallback = Deno.env.get('PAYSTACK_CALLBACK_URL') || '';
      const callbackUrl = /^https:\/\//i.test(configuredCallback) && !/(localhost|127\.0\.0\.1)/i.test(configuredCallback)
        ? configuredCallback
        : `${(allowedOrigins.find((o) => o.startsWith('https://') && !o.includes('wassaa.app')) || 'https://wassaa.vercel.app').replace(/\/$/, '')}/payment/callback`;
      const response = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, amount: amountMinor, currency, email, callback_url: callbackUrl, metadata: { planId, credits: plan.credits, band: plan.band, userId: uid } }), signal: AbortSignal.timeout(10000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.status || !result.data?.authorization_url) {
        await db.from('payments').update({ status: 'failed' }).eq('reference', reference).eq('status', 'pending');
        return err('Payment provider error. Try again shortly.', 502, origin);
      }
      return json({ success: true, sandbox: false, reference, authorizationUrl: result.data.authorization_url, amountNaira: amountMinor / 100, currency, band: plan.band, credits: plan.credits }, 200, origin);
    }
    if (path === '/billing/activate' && req.method === 'POST') {
      const b = await getBody(), reference = cleanString(b.reference, 100);
      const { data: payment } = await db.from('payments').select('status,user_id').eq('reference', reference).maybeSingle();
      if (!payment || payment.user_id !== uid) return err('Payment not found.', 404, origin);
      if (payment.status !== 'success') return err('Payment not confirmed yet. If you just paid, wait a moment and retry.', 402, origin);
      const { data: current } = await db.from('profiles').select('tier,credits').eq('id', uid).single();
      return json({ success: true, tier: current?.tier || profile.tier, credits: current?.credits ?? 0 }, 200, origin);
    }
    if (path === '/billing/sandbox/complete' && req.method === 'POST') return err('Sandbox payment completion is disabled.', 404, origin);

    // ---- notifications (in-app feed, mark-read, mute, preferences) ----
    // Admin notifications live in the admin router (`/admin/activity`,
    // `/admin/notifications/deliver`), because `/admin/*` never reaches here.
    {
      const r = await notificationsRoute(db, profile, uid, path, req, origin);
      if (r) return r;
    }

    return err(`No route: ${req.method} ${path}`, 404, origin);
  } catch (e) {
    if (e instanceof SyntaxError) return err('Invalid JSON body.', 400, origin);
    if (e instanceof Error && e.message === 'Request body is too large.') return err(e.message, 413, origin);
    console.error('[wassaa-edge-api] request failed', { path, message: e instanceof Error ? e.message : 'unknown' });
    return err('Internal error.', 500, origin);
  }
});
