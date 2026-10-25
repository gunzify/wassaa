# WASSAA — Project Knowledge Base

> **Canonical source of truth for this repository.** Read this before changing product behavior, APIs, schemas, deployment, or UI. When this document conflicts with an older planning document or the legacy Express implementation, the active code described here takes precedence. Update this file in the same change whenever architecture or behavior changes.
>
> **Reviewed:** 2026-10-24. This file documents the repository and the deployment state reported by the owner on that date. It is not a claim that every external provider or production flow has been tested.

## 1. At a glance

WASSAA is a mobile-first dating and matchmaking PWA for adults in Nigeria, including people in military, police, paramilitary, healthcare, education, engineering, business, government, and other professions. Its positioning is intentional dating and professional compatibility. Uniformed service membership is self-reported; the current identity review does **not** prove military employment, rank, or duty station.

### Active architecture

```text
React + Vite PWA (frontend/)
  ├─ Supabase Auth REST API: email OTP + Google ID-token exchange
  │    (phone verification optional, adds a number to an existing account)
  ├─ Supabase Edge Function: /functions/v1/api
  │    ├─ Supabase Postgres (profiles, swipes, matches, chat, safety, billing)
  │    ├─ Cloudflare R2 (photos, chat photos, verification documents)
  │    └─ Paystack (checkout initialization and webhook verification)
  └─ Supabase Auth Send SMS Hook
       └─ Edge Function: /functions/v1/send-sms → Termii DND SMS route
```

`backend/` is a retained Express implementation and rollback/development path. The active frontend calls Supabase Auth and the Supabase `api` Edge Function; it does **not** use the Express API for normal member flows. The two backends have different auth/session systems and must not be mixed accidentally.

### Current rollout snapshot

- Supabase project: `wassaa-dating`, ref `avlbsficfejvwokxkgyl`, region `eu-west-1` (West EU / Ireland).
- Migrations `20261024000000`–`20261024000007` are all recorded as applied on the remote. `00007` (`matching_realtime`) was verified present in the live database from this workspace on 2026-10-25: `supabase migration list` shows all eight local/remote pairs matching, and a `supabase db dump` confirmed the `location_lat`/`location_lng` columns and constraint, the nine-parameter `wassaa_discovery`, the `wassaa_chat_message_broadcast` trigger, `wassaa_can_access_match_topic`, and the `realtime.messages` policy "Wassaa match members can receive chat broadcasts".
- The `api` Edge Function was redeployed from this workspace on 2026-10-25 (after the discovery radius guard in §16). `GET /functions/v1/api/health` returns 200 through the fixed `/functions/v1/api/...` path parser, confirming the path normalizer fix is live — this resolves the 2026-10-24 incident where member calls to `/functions/v1/api/auth/session` returned 404 because the handler's path parser was not stripping Supabase's `/api/...` function-prefixed path. A full authenticated two-account smoke run passed (48/48, §13). `send-sms` deployment remains unconfirmed.
- Auth model (2026-10-24): email OTP or Google is required and sufficient; phone verification is optional. The hosted email provider is enabled and the exact `verify { type: 'email' }` call was exercised with an admin-generated code (session issued, email confirmed) without sending mail. The default Magic Link template still needs `{{ .Token }}` for the six-digit code to appear; the link works meanwhile.
- **Phone auth is disabled** (`external.phone: false`); phone verification is optional and not required for signup, profile creation, or app access. It is only an optional `phone_change` step in Settings and depends on Termii/SMS hook delivery being available. The owner reports Google sign-in is working; the current workspace cannot independently confirm production OAuth settings. `wassaa_admin_users` was empty in the last inspected state, so every `/admin/*` call returns 403 until an admin is provisioned.
- Live database verification (2026-10-24): 13 tables, RLS on every table, 8 RPCs and the auth→profile trigger present and correct; the trigger was exercised with a real Auth user and the account removed. R2 is **configured and live-verified** on the hosted `api` function as of 2026-10-25 (secrets uploaded, presign → signed PUT → public URL → cleanup all 200/204 in the smoke run). Paystack still cannot be described as live until its secret is uploaded and real staging transactions succeed. See `docs/PRODUCTION-AUDIT.md`.
- Type checks, the frontend production build and `deno check` for `send-sms` pass. `deno check` for `api` reports 29 errors, all from untyped Supabase clients (no generated `Database` types). 14 demo profiles remain with no `auth_user_id` and `+234…` phone formats that can never match Supabase's digit-only storage; delete them before launch.

## 2. Repository map

| Path | Responsibility |
|---|---|
| `frontend/src/App.tsx` | App-level screen state machine, session restore, user actions, polling, API orchestration, toast handling, and shell/nav. |
| `frontend/src/components/screens/` | The concrete PWA screens: auth, onboarding, discovery, profile, match, messaging, settings, verification, and plans. |
| `frontend/src/components/onboarding/RealDatingOnboardingFlow.tsx` | Ten-step profile completion flow used after authentication. |
| `frontend/src/services/profile-readiness.ts` | Client-side mandatory onboarding completion gate. |
| `frontend/src/services/realtime.ts` | Private match-topic Supabase Realtime WebSocket subscription and recovery lifecycle. |
| `supabase/functions/api/domain.ts` | Shared server-side age, onboarding eligibility and great-circle distance rules. |
| `frontend/src/components/common/` | Logo, Google button, filters, and small shared components. |
| `frontend/src/components/chat/BlockReportModal.tsx` | Report/block user workflow from chat. |
| `frontend/src/services/api.ts` | Typed `WassaaApi` client for the active Edge API; serializes requests and maps API profiles to UI models. |
| `frontend/src/services/supabase-auth.ts` | Direct Supabase Auth REST calls, refresh-token lifecycle, Google ID-token exchange, email OTP, optional phone-change verification, magic-link fragment pickup, and local session storage. |
| `frontend/src/services/media.ts` | Browser-side image resizing/encoding before upload. |
| `frontend/src/types/index.ts` | UI/domain contracts for profiles, privacy, preferences, messages, matches, and tiers. |
| `frontend/src/design-tokens.ts` | Palette, spacing, radii, shadows, and typography scale. |
| `frontend/src/assets/branding.ts` | Brand metadata and primary image imports. |
| `frontend/public/admin/` | Active static integrity console; copied unchanged into the Vite build at `/admin/`. Uses Google + Supabase Auth and server-side admin allowlisting. |
| `frontend/public/sw.js`, `manifest.webmanifest`, `icons/` | PWA installation and app-shell-only offline cache. |
| `supabase/migrations/` | The applied SQL migration history for the current Supabase system. |
| `supabase/functions/api/index.ts` | Active member/admin API, auth verification, data access, R2, Paystack, CORS, and normalization of Supabase function-prefixed paths. |
| `supabase/functions/send-sms/index.ts` | HTTP Auth Hook handler; verifies Supabase's signed hook and sends OTP via Termii. |
| `supabase/config.toml` | Project ref plus per-function `verify_jwt = false`. The handlers perform explicit verification; this is intentional. |
| `scripts/deploy-supabase.mjs` | Deployment preflight, filtered secret-file creation, Edge secret upload, and function deploy. Requires credential-rotation acknowledgement and complete env values. |
| `scripts/e2e-smoke.mjs` | Two-account live smoke test against the hosted stack (onboarding gate, drafts, location/radius, discovery, match, messaging, private realtime, block enforcement, media round-trip). Reads local env files, prints no secrets, deletes its QA users on exit. `npm run smoke` (or `node scripts/e2e-smoke.mjs`). |
| `scripts/set-r2-secrets.mjs` | Uploads only the `R2_*` values from `backend/.env` as hosted Edge Function secrets via a mode-0600 temp file (values never printed, temp file removed). Run after rotating R2 credentials, then redeploy `api`. Needs the Owner/Administrator CLI login. |
| `scripts/r2-check.mjs` | Validates the local R2 config without printing values: key presence/format, signed PUT→GET→DELETE round-trips on the private and public buckets, and an unsigned GET through `R2_PUBLIC_BASE_URL`. Test objects are removed afterwards. |
| `backend/src/` | Legacy Express API, business logic, memory/Postgres stores, security middleware, and the old admin API. |
| `backend/admin-panel/` | Older key-based HTML admin console for the Express API. Not the current Supabase admin UI. |
| `backend/migrations/` | Legacy Express/Postgres migration files. They are **not** a replacement for `supabase/migrations/` in the active Supabase deployment. |
| `docs/` | Setup and planning documents. Some contain superseded architecture or product proposals; see §13. |

Two components under `frontend/src/components/common/` (`FilterModal.tsx`, `BackendLiveConsole.tsx`) and `frontend/src/components/screens/ProfileScreen.tsx` exist in the tree but are not imported by the current `App.tsx` shell. Do not assume that a component is an active user flow merely because it exists.

## 3. Frontend product and design

### Product model

- Audience: adults 18+, nationwide Nigeria, uniformed-service and civilian professionals.
- Profile facts are member-supplied, except phone ownership and general identity review. Do not label service affiliation as verified.
- Identity check: manual comparison of submitted ID, selfie, and profile details. It does not provide automated liveness, employment, rank, or duty-station verification.
- Service and rank visibility are member-controlled. Paying for a tier must never override consent, block status, or privacy settings.
- Safety actions (block/report) are not paid features. Text and photo chat are available after mutual matching.

### Design system

The visual language is **Warm Terracotta & Editorial**: restrained editorial typography, warm paper-like backgrounds, high contrast ink, and a limited terracotta action color. Tokens are declared in `frontend/src/design-tokens.ts`; components also use Tailwind arbitrary values matching those tokens, so token edits may require updating component classes too.

| Role | Value | Usage |
|---|---|---|
| Canvas | `#F7F5F0` | Main background |
| Surface | `#FFFFFF` | Cards, sheets, nav |
| Border | `#E8E4DC` | Dividers and input outlines |
| Main ink | `#1A1816` | Headlines and body text |
| Secondary / muted | `#6B665F` / `#9C958D` | Supporting text and inactive states |
| Brand / hover | `#B85A3C` / `#A04E33` | Primary CTA and active nav |
| Brand wash | `#F5EAE5` | Selected and supporting surfaces |
| Olive | `#2A3A2C` | Editorial accent |
| Verified | `#2C6B56` | General verification badge/success |
| Danger | `#9B2C2C` | Destructive/safety actions |

Typography: Cormorant Garamond for display/editorial headings, Plus Jakarta Sans for UI/body, and Space Mono for labels/metadata. Fonts are fetched from Google Fonts in `frontend/index.html`; they are not bundled. Spacing is a 4px scale; radii run from 8px to 24px with pill actions; cards use light shadows. The main content column is capped around 480px and designed mobile-first.

### Shell and navigation

`App.tsx` uses a string-valued local `currentScreen` state, not a URL router. The four-item fixed bottom dock is Discover, Matches, Messages, and Profile; it respects the device safe-area inset. There is a centered narrow shell for most screens, full-bleed splash/match celebration, and a simple top toast host. Session restoration happens during app boot. The application is a PWA, not a native Android/iOS application.

Current shell screens and flows:

| Screen | Purpose and main behavior |
|---|---|
| `SplashScreen` | Brand introduction; create account / login entry. |
| `SignUpScreen` | Entry for email auth and Google Identity Services. Either path confirms the account; no phone number is required. |
| `EmailVerificationScreen` | Email entry, six-digit code request/entry, resend cooldown, and Supabase `verify` with `type: 'email'`. Also covers sign-in for existing accounts. |
| `PhoneVerificationScreen` | Optional, skippable. Nigeria `+234` phone input, OTP request, six-digit keypad/entry, resend cooldown, and verification through Supabase phone-change semantics. Reached from Profile & Settings. |
| `ProfessionSelectionScreen` | Search/select a profession category; uniformed categories proceed to service selection. |
| `ServiceSelectionScreen` | Select a uniformed-service branch; this is self-reported data. |
| `ProfileSetupScreen` | Initial profile details and photo setup before the identity review screen. |
| `IdentityVerificationScreen` | Choose document type, enter a document number that is masked server-side, capture/select ID and selfie images, upload privately, and submit for manual review. Continue-to-discovery does not mean verified. |
| `RealDatingOnboardingFlow` | Ten steps: Intent; Basics; Photos; Profession; Location; About you; Lifestyle; Values; Prompts & Interests; Match Preferences. Photos require at least two in this flow; interests require at least three; lifestyle, values, and final preference step can be skipped/optional. Location is state + city; there is no implemented radius search. |
| `DiscoverScreen` | Card/photo browsing, pass, like, super-like, profile detail, filters, and deck refresh. Swipes are server-authoritative. |
| `ProfileDetailScreen` | Expanded candidate profile and swipe actions. |
| `MatchCelebrationScreen` | Shown after the server reports a mutual like; starts chat or returns to discovery. |
| `MatchesListScreen` | Matches and received likes tabs. Received likes are gated to paid tiers. |
| `ChatScreen` | Text/photo exchange, profile view, block/report menu, and image preview. Photos are private R2 objects delivered with short-lived signed URLs. There is no active voice recording/send API. |
| `SettingsPrivacyScreen` | Profile and privacy controls, optional phone verification, blocked users, account actions, sign-out, and upgrade entry. |
| `SubscriptionPlansScreen` | Displays Free, Premium, and Hyper Premium tiers and starts checkout. |

Some onboarding/profile models contain richer optional fields (prompts, habits, family/values, relocation) than the active database/API persists. Check both the `WassaaApi` request serializer and Edge API before adding a UI field: type presence alone does not mean it is stored.

### PWA behavior

`frontend/src/main.tsx` registers `frontend/public/sw.js` only in production. The service worker caches a small same-origin app shell/icons, does not cache `/api/` or `/admin`, serves navigation from the network with cached `/` as an offline fallback, and uses cache-first/background-refresh behavior for other same-origin GET assets. The manifest sets standalone portrait mode and `en-NG`. This is not offline-first dating functionality: authentication, discovery, chat, uploads, and account changes need network access.

### Client session/API orchestration

1. `supabase-auth.ts` stores the Supabase session under `wassaa_supabase_auth_v1` in `localStorage`. It attempts refresh when the token is within 60 seconds of expiry and deduplicates concurrent refresh requests. Old `wassaa_session_token` is removed at module load. Sign-out calls `/auth/v1/logout` and clears the stored session; the legacy `services/auth.ts` shim was removed because it left the real session intact.
2. Email sign-in calls Supabase Auth `/auth/v1/otp` (`email`, `create_user: true`) and confirms with `/auth/v1/verify` (`type: 'email'`). A Google sign-in exchanges the GIS ID token using `grant_type=id_token` and nonce. Optional phone verification updates the signed-in Auth user's phone and confirms with `type: 'phone_change'`. A magic-link return is folded into the stored session from the URL fragment at module load.
3. `api.ts` adds the publishable key as `apikey` and the current access token as `Authorization: Bearer ...` to Edge API requests. On `401`, it clears the local session and throws an error with status/code metadata.
4. App boot restores the user through `/auth/session`, loads tier/blocked users/matches for a complete profile, and redirects an incomplete profile into onboarding.
5. Discovery is fetched when entering the Discover screen. A successful like may show match celebration; the deck advances after a right swipe even if a like request failed. Pass is best-effort in the current shell.
6. Match summaries refresh every 8 seconds while on Matches or Chat. Messages load initially, then fetch `?since=<last-created-at>` every 4 seconds. This is polling, not Supabase Realtime/WebSocket. Opening chat also marks it read.
7. Photo files are resized by `preparePhoto()` (max edge 1600px; target <=650 KiB, JPEG) before being uploaded directly to R2. Client does not send photo bytes through the Edge API.
8. Paystack checkout opens a popup synchronously from the click to avoid popup blockers, then polls the server-side activation endpoint up to 40 times at 3-second intervals while the webhook processes payment. If popup is blocked, it redirects the current tab.

The four-tab `Messages` action opens the Chat screen; actual conversation context still depends on selecting a match first. Do not assume a separate inbox route exists in the URL system.

## 4. Frontend service contracts

`WassaaApi` in `frontend/src/services/api.ts` is the active client interface. It groups operations as follows:

- Auth: `requestOtp`, `verifyOtp`, `signInWithGoogle`, `fetchSession`.
- Profile: `getProfile`, `updateProfile`, `updatePrivacy`, `updatePreferences`, `deleteAccount`.
- Discovery: `getDiscovery` with profession/service/city/gender/minAge/maxAge/limit.
- Likes: `like`, `pass`, `getLikesReceived`.
- Matches/chat: `getMatches`, `getMessages`, `sendMessage`, `markRead`.
- Safety: `listBlocked`, `block`, `unblock`, `submitReport`.
- Verification/media: `submitVerification`, `verificationStatus`, `uploadImage` for photo/id_doc/selfie/chat_photo.
- Billing: `getPlans`, `checkout`, `activate`, `getEntitlements`. `sandboxComplete` remains in the client interface but is intentionally disabled by the active Edge API.

API profile responses use camelCase while Postgres uses snake_case. `toUserProfile()` maps fields to the UI model and fills some UI-only fields from fallback values. Note that `hasGovernmentId` / `hasLiveSelfie` are inferred from `verification.status === 'pending'`; they are not evidence of liveness or a machine-validated document.

## 5. Supabase Auth, OTP, and Google

### Email OTP (primary)

Email is the required identity. The app requests a code with `POST /auth/v1/otp` and confirms it with `POST /auth/v1/verify` `{ email, token, type: 'email' }`; Supabase owns code generation, attempts, and expiry. The email provider is enabled on the hosted project. The default Magic Link template needs `{{ .Token }}` added to show the six-digit code to members; the link in the same email also works because `consumeRedirectSession()` stores the session from the URL fragment and cleans the address bar. No custom SMTP is configured yet, so the built-in mailer's low hourly quota applies.

### Phone OTP with Termii (optional)

Supabase Auth remains the source of OTP generation, expiry, attempts, and verification. Termii is only the SMS transport; do not build a second OTP database or verify the code in the Edge Function.

Configured flow:

1. Supabase Auth sends an HTTP Send SMS hook with `user.phone` and `sms.otp`.
2. `supabase/functions/send-sms/index.ts` accepts POST only, reads at most 16 KiB, checks webhook ID and timestamp (within 300 seconds), and verifies the HMAC-SHA256 Standard Webhooks signature using `SEND_SMS_HOOK_SECRET`.
3. It requires an E.164 phone and 4–8 digit OTP, then posts a plain SMS to Termii `/api/sms/send`, using `channel: "dnd"`, configured sender ID, and API key. `TERMII_BASE_URL` is configurable; default is `https://api.ng.termii.com`.
4. It returns 200 only when Termii reports success; otherwise it returns an error to Auth. This is delivery API acceptance, not proof the handset received the SMS.

Termii does not appear in Supabase's native provider dropdown. That is expected: enable Phone Auth and configure **Authentication → Hooks → Send SMS → HTTP Endpoint** with `https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/send-sms`. The signing secret configured on the Auth Hook must be mirrored exactly (including `v1,whsec_`) as the Edge Function secret `SEND_SMS_HOOK_SECRET`. Edge Function Secrets also need `TERMII_API_KEY` and approved `TERMII_SENDER_ID` (typically `WASSAA`). Never use a built-in Twilio/MessageBird/Textlocal provider simultaneously for the same flow when the hook is meant to replace delivery.

### Google Sign-In

The web client loads Google Identity Services from `accounts.google.com/gsi/client`, creates a random nonce using Web Crypto, sends the SHA-256 hash to Google, and exchanges the returned ID token plus original nonce with Supabase Auth. The client ID is public and is supplied as `VITE_GOOGLE_CLIENT_ID`; the same client ID is held by Auth/API config. The OAuth client secret belongs only in Supabase Auth provider configuration, never browser code or a `VITE_` variable.

Google Cloud Web OAuth setup needs `https://wassaa.app` (and exact local origins used in development) as Authorized JavaScript origins, and the Supabase callback `https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/callback` as Authorized redirect URI. Supabase provider nonce validation should stay enabled. Google-authenticated users must verify a phone before the Auth trigger links/creates a WASSAA profile.

### Auth-to-profile linkage

`profiles.id` preserves legacy profile IDs. `profiles.auth_user_id` references `auth.users.id`. The `link_auth_user_to_profile()` trigger runs after insert/update of Auth phone fields and only acts for confirmed non-empty phone numbers. It links an existing profile with that phone when unclaimed, or inserts a new profile with Auth UUID as its profile UUID. Existing accounts with confirmed matching phones are backfilled when migration 00003 runs. The unique `auth_user_id` prevents one Auth account linking to multiple profiles.

## 6. Edge API behavior and data flows

The function endpoint is `https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api`. `supabase/config.toml` sets `verify_jwt = false` so public health, plan catalog, webhook, and explicit handler auth can coexist. The function explicitly validates bearer tokens through `authClient.auth.getUser(jwt)` before any member operation. It then uses a server-side service key client. The service key must stay in Supabase's server environment.

| Method + path | Auth | Behavior |
|---|---|---|
| `GET /health` | Public | Function health response. |
| `GET /billing/plans-public`, `GET /billing/plans` | Public | Hard-coded NGN plan catalog; consumables list is empty. |
| `GET /public-config` | Public | Supabase URL, publishable key, configured Google client ID. |
| `POST /billing/webhook` | Paystack signature | HMAC-SHA512 signature check, verify transaction with Paystack, compare status/amount/currency with pending DB payment, then call idempotent fulfillment RPC. |
| `GET /auth/session` | Member JWT | Return the caller's linked profile. |
| `GET/PATCH /me/profile` | Member JWT | Read/update allowed profile fields; validates DOB and 18+ age, gender, string lengths, photo count, interests. |
| `PATCH /me/privacy` | Member JWT | Update enumerated visibility and preference flags. |
| `PATCH /me/preferences` | Member JWT | Persist gender and age range; optional `maxDistanceKm` requires private device coordinates and is used by discovery. |
| `DELETE /me/account` | Member JWT | Remove member media from R2, redact report/admin-audit references, delete profile (cascading relational rows), then delete Supabase Auth user. Errors stop the operation where safe deletion cannot be confirmed. |
| `GET /discovery` | Member JWT | Calls the `wassaa_discovery` RPC: complete active profiles only, excluding self, prior swipes and blocks; applies reciprocal age/gender preferences, optional radius and profession/service/city/gender filters. Returns at most 30 ranked profiles; cursor pagination is not implemented. Filtering in SQL keeps the swipe-exclusion list out of the request URL. |
| `POST /likes` | Member JWT | Rate/plan-gated like or super-like via SQL RPC; mutual match is created atomically if the other member has already liked. |
| `POST /passes` | Member JWT | Record one pass per pair; excludes blocked/self/invalid targets. |
| `GET /likes/received` | Member JWT | Paid tier only; removes already-swiped/blocked users and returns matching profiles. |
| `GET /matches` | Member JWT | SQL summary of caller matches, partner profile, unread count, last message. |
| `GET/POST /matches/:id/messages` | Member JWT | Verify caller belongs to match. Fetch at most 500 messages; private chat-photo keys become 5-minute signed GET URLs. Sending supports text/photo only and rejects blocked pairs. |
| `POST /matches/:id/read` | Member JWT | Upsert caller's last-read timestamp. |
| `GET/POST /blocks`, `DELETE /blocks/:id` | Member JWT | List, create, and remove caller-owned blocks. |
| `POST /reports` | Member JWT | Create categorized safety report; may also block. |
| `GET /verification/status`, `POST /verification/submit` | Member JWT | Read review status / submit masked document number and private ID+selfie object keys. RPC prevents duplicate pending submission. |
| `POST /uploads/presign` | Member JWT | Validate kind/content type/size, rate-limit, and issue a 5-minute R2 PUT URL. |
| `GET /billing/entitlements` | Member JWT | Returns server-authoritative tier entitlement flags. |
| `POST /billing/checkout` | Member JWT | Creates pending row and initializes Paystack transaction. Currently supports premium/hyper_premium only. |
| `POST /billing/activate` | Member JWT | Returns tier only when payment reference belongs to caller and server has marked it successful. |
| `POST /billing/sandbox/complete` | Member JWT | Disabled (404) in active Edge API. |
| `/admin/*` listed below | Member JWT + allowlist | Calls `adminRoute`; caller must be listed in `wassaa_admin_users`. |

Admin API routes: `GET /admin/session`, `GET /admin/verifications`, `POST /admin/verifications/:id/review`, `GET /admin/reports`, `POST /admin/reports/:id/status`, `POST /admin/users/:id/block`, and `GET /admin/audit`. The admin account allowlist is checked on every request, so removing an allowlist row revokes access. Admin media uses short-lived private-object GET URLs. Review checks pending status, deletes ID/selfie objects before recording a decision, clears their DB references, updates profile status, and writes an audit record. Reports can be advanced through pending/investigating/resolved/dismissed; admins can block/unblock users.

### Rate limiting

The Edge API has a shared Postgres-backed per-profile rate bucket (not an in-memory counter). Every authenticated API request uses a general 300-per-60-second bucket. Specific operations use additional buckets: like 120/600s, pass 300/600s, message 40/60s, block 60/3600s, report 10/3600s, verification submit 5/86400s, upload presign 40/3600s, and checkout 5/600s. Supabase Auth has its own project/IP rate controls for OTP. Load and abuse thresholds still require production monitoring and validation.

## 7. Database schema and invariants

All active schema lives in `supabase/migrations/`; Edge business operations use Postgres and RPCs. The Edge API uses `service_role` after it validates a user's JWT, while direct `anon` and `authenticated` table access is revoked and RLS enabled. Do not expose the service key to the browser.

| Table | Key data / invariant |
|---|---|
| `profiles` | Member UUID, optional phone, unique `auth_user_id`, DOB, profession/service/rank, location text, bio/photos/interests, match preferences, tier, identity verification state, JSON privacy, blocked/deleted flags and timestamps. |
| `otp_sessions` | Legacy Express OTP store only; active OTP state is owned by Supabase Auth. |
| `swipes` | `(from_user_id,to_user_id)` primary key; kind like/pass/super; profile FK cascade. |
| `matches` | Normalized unique pair `(user_a,user_b)`, no self-match; profile FKs cascade. |
| `messages` | Match FK cascade; text/photo/system kinds; sender is profile UUID text or `system`; optional media key/text/caption/voice duration. Active API sends only text/photo. |
| `match_reads` | `(user_id,match_id)` last-read timestamp. |
| `blocks` | Unique blocker/blocked pair, optional reason/time. |
| `reports` | Reporter, nullable subject after deletion, category/details/status and timestamps. |
| `verification_submissions` | User, accepted doc type, masked doc number, private ID/selfie keys, pending/reviewed state and moderator note. Binary data is not stored in Postgres. |
| `payments` | Reference PK, owner, plan, kobo amount, currency, status, channel and timestamps. |
| `admin_audit` | Append-oriented admin action history, target/detail and timestamp. Account deletion anonymizes member references. |
| `api_rate_limits` | `(actor_id,bucket)` counter/window; SQL RPC updates atomically. |
| `wassaa_admin_users` | Explicit allowlist: Auth UUID, display name, created timestamp. |

Key security/concurrency RPCs in migration `20261024000003_auth_identity_bridge.sql`:

- `wassaa_record_like`: advisory lock per actor, duplicate protection, block check, daily likes and weekly super-like limits, insert.
- `wassaa_find_or_create_match`: sorted pair lock, verifies reciprocal non-pass likes, creates unique match, adds a system greeting.
- `wassaa_match_summaries`: returns member-owned match summaries, unread counts, and last message.
- `wassaa_consume_rate_limit`: shared rolling counter update.
- `wassaa_submit_verification`: one pending submission per user and status update.
- `wassaa_fulfill_payment`: only pending reference changes to successful and tier advances; repeat fulfillment is safe.
- `wassaa_anonymize_admin_audit`: strips account identifiers on deletion.

Migration ledger applied by the owner on 2026-10-24:

1. `20261024000000_baseline.sql` — core profile/auth-independent dating, messaging, safety, verification, and payment tables/indexes.
2. `20261024000001_admin.sql` — admin audit and review/report indexes.
3. `20261024000002_google_identity.sql` — Google subject/email columns and partial unique active subject index.
4. `20261024000003_auth_identity_bridge.sql` — Supabase Auth identity mapping, trigger/backfill, RPCs, rate table, RLS/revokes/service-role grants.
5. `20261024000004_admin_users.sql` — server-side integrity-admin allowlist.
6. `20261024000005_discovery_rpc.sql` — initial `wassaa_discovery` eligibility RPC, replacing the URL-length-limited swipe-exclusion filter.
7. `20261024000006_email_identity.sql` — confirmed email identity to profile bridge and optional phone linkage (owner reports applied).
8. `20261024000007_matching_realtime.sql` — private location columns/constraints, radius-aware and ranked discovery RPC, private per-match Realtime broadcast with match membership authorization. **Applied to the remote and verified from this workspace on 2026-10-25** (migration list + schema dump of every object it creates).

**Schema drift status:** the live `information_schema` was compared with the code on 2026-10-24. Tables, columns and nullability match what the Edge API selects and writes, RLS is on for every table, and all RPCs execute against real data. Constraints and indexes were not individually diffed; re-check them after any baseline change rather than trusting the migration ledger alone.

## 8. Media and R2

Configured account layout (names/domains are identifiers, not credentials):

- Private bucket `wassaa`: identity documents/selfies and private chat images.
- Public bucket `wassaa-public`: profile photos only.
- Public development domain is configured for the profile bucket. Prefer a custom domain for production; `r2.dev` is a development/testing URL.
- Browser CORS file: `backend/r2-cors.json`, currently allows GET/PUT/HEAD with `content-type` and development plus `https://wassaa.app` origins. Keep it aligned with the actual deployed origin.

Object key namespaces: `photos/<profile-id>/<uuid>.<ext>`, `chat/<profile-id>/<uuid>.<ext>`, `verification/<profile-id>/<uuid>.<ext>`. Accepted content types are JPEG, PNG, WebP. Presigned PUT lasts 300 seconds. Profile photos are persisted as public URLs; chat and verification media are persisted as object keys. Chat reads only return a signed GET after checking the match membership and that the key belongs to one participant. Admin review receives signed GETs to verification media.

The upload signer validates declared content type and byte count (photo/chat max 6 MiB, ID/selfie max 10 MiB) but does not inspect the uploaded file's actual decoded type, malware, EXIF, liveness, or image content. `preparePhoto()` compresses ordinary app uploads, but direct API calls still rely on R2 bucket and signer configuration. Configure CORS on both buckets and keep the private bucket private.

Account deletion attempts both referenced-object cleanup and prefix cleanup in R2. If storage is configured but media deletion fails, the API returns an error and stops before deleting relational/Auth data. If R2 is unavailable, deletion only proceeds when the member has no discoverable/stored media references; otherwise it refuses deletion rather than leave private objects orphaned.

**Hosted R2 status (live-verified 2026-10-25):** configured. The eight `R2_*` values from `backend/.env` were uploaded as hosted Edge Function secrets with `node scripts/set-r2-secrets.mjs` (values only pass through a mode-0600 temp file; never printed) and the `api` function was redeployed. Verified end to end by `npm run smoke` step 11: `POST /uploads/presign` returns a signed URL, a browser-style PUT uploads bytes to the correct bucket (HTTP 200), the photo is served from `R2_PUBLIC_BASE_URL` (HTTP 200), and the test object is deleted again (HTTP 204, no orphan media). Re-run `node scripts/r2-check.mjs` after any credential rotation to validate the local `.env` values directly against R2.

**Hosted secrets management requires the Owner or Administrator organization role** (Supabase docs: developers can view but not create/delete production secrets). A limited-role CLI login gets `403 ... necessary privileges` on `supabase secrets set/list` while `functions deploy` and database access still work — that split is the tell. Fix: `npx supabase login` with an Owner/Administrator account for the project's organization.

## 9. Payments and commercial behavior

Current active Edge API catalog:

| Tier | Price | Current entitlement enforcement |
|---|---:|---|
| Free | NGN 0 | 30 non-pass likes/day, 1 Super Like per 7 days, no received-likes view. |
| Premium | NGN 1,500 one-time | Unlimited likes, 5 Super Likes per 7 days, received-likes view. |
| Hyper Premium | NGN 5,000 one-time | Unlimited likes, 15 Super Likes per 7 days, received-likes view. |

Checkout accepts only `premium` and `hyper_premium`. The client sends the plan ID, but the server chooses amount and currency. A pending row is created before the provider call. The signed webhook handler verifies signature, then independently fetches Paystack transaction details and checks amount/currency/status before running the idempotent RPC. Client activation cannot grant an unpaid tier.

No renewal, subscription expiration, grace period, refund workflow, invoice management, consumable purchase, boost/rewind/incognito/private-introduction delivery, or receipt reconciliation UI is currently complete. Some entitlement flags and old marketing docs mention these future features, but their UI/API fulfillment path is absent. Current plans are one-time purchases and tiers do not expire automatically. `PAYSTACK_SECRET_KEY` was absent at the last `.env` inspection, so checkout cannot work until set in the hosted Edge Function environment and verified in test mode.

The app callback should return to the deployed SPA root (for example `https://wassaa.app/`); there is no dedicated payment callback route. The webhook is the source of truth. The frontend popup flow polls `/billing/activate`; if a popup is blocked, the app redirects the current tab and boot restores tier by fetching entitlements.

## 10. Safety, privacy, and admin operations

- Member block is bilateral in discovery/likes/chat checks; only the blocker can remove their block. Report supports categories, details, and optional block.
- A report creates a moderator work item but does not itself hide/block unless `alsoBlock` is selected. The admin panel can update case status and block/unblock accounts.
- Admin block uses `profiles.blocked_us`; the active Edge API refuses blocked accounts on each authenticated request. It does not revoke Supabase Auth credentials directly.
- Verification badge means the identity submission was manually approved. It does not certify military/service employment, rank, or a current duty assignment.
- The app records only a masked document number; source ID/selfie files are stored in private R2 until a moderator decision, then deleted and DB references nulled.
- Admin access in the active console is Google sign-in followed by an explicit `wassaa_admin_users` allowlist lookup server-side. There is no browser-supplied admin key. The old Express admin uses `ADMIN_API_KEY` and is legacy-only.
- Member account deletion purges known R2 media, redacts records that need to survive for safety/legal audit, deletes profile-linked relational rows through FK cascades, and deletes Auth user. This is not a full compliance-retention policy: retention rules, legal holds, backups, provider logs, and support escalation still need documented governance.
- Support workflows, emergency escalation, abuse operations staffing, device/session management, automated liveness, and service membership verification are not implemented end-to-end.

### Active admin console

`frontend/public/admin/` is no-build HTML/CSS/JS. It loads public config from the Edge function, initializes Google GIS with nonce, exchanges Google token through Supabase Auth, stores the session in `sessionStorage`, and invokes `/admin/*` with bearer token + publishable key. It has Verifications, Reports, Audit log, refresh/lock controls, and a storage-ready indicator. Before a moderator can use it, create their Supabase Auth identity and insert their UUID/display name into `public.wassaa_admin_users`. The static path must be hosted at `/admin/` along with the frontend build.

## 11. Legacy Express backend

The Express service is still present and typechecked but is not the active API for the PWA.

- Start: backend package `npm run dev` (`tsx watch src/server.ts`), default port 8787; root helper `npm run dev:backend`.
- Routes: auth Google/phone OTP/session; profile/privacy/preferences/account; discovery; likes/passes/received likes; match/message/read; block/report; manual verification; R2 presign; Paystack billing/webhook; key-protected admin.
- Auth: custom HS256 session JWT, separate from Supabase Auth. Never send the active Supabase access token to the old API expecting it to work.
- Stores: `store/memory.ts` (process-local state seeded with demo profiles) and `store/pg.ts` (Postgres/Supabase through `pg`). Memory state is lost on restart and not production-safe. Legacy rate limiter is in process memory and not multi-instance safe.
- Security setup includes Helmet-like manual headers, CORS allowlist, route guard, per-IP/user rate limits, request size limits, request logging, production config refusal, and graceful DB shutdown.
- The legacy frontend dev proxy in `frontend/vite.config.ts` proxies only `/api/v1` to `API_TARGET` or `localhost:8787`; the current `WassaaApi` client targets Supabase Edge directly. This proxy does not redirect active calls.
- `backend/.env` has legacy variables such as `SUPABASE_DB_URL`, `DATA_BACKEND`, custom session secret/admin key, and R2/Termii settings. Do not upload the whole legacy env wholesale to Supabase Edge secrets.
- `backend/migrations/*.sql` and `backend/scripts/migrate.mjs` belong to the legacy store. Since the new Supabase migration ledger has already been applied, do not rerun these migrations blindly against the active project.

## 12. Configuration and secrets

### Frontend build-time values (`frontend/.env`)

| Variable | Exposure | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Public | Supabase project base URL. |
| `VITE_SUPABASE_ANON_KEY` | Public | Supabase publishable/anon key; RLS and API authorization still required. |
| `VITE_GOOGLE_CLIENT_ID` | Public | Google Identity Services Web OAuth client ID. |

Never put a Supabase service-role/secret key, Google OAuth client secret, Termii API key, Paystack key, webhook secret, or R2 secret in any `VITE_` variable.

### Legacy local API (`backend/.env`)

The ignored local file contains some combination of `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `SESSION_JWT_SECRET`, `ADMIN_API_KEY`, `DATA_BACKEND`, `SUPABASE_DB_URL`, `SUPABASE_URL`, publishable/service role values, `TERMII_*`, `PAYSTACK_*`, `R2_*`, and `GOOGLE_CLIENT_ID`. Use `.env.example` for key names and intended behavior, never copy values into docs or chat. `.gitignore` excludes `.env*` and the local hook secret.

### Hosted Edge Function values

Supabase injects project URL and API key material in the hosted Edge runtime. Customer-managed function secrets expected by code include:

`TERMII_API_KEY`, `TERMII_SENDER_ID`, optional `TERMII_BASE_URL`, `SEND_SMS_HOOK_SECRET`, `APP_ORIGINS`, `GOOGLE_CLIENT_ID`, `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` or `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`, `PAYSTACK_SECRET_KEY`, and `PAYSTACK_CALLBACK_URL`.

Hosted Edge secrets are separate from local `.env`; adding a value locally does not upload it. Set them in Supabase Dashboard → Edge Function Secrets or via Supabase CLI (`npx supabase login` first — requires the **Owner or Administrator** role, see §8). The repository deploy helper reads only an allowlisted subset from `backend/.env`, creates a temporary filtered env file, uploads it, and deploys `send-sms` + `api`. It checks for a `--credentials-rotated` acknowledgement and refuses to deploy if required entries are empty, the SMS hook secret has an invalid format, buckets are the same, or public/callback URLs are not HTTPS. For R2-only re-uploads (after credential rotation) use `node scripts/set-r2-secrets.mjs`.

**Hosted secret inventory (inspected 2026-10-25 via `supabase secrets list`, values are returned as hashes only):**

- Present: `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL` (uploaded 2026-10-25), `TERMII_API_KEY`, `TERMII_SENDER_ID`, and the Supabase-managed `SUPABASE_*` keys.
- **Missing:** `GOOGLE_CLIENT_ID` (the `/public-config` response therefore returns an empty client ID; the app relies on `VITE_GOOGLE_CLIENT_ID`), `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` (billing endpoints return "Payments are not configured"), `APP_ORIGINS` (the function falls back to its built-in default origins: `https://wassaa.app` + localhost), `TERMII_BASE_URL`.
- **Typo found:** a secret named `SEND_SMS_HOOK_SECRE` (missing final `T`, set 2026-10-24) exists. The code expects `SEND_SMS_HOOK_SECRET`, so SMS hook auth will fail until the typo'd secret is deleted and the correct name is set. Do this before enabling phone verification.

**Never store secrets in this file.** Termii and R2 keys exposed in chat were detected as reused in the local env at last check and must be rotated at the providers. Rotate any exposed Cloudflare account token and Google OAuth client secret as well. Do not re-use the leaked values. Use separate dev/staging/production credentials.

## 13. Build, deploy, and operational workflow

### Local development

Prerequisite: Node.js 20+ (current machine used Node 24). Dependencies are split by package:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm run dev:frontend
```

The frontend Vite server defaults to `http://localhost:5173`. It will call the configured Supabase project because active auth/API use `frontend/.env`; no local Supabase stack is required for that path. To run the legacy backend separately, use `npm run dev:backend`; that is not the active PWA backend. Root scripts: `npm run typecheck`, `npm run build:frontend`, and `npm run deploy:supabase -- --credentials-rotated`.

### Database and Edge deployment

1. Confirm target project ref and inspect `supabase migration list`.
2. Do not `db reset` on the linked project. Migration history is applied; first resolve/verify pre-existing schema drift.
3. Configure Supabase Auth Google provider, Site URL/redirect allow-list, the Magic Link template `{{ .Token }}`, and (only for optional phone verification) phone auth plus the Send SMS hook URL/secret.
4. Rotate exposed provider keys, fill required local environment values, and set the **same** SMS signing secret in Auth Hook configuration and Edge Function Secrets.
5. Deploy through `npm run deploy:supabase -- --credentials-rotated`. For SMS-only deployment, the minimal required hosted values are Termii key/sender and matching `SEND_SMS_HOOK_SECRET`, then `supabase functions deploy send-sms --no-verify-jwt`.
6. Deploy the active `api` function after code changes (`npx supabase functions deploy api`). The route-path parser fix, the onboarding/location/chat routes and the discovery radius guard (§16) were deployed from this workspace on 2026-10-25 and verified with `GET /functions/v1/api/health` (200) plus the authenticated smoke run in §13/§16. Migrations `20261024000006` and `20261024000007` are applied remotely (00007 verified by schema dump on 2026-10-25). Still to verify: email OTP UI flow, Google sign-in, optional phone linking when Termii is ready, review/purge, blocking/deletion, and Paystack test webhook. (Uploads/R2 are verified — 48/48 smoke run including the media round-trip.)
7. Create the first `wassaa_admin_users` row and verify `/admin/` hosted assets.
8. Only after success, route a controlled pilot cohort. Keep legacy Express deployment available only as an explicitly separate rollback route; it cannot accept Supabase sessions.

### Build/check evidence and limits

For the onboarding/location/chat update, root backend and frontend TypeScript typechecks passed; the frontend Vite production build passed with a ~510 KB JavaScript chunk warning; five focused Node tests passed; and TypeScript syntax transpilation passed for the Edge API, domain helpers, domain tests and realtime service. The build outputs to `frontend/dist`.

**Live verification (2026-10-25, from this workspace):** `npm run smoke` (`scripts/e2e-smoke.mjs`) ran against the hosted project and passed **48/48 checks** with two freshly created QA accounts (deleted afterwards). It exercised: health, confirmed-email → profile bridge, password sign-in, the `ONBOARDING_REQUIRED` gate on discovery and matches, `LOCATION_REQUIRED` on radius without coordinates, draft saves reaching the gate field by field, coordinates + radius accepted, discovery returning member B with a 5 km-band distance (~70 km Lagos↔Abeokuta) and no raw coordinates, a 5 km radius excluding the distant candidate, mutual like → match, two-way API messaging, non-member match ID rejected with 404, a private realtime join receiving a broadcast that carried only message IDs (no content), block enforcement (send rejected 403 on both sides, blocked member's channel rejoin denied by `wassaa_can_access_match_topic`, unblock restores), and a full media round-trip: presign → signed PUT to R2 (200) → photo served from the public URL (200) → test object deleted (204).

Deno is unavailable in the current workspace, so there is no Deno typecheck. Still not performed: browser/device UI run, geolocation permission prompts on a real device, live SMS, Paystack transactions, admin console run, or load test. Do not infer production capacity from a successful build or a smoke test.

## 14. Known gaps and source-of-truth decisions

These are implementation gaps, not hidden features:

- **Edge Functions/secrets:** `api` was redeployed from this workspace on 2026-10-25 with the route-path normalizer, onboarding/location/chat routes and discovery radius guard, and it is live-verified (health 200 + 48/48 authenticated smoke run). Hosted secrets management requires the **Owner/Administrator** role (a limited-role login gets 403 on `secrets set/list` while `functions deploy` still works). `send-sms` deployment and the SMS hook remain unverified — and a typo'd secret `SEND_SMS_HOOK_SECRE` must be fixed before SMS can work (§12). Phone verification remains optional. Email and Google sign-in do not depend on SMS; note `GOOGLE_CLIENT_ID` is not set as a hosted secret (§12).
- **Provider config:** R2 is **configured and live-verified** (presign → signed PUT → public URL → cleanup, 2026-10-25). Hosted Paystack configuration and staging transactions/transfers remain unverified — `PAYSTACK_SECRET_KEY`/`PAYSTACK_CALLBACK_URL` are not hosted secrets yet, so billing endpoints return "Payments are not configured". Local `.env` values do not prove hosted configuration. Termii/R2 credentials exposed in chat were reported rotated; keep rotating rather than reusing leaked values. The public `r2.dev` URL is not a production CDN/domain.
- **Schema drift:** existing core tables predated the migration ledger. Reconcile live columns/constraints/permissions/indexes and RLS.
- **Trust:** manual ID review only; no liveness, service-employment, rank, or duty validation. Terms, privacy, retention, data-subject request, moderation appeal, and escalation procedures need finalized legal/product review.
- **Matching:** city/state are text fields; device coordinates, 5–500 km radius filtering and ranked discovery are implemented in source and live-verified (2026-10-25 smoke run: distance banding, radius inclusion/exclusion, no coordinate leak). There is no cursor pagination or preference-density guarantee; benchmark and add spatial/keyset strategies before scaling to large profile pools. Only two QA accounts were tested against a small pool — ranking quality at volume is unproven.
- **Messaging:** private Realtime broadcasts and API-based two-way message send/fetch are implemented in source and live-verified with two accounts (id-only broadcast payload, block denial on both the message API and channel rejoin). The 5-second fallback polling and 30-second recovery while subscribed remain as described. Push notifications, typing indicators, voice-note recording/sending, read-receipt tier enforcement and offline/outbox delivery are not implemented. One cold-start behavior is known and handled: the first Realtime join of the day can fail with `MissingPartition` until a live socket creates the day's `realtime.messages` partition; the client retries once (see §16).
- **Monetization:** paid tiers are one-time prices in the active API. No subscriptions/expiry/renewals/refunds; no boosts or consumables; several returned entitlement flags are not wired into product behavior.
- **Operations:** no confirmed monitoring/alerts, backups/restore drill, incident runbook, support staffing, abuse staffing, production load test, or concurrency estimate.
- **Client/UX:** mandatory onboarding routing/back behavior and persisted drafts are implemented in source. No React Router/deep-link route table; some component files are not wired. Full accessibility, visual, cross-browser/mobile and device-location QA remain.
- **Infrastructure:** the PWA static host and production origin are not established by repository code. R2 CORS and Google OAuth origins must match the actual final domains.

The older `docs/IMPLEMENTATION-PLAN.md`, `docs/MONETIZATION-ECONOMY.md`, and parts of `README.md` include planned or legacy content (monthly subscriptions, verification charges, boost/consumable products, voice notes, Express API as primary, native apps, PostGIS, future features). These are **not authoritative implemented behavior** where they conflict with active code and this KB. In particular, `frontend/src/data/monetizationData.ts` is a PRD/proposal artifact and its plan period/features are not the server catalog. Check active Edge API and SQL migrations for actual behavior.

## 15. Change discipline for future agents

1. Read this KB first; inspect actual source files before acting on an undocumented assumption.
2. Preserve the active flow: frontend → Supabase Auth + Edge API. Do not wire active screens back to Express by accident.
3. Treat Supabase migrations as production schema history. Make new additive migrations; never edit an already-applied migration to change remote state.
4. Put secrets only in ignored local env files and hosted secret stores. Never print values in logs, docs, build output, or chat. Rotate exposed credentials rather than copying them.
5. Enforce privacy/safety/entitlements server-side. The browser is untrusted. Every new route needs authentication/ownership checks, input validation, rate controls, and abuse/error handling.
6. Keep public profile images and private identity/chat media in separate buckets. Do not return private object keys as public URLs.
7. Update this KB's architecture, endpoints, schema, provider configuration, and deployment snapshot when code changes. Mark planned work as planned and tested work with the exact verification performed.

## 16. Onboarding, location, matching, and chat update (2026-10-24; live-verified 2026-10-25)

### Mandatory onboarding

- `frontend/src/services/profile-readiness.ts` defines the client completion gate: valid adult birth date, name, gender, two profile photos, profession, city/state, bio, three interests, dating intention, and age/gender match preferences.
- `supabase/functions/api/domain.ts` is the canonical server-side rules module for age calculation, profile readiness and great-circle distance. `supabase/functions/api/index.ts` enforces that gate after authentication. Until complete, the API allows only session/profile/preferences/location/upload/account setup paths; discovery, likes, matches and messaging are blocked with `ONBOARDING_REQUIRED`.
- App boot and Google/email sign-in route incomplete profiles back to the onboarding flow. The onboarding flow has no close/skip action; Back only returns to a previous step. Completed steps save drafts. On reload, onboarding resumes at the earliest incomplete step.
- Requirements are tested in `frontend/src/services/profile-readiness.test.ts` and `supabase/functions/api/domain.test.ts`. Five focused tests pass locally. Keep these rules aligned when adding fields.

### Device location and distance preferences

- Onboarding and Settings can request browser geolocation with explicit user action. City/state remain required profile fields and are the fallback when location permission is denied.
- Migration `20261024000007_matching_realtime.sql` adds nullable latitude/longitude columns with range and pair constraints. Coordinates are server-only and never included in public profile JSON. The API computes a great-circle distance and returns a rounded 5 km band; exact coordinates are never returned.
- The optional 5–500 km radius is stored in `profiles.match_preferences.maxDistanceKm` and applied in `wassaa_discovery`. Clearing precise location also clears the radius setting.
- Current implementation does not use a map tile, address lookup or place autocomplete API. Device GPS plus server-side distance calculation needs no Maps key. For future city/place autocomplete or reverse geocoding, use Google Maps Platform Places API (New) and Geocoding API, with restricted keys and billing. Do not expose a server key in `VITE_` variables.

### Match ranking

`wassaa_discovery` first filters for complete candidate profiles, age/gender preferences, reciprocal preferences, blocks, existing swipes, active account, and optional distance radius, then ranks eligible profiles. The radius path uses a latitude bounding range before the exact great-circle check. Current ranking favors matching dating intention, shared interests, profession/service affinity, proximity or same-city fallback, profile completeness and modest recency. It is deterministic at request time except for recency and avoids ranking anyone excluded by filters. It is a transparent heuristic, not a machine-learning model; calibrate weights from retention and safety outcomes before describing it as predictive. For very large profile counts, benchmark and likely add keyset paging/geospatial indexing before scaling launch volume.

### Two-way chat

- Chat history and sends use the authenticated `api` Edge Function; API checks match membership and block state. Message send is server authoritative and the UI clears the composer only after success.
- Migration `20261024000007_matching_realtime.sql` creates a private Realtime Broadcast channel per match. Membership is authorized by `wassaa_can_access_match_topic`; deleted/disabled profiles and blocked pairs are rejected on subscription. The trigger broadcasts only the inserted message ID, not message contents or private media keys. The client uses a Phoenix protocol WebSocket in `frontend/src/services/realtime.ts`, then fetches new message bodies through the ownership-checked API.
- Realtime is backed by a low-frequency polling recovery path (5 seconds when disconnected, 30 seconds when subscribed); match list refresh is 30 seconds, and new activity refreshes it sooner. This is resilient to dropped broadcasts but still requires Supabase Realtime and migration setup. Supabase caches channel authorization during a connection, so a block can take effect on an already-open peer socket only after authorization is refreshed or the socket expires/closes; message API access is blocked immediately.
- **Cold-start retry (added 2026-10-25):** `realtime.messages` is partitioned by day and the day's partition only appears once a live WebSocket connects, so the very first join of the day can fail once with `MissingPartition` (observed in the first live smoke run; the subsequent join succeeded). `frontend/src/services/realtime.ts` retries the join exactly once after 1.2 s for transient failures (`MissingPartition`, `PartitionCreationFailed`, join timeout, connection failure); authorization denials such as `Unauthorized` are not retried and propagate as before, falling back to polling.
- Voice notes, push delivery, typing indicators, and reliable offline/outbox delivery are not implemented. Old voice content is rendered as unavailable; the UI must not claim live presence.

### Deployment and current verification

- Migration `20261024000007_matching_realtime.sql` **is applied** to the linked project. Verified from this workspace on 2026-10-25: `npx supabase migration list` shows all eight migrations (00000–00007) matched local/remote, and a `supabase db dump` of the `public` and `realtime` schemas confirmed every object it creates (location columns + constraint, nine-parameter `wassaa_discovery`, `wassaa_chat_message_broadcast` trigger, `wassaa_can_access_match_topic`, `realtime.messages` policy). Earlier KB claims that 00007 was unapplied were stale. Do not edit an applied migration; use a follow-up migration for changes.
- The `api` Edge Function was redeployed from this workspace on 2026-10-25 after the discovery radius guard, and is live (health 200 through the `/functions/v1/api/...` prefix). Redeploy after every source change.
- Local checks: root backend/frontend TypeScript typecheck and frontend production build (Vite reports an existing ~510 KB JS chunk warning); five focused Node tests passed. No Deno typecheck is possible in this workspace.
- Live two-account verification (2026-10-25): `npm run smoke` → **48/48 checks passed** covering the onboarding gate, draft saves, location/radius preferences, ranked discovery with distance bands and radius exclusion, mutual match, two-way messaging, private realtime broadcast (id only), block enforcement on both the message API and channel authorization, and the full media path (presign → signed PUT → public URL → object cleanup). The script creates and deletes its own QA accounts and prints no secrets.
- R2 hosted secrets were uploaded on 2026-10-25 with `node scripts/set-r2-secrets.mjs` after `npx supabase login` (Owner role required — see §8/§12) and the `api` function was redeployed. Use the same script after rotating R2 credentials; use `node scripts/r2-check.mjs` to validate `backend/.env` values directly against R2 without touching the cloud.
- The radius guard: `/discovery` only forwards `radiusKm` to the RPC when the member has coordinates and the stored radius is finite and ≥ 5 (defends against `Number(null) === 0`, which would have produced an empty deck for members without location). Enforced in the API layer, so no follow-up migration was created.
- Still unverified: browser/device UI run and geolocation permission prompts, email OTP and Google sign-in UI flows (note: `GOOGLE_CLIENT_ID` is not a hosted secret yet, §12), Paystack test webhook/transactions (secrets not hosted), `send-sms` (and the `SEND_SMS_HOOK_SECRE` typo, §12), admin console, moderation flows, and load testing. R2 media upload/download is verified (48/48 smoke run).
