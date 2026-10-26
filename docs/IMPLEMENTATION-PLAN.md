# WASSAA Implementation Plan

> Verified dating & matchmaking platform for Nigeria's uniformed and civilian professionals.
> Real People. Meaningful Connections.

**Status:** Phase 1 (production-shaped vertical slice) — complete and running end-to-end.
This document describes the current architecture, external services, requirements coverage and the migration roadmap to full production.

---

## 1. Product pillars

| Pillar | What it means | Where it lives in code |
|---|---|---|
| Verified real people | Phone-OTP identity + manual ID/selfie review → a general verified badge only | `backend/src/lib/sms.ts`, `routes/verification.ts`, `routes/admin.ts` |
| Privacy for uniformed services | Rank/branch/duty-station visibility is user-controlled (`public / matches / private`); a verified badge **never** reveals service details | `store.ts#serializeProfileForViewer`, `PATCH /me/privacy` |
| Consent-first discovery | Server-authoritative swipes, match creation, blocks both directions, reports with categories | `routes/matching.ts`, `routes/discovery.ts` |
| Zero retention of ID documents | ID photo + selfie are held only while a review is pending; nulled immediately after a decision | `domain.ts#VerificationSubmission`, `routes/admin.ts` review endpoints |
| Legality & dignity | No human matchmaking sold as service (Phase 1); transparent one-time fee only pays for manual identity review | `docs/MONETIZATION-ECONOMY.md` |

## 2. Stack

### Frontend — `frontend/` (React PWA)
- **React 18 + Vite 6 + Tailwind CSS 4** (`@tailwindcss/vite`).
- **Design system — “Warm Terracotta & Editorial”**, single source of truth in `src/index.css` (palette variables, type scale, component kit) — `src/design-tokens.ts` was removed as dead code.
  - Canvas `#F7F5F0`, surface `#FFFFFF`, border `#E8E4DC`, ink `#1A1816`; brand terracotta `#B85A3C` (hover `#A04E33`, wash `#F5EAE5`); editorial olive `#2A3A2C`; verified `#2C6B56`; danger `#9B2C2C`.
  - Type: **Cormorant Garamond** (display serif), **Plus Jakarta Sans** (UI), **Space Mono** (uppercase micro-labels and section numbering), loaded from Google Fonts in `index.html`.
  - Shape: 8–24px radii, pill buttons, soft shadows, 4px spacing scale.
- **App shell** `src/App.tsx` — screen state machine, 480px centred column, fixed four-tab dock (Discover / Matches / Messages / Profile) with safe-area padding, toast host and session restore on boot.
- Screens: splash → sign-up → phone OTP → profession/service selection → profile setup → identity verification → discover / profile view / match celebration / chat / matches list / profile & settings / subscription plans.
- **API client** `src/services/api.ts` — single `WassaaApi` surface, bearer-token auth, typed mapping of backend payloads to `src/types`.
- **Auth store** `src/services/auth.ts` — session token in `localStorage`.
- Dev proxy: `vite.config.ts` forwards `/api/v1 → http://localhost:8787` (override with `API_TARGET`).
- All mock data and the old Firebase service were removed; the app is fully server-backed. Firebase config, Firestore rules and AI Studio metadata survive only as archives (`backend/.legacy-firebase/`, `docs/.legacy-ai-studio-metadata.json`).

### Backend — `backend/` (Node + Express + TypeScript)
- **Express 4** REST API under `/api/v1`, raw-body capture for the Paystack webhook, security headers, CORS allow-list.
- **Auth**: phone OTP → JWT session (HS256, `JWT_SECRET`), `createAuthMiddleware(scopes byStore)`; admin routes guarded by `x-admin-key`.
- **Storage abstraction** `backend/src/store.ts` — `Store` interface with two implementations:
  - `store/memory.ts` — in-memory store seeded with demo profiles (dev/preview default).
  - `store/pg.ts` — Postgres/Supabase via `pg`, pooled connections, schema in `backend/migrations/0001_init.sql`.
- **Domain model** (`domain.ts`): Profile, Swipe, Match, ChatMessage, OtpSession, Payment, VerificationSubmission, SafetyReport, BlockRecord.
- Verification images carried as data-URLs in Phase 1; production plan moves to object storage (§6).

### Node modules
React/ReactDOM, lucide-react, motion, canvas-confetti; backend: express, cors, pg, jsonwebtoken, paystack-style HTTPS client of our own in `lib/paystack.ts`, twilio-style SMS adapter in `lib/sms.ts` (fallback logs the code in dev).

## 3. External services & configuration

| Service | Purpose | Env vars | Phase 1 behavior |
|---|---|---|---|
| **Twilio (or LandaSMS)** | OTP SMS delivery, rate-limited (30s between requests, 10-min expiry, 5 attempts) | `SMS_ACCOUNT_SID`, `SMS_AUTH_TOKEN`, `SMS_FROM`, `SMS_LANDA_API_KEY` | Dev fallback prints the OTP in the response (`devCode`) |
| **Supabase Postgres** | All persistent data | `SUPABASE_DB_URL` (+ `DATA_BACKEND=supabase`) | Default `DATA_BACKEND=memory` seeds demo data. Schema via `npm run db:migrate`, demo rows via `npm run db:seed` |
| **Paystack** | Subscriptions, verification fee, boosts | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` | Without a key: sandbox completion endpoint (never in production) |
| **JWT** | Sessions | `JWT_SECRET` | Required in production |

Full env reference: `backend/.env.example` (the frontend keeps no secrets; root `.env.example` documents only `API_TARGET`).

## 4. API surface (`/api/v1`)

| Area | Routes |
|---|---|
| Health / catalog | `GET /health`, `GET /billing/plans-public` |
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `GET /auth/session` |
| Me | `GET/PATCH /me/profile`, `PATCH /me/privacy`, `PATCH /me/preferences`, `DELETE /me/account` |
| Discovery | `GET /discovery?profession&service&city&gender&minAge&maxAge&limit` |
| Swipes & matches | `POST /likes`, `POST /passes`, `GET /likes/received`, `GET /matches`, `GET/POST /matches/:id/messages`, `POST /matches/:id/read` |
| Safety | `GET/POST /blocks`, `DELETE /blocks/:id`, `POST /reports` |
| Verification | `POST /verification/submit` (R2 keys or data-URLs), `GET /verification/status` |
| Uploads | `POST /uploads/presign` — one-shot presigned PUT for `photo` / `id_doc` / `selfie` |
| Billing | `POST /billing/checkout`, `POST /billing/webhook`, `GET /billing/entitlements`, `POST /billing/activate`, `POST /billing/sandbox/complete` |
| Admin (`x-admin-key`) | `GET /admin/session`, `GET /admin/verifications`, `POST /admin/verifications/:id/review`, `GET /admin/reports`, `POST /admin/reports/:id/status`, `POST /admin/users/:id/block`, `GET /admin/audit` — consumed by the console at `/admin` |

## 5. Requirements coverage (service blueprint → code)

1. **Figure 1 — system architecture:** mobile web PDA (front) ↔ API tier ↔ data tier ↔ third-party infrastructure. ✔ two-tier Express + store abstraction.
2. **User verification:** OTP ✔; ID/selfie upload with masked document number ✔; manual admin adjudication queue ✔; badge-only reveal ✔.
3. **Rank & deployment privacy:** three-level per-field visibility with serialization that strips service/rank/duty outside `matches` scope ✔.
4. **Matching engine:** filterable candidate pool excluding swiped/blocked profiles, mutual match creation keyed on lexicographic pair ✔ (Phase 2 adds scoring).
5. **Standing chat:** text/voice/photo messages, poll-based fetch with `?since`, unread counts, read receipts on VIP ✔ (Phase 2 adds websocket push).
6. **Safety:** blocks (bidirectional), categorized reports, admin case queue, disabled-flag via `blockedUs` ✔.
7. **Monetization:** tiered plans + consumables, entitlements API, Paystack hosted checkout + idempotent webhook fulfillment ✔.
8. **Legality (matching service fee):** Phase 1 sells only features/verification review; matchmaking service fee is deferred to Phase 4 with geo-distribution readiness ✔.

## 6. Security controls (implemented)

| Control | Where |
|---|---|
| Rate limits (OTP per IP/phone, likes, messages, reports, uploads, admin) | `src/lib/rate-limit.ts` mounted per route |
| Constant-time admin key comparison | `routes/context.ts#requireAdmin` |
| CSP, HSTS, no-store, frame denial, permissions policy | `src/server.ts` |
| CORS allowlist (loopback in dev only) | `src/server.ts#corsOrigin` |
| Async errors cannot kill the process | `src/lib/router.ts`, `pool.on('error')` |
| Graceful shutdown drains requests and closes the pool | `src/server.ts#shutdown` |
| Production refuses insecure defaults | `src/server.ts#assertProductionConfig` |
| Media type/size/ownership validation | `storage.ts#isAllowedImageType`, `verification.ts#acceptMedia` |
| Photo URL scheme allowlist | `routes/me.ts#isSafeMediaUrl` |
| Zero-retention document purge (object + column) | `routes/admin.ts` + `store.resolveVerificationSubmission` |
| Append-only admin audit trail | `admin_audit` table, `store.recordAdminAction` |

## 7. Roadmap

- **Phase 1 (done):** vertical slice above; in-memory + Postgres stores; sandbox billing; manual review console; R2 presigned uploads (pending credentials); rate limiting; audit trail; PWA manifest and offline shell.
- **Phase 2 — Hardening:** WebSocket chat push (rate-limited); object storage for verification media (private bucket, signed short-TTL admin access, automatic purge job); like-limit counters persisted (PPH-safe); message text e2e-encryption evaluation.
- **Phase 3 — Launch ops:** SMS provider production keys; Paystack keys + webhook secret; secret rotation; monitoring & audit log for admin actions; app store wrappers (Capacitor) from the same PWA.
- **Phase 4 — Scale:** matchmaking scoring (premium signal boost), Private Introduction queueing service (human time, priced separately — requires legal review in Nigeria), spam scoring, geo-aware discovery ranks per state.

## 8. Local development

```bash
# backend (memory store, seeded)
npm install     # in backend/
npm run dev     # http://localhost:8787

# frontend (proxies /api/v1 to :8787)
npm install     # in frontend/
npm run dev     # http://localhost:5173

# root helpers
npm run dev:backend | npm run dev:frontend | npm run typecheck
```

Deploy: build frontend → `frontend/dist` (static, PWA-ready), backend → any Node host (or Supabase-hosted functions).

Schema and data:

```bash
cd backend
npm run db:migrate   # applies migrations/*.sql via pg (no psql needed)
npm run db:seed      # optional demo profiles, same set as the memory store
```

**Connecting to Supabase:** use the Supavisor pooler (`postgres.<project-ref>@aws-0-<region>.pooler.supabase.com`), port 5432 for this long-lived server, 6543 for serverless. Newer projects resolve `db.<ref>.supabase.co` to IPv6 only, so the direct host fails on IPv4-only networks; the pooler is IPv4. Do not append `?sslmode=require` — `pg` negotiates TLS in `store/pg.ts`, and the `require` parameter would force certificate verification against Supabase's self-signed chain.

Design work now starts in `frontend/src/index.css`: change the palette variables or component kit there, then propagate — screen files reference the same hex values through Tailwind arbitrary values rather than a runtime theme object.
