import { createClient } from 'npm:@supabase/supabase-js@2';
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3';
import { ageAt, greatCircleDistanceKm, isOnboardingComplete } from './domain.ts';

type Row = Record<string, any>;
const allowedOrigins = (Deno.env.get('APP_ORIGINS') || 'https://wassaa.app,http://localhost:5173,http://localhost:5174,http://localhost:4173').split(',').map((s) => s.trim());
const PLANS = [
  { id: 'free', name: 'Free', tagline: 'Meet the community', priceNgn: 0, period: 'free', features: ['Browse profiles', 'Like up to 30 profiles per day', '1 Super Like per week'] },
  { id: 'premium', name: 'Premium', tagline: 'More connections', priceNgn: 1500, period: 'one-time', isPopular: true, features: ['Unlimited profile likes', '5 Super Likes per week', 'See who liked you'] },
  { id: 'hyper_premium', name: 'Hyper Premium', tagline: 'More Super Likes', priceNgn: 5000, period: 'one-time', features: ['Unlimited profile likes', '15 Super Likes per week', 'See who liked you'] }
];
const DEFAULT_PRIVACY = { serviceVisibility: 'matches', rankVisibility: 'private', verificationDisplay: 'badge', chatNotifications: true, twoFactorAuth: false, privateIntroductionOptIn: true };
const MAX_JSON_BYTES = 1_500_000;

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
function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), 'Content-Type': 'application/json' } });
}
function err(message: string, status = 400, origin: string | null = null, code?: string): Response {
  return json({ error: message, ...(code ? { code } : {}) }, status, origin);
}
function cleanString(value: unknown, max = 500): string { return String(value ?? '').trim().slice(0, max); }
const ageOf = ageAt;
function profileForViewer(p: Row, viewerId: string, mutual = false, distanceKm?: number) {
  const privacy = p.privacy || DEFAULT_PRIVACY;
  return {
    id: p.id, name: p.name || 'New member',
    ...(p.id === viewerId ? { email: p.email || undefined, phone: p.phone || undefined, hasPreciseLocation: p.location_lat != null && p.location_lng != null } : {}),
    phoneVerified: Boolean(p.phone),
    ...(p.id === viewerId && p.birth_date ? { birthDate: p.birth_date } : {}), age: ageOf(p.birth_date),
    gender: p.gender || undefined, pronouns: p.pronouns || undefined,
    professionCategory: p.profession_category || 'Others', professionTitle: p.profession_title || undefined,
    companyOrOrg: p.company_or_org || undefined,
    service: privacy.serviceVisibility === 'private' || (privacy.serviceVisibility === 'matches' && !mutual) ? undefined : p.service || undefined,
    rank: privacy.rankVisibility === 'private' || (privacy.rankVisibility === 'matches' && !mutual) ? undefined : p.rank || undefined,
    dutyStation: privacy.rankVisibility === 'private' ? undefined : p.duty_station || undefined,
    city: p.city || '', state: p.state || '', bio: p.bio || '', photos: p.photos || [], interests: p.interests || [],
    ...(distanceKm != null ? { distanceKm } : {}),
    datingGoal: p.dating_goal || undefined, matchPreferences: p.match_preferences || undefined,
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
function reportRow(r: Row) {
  return { id: r.id, reporterId: r.reporter_id, reportedUserId: r.reported_user_id, category: r.category, categoryLabel: r.category_label,
    details: r.details, serviceBranch: r.service_branch || undefined, alsoBlocked: r.also_blocked, status: r.status, createdAt: r.created_at };
}
async function bodyJson(req: Request): Promise<Row> {
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

async function handlePaystackWebhook(req: Request): Promise<Response> {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY'), signature = req.headers.get('x-paystack-signature');
  if (!secret || !signature) return new Response('Invalid webhook signature', { status: 401 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response('Payload too large', { status: 413 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  let diff = expected.length ^ signature.length;
  for (let i = 0; i < Math.min(expected.length, signature.length); i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return new Response('Invalid webhook signature', { status: 401 });
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
  if (path === '/admin/session' && req.method === 'GET') return json({ ok: true, storage: Boolean(await s3Client()) }, 200, origin);
  const idMatch = path.match(/^\/admin\/verifications\/([0-9a-f-]+)\/review$/i);
  const reportMatch = path.match(/^\/admin\/reports\/([0-9a-f-]+)\/status$/i);
  const blockMatch = path.match(/^\/admin\/users\/([0-9a-f-]+)\/block$/i);
  const actor = cleanString(admin.display_name, 60) || user.id;
  if (path === '/admin/verifications' && req.method === 'GET') {
    const { data: queue, error } = await db.from('verification_submissions').select('*').eq('status', 'pending').order('submitted_at', { ascending: true }).limit(200);
    if (error) return err('Could not load verification queue.', 500, origin);
    const userIds = [...new Set((queue || []).map((s: Row) => s.user_id))];
    const { data: profiles } = userIds.length ? await db.from('profiles').select('id,name,birth_date,gender,phone,city,state,profession_title,profession_category,verification_status,photos').in('id', userIds) : { data: [] as Row[] };
    const byId = new Map((profiles || []).map((p: Row) => [p.id, p]));
    return json({ queue: await Promise.all((queue || []).map(async (s: Row) => {
      const getMedia = async (key: string | null) => {
        if (!key) return null;
        if (!isStorageKey(key)) return key;
        return await presignedGet(key);
      };
      const p = byId.get(s.user_id);
      return { id: s.id, submittedAt: s.submitted_at, documentType: s.document_type, documentNumberMasked: s.document_number_masked,
        idDocUrl: await getMedia(s.id_doc_url), selfieUrl: await getMedia(s.selfie_url),
        profile: p ? { id: p.id, name: p.name, birthDate: p.birth_date, age: ageOf(p.birth_date), gender: p.gender, phone: p.phone, city: p.city, state: p.state, professionTitle: p.profession_title, professionCategory: p.profession_category, verificationStatus: p.verification_status, photos: p.photos } : null };
    })), storage: Boolean(await s3Client()) }, 200, origin);
  }
  if (idMatch && req.method === 'POST') {
    const b = await bodyJson(req), approve = Boolean(b.approve), note = cleanString(b.note, 500) || null;
    const { data: sub } = await db.from('verification_submissions').select('*').eq('id', idMatch[1]).maybeSingle();
    if (!sub) return err('Submission not found.', 404, origin);
    if (sub.status !== 'pending') return err('This submission has already been reviewed.', 409, origin);
    const storage = await s3Client(), bucket = Deno.env.get('R2_PRIVATE_BUCKET') || Deno.env.get('R2_BUCKET');
    const mediaKeys = [sub.id_doc_url, sub.selfie_url].filter((key: unknown): key is string => isStorageKey(key));
    if (mediaKeys.length && (!storage || !bucket)) return err('Private media storage is unavailable; documents were not purged.', 503, origin);
    try {
      if (storage && bucket) for (const key of mediaKeys) {
        if (!key.startsWith(`verification/${sub.user_id}/`)) return err('Verification media ownership check failed.', 403, origin);
        await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    } catch {
      return err('Could not securely purge verification media. Retry the review.', 502, origin);
    }
    const now = new Date().toISOString();
    const { data: resolved, error } = await db.from('verification_submissions').update({ status: approve ? 'verified' : 'rejected', reviewed_at: now, reviewed_by: actor, review_note: note, id_doc_url: null, selfie_url: null }).eq('id', idMatch[1]).eq('status', 'pending').select('*').maybeSingle();
    if (error) return err('Could not resolve verification.', 500, origin);
    if (!resolved) return err('This submission has already been reviewed.', 409, origin);
    await db.from('profiles').update({ verification_status: approve ? 'verified' : 'rejected', verified_at: approve ? now.slice(0, 10) : null, updated_at: now }).eq('id', sub.user_id);
    await db.from('admin_audit').insert({ admin_id: actor, action: approve ? 'verification.approved' : 'verification.rejected', target_id: resolved.id, detail: { userId: sub.user_id, note } });
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
    const { data: profiles } = ids.length ? await db.from('profiles').select('id,name,blocked_us,verification_status').in('id', ids) : { data: [] as Row[] };
    const byId = new Map((profiles || []).map((p: Row) => [p.id, p]));
    return json({ reports: (reports || []).map((r: Row) => ({ ...reportRow(r), reporter: byId.get(r.reporter_id) ? { id: r.reporter_id, name: byId.get(r.reporter_id).name } : null, reported: byId.get(r.reported_user_id) ? { id: r.reported_user_id, name: byId.get(r.reported_user_id).name, blocked: byId.get(r.reported_user_id).blocked_us, verificationStatus: byId.get(r.reported_user_id).verification_status } : null })) }, 200, origin);
  }
  if (reportMatch && req.method === 'POST') {
    const b = await bodyJson(req), status = String(b.status);
    if (!['pending_review','investigating','resolved','dismissed'].includes(status)) return err('Invalid report status.', 400, origin);
    const { data: report, error } = await db.from('reports').update({ status }).eq('id', reportMatch[1]).select('*').maybeSingle();
    if (error) return err('Could not update report.', 500, origin);
    if (!report) return err('Report not found.', 404, origin);
    await db.from('admin_audit').insert({ admin_id: actor, action: 'report.status', target_id: report.id, detail: { status } });
    return json({ success: true, report: reportRow(report) }, 200, origin);
  }
  if (blockMatch && req.method === 'POST') {
    const b = await bodyJson(req), blocked = b.blocked !== false;
    const { data: target } = await db.from('profiles').select('id,name').eq('id', blockMatch[1]).maybeSingle();
    if (!target) return err('Profile not found.', 404, origin);
    await db.from('profiles').update({ blocked_us: blocked, updated_at: new Date().toISOString() }).eq('id', target.id);
    await db.from('admin_audit').insert({ admin_id: actor, action: blocked ? 'user.blocked' : 'user.unblocked', target_id: target.id, detail: { reason: cleanString(b.reason, 200) || null } });
    return json({ success: true, user: { id: target.id, name: target.name, blocked } }, 200, origin);
  }
  if (path === '/admin/audit' && req.method === 'GET') {
    const limit = Math.min(200, Math.max(1, Number(reqUrl(req).searchParams.get('limit')) || 50));
    const { data, error } = await db.from('admin_audit').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) return err('Could not load audit history.', 500, origin);
    return json({ actions: (data || []).map((r: Row) => ({ id: String(r.id), adminId: r.admin_id, action: r.action, targetId: r.target_id || undefined, detail: r.detail || undefined, createdAt: r.created_at })) }, 200, origin);
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
  if ((path === '/billing/plans-public' || path === '/billing/plans') && req.method === 'GET') return json({ plans: PLANS, consumables: [] }, 200, origin);
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
  if (!profile || profile.deleted_at || profile.blocked_us) return err('Account unavailable.', 403, origin);
  const uid = profile.id as string;
  const onboardingRoutes = new Set(['/auth/session', '/me/profile', '/me/preferences', '/me/location', '/uploads/presign', '/me/account']);
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
    if (path === '/auth/session' && req.method === 'GET') return json({ user: profilePayload(profile) }, 200, origin);
    if (path === '/me/profile' && req.method === 'GET') return json({ user: profilePayload(profile) }, 200, origin);
    if (path === '/me/profile' && req.method === 'PATCH') {
      const b = await getBody(); const fields: Record<string, string> = { name: 'name', birthDate: 'birth_date', gender: 'gender', pronouns: 'pronouns', professionCategory: 'profession_category', professionTitle: 'profession_title', companyOrOrg: 'company_or_org', service: 'service', rank: 'rank', dutyStation: 'duty_station', city: 'city', state: 'state', bio: 'bio', datingGoal: 'dating_goal' };
      const update: Row = {};
      for (const [key, column] of Object.entries(fields)) if (b[key] !== undefined && typeof b[key] === 'string') update[column] = cleanString(b[key], ({ name: 60, bio: 1000, service: 80, rank: 80, profession_title: 80, city: 100, state: 100, duty_station: 120 } as Record<string, number>)[column] || 150);
      if (update.birth_date) {
        const birth = new Date(`${update.birth_date}T00:00:00Z`);
        const age = ageOf(update.birth_date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(update.birth_date) || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== update.birth_date) return err('Enter a valid date of birth.', 400, origin);
        if (age == null || age < 18 || age > 110) return err('You must be at least 18 years old to use Wassaa.', 400, origin);
      }
      if (update.gender !== undefined && !['female','male'].includes(update.gender)) return err('Choose a valid gender.', 400, origin);
      if (update.name !== undefined && !update.name) return err('Name cannot be empty.', 400, origin);
      if (Array.isArray(b.photos)) update.photos = b.photos.map((v: unknown) => cleanString(v, 600)).filter((v: string) => /^https:\/\//i.test(v) || /^\/(?!\/)/.test(v)).slice(0, 8);
      if (Array.isArray(b.interests)) update.interests = b.interests.map((v: unknown) => cleanString(v, 80)).filter(Boolean).slice(0, 8);
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
      const { error } = await db.from('profiles').update({
        location_lat: clearLocation ? null : latitude,
        location_lng: clearLocation ? null : longitude,
        updated_at: new Date().toISOString()
      }).eq('id', uid);
      if (error) return err('Could not update location settings.', 500, origin);
      if (clearLocation && profile.match_preferences?.maxDistanceKm) {
        const preferences = { ...profile.match_preferences };
        delete preferences.maxDistanceKm;
        const { error: preferenceError } = await db.from('profiles').update({ match_preferences: preferences }).eq('id', uid);
        if (preferenceError) return err('Location was cleared, but distance matching could not be disabled.', 500, origin);
      }
      return json({ success: true, hasPreciseLocation: !clearLocation }, 200, origin);
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
          const { data: messages } = matchIds.length ? await db.from('messages').select('media_url').in('match_id', matchIds) : { data: [] as Row[] };
          const keys = [
            ...(messages || []).map((m: Row) => m.media_url),
            ...(submissions || []).flatMap((s: Row) => [s.id_doc_url, s.selfie_url])
          ].filter((key: unknown): key is string => isStorageKey(key));
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
      const b = await getBody(), targetId = cleanString(b.targetUserId, 64), kind = b.superLike ? 'super' : 'like';
      if (!targetId || targetId === uid) return err('You cannot like your own profile.', 400, origin);
      const { data: target } = await db.from('profiles').select('*').eq('id', targetId).is('deleted_at', null).maybeSingle();
      if (!target || target.blocked_us) return err('Profile not found.', 404, origin);
      const { data: outcome, error } = await db.rpc('wassaa_record_like', { p_from: uid, p_to: targetId, p_kind: kind, p_daily_limit: profile.tier === 'free' ? 30 : -1, p_weekly_super_limit: profile.tier === 'hyper_premium' ? 15 : profile.tier === 'premium' ? 5 : 1 });
      if (error) return err('Could not save this like.', 500, origin);
      if (outcome === 'blocked') return err('Unable to interact with this profile.', 403, origin);
      if (outcome === 'daily_limit') return err('Daily like limit reached. Upgrade to Premium for unlimited likes.', 402, origin, 'LIKE_LIMIT');
      if (outcome === 'super_limit') return err('Your weekly Super Like allowance has been used.', 402, origin, 'SUPER_LIMIT');
      const { data: matchId } = await db.rpc('wassaa_find_or_create_match', { p_a: uid, p_b: targetId });
      return json({ success: true, isMatch: Boolean(matchId), ...(matchId ? { match: { id: matchId, partner: profileForViewer(target, uid, true) } } : {}), ...(outcome === 'already' ? { already: true } : {}) }, 200, origin);
    }
    if (path === '/passes' && req.method === 'POST') {
      const limited = await allowAction('pass', 300, 600); if (limited) return limited;
      const b = await getBody(), targetId = cleanString(b.targetUserId, 64);
      if (!targetId || targetId === uid) return err('Invalid pass target.', 400, origin);
      const { data: target } = await db.from('profiles').select('id,blocked_us').eq('id', targetId).is('deleted_at', null).maybeSingle();
      if (!target || target.blocked_us) return err('Profile not found.', 404, origin);
      const { data: block } = await db.from('blocks').select('id').or(`and(blocker_id.eq.${uid},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${uid})`).limit(1);
      if (block?.length) return err('Unable to interact with this profile.', 403, origin);
      const { error } = await db.from('swipes').upsert({ from_user_id: uid, to_user_id: targetId, kind: 'pass' }, { onConflict: 'from_user_id,to_user_id', ignoreDuplicates: true });
      if (error) return err('Could not save pass.', 500, origin);
      return json({ success: true }, 200, origin);
    }
    if (path === '/likes/received' && req.method === 'GET') {
      if (profile.tier === 'free') return err('Upgrade to Premium to see who liked you.', 402, origin, 'UPGRADE_NEEDED');
      const [{ data: likes }, { data: swiped }, { data: blockRows }] = await Promise.all([
        db.from('swipes').select('from_user_id').eq('to_user_id', uid).neq('kind', 'pass'),
        db.from('swipes').select('to_user_id').eq('from_user_id', uid),
        db.from('blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`)
      ]);
      const exclude = new Set([...(swiped || []).map((x: Row) => x.to_user_id), ...(blockRows || []).map((x: Row) => x.blocker_id === uid ? x.blocked_id : x.blocker_id)]);
      const ids = [...new Set((likes || []).map((x: Row) => x.from_user_id).filter((id: string) => !exclude.has(id)))];
      if (!ids.length) return json({ likes: [] }, 200, origin);
      const { data: profiles } = await db.from('profiles').select('*').in('id', ids).eq('blocked_us', false).is('deleted_at', null);
      return json({ likes: (profiles || []).map((p: Row) => profileForViewer(p, uid, false)) }, 200, origin);
    }

    // Match list and chat
    const msgMatch = path.match(/^\/matches\/([0-9a-f-]+)\/messages$/i), readMatch = path.match(/^\/matches\/([0-9a-f-]+)\/read$/i);
    if (path === '/matches' && req.method === 'GET') {
      const { data: matches, error } = await db.rpc('wassaa_match_summaries', { p_user: uid, p_limit: 100 });
      if (error) return err('Could not load matches.', 500, origin);
      const partnerIds = (matches || []).map((m: Row) => m.partner_id);
      const { data: partners } = partnerIds.length ? await db.from('profiles').select('*').in('id', partnerIds) : { data: [] as Row[] };
      const partnerMap = new Map((partners || []).map((p: Row) => [p.id, p]));
      const output = (matches || []).flatMap((m: Row) => {
        const partner = partnerMap.get(m.partner_id);
        if (!partner) return [];
        const lastMessage = !m.last_kind ? 'You matched' : m.last_kind === 'photo' ? (m.last_caption ? `Photo: ${m.last_caption}` : 'Shared a photo') : m.last_text || 'You matched';
        return [{ id: m.match_id, matchedAt: m.matched_at, profile: profileForViewer(partner, uid, true), lastMessage, lastMessageTime: m.last_created_at || m.matched_at, unread: Number(m.unread_count) || 0 }];
      });
      return json({ matches: output }, 200, origin);
    }
    if (msgMatch && (req.method === 'GET' || req.method === 'POST')) {
      if (req.method === 'POST') { const limited = await allowAction('message', 40, 60); if (limited) return limited; }
      const matchId = msgMatch[1];
      const { data: match } = await db.from('matches').select('*').eq('id', matchId).or(`user_a.eq.${uid},user_b.eq.${uid}`).maybeSingle();
      if (!match) return err('Match not found.', 404, origin);
      if (req.method === 'GET') {
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
      const { data: msg, error } = await db.from('messages').insert({ match_id: matchId, sender_id: uid, kind, text, media_url: media, caption }).select('*').single();
      if (error) return err('Could not send message.', 500, origin);
      await db.from('match_reads').upsert({ user_id: uid, match_id: matchId, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,match_id' });
      const mapped = messageRow(msg); if (kind === 'photo') mapped.mediaUrl = media ? await presignedGet(media) || undefined : undefined;
      return json({ success: true, message: mapped }, 200, origin);
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
      const names = new Map((people || []).map((p: Row) => [p.id, p.name]));
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
      const { data: report, error } = await db.from('reports').insert({ reporter_id: uid, reported_user_id: reported, category, category_label: cleanString(b.categoryLabel, 100) || category, details, service_branch: cleanString(b.serviceBranch, 100) || null, also_blocked: Boolean(b.alsoBlock) }).select('*').single();
      if (error) return err('Could not submit report.', 500, origin);
      if (b.alsoBlock) await db.from('blocks').upsert({ blocker_id: uid, blocked_id: reported, reason: `Reported for ${report.category_label}` }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
      return json({ success: true, report: { id: report.id, status: report.status } }, 200, origin);
    }

    // Verification submission, status, and short-lived uploads
    if (path === '/verification/status' && req.method === 'GET') {
      const { data: pending } = await db.from('verification_submissions').select('id').eq('user_id', uid).eq('status', 'pending').order('submitted_at', { ascending: false }).limit(1).maybeSingle();
      return json({ status: profile.verification_status, verifiedAt: profile.verified_at, documentType: profile.document_type, pendingSubmissionId: pending?.id }, 200, origin);
    }
    if (path === '/verification/submit' && req.method === 'POST') {
      const limited = await allowAction('verification', 5, 86400); if (limited) return err('Verification submission limit reached. Contact support if your documents keep being rejected.', 429, origin);
      const b = await getBody(), types = ['NIN','Passport','DriversLicense','ServiceID'], docNo = cleanString(b.documentNumber, 100).replace(/[^A-Za-z0-9]/g, '');
      if (!types.includes(String(b.documentType))) return err('documentType must be NIN, Passport, DriversLicense or ServiceID.', 400, origin);
      if (docNo.length < 4 || docNo.length > 32) return err('Enter a valid document number.', 400, origin);
      const idDoc = b.idDocKey || b.idDocDataUrl, selfie = b.selfieKey || b.selfieDataUrl;
      if (!isStorageKey(idDoc) || !String(idDoc).startsWith(`verification/${uid}/`) || !isStorageKey(selfie) || !String(selfie).startsWith(`verification/${uid}/`)) return err('Upload the ID and selfie through secure storage first.', 400, origin);
      const masked = docNo.replace(/.(?=.{3})/g, '*');
      const { data: submission, error } = await db.rpc('wassaa_submit_verification', { p_user: uid, p_document_type: b.documentType, p_document_number_masked: masked, p_id_doc_url: idDoc, p_selfie_url: selfie });
      if (error) return err('Could not submit verification.', 500, origin);
      const outcome = Array.isArray(submission) ? submission[0] : submission;
      if (outcome?.result === 'verified') return err('This account is already verified.', 409, origin);
      if (outcome?.result === 'pending') return err('You already have a verification under review.', 409, origin);
      if (outcome?.result !== 'created') return err('Account not found.', 404, origin);
      const { data: updated } = await db.from('profiles').select('*').eq('id', uid).single();
      return json({ success: true, status: 'pending', submissionId: outcome.submission_id, message: 'Submitted for review. Documents are purged after a decision.', user: updated ? profilePayload(updated) : null }, 200, origin);
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
      return json(tier === 'hyper_premium' ? { tier, dailyLikes: -1, superLikesPerWeek: 15, canSeeLikes: true, canRewind: true, incognito: true, privateIntroduction: true, boostsPerMonth: 3, readReceipts: true } : tier === 'premium' ? { tier, dailyLikes: -1, superLikesPerWeek: 5, canSeeLikes: true, canRewind: true, incognito: false, privateIntroduction: false, boostsPerMonth: 1, readReceipts: false } : { tier: 'free', dailyLikes: 30, superLikesPerWeek: 1, canSeeLikes: false, canRewind: false, incognito: false, privateIntroduction: false, boostsPerMonth: 0, readReceipts: false }, 200, origin);
    }
    if (path === '/billing/checkout' && req.method === 'POST') {
      const limited = await allowAction('checkout', 5, 600); if (limited) return limited;
      const b = await getBody(), planId = String(b.planId), plan = planId === 'premium' ? { naira: 1500 } : planId === 'hyper_premium' ? { naira: 5000 } : null;
      if (!plan) return err('Unknown plan.', 400, origin);
      const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY');
      if (!paystackKey) return err('Payments are not configured.', 503, origin);
      const reference = `wss_${crypto.randomUUID().replace(/-/g,'')}`;
      const fallbackEmail = `${String(profile.phone || '').replace(/\D/g, '') || 'member'}@guest.wassaa.ng`;
      const email = cleanString(b.email || user.email || profile.email || fallbackEmail, 200);
      if (!email || !email.includes('@')) return err('A valid email address is required for checkout.', 400, origin);
      const { error: paymentError } = await db.from('payments').insert({ reference, user_id: uid, plan_id: planId, amount_kobo: plan.naira * 100, currency: 'NGN', status: 'pending' });
      if (paymentError) return err('Could not create payment record.', 500, origin);
      const response = await fetch('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, amount: plan.naira * 100, currency: 'NGN', email, callback_url: Deno.env.get('PAYSTACK_CALLBACK_URL'), metadata: { planId, userId: uid } }), signal: AbortSignal.timeout(10000) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.status || !result.data?.authorization_url) {
        await db.from('payments').update({ status: 'failed' }).eq('reference', reference).eq('status', 'pending');
        return err('Payment provider error. Try again shortly.', 502, origin);
      }
      return json({ success: true, sandbox: false, reference, authorizationUrl: result.data.authorization_url, amountNaira: plan.naira }, 200, origin);
    }
    if (path === '/billing/activate' && req.method === 'POST') {
      const b = await getBody(), reference = cleanString(b.reference, 100);
      const { data: payment } = await db.from('payments').select('status,user_id').eq('reference', reference).maybeSingle();
      if (!payment || payment.user_id !== uid) return err('Payment not found.', 404, origin);
      if (payment.status !== 'success') return err('Payment not confirmed yet. If you just paid, wait a moment and retry.', 402, origin);
      const { data: current } = await db.from('profiles').select('tier').eq('id', uid).single();
      return json({ success: true, tier: current?.tier || profile.tier }, 200, origin);
    }
    if (path === '/billing/sandbox/complete' && req.method === 'POST') return err('Sandbox payment completion is disabled.', 404, origin);

    return err(`No route: ${req.method} ${path}`, 404, origin);
  } catch (e) {
    if (e instanceof SyntaxError) return err('Invalid JSON body.', 400, origin);
    if (e instanceof Error && e.message === 'Request body is too large.') return err(e.message, 413, origin);
    console.error('[wassaa-edge-api] request failed', { path, message: e instanceof Error ? e.message : 'unknown' });
    return err('Internal error.', 500, origin);
  }
});
