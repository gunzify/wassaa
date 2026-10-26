# WASSAA

**For people who are done with casual.**

A dating and matchmaking platform for Nigeria's uniformed services and civilian professionals. A verified email (or Google sign-in) is required to create an account; adding a phone number is optional. ID and selfie review checks identity. Service branch is currently self-reported and is not independently verified.

This repository holds the full stack — a mobile-first React PWA and the Express API it runs on.

```
frontend/   React 18 + Vite 6 + Tailwind CSS 4 (mobile-first PWA)
backend/    Express 4 + TypeScript REST API (:8787/api/v1)
docs/       Implementation plan and monetization/economy model
supabase/   Supabase migrations and Edge Functions used by the current frontend
```

---

## Design system — Warm Terracotta & Editorial

The interface was rebuilt around one design language. The tokens and component kit live in [`frontend/src/index.css`](frontend/src/index.css) and are the single source of truth; screens compose the kit classes and Tailwind arbitrary values that match that palette.

**Palette**

| Role | Hex | Use |
|---|---|---|
| Canvas | `#F7F5F0` | Page background, app shell |
| Surface | `#FFFFFF` | Cards, sheets, modals |
| Border | `#E8E4DC` | Hairline rules and card outlines |
| Ink | `#1A1816` | Primary text |
| Secondary | `#6B665F` | Supporting copy |
| Muted | `#9C958D` | Meta, unselected nav |
| Terracotta (brand) | `#B85A3C` | Primary actions, active state, brand marks |
| Terracotta hover | `#A04E33` | Pressed/hover |
| Terracotta wash | `#F5EAE5` | Selected chips, upgrade banners |
| Olive | `#2A3A2C` | Editorial accent |
| Verified | `#2C6B56` | Verification badge and success |
| Danger | `#9B2C2C` | Destructive actions, reports |

**Type**

- `Cormorant Garamond` — editorial display serif for screen titles, names, quotes.
- `Plus Jakarta Sans` — UI sans for body copy, buttons, form fields.
- `Space Mono` — uppercase micro-labels, section numbering (`01 / Profile Photos`), IDs and meta.

All three are loaded from Google Fonts in [`frontend/index.html`](frontend/index.html); there is no bundled font dependency.

**Shape and rhythm** — 8–24px radii (2xl cards, pill buttons), soft shadows (`0 1px 3px` / `0 4px 16px -2px`), 4px spacing scale, a 480px centred content column, and a fixed four-tab bottom dock (Discover / Matches / Messages / Profile) with safe-area padding.

**Screen flow** — splash → sign-up → email OTP → onboarding → discover → profile view → match celebration → messages → profile & settings → subscription plans. Phone verification is an optional step opened from Profile & Settings. The shell and routing live in [`frontend/src/App.tsx`](frontend/src/App.tsx); each step is a screen in [`frontend/src/components/screens`](frontend/src/components/screens).

---

## Quick start

Requires Node.js 20+.

The current frontend authenticates with Supabase and calls `https://<project-ref>.supabase.co/functions/v1/api`. Configure `frontend/.env`, apply/adopt the SQL migrations, deploy the Edge Functions, and set rotated provider secrets as described in [`docs/SUPABASE-EDGE-MIGRATION.md`](docs/SUPABASE-EDGE-MIGRATION.md) before opening the app. The Express server below is a legacy rollback path and does not accept Supabase access tokens.

```bash
# 1. API — memory store, seeded with demo profiles, no database needed
cd backend
npm install
cp .env.example .env      # optional in dev; SMS/Paystack keys can stay blank
npm run dev               # http://localhost:8787

# 2. App — proxies /api/v1 to the API above
cd frontend
npm install
npm run dev               # http://localhost:5173
```

Root helpers:

```bash
npm run dev:backend   # start the API
npm run dev:frontend  # start the app
npm run typecheck     # typecheck both projects
npm run build:frontend
```

### Supabase Auth configuration

Email is the primary sign-in method and the email address must be confirmed; Google is the alternative. Phone verification is optional and lives in Profile & Settings.

- **Email provider** — enabled by default. The app requests a six-digit OTP from `/auth/v1/otp` and confirms it with `/auth/v1/verify`. Edit **Authentication → Email Templates → Magic Link** to include `{{ .Token }}` so the mail shows the code; the link in the same email also works, because the app picks the session up from the URL fragment on return.
- **Site URL and redirect allow-list** — set **Authentication → URL Configuration** to the deployed origin (for example `https://wassaa.app`) and add the local dev origins (`http://localhost:5173`) so the emailed link returns to the app.
- **Google** — follow [`docs/GOOGLE-SIGN-IN.md`](docs/GOOGLE-SIGN-IN.md); a Google account no longer needs a phone number.
- **Phone (optional)** — needs an SMS provider plus the Send SMS hook. Without it, the optional phone step reports that the code could not be sent; nothing else depends on it.
- **Custom SMTP** — the built-in mailer is rate-limited to a few messages per hour. Configure a provider before real traffic.

Apply [`supabase/migrations/20261024000006_email_identity.sql`](supabase/migrations/20261024000006_email_identity.sql) so confirmed emails create and link profiles the same way confirmed phone numbers do.

### Legacy Express API database configuration (rollback only)

The API runs on the in-memory store by default. To run it on Postgres (Supabase), set `DATA_BACKEND=supabase` and `SUPABASE_DB_URL` in `backend/.env`, then apply the schema and (optionally) the demo profiles:

```bash
cd backend
npm run db:migrate   # applies migrations/*.sql through pg — psql not required
npm run db:seed      # optional: the same demo profiles the memory store seeds
```

**Connection string.** Prefer the Supavisor pooler:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Recent Supabase projects resolve `db.<project-ref>.supabase.co` to **IPv6 only**, which fails on IPv4-only networks (the direct connection also needs the IPv4 add-on). The pooler is IPv4 and needs the `postgres.<project-ref>` user, not plain `postgres`. Port `5432` is session mode (right for this long-lived Express server); `6543` is transaction mode for serverless. Do not add `?sslmode=require` — `pg` here negotiates TLS itself in `backend/src/store/pg.ts`.

`db:seed` inserts profiles with phones `+2348010000001…7`; to remove them: `delete from profiles where phone like '+23480100%';`.

### Object storage (Cloudflare R2)

Set the `R2_*` variables from [docs/GETTING-KEYS.md](docs/GETTING-KEYS.md) to upload ID documents, selfies and photos straight from the browser. Use a private bucket for verification material and a separate public bucket for profile photos. Without private bucket credentials the API falls back to data-URLs in the database (development only); profile photo uploads also require the public bucket and its asset domain.

### Hardening already in place

Per-IP and per-user rate limits on OTP, likes, messages, reports and uploads; constant-time admin key comparison; CSP/HSTS/no-store headers; CORS allowlist; async-safe routing so a database error returns 500 instead of killing the process; graceful shutdown that drains the pool; structured JSON request logs; and a production startup check that refuses insecure defaults.

## Configuration

Every secret belongs to the API. Copy [`backend/.env.example`](backend/.env.example) to `backend/.env`:

| Service | Variables | Behaviour without them |
|---|---|---|
| Sessions | `SESSION_JWT_SECRET` | Required for production; a dev fallback is used locally |
| Data | `DATA_BACKEND`, `SUPABASE_DB_URL` | `memory` seeds demo profiles; `supabase` uses Postgres (migrate + seed with `db:migrate` / `db:seed`) |
| SMS / OTP | `TERMII_*` or `TWILIO_*` | OTP is logged and returned as `devCode` |
| Payments | `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` | Sandbox completion endpoint, local only |
| Admin review | `ADMIN_API_KEY` | Sent as `x-admin-key` by the verification/report admin tooling |

Database schema: [`backend/migrations/0001_init.sql`](backend/migrations/0001_init.sql) (`npm run seed:db` at the root).

## Trust & safety

Identity review is manual: a member submits an ID and selfie for moderator review. It does not establish military or other service employment, and there is no automated liveness check. Reviews happen in the `/admin` console and decisions are audited. Account removal currently hides the profile; it does not perform full erasure of related records.

## Documentation

- [Getting the keys](docs/GETTING-KEYS.md) — every provider, step by step, with links: Supabase, Termii/Twilio, Paystack, Cloudflare R2, admin key.
- [Google sign-in setup](docs/GOOGLE-SIGN-IN.md) — Google Cloud configuration, web client IDs, and how Google accounts link to WASSAA profiles.
- [Implementation plan](docs/IMPLEMENTATION-PLAN.md) — architecture, API surface, requirements coverage, roadmap.
- [Monetization & economy](docs/MONETIZATION-ECONOMY.md) — plans, pricing, revenue model and the legal limits on selling matchmaking in Nigeria.

## Legacy archives

The project began as a single-page AI Studio prototype backed by Firebase. The app is now fully server-backed; the old Firebase rules/config and the AI Studio metadata are kept for reference only, in `backend/.legacy-firebase/` and `docs/.legacy-ai-studio-metadata.json`. Nothing in the running app reads them.
