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
- **Hosting (2026-10-26):** the PWA is live on Vercel at `https://wassaa.vercel.app`. Testers reported "failed to fetch" on image uploads there while localhost worked; root cause was the R2 bucket CORS rules not listing the Vercel origin (Edge API CORS already allowed it). Both buckets were updated from `backend/r2-cors.json` on 2026-10-26 and verified with `wrangler r2 bucket cors list` (§8).
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
| `frontend/src/index.css` | The design system: palette CSS variables, type scale, component kit (`.btn`, `.card`, `.field`, `.dock`, …), and interaction rules. (Former `design-tokens.ts` was imported by no code and was removed 2026-10-26.) |
| `frontend/src/assets/branding.ts` | Brand metadata and primary image imports. |
| `frontend/public/admin/` | Active static integrity console; copied unchanged into the Vite build at `/admin/`. Uses Google + Supabase Auth and server-side admin allowlisting. |
| `frontend/public/sw.js`, `manifest.webmanifest`, `icons/` | PWA installation and app-shell-only offline cache. |
| `supabase/migrations/` | The applied SQL migration history for the current Supabase system. |
| `supabase/functions/api/index.ts` | Active member/admin API, auth verification, data access, R2, Paystack, CORS, and normalization of Supabase function-prefixed paths. |
| `supabase/functions/send-sms/index.ts` | HTTP Auth Hook handler; verifies Supabase's signed hook and sends OTP via Termii. |
| `supabase/config.toml` | Project ref plus per-function `verify_jwt = false`. The handlers perform explicit verification; this is intentional. |
| `scripts/deploy-supabase.mjs` | Deployment preflight, filtered secret-file creation, Edge secret upload, and function deploy. Requires credential-rotation acknowledgement and complete env values. |
| `scripts/e2e-smoke.mjs` | Two-account live smoke test against the hosted stack (onboarding gate, drafts, location/radius, discovery, match, messaging, private realtime, block enforcement, media round-trip). Reads local env files, prints no secrets, deletes its QA users on exit. `npm run smoke` (or `node scripts/e2e-smoke.mjs`). |
| `scripts/npc-smoke.mjs` | Persona-loop live smoke test (match → greeting → paid reply). Run after any NPC-engine or credit change; deletes its QA account on exit. |
| `scripts/admin-smoke.mjs` | Integrity-console live smoke test: allowlist gate, verification queue (approve/reject), report + DM review context, restrict/ban/lift with member-side enforcement, appeals (grant/deny), persona editing and the audit trail. Temporarily allowlists a QA admin, then removes every row and R2 object it created. `node scripts/admin-smoke.mjs` (`--keep` leaves fixtures for inspection). |
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

The visual language is **Warm Terracotta & Editorial**: restrained editorial typography, warm paper-like backgrounds, high contrast ink, and a limited terracotta action color. The canonical implementation is the component kit in `frontend/src/index.css` (`@layer components`): `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-quiet`/`.btn-danger`/`.btn-block`, `.card`, `.field`, `.pill`, `.sheet`/`.sheet-backdrop`/`.modal-title`, `.row`/`.row-icon`/`.row-title`/`.row-sub`, and `.dock`/`.dock-item`/`.dock-label`. Screens should compose these classes instead of inventing one-off button or modal styles; components still use Tailwind arbitrary values matching the palette below.

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

Every one of these values has a dark-mode twin in `frontend/src/styles/theme-dark.css`, generated from the literals the app actually uses — see §19. Keep colours in class strings so the generator can see them.

Typography: Cormorant Garamond for display/editorial headings, Plus Jakarta Sans for UI/body, and Space Mono for labels/metadata. Fonts are fetched from Google Fonts in `frontend/index.html`; they are not bundled. The HTML root font size is fixed at 16px (no viewport-based clamp), so every device renders the rem scale identically. Spacing is a 4px scale; radii run from 8px to 24px with pill actions; cards use light shadows. The main content column is capped around 480px and designed mobile-first.

Interaction rules (enforced in unlayered CSS in `index.css`, so they beat Tailwind's utility layer): every `button`/`[role="button"]` gets a 44px min-width/min-height floor (40px with `data-compact`), and all buttons/links carry a `scale` transition so `transition-colors` utilities on a screen cannot strip press feedback. The dock is opaque (no `backdrop-filter`), items are ~68px tall with 28px icons, and `index.html` sets `viewport-fit=cover` so `env(safe-area-inset-bottom)` lifts it above the home indicator.

### Shell and navigation

`App.tsx` uses a string-valued local `currentScreen` state, not a URL router. The four-item fixed bottom dock is Discover, Matches, Messages, and Profile; it respects the device safe-area inset. Profile and Settings are separate screens: the Profile header's gear button opens `settings` (same component rendered with `view="settings"`), whose back button returns to `settings_privacy`; the dock's Profile tab stays active for both. The Messages tab has its own `messages` screen (the conversation list, `MatchesListScreen` with `variant="messages"`) and lights up for both `messages` and `chat`, so it never silently redirects to Matches. There is a centered narrow shell for most screens, full-bleed splash/match celebration, and a simple top toast host. Session restoration happens during app boot. The application is a PWA, not a native Android/iOS application.

Current shell screens and flows:

| Screen | Purpose and main behavior |
|---|---|
| `SplashScreen` | Brand introduction; create account / login entry. |
| `SignUpScreen` | Entry for email auth and Google Identity Services. Either path confirms the account; no phone number is required. |
| `EmailVerificationScreen` | Email entry, six-digit code request/entry, resend cooldown, and Supabase `verify` with `type: 'email'`. Also covers sign-in for existing accounts. |
| `PhoneVerificationScreen` | Optional, skippable. Nigeria `+234` phone input, OTP request, six-digit keypad/entry, resend cooldown, and verification through Supabase phone-change semantics. Reached from Settings (trust & privacy), returns there. |
| `ProfessionSelectionScreen` | Search/select a profession category; uniformed categories proceed to service selection. |
| `ServiceSelectionScreen` | Select a uniformed-service branch; this is self-reported data. |
| `ProfileSetupScreen` | Initial profile details and photo setup before the identity review screen. |
| `IdentityVerificationScreen` | Settings entry point for manual identity review. The capture itself is `components/common/IdentityCapturePanel` — document type, a number masked server-side, private ID photo and live selfie upload, submit — shared with onboarding step 11 so both render identically. Continue-to-discovery does not mean verified. |
| `RealDatingOnboardingFlow` | Eleven steps: Intent; Basics; Photos; Profession; Location; About you; Lifestyle; Values; Prompts & Interests; Match Preferences; Identity verification. Photos require at least two in this flow; interests require at least three; lifestyle, values and the final preference step can be skipped/optional. Step 11 is opt-in: capture both images and "Submit for review" files the submission in the admin queue, while the footer's "Finish profile" skips it and enters the app. The profile works unverified either way; its status only drives the badge. Location is state + city; there is no implemented radius search. |
| `DiscoverScreen` | Card/photo browsing, pass, like, super-like, profile detail, filters, and deck refresh. Swipes are server-authoritative. |
| `ProfileDetailScreen` | Expanded candidate profile and swipe actions. |
| `MatchCelebrationScreen` | Shown after the server reports a mutual like; starts chat or returns to discovery. |
| `MatchesListScreen` | Two renderings: `variant="matches"` (Matches tab: matches + received-likes inner tabs) and `variant="messages"` (Messages tab: conversations list with last-message preview and its own empty state). Received likes are gated to paid tiers. |
| `ChatScreen` | Text/photo exchange, profile view, block/report menu, and image preview. Photos are private R2 objects delivered with short-lived signed URLs. There is no active voice recording/send API. |
| `SettingsPrivacyScreen` | Renders one of two views via the `view` prop: `profile` (identity card, photos, about you; header has preview + gear buttons) or `settings` (membership, discovery preferences, trust & privacy, account actions; header has a back button). Optional phone verification, blocked users, sign-out, delete account, and upgrade entry live in the settings view. |
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

The dock's `Messages` tab opens the `messages` conversation list (not Chat directly); selecting a conversation opens `chat`, and chat's back button returns to `chatOrigin` (`messages`, `matches_list`, or `discover` depending on where it was opened). The `matches_list` refresh effect also covers `messages`.

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
- Browser CORS file: `backend/r2-cors.json` allows GET/PUT/HEAD with `content-type` from `http://localhost:5173`, `http://localhost:3000`, `http://localhost:4173`, `https://wassaa.app`, and `https://wassaa.vercel.app`. The file is the source of truth; apply it to **both** buckets with `npx wrangler r2 bucket cors set <bucket> --file backend/r2-cors.json` and confirm with `cors list`. The Vercel origin was added on 2026-10-26 after testers got "failed to fetch" on uploads from `wassaa.vercel.app` (bucket rules lacked the origin while Edge API CORS already allowed it); the Edge API allow-list itself never needed a change for Vercel (see §12). Keep the file aligned with the actual deployed origins.

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
| `VITE_POSTHOG_KEY` | Public | PostHog project API key (`phc_…`) for product analytics. Absent = analytics is a no-op. |
| `VITE_POSTHOG_HOST` | Public | Optional PostHog ingest host; defaults to `https://eu.i.posthog.com`. |

Never put a Supabase service-role/secret key, Google OAuth client secret, Termii API key, Paystack key, webhook secret, R2 secret, or a PostHog **personal** API key in any `VITE_` variable.

### Product analytics (PostHog, consent-gated)

`frontend/src/services/analytics.ts` wraps `posthog-js`. The SDK is not initialised and no request is made until a member turns on **Product analytics** in Settings → Trust & privacy (localStorage key `wassaa_analytics_consent_v1`; default is off). Consent can be withdrawn from the same switch, which resets the PostHog identity and opts out. The switch only renders when `VITE_POSTHOG_KEY` is present in the build.

Captured events: `app_opened`, `screen_viewed` (the shell is a state machine, so each screen is captured explicitly), `sign_in_completed`, `onboarding_step_completed`, `onboarding_completed`, `like_sent`, `pass_sent`, `match_created`, `chat_opened`, `message_sent`, `store_opened`. The member is identified by profile UUID with only `onboarding_complete`, `identity_verified`, `account_status`, and `dating_goal` as person properties — no email, phone, name, photos, document numbers, coordinates, or message text. Sign-out and account deletion call `resetAnalytics()`. Session replay, autocapture, pageviews, and pageleave capture are disabled.

### Legacy local API (`backend/.env`)

The ignored local file contains some combination of `PORT`, `NODE_ENV`, `CORS_ORIGINS`, `SESSION_JWT_SECRET`, `ADMIN_API_KEY`, `DATA_BACKEND`, `SUPABASE_DB_URL`, `SUPABASE_URL`, publishable/service role values, `TERMII_*`, `PAYSTACK_*`, `R2_*`, and `GOOGLE_CLIENT_ID`. Use `.env.example` for key names and intended behavior, never copy values into docs or chat. `.gitignore` excludes `.env*` and the local hook secret.

### Hosted Edge Function values

Supabase injects project URL and API key material in the hosted Edge runtime. Customer-managed function secrets expected by code include:

`TERMII_API_KEY`, `TERMII_SENDER_ID`, optional `TERMII_BASE_URL`, `SEND_SMS_HOOK_SECRET`, `APP_ORIGINS`, `GOOGLE_CLIENT_ID`, `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` or `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`, `PAYSTACK_SECRET_KEY`, and `PAYSTACK_CALLBACK_URL`.

Hosted Edge secrets are separate from local `.env`; adding a value locally does not upload it. Set them in Supabase Dashboard → Edge Function Secrets or via Supabase CLI (`npx supabase login` first — requires the **Owner or Administrator** role, see §8). The repository deploy helper reads only an allowlisted subset from `backend/.env`, creates a temporary filtered env file, uploads it, and deploys `send-sms` + `api`. It checks for a `--credentials-rotated` acknowledgement and refuses to deploy if required entries are empty, the SMS hook secret has an invalid format, buckets are the same, or public/callback URLs are not HTTPS. For R2-only re-uploads (after credential rotation) use `node scripts/set-r2-secrets.mjs`.

**Hosted secret inventory (inspected 2026-10-25 via `supabase secrets list`, values are returned as hashes only):**

- Present: `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL` (uploaded 2026-10-25), `TERMII_API_KEY`, `TERMII_SENDER_ID`, and the Supabase-managed `SUPABASE_*` keys.
- **Fixed 2026-10-27 (Owner CLI session, project linked to `avlbsficfejvwokxkgyl`):** `GOOGLE_CLIENT_ID` and `PAYSTACK_CALLBACK_URL` were uploaded via `npx supabase secrets set --env-file <filtered temp file>` (values never printed) and are confirmed present. `/public-config` now returns the Google client ID, so the admin console renders the Google button instead of "Google Sign-In is not configured." Secrets set this way take effect at runtime — the `api` function did **not** need redeploying for `/public-config` to pick it up.
- **Still absent:** `PAYSTACK_SECRET_KEY` is missing from `backend/.env` itself (billing endpoints keep returning "Payments are not configured" until it is added and uploaded), and `TERMII_BASE_URL` is optional/unset.
- **`APP_ORIGINS` — superseded by request probes (2026-10-26):** the 2026-10-25 inventory listed it as missing, but live probes of the deployed `api` function show `https://wassaa.vercel.app` being echoed as `Access-Control-Allow-Origin` (200) while an unknown origin gets 403 + fallback to `https://wassaa.app` — i.e. the effective allow-list includes Vercel, so the secret is set hosted (or the deployed code was updated to include it). The inventory itself could not be re-read: `supabase secrets list` from this workspace returned 403 (insufficient privileges) on 2026-10-26; re-login with an Owner/Administrator session before the next secrets change. Verify by probing, not by assumption.
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

**Vercel frontend deploy:** run `vercel --prod` **from `frontend/`**, not the repo root. Both `.vercel/project.json` links point at the same `wassaa` project, but the Vite build config (`buildCommand`, output `dist`, rewrites, headers) lives in `frontend/vercel.json`, and the root `package.json` has no `build` script — running `vercel` from the root uploads the whole repo and fails the remote build with `Missing script: "build"` (observed 2026-10-26). Local CLI deploys upload the working tree as a snapshot, so an uncommitted tree still deploys; push to git separately if it should also be in history. After deploying, confirm the live HTML references the fresh `assets/index-*.js` hash and remember the service worker caches the shell — testers need a hard refresh.

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

Deno is unavailable in the current workspace, so there is no Deno typecheck. Still not performed at that date: browser/device UI run, geolocation permission prompts on a real device, live SMS, Paystack transactions, or load test (the admin console/moderation routes were exercised later — see the 2026-10-27 run in §18). Do not infer production capacity from a successful build or a smoke test.

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
- **Infrastructure:** the PWA is hosted on Vercel at `https://wassaa.vercel.app` (hosting lives in the Vercel dashboard, not in repository code; `https://wassaa.app` remains in the API/R2 allow-lists as the intended production origin). R2 bucket CORS was updated to include the Vercel origin on 2026-10-26 (§8) after tester upload failures. Google OAuth origins must match the final domains — confirm the Vercel domain is added to the Google Cloud OAuth authorized origins before relying on Google sign-in there.

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
- Google sign-in and the admin console sign-in are **verified end-to-end on localhost (2026-10-27)**: `http://localhost:5173/admin/index.html` obtained a Google ID token, exchanged it at `/auth/v1/token?grant_type=id_token` (200), passed the allowlist gate (`/admin/session` 200) and loaded `/verifications`, `/reports`, `/appeals`, `/threads` and `/npcs` (all 200) with the persona pool rendered. The owner row is in `public.wassaa_admin_users` (`lemyskew7@gmail.com`, display "Owner"); the deployed bundle at `wassaa.vercel.app` contains `VITE_GOOGLE_CLIENT_ID` and loads GIS, and the production console renders the button, but the popup click on that origin has not been exercised (needs the owner's Google session; the origin must be listed in the OAuth client's Authorized JavaScript origins).
- Local console URL quirk: under the Vite dev server the SPA fallback wins for `/admin/` and shows the member app; use `http://localhost:5173/admin/index.html`. On Vercel the static file takes precedence, so `/admin/` is correct there.
- Still unverified: device/permission-prompt runs, Paystack test webhook/transactions (`PAYSTACK_SECRET_KEY` not in `backend/.env`), `send-sms` (and the `SEND_SMS_HOOK_SECRE` typo, §12), and load testing. R2 media upload/download is verified (48/48 smoke run); the admin console and moderation flows were verified on 2026-10-27 (`scripts/admin-smoke.mjs`, §18).

## 17. Design overhaul and navigation restructure (2026-10-26)

Everything below is verified in the browser against the local dev server with a QA account and passes typecheck + production build.

### Profile / Settings split and dock rework

- `SettingsPrivacyScreen` gained `view: 'profile' | 'settings'`, `onOpenSettings`, `onBackToProfile`. Profile view: header (preview + gear buttons), identity card, photos, about you. Settings view: back button header, membership card, discovery, trust & privacy, account. Both are rendered from `App.tsx` (`settings_privacy` and `settings` ScreenIds); `settings` is in `showTabs` and maps to the Profile dock tab.
- New ScreenId `messages`: `MatchesListScreen` renders `variant="messages"` (own header, conversation list, "No messages yet" empty state with a Discover CTA). The old bug — clicking Messages with no active match redirected to `matches_list`, lighting up the **Matches** tab so Messages looked dead — is gone; the dock handler is a plain `setCurrentScreen(id)` again.
- Chat tracks `chatOrigin` so Back returns to `messages`, `matches_list`, or `discover` depending on where the conversation was opened. Phone verification now enters/returns to `settings`.
- Dock: 28px icons (`w-7 h-7`), ~68px item height, 13px labels, opaque surface (no `backdrop-filter`), 12px + safe-area bottom padding.

### System CSS (frontend/src/index.css)

- Root font size fixed at 16px (removed the `clamp(16px, 4.25vw, 18px)` viewport scaling that made devices disagree).
- Unlayered press-calibration rule: `button, [role="button"], a[href]` always transition `scale` (140ms) — beats the utilities layer, so per-screen `transition-colors` can no longer drop press feedback. Verified in-browser: a `transition-colors` button computes `transitionProperty: "scale, background-color, ..."`.
- Tap floors: 44px min-width/min-height, 40px with `data-compact` (also floors the inline-styled icon buttons).
- `.row-icon` is now a plain muted inline icon — the tinted icon-tile boxes that made every Profile row bulky are gone (per-row `bg-[...] text-[...]` overrides removed in TSX).
- New `.modal-title` class; all ten modals in `SettingsPrivacyScreen` use it plus the `.btn` kit (their ad-hoc `rounded-full bg-[#B85A3C] text-xs font-bold` one-offs were replaced).

### AI-slop / consistency sweep

- `frontend/index.html` sets `viewport-fit=cover` so `env(safe-area-inset-*)` is real on notched phones (dock/text were sitting under the home indicator before).
- BlockReportModal + FilterModal: off-palette hexes (`#C25E68`, `#232725`, `#646A67`, `#E5E0D8`, `#F8F5F0`) → brand values; unloaded Fraunces → Cormorant Garamond; `⌛` spinners → `Loader2`; `vh` → `dvh`.
- Dating-goal emoji options (💍❤️✨🌿) → lucide `Gem`/`Heart`/`Target`/`Compass` with keyboard-accessible `role="button"` rows; membership `Sparkles` → `Star`; MatchCelebration gradient blob removed; `WassaaLogo` 9/10px text bumped; "Profile activated! Your match queue is ready" → "You're all set — fresh profiles land in Discover."; dead `BackendLiveConsole.tsx` deleted; lightbox/photo triggers got `role="button"`; `vh` → `dvh` across Chat/Identity/Settings lightbox.

### QA fixtures

- `scripts/qa-design-user.mjs` gained `--seed` (three male Lagos deck profiles, `qa-design-deck*` prefix) so Discover renders real cards; `--cleanup` still removes every `qa-design-*` user and profile. Reviewer deck verified at 3 cards.

## 18. Expansion: taxonomy, verification, NPCs, moderation, credits (2026-10-26; implemented in source, DB applied, 300 personas seeded 2026-10-27)

> Implementation status lives at the end of this section (§18G). Sections §9 (tiers) and §3 onboarding details are superseded by the credit model here. Where this text and the SQL disagree, the SQL wins.

The remainder of §18A–F is the agreed design; §18G records what is actually built, what was verified, and what is still blocked.

### A. Role and skill taxonomy (profiles)

Top-level `class_of_service` replaces the implicit uniformed/civilian split:

- `military` | `police` | `paramilitary` → require **role** ∈ `officer` | `soldier` (police/paramilitary map officer = inspector-and-above/inspectorate cadre, soldier = rank-and-file/constable cadre) and a **skill/trade** from a curated list (e.g. Nursing/Medical, Engineering, Software/IT, Logistics/Drivers, Communications/Signals, Aviation, Legal, Education, Admin/Logistics, Trades).
- `civilian` → no officer/soldier; picks profession category + title as today (any profession list works: nurse, engineer, software engineer, trader, student, etc.).
- Migration is additive: existing profiles keep their profession fields; `class_of_service`, `role`, `skill` land as nullable columns filled on next edit; the onboarding Profession step branches: Branch (Military/Police/Paramilitary/Civilian) → for non-civilian: service branch select → officer|soldier → skill → title; for civilian: existing category/title path.
- Officer/soldier labels shown on the identity card as `Officer · Nursing` etc.; civilians show their title only.

### B. Verification pipeline (selfie + ID → badge)

1. Onboarding includes the identity step: front+back ID photo, selfie, document type + number (number masked server-side as today). Photos go to a **private** bucket path under the user; only short-lived signed URLs ever leave the API.
2. New `verification_requests` row per submission: `pending → approved | rejected` with reviewer, timestamp, and reject reason.
3. Admin console gets a review queue: side-by-side selfie vs ID (signed URLs), doc type/number, prior history. Approve sets `profiles.verification_status='verified'` → existing `ShieldCheck` badge lights up everywhere it is rendered.
4. On any profile report, the reviewer re-opens the face-vs-ID pair from the account view to confirm the reporting subject still matches their ID (that is why raw photos are retained securely).
5. NPC profiles are seeded as `verified` (they are fixtures; the flag is server-side and never distinguishes them publicly).

### C. NPC population and behavior (≈300 profiles)

- **Seeding:** `scripts/seed-npcs.mjs` creates ~300 auth users (`npc-…@wassaa.test`-style service markers server-side, flagged `is_npc=true`) with Nigerian names, ages 22–40, Lagos/Abuja/PH/Kano/Enugu/Ibadan locations, bios/interests/roles/skills from the §A taxonomy, 3–4 photos each (placeholder CDN initially; admin can replace with real uploaded photos via R2 from the NPC manager).
- **Discovery priority and fade:** discovery composes each deck as *real candidates first* (existing ranking), NPCs filling the remainder. NPC share = `clamp(1 − real_candidates_in_range/30, 0.25, 1)` — with few real users the deck is mostly NPCs; as real candidates in range grow, NPC share decays to a **25% floor** and never reaches zero.
- **Greeting:** after a mutual match, an NPC sends a randomized "hello"-style opener (cron/Edge function; delayed 5–60 min so it feels human).
- **Reply engine:** rule/intent-based (greeting, small talk, questions about them, compliments, plans/logistics, farewell, off-topic fallback) using persona data (skill, city, interests). Replies are delayed 20–90 s before posting through the normal message path so the standard broadcast/poll delivery is unchanged.
- **Thread state machine** (per user × NPC thread): `active` → replies while the payer has credits and the thread has daily budget; `quiet` after the free budget (≈12 NPC messages/thread/day) or at 0 credits — NPC simply stops replying; two further user messages trigger the top-up sheet; `admin_owned` after any credit purchase — auto engine detaches and the thread appears in the admin "Attending" queue where staff reply as the NPC in real time. Existing threads are never faded out: fade rules apply only to *new* NPC discovery and new greetings.
- **Admin NPC manager:** list/search NPCs, edit persona, upload/replace photos, activate/deactivate, view per-NPC thread counts.

### D. Reporting, review, and sanctions (chat + accounts)

- Report targets: an **account**, a **message**, or an **image** (long-press a message bubble or image → sheet with Report). Reasons: photos/impersonation, harassment, spam/scam, underage/suspicious, other + free text.
- Reports store reporter, target, reason, optional message reference. The admin review view assembles everything server-side: full profile (incl. verification data with face-vs-ID viewer), account dates, prior reports, and the **complete DM history between reporter and reported** (history already lives in messages).
- Actions: **restrict** (logged in, read-only: no likes, no sends), **ban** (login blocked), **delete account** — every action requires a stored reason; the user sees the reason in-app and an **Appeal** button; appeals queue for admin re-review with a note; reinstatement clears the sanction.

### E. Credit economy (replaces tier subscriptions)

Decisions (profit + retention, one currency, no tier/credit mix):

- **1 credit = 1 sent message**, persona or real (owner revision in `20261026000001_message_credits_everywhere.sql`, which supersedes the original "real chat is free" decision in this spec). Replies never charge the member.
- **Signup grant: 25 credits** (welcome screen states it plainly). Plus a **daily drip of 1 credit** for returning non-payers (keeps dormant threads re-enterable for admin re-hooking).
- **Actions:** NPC message 1 · Super Like 3 · Boost (1 h) 10 · Reveal who likes you (24 h) 15 · Undo pass 1.
- **Paystack packs:** Quick 40 ₦300 (₦7.5/credit) · Standard 240 ₦1,500 (₦6.25/credit, "Most popular") · Premium 600 ₦3,300 (₦5.5/credit, "Best value"). Credits never expire. Existing paid tier entitlements (if any) are honored to expiry, then retired; `SubscriptionPlansScreen` becomes the credit store.
- **Paywall moments:** sending to a quiet NPC at 0 credits; balance chip ≤ 5 turns amber; after every successful payment the user lands back in the thread with an NPC reply queued, and **all of that user's NPC threads flip to `admin_owned`** so staff continue the conversation personally.
- Server-side: `credit_ledger` (append-only: grant, drip, purchase, spend, refund) + cached balance, checked inside the same transaction/authorization path as message send — the browser is never trusted with balances.

### F. Implementation order (when the code maps land)

1. Additive migration: taxonomy columns, `verification_requests`, sanctions/appeals, `is_npc` + credit tables.
2. Edge API: credit grant/drip/spend hooks, extended Paystack webhook, NPC engine endpoints (greeting cron, reply), report/appeal endpoints, admin surface (verification queue, reports+DM view, sanctions, NPC manager, thread takeover).
3. Frontend: onboarding taxonomy step, credit chip + store + paywall sheets, long-press report sheet, restriction banner + appeal screen, verified badge already reactive.
4. `scripts/seed-npcs.mjs` (300 profiles) + admin NPC photo upload.
5. Smoke/verification pass, then KB rewrite of §9 and §3 details from "spec" to "implemented + verified".

### G. Implementation status (2026-10-27)

**Applied to the linked project** (`avlbsficfejvwokxkgyl`), verified by direct Postgres queries from this workspace (`backend/.env` → `SUPABASE_DB_URL`):

- `20261026000000_expansion.sql` and `20261026000001_message_credits_everywhere.sql` are both recorded in `supabase_migrations.schema_migrations`.
- Columns/tables exist: taxonomy (`class_of_service`, `org_role`, `skill`), persona (`is_npc`, `npc_active`, `npc`), credits (`credits`, `last_credit_drip`, `boosted_until`, `revealed_likes_at`, `credit_ledger`), sanctions (`account_status`, `restriction_reason`, `restricted_at/by`, `appeals`), thread state (`matches.auto_state`, `auto_next_at`, `auto_spent`, `taken_over_by`), report evidence (`match_id`, `message_id`, `review_note`, `reviewed_at`).
- RPCs present: `wassaa_send_message` (6 args), `wassaa_npc_reply`, `wassaa_grant_credit`, `wassaa_spend_credit`, `wassaa_daily_drip`, `wassaa_seed_npcs`, `wassaa_fulfill_payment`, and the 9-arg NPC-aware `wassaa_discovery`. The superseded `wassaa_npc_send_message` was dropped by 00001.
- Welcome grant backfilled: 25 pre-existing members received a `signup_grant` ledger row.
- Verification reuses the existing `verification_submissions` table; no `verification_requests` table was added. Review now **retains** documents in the private bucket (short-lived signed URLs only) instead of purging them.

**Persona deck seeded (300)** with `node scripts/seed-npcs.mjs`: 300 rows, all `npc_active`, all `verified`, 20 cities, 95 greeters (32%). Class mix: 107 military / 45 police / 42 paramilitary / 106 civilian, with every uniformed persona carrying an `org_role`. Photos are `randomuser.me` portraits matched to gender (0 mismatches); the pool is 99 per gender, so faces repeat across the deck — these are placeholders meant to be replaced from the admin Personas screen (the script originally used random `picsum` landscapes, which read as broken profile cards). Deck composition was verified by running `wassaa_discovery` as a real Lagos member: **15 cards = 1 real + 14 personas**, real candidates first, 25% floor intact.

**Deployed 2026-10-27** with the project-owner Supabase session (`supabase functions deploy api --no-verify-jwt --project-ref avlbsficfejvwokxkgyl`). The first attempt failed with **403** because the CLI was signed into an account that could not see this project (absent from `supabase projects list`; `migration list` and `secrets` also 403) — owner login was the unblock. Live proof after deploy: `GET /functions/v1/api/health` → 200 and `/billing/plans-public` now returns `free, credit_40, credit_240, credit_600` (previously it still served `premium`/`hyper_premium`). Redeploy `api` after every source change with that same command; `npm run deploy:supabase` also pushes secrets and `send-sms`, which is unnecessary for an API-only change.

**Persona matching had to be fixed for the loop to exist.** `wassaa_find_or_create_match` requires a swipe in both directions and seeded personas never acted, so a member could like all 300 personas and never match one — no greeting, no conversation, nothing for credits to spend on. The `/likes` route now has the persona reciprocate a fresh like with **32% probability** (a normal `swipes` row, written server-side, never exposed in any client payload); the resulting match flows through the existing advice-locked match path, and the client cannot distinguish it from a member matching back.

**Implemented in source; static checks pass, live verification below:**

- Edge API (`index.ts` + `npc.ts` + `npc-content.ts`): lazy NPC engine on `/matches` and `/matches/:id/messages`, atomic spend + insert + reply-window in `wassaa_send_message`, daily drip on `/auth/session`, Super Like 3 / Boost 10 / reveal 15, credit-pack checkout and fulfillment, sanction gate (`ACCOUNT_BANNED` / `ACCOUNT_RESTRICTED`), appeals, report evidence, and admin queue/context/sanction/appeal/NPC/thread routes.
- Frontend: onboarding officer/soldier + skill pickers, chat credit hint, credit store, locked-likes reveal, appeal screen + restriction banner, hold-to-report, and the identity step as the **final step of onboarding** (opt-in) plus the Settings entry point — both mount `components/common/IdentityCapturePanel` (2026-10-27).
- Root `npm run typecheck` passes (backend + frontend); `npm run build` passes (existing ~510 kB chunk warning); `node scripts/check-edge.mjs` parses all four Edge modules.

**Deviations from the design above** (SQL is authoritative):

- Every **sent** message costs 1 credit; the "free real chat" line is retired and the store copy now says so. Replies never charge.
- The persona reply budget is **15 lifetime replies per thread** (not 12/day). `quiet` stops auto-replies; member messages still cost a credit.
- Greeting delay is 60–180 s, deterministic per persona (not 5–60 min); replies queue 20–90 s after a member message.
- There is no greeting cron — the engine ticks lazily when the member loads matches or a thread, so replies appear on the client's existing polling cadence.
- The balance chip does not turn amber at ≤5, and a completed purchase does not auto-return the member to the thread.

**Live verification (2026-10-27, hosted project):**

- `npm run smoke` (`scripts/e2e-smoke.mjs`) → **56 passed, 0 failed** on the final run. Covered: health, QA provisioning, onboarding gate, draft saves, location/radius, ranked discovery with **no persona markers**, mutual match, **1-credit debit on each send for both members**, id-only realtime broadcast, block enforcement on API + channel, signed R2 upload and public serve, **402 `CREDITS_NEEDED` at zero balance**, and “failed spend leaves no message behind”. Caveat: two earlier runs failed only the script's direct-S3 cleanup check (`r2DeleteObject` returned `null` while upload/serve passed), then it passed without changes — treat that helper as flaky and check for stray `smoke/` objects in the public bucket if it recurs.
- `node scripts/npc-smoke.mjs` (new persona-loop suite; run it after any NPC-engine or credit change) → **16/16**. Live proof of the whole persona loop: QA account bridged to a profile with 25 credits (+1 daily drip = 26), 20-card discovery with no persona markers, persona match after 2 likes, **greeting posted by the persona within the 60–180 s window** ("Hi QA! Two things: hello, and…"), member send debited exactly 1 credit (26 → 25), **persona reply posted in the 20–90 s window**, and match summaries carrying no persona marker. The QA account, profile, swipes, match, messages and ledger rows were removed afterwards.

- `node scripts/admin-smoke.mjs` (new; run it after any admin, moderation, verification, appeal or persona-editing change) → **83 passed, 0 failed**. Against the deployed API it proved: admin routes deployed (non-admin 403, not 404), allowlisted console session with R2 storage reported, verification queue exposing signed private ID/selfie URLs + masked document numbers, approve → profile `verified` (double-review 409), reject → note + reviewer stored, a report filed with real match/message evidence and the admin list/context returning the **full DM history with exactly the reported message flagged**, the reporter/reported account shapes incl. email and verification state, retained face-vs-ID media, status updates (invalid status 400), restrict → `ACCOUNT_RESTRICTED` on mutation with the stored reason while the session still loads, lift → mutations work again, ban → `ACCOUNT_BANNED` on discovery with the session/appeal path open, sanction validation (short reason 400, unknown action 400, non-admin 403), appeals (short note 400, duplicate `APPEAL_PENDING` 409, admin queue snapshot, non-admin decision 403, grant → account reinstated + sanction cleared, re-decision 409, deny → member reads the decision note and stays banned), persona search/edit/pause with the account detail view reflecting it, non-NPC and missing-persona refusals, photo presign (non-raster 415), signed PUT → attach → public serve, and the audit trail for every action. One transient `fetch failed` in an earlier run did not reproduce; the final run was clean.

- **Onboarding verification step (2026-10-27, local browser against the hosted API):** a throwaway member seeded one step short of the final step walked `10 / 11 → 11 / 11` in the real UI. Capturing a canvas-generated ID photo and selfie through the real file inputs produced `POST /uploads/presign` ×2 → signed `PUT` ×2 into `verification/<profileId>/…` → `POST /verification/submit` **200**. The queue row read back `pending`, type `NIN`, number `********901` (masked), both media keys under the member's private prefix, `profiles.verification_status = 'pending'` — i.e. exactly what the console's Verifications tab lists. The Settings entry point (same panel) rendered its capture cards as 78 px rows with a 52 px disabled submit before capture. The QA auth user, profile, submission row and both R2 objects were removed afterwards (R2 deletes returned 204). The seed/check/cleanup harness used for this was temporary and has been deleted; rebuild it from the `scripts/admin-smoke.mjs` fixtures if it is needed again.

**Still open:** click through the store and appeal UI in a browser, verify Paystack packs end to end (secrets still not hosted), fix or replace the smoke script's direct-R2 cleanup helper, and replace the persona placeholder portraits. (Hold-to-report was exercised in a browser on 2026-10-27 — see §20.) Four leftover `qa-design-*` QA auth accounts (2026-10-26, from the design-overhaul pass) remain in the hosted project; the admin-smoke run left nothing behind.

## 19. Dark mode (2026-10-27)

Light and dark are the same design system, not two palettes. The app expresses its colours as literal Tailwind values (`bg-[#F7F5F0]`, `text-[#1A1816]`, …), so a hand-written dark stylesheet would drift on the next new screen. Instead **`frontend/scripts/gen-dark-theme.mjs` reads the real colour classes out of `src/**/*.tsx`, maps them, and writes `frontend/src/styles/theme-dark.css`** (61 rules today, from 123 colour classes) — re-run the generator after introducing new colour literals.

- **Mechanism:** every rule is scoped to `html[data-theme="dark"]`, so switching is one attribute on `<html>`. The generated sheet is imported from `index.css` after `@import "tailwindcss"`; because it is unlayered it beats Tailwind's `utilities` layer without `!important`.
- **Tokens too:** the `@theme` variables (`--color-canvas`, `--color-surface`, `--color-line`, `--color-ink*`, `--color-brand-tint`, `--color-verified*`, `--color-danger*`) are redefined in the same block, which is what restyles the `@layer components` kit (`.card`, `.row`, `.dock`, `.toast-pill`, `.btn`) without touching TSX.
- **Mapping rules:** near-white surfaces → `#131110` canvas / `#1c1917` surface with alpha preserved; ink text → `#f3efe9`, muted → `#b7afa6`, faint → `#8e867d`; hairlines → `#332d28`; accent **text** brightens (`#B85A3C` → `#E8916B`, green → `#7bcda6`, red → `#f08c8c`) while solid brand fills stay `#B85A3C` so white-on-brand contrast (4.6:1) is unchanged; low-alpha white overlays on photos (`bg-white/25` etc.) deliberately stay white. `#1A1816` used as a *fill* becomes `#2e2925` so light text on it still reads, and `.toast-pill` (ink fill + white text) gets an explicit raised-surface override.
- **Preference:** `frontend/src/services/theme.ts` — `system | light | dark`, stored in `localStorage['wassaa_theme']`, applied by `initTheme()` in `main.tsx`. An inline script in `index.html` resolves the theme **before first paint** so a dark-mode member never sees a cream flash; `system` follows `prefers-color-scheme` live and the `<meta name="theme-color">` follows the resolved theme (`#131110` / `#F7F5F0`).
- **UI:** Settings → **Appearance → Theme** (System / Light / Dark, three 56 px options, `role="radiogroup"`). It is device-local and deliberately not part of the profile, so nothing is written to the database.

**Verified in-browser (2026-10-27, local dev server + hosted API, throwaway member):**

- Fresh load in dark: body/canvas `rgb(19,17,16)`, cards `rgb(28,25,23)`, dock `rgb(28,25,23)`, active dock tab `#37231b` with `#E8916B` label, and **zero opaque near-white surfaces left in the whole document** (scripted sweep of every element's computed background).
- Contrast on dark: page headline 16.4:1, settings row titles 15.3:1, row sub-copy 4.88:1 — all ≥ AA for their size.
- Switching to Light from the Appearance control updates body/cards immediately (`#F7F5F0` / white), flips `localStorage`, and the active dock tab returns to `#F5EAE5` / `#B85A3C`; reloading keeps the choice in both directions. `npm run typecheck` and `npm run build:frontend` pass (same pre-existing ~515 kB chunk warning).
- Not done: a real device check of the OS-level auto-switch, and a dark pass on every screen (Discover, Settings, onboarding step 11, chat, appeals verified; store/report/hold-to-report flows not yet inspected in dark).

**Screens that still need the literal-class treatment:** only if the generator ever skips a class, because the value is a hex the regex does not see (e.g. a colour built inside a template string). Keep literal colours in class strings.

## 20. Presentation pass: seal, report sheet, card scale, dense-surface copy (2026-10-27)

Owner feedback after the dark-mode release, all presentation: the verified badge "looks AI generated"; the hold-to-report sheet is "tacky, bulky, ugly"; the Discover card is small while space goes unused; list and profile screens have dead space; the profile preview sheet turns white in dark mode; the self-photo preview crops to the top of the frame.

- **Verified seal (`frontend/src/components/common/VerifiedMark.tsx`).** Rebuilt as a real trust mark: a **cusped seal** — twelve points at the rim joined by concave quadratic arcs (`Q` with the control point pulled toward the centre), which is the shape real badges use, and unlike the earlier rounded-lobe rosette it does not read as a cog. Geometry is size-aware: **12 points at ≥26px, 8 shallower points below**, the inner ring is drawn only at ≥26px, and the check thins (2.6 / 2.4 / 2.2) as the seal shrinks, because a thick check is a smudge in a 16px row. `onPhoto` keeps the white-seal-with-green-check variant and adds a soft drop shadow.
- **Report / block sheet (`frontend/src/components/chat/BlockReportModal.tsx`).** One calm column instead of a wall of copy: every reason is a single row (icon in a tinted circle, label, radio) and **only the chosen reason prints its description**, expanding with a height animation; the note field and the block switch stay folded (`Add details — Optional`) until asked for; the person's own header names the subject; the footer is one full-width action plus a quiet `Cancel` below it. Reason copy stays profession-neutral (a nurse, a trader, a soldier) and the report keys are unchanged, so existing reports and the console are untouched.
- **Careful with `bg-white`.** The dark-theme generator maps a bare `bg-white` to the dark surface, so anything that must stay white (a switch knob) cannot use it. The sheet now uses the shared `.switch` / `.switch-knob` component instead.
- **Discover card (`DiscoverScreen.tsx`).** The stage was `clamp(23rem, 100dvh − 17.5rem, 40rem)`, which both capped short and overflowed short phones. It is now **`clamp(20rem, 100dvh − 14.75rem, 46rem)`** against tighter chrome (header `mb-2.5`, actions `pt-4`, 3.5rem / 3rem / 3.5rem buttons) and measures **608 px tall on a 390×844 viewport**. Card story order is name, age, seal → service line → place → hairline rule → three-line quote → five hobby chips.
- **Service copy (`frontend/src/lib/profile-display.ts`).** Three helpers now cover three densities: `serviceLine` for the card (military = branch + cadre, `Army officer`; when the branch is unknown, `Armed forces · soldier`), `serviceShort` for rows and grid tiles (`Army`, `Police`, job title — one or two words so nothing truncates), and `affiliationLine` for detail surfaces. `shortAffiliation` was removed as dead. Cadre wording is commissioned / non-commissioned; **rank is never displayed anywhere**.
- **Dense surfaces.** Matches / Messages rows: 60px avatars, `py-4`, name at 1.0625rem, divider inset 5.5rem, and the suggestion rail's tiles grew to 8rem with the seal on them. Profile identity card restructured: avatar row, then the status pills (verify / credits / photo count) on their own full-width row, which stopped the name wrapping and left no pill stranded on its own line.
- **Profile preview sheet.** Was hard-coded `bg-[#F7F5F0]` / `border-[#E8E4DC]` / `text-[#1A1816]` — the white block members saw in dark mode. It now uses design tokens (`bg-surface`, `border-line`, `text-ink*`, `t-section`) and its hero shows the **whole frame** (`object-contain` on a near-black stage) instead of cropping to `object-[50%_28%]`, so a self preview can never show only the top of a portrait. Grid thumbnails and card crops moved 28–30% → 32%, which is where faces sit in a 3:4 frame.

**Verified in-browser (2026-10-27, local dev server + hosted API, dark and light):**

- Seal rendered at 16 / 21 / 26 / 40 / 96 px — clean scallop and readable check at every size; the 24-unit seal is a blur only with the old 12-point geometry, which is why the point count is size-aware.
- Discover card 608×334 on a 390×844 viewport; story reads `Ify Nwankwo, 23` + seal, `ARMED FORCES · SOLDIER`, `Ikeja, Lagos`, quote, five hobby chips.
- A conversation renders with **no dock** (`showTabs` excludes `chat`); the header menu and a real long-press on a received bubble both open the new sheet, and selecting a reason reveals exactly one description and enables `Report and block`.
- Photo viewer: simulated pointer swipes moved `2 / 3 → 1 / 3 → 2 / 3`; while open `body` is `position: fixed`, and after closing it returns to `static` with `scrollY` restored to 200 (the position the member left).
- Preview sheet image computes `object-fit: contain`; Profile / Matches / Explore were reviewed in dark, and Discover / Profile / the report sheet in light.
- `npm run typecheck` and `npm run build` (frontend) pass — same pre-existing ~530 kB chunk warning.

**Not done here:** the deployed bundle was not redeployed, so `wassaa.vercel.app` still serves the previous build; the admin console was untouched; the store and appeal screens have not had the dark/space review; no physical-device check.

## 21. One profile contract for members and personas (2026-10-29)

The member app and the seeded persona deck were carrying different field sets. Auditing the write path (`updateProfile` → `PATCH /me/profile` → `profileForViewer`) against the read path (`ProfileDetailScreen`) turned up **four fields that were collected, sometimes rendered, and never stored**: conversation prompts, lifestyle, values & family, and education / alma mater. The profile screen printed `almaMater` and the detail screen rendered all four, but no column, no PATCH field and no serializer existed — so a member could type them, see "Profile saved", and lose them on reload. Personas kept their prompts inside the `npc` JSON blob, which is why they looked richer than real people.

### The durable list (single source of truth)

| Layer | Fields |
| --- | --- |
| Identity | `name`, `birth_date` (→ age), `gender`, `pronouns`, `photos[]` |
| Work | `profession_category`, `profession_title`, `class_of_service` (derived), `service`, `org_role` (cadre), `skill`, `company_or_org`, `duty_station`, `education_level`, `alma_mater` |
| Place | `city`, `state`, `location_lat/lng` |
| Story | `bio`, `interests[]`, `prompts[]` (`{id,question,answer}` ×3) |
| Detail | `lifestyle` (`exercise`,`drinking`,`smoking`,`pets`), `values_family` (`faith`,`faithImportance`,`familyPlans`) |
| Intent | `dating_goal`, `match_preferences` |
| Trust | `verification_status`, `verified_at`, `privacy`, `account_status` |
| System | `credits`, `is_npc`, `npc`, `npc_active`, `created_at` |

Rank is **not** in the contract: `rank` is gone from the PATCH map and from `profileForViewer`; cadre (`org_role` = officer / soldier) carries that meaning, and the seed corpus no longer uses rank titles as job titles.

### What changed

- **`supabase/migrations/20261029000000_profile_detail_standard.sql`** — adds `prompts jsonb not null default '[]'`, `lifestyle jsonb`, `values_family jsonb`, `education_level text`, `alma_mater text`; backfills legacy `npc.prompts` (`{q,a}`) into `prompts` (`{id,question,answer}`, capped at 3); and rewrites `wassaa_seed_npcs` so personas land in the same columns.
- **Edge API (`supabase/functions/api/index.ts`)** — one validator per block (`cleanPrompts`, `cleanLifestyle`, `cleanValuesFamily`) applied to both `PATCH /me/profile` and `PATCH /admin/npcs/:id`; `profileForViewer` now returns `lifestyle`, `values`, `educationLevel`, `almaMater` for everyone, preferring the column and falling back to the persona blob for old rows.
- **Admin console (`frontend/public/admin/app.js`)** — the persona sheet edits the whole contract: identity (name, date of birth, gender, pronouns), work (category, title, employer, service, cadre, trade, duty station, education, school), profile (city, state, interests, bio, intention), lifestyle, values, three prompt rows, verification state, greeter and active. Category changes re-derive `class_of_service`; a civilian cannot keep a cadre.
- **Client (`frontend/src/services/api.ts`)** — `updateProfile` sends `prompts`, `lifestyle`, `values`, `educationLevel`, `almaMater`; `ClientProfile`/`toUserProfile` map them back.
- **Onboarding (`RealDatingOnboardingFlow.tsx`)** — steps 7, 8 and 9 now persist on `goNext`, not only at the final submit, so closing the app mid-flow no longer discards them.
- **Seed (`scripts/seed-npcs.mjs`, `scripts/npc-corpus.mjs`)** — personas get pronouns, prompts, lifestyle and values in the standard shape; `--backfill` fills existing personas deterministically without touching edited ones.

### Deployment order

Apply the migration before deploying the Edge function (the admin list selects the new columns), then ship the frontend/admin bundle. `node scripts/seed-npcs.mjs --backfill` fills personas seeded before this change.

### Verified

`node scripts/check-edge.mjs`, `tsc -p scripts/tsconfig.edge.json` (edge, strict), `tsc --noEmit` and `vite build` (frontend), `node --check` on the admin bundle and the seed script all pass. The migration has **not** been applied to the hosted project and the Edge function has not been deployed; no browser pass was run against the new columns. Docker was unavailable, so the SQL was not executed against a local Postgres.

## 22. Nigerian naming rule for personas (2026-10-29)

The persona deck composed first and last names independently from one flat pool, which produced impossible pairs — `Chukwuemeka Bello` (Igbo given name, Hausa surname), `Aisha Okonkwo`, `Dele Bello`, `Ngozi Ogundele`. Roughly **half the deck** was affected (148 of 300 in a dry run).

**The rule, now enforced in code (`scripts/npc-corpus.mjs`):**

- Names are tagged by tradition: **Yoruba, Igbo, Hausa, Tiv, Efik/Ibibio, Edo**, plus a separate **English/Christian** given-name pool and an **English** surname pool.
- A tribal given name takes a surname from **the same** pool. `Chidi Nnaji`, `Zainab Danladi`, `Mfon Edet`, `Terna Iorapuu`.
- An English/Christian given name (`Emmanuel`, `Grace`, `Joy`, `Victor`) may take **any** Nigerian surname, English included. `Christian Nwogu`, `Joy Oyelowo`, `Grace Ekpo`.
- The surname may not repeat the given name.
- `GIVEN_NAMES`, `FAMILY_NAMES`, `ENGLISH_GIVEN`, `buildName(rng, gender)`, `givenOriginOf()`, `familyOriginsOf()` are the only public name API. `FIRST_NAMES` / `SURNAMES` are gone; nothing may pick a first and last name independently again.

**Existing personas:** `node scripts/seed-npcs.mjs --fix-names` repairs only rows where the given name is a known tribal name and the surname belongs to a *different* known pool. English given names and surnames outside the corpus are left alone, so manual admin edits survive. `--dry-run` lists every proposed rename first. Dry run on the live deck: 148 of 300 names would change.

**Verified:** 20,000 generated names checked against the rule — zero violations; `node --check` on the seed script; sample output inspected for natural pairs.

## 23. Applied to hosted (2026-10-29)

`supabase db push` applied `20261029000000_profile_detail_standard.sql` to `avlbsficfejvwokxkgyl` (one pending migration, exit 0). The Edge Function was then deployed from the project-owner account, and the frontend to `wassaa.vercel.app` (`vercel --prod frontend`, 13 s, Ready; the served `/admin/app.js` is byte-identical to the local file).

**Data passes**

- `node scripts/seed-npcs.mjs --backfill` — all **300** personas now carry `prompts`, `lifestyle` (4 keys) and `values_family` (3 keys). Two follow-up passes were needed: the first used signed `>>` on a 32-bit hash, which produced negative indices for roughly half the ids, so 80 rows landed as `{}` and 72 as partial objects. The filter now treats a block with any missing key as absent, and the indices use `>>>`.
- `node scripts/seed-npcs.mjs --fix-names` — **201 names** repaired across five passes (148 mixed-tradition, 26 retired/unclassified surnames, 7 orphans after adding `Adebayo`/`Kalu`/`Ogbeide`/`Ogundana`/`Haladu` to their real pools, 17 given names that had been unclassified — `Tosin`, `Oluwakemi`, `Ayo`, `Ladi`, `Haliru`, `Ikpe`, `Festus`, `Rosemary`, `Mariam` were added — and 3 `Ekong` surname-as-given-name rebuilds). `RETIRED_FAMILY_NAMES` (`Arigidi`, `Tiwah`, `Mbaku`) and `RETIRED_GIVEN_NAMES` (`Ekong`) force a full rebuild rather than a swap.

Final live audit over all 300 personas: **mixed 0, retired 0, unclassified-given-with-tribal-surname 0, detail-complete 300**.

**Live verification after deployment**

- `node scripts/e2e-smoke.mjs` — **56 passed, 0 failed** (onboarding gate, discovery, match, two-way chat, credits/paywall, realtime, blocks, R2 upload round-trip, cleanup).
- Profile round-trip against the deployed API with a throwaway QA account: `PATCH /me/profile` and `GET /me/profile` both return `prompts`, `lifestyle`, `values`, `educationLevel`, `almaMater`, and no `rank` — **9/9 checks passed**, QA user deleted.
- Admin check with a temporary `wassaa_admin_users` grant: `GET /admin/npcs` returns `prompts`, `lifestyle`, `values`, `birthDate`, `educationLevel`, `almaMater`, `pronouns`, `companyOrOrg`, `dutyStation` — grant and user removed.

**Note for future agents:** the `supabase` CLI on this machine is authenticated as an account that does *not* belong to `avlbsficfejvwokxkgyl` (it 403s on `functions` and does not list the project). `db push` works only because `backend/.env` holds the Postgres password; function deploys must be run by the owner.
