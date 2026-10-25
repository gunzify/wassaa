# WASSAA — Production Audit

**Date:** 2026-10-24
**Scope:** the Supabase rewrite described in [`knowledgebase.md`](../knowledgebase.md) — React/Vite PWA → Supabase Auth + Edge Function `api` → Postgres + R2 + Paystack.
**Method:** static review, Deno and TypeScript checks, production build, live probes against the hosted project, and read/write tests against the live database inside rolled-back transactions.

## 1. Verdict

The **data layer is sound and the SQL is correct**. Every RPC, trigger, RLS rule and PostgREST predicate the API depends on was executed against the live project and behaved as intended.

The **product is not usable end to end** for one reason that has nothing to do with code quality: the Edge Functions were never deployed, and phone authentication is switched off. Every user-facing flow stops at the first request.

| Area | State |
|---|---|
| Database schema, RLS, RPCs, triggers | Verified working |
| Edge Function source | Sound, one defect fixed, **not deployed** |
| Supabase Auth | Google on, **phone off** — no OTP path |
| R2 media | Not configured in the hosted environment |
| Paystack | Not configured; no key in any deployed environment |
| Frontend build | Passes; **no host, no Google client ID** |
| Admin console | Deployed with the bundle, **allowlist empty → 403 for everyone** |

## 2. Evidence

Commands were run from the repository root.

| Check | Result |
|---|---|
| `npm run typecheck` (backend + frontend) | Pass |
| `npm run build:frontend` | Pass — `dist/` includes `admin/`, `manifest.webmanifest`, `sw.js`, icons, demo photos |
| `deno check supabase/functions/send-sms` | Pass (after fix) |
| `deno check supabase/functions/api` | 29 type errors, all from untyped Supabase clients — see §6.1 |
| `GET /functions/v1/api/health` | **404** `Requested function was not found` |
| `POST /functions/v1/send-sms` | **404** |
| `GET /auth/v1/settings` | `external.phone: false`, `external.google: true`, `external.email: true` |
| `POST /auth/v1/otp` | **400** `phone_provider_disabled` — "Unsupported phone provider" |
| Live schema inspection | 13 tables, 8 functions, RLS enabled on every table, auth→profile trigger present, columns match the code |
| RPC suite (rolled back) | `record_like` (recorded/already), `find_or_create_match` + system greeting, `match_summaries`, `submit_verification`, `fulfill_payment` (first=true, replay=false), `consume_rate_limit` — all correct |
| Auth→profile trigger | Created a confirmed-phone Auth user → profile auto-created with the same UUID; cleaned up afterwards |
| PostgREST predicates used by the API | 15/15 pass (`photos<>{}`, `not.in.(uuid…)`, nested `or(and(),and())`, `in(uuid[])`, birth-date ranges, `ilike`, upserts with `ignore-duplicates`, jsonb insert) |
| PWA surface | `/`, `/manifest.webmanifest`, `/sw.js`, `/icons/icon-192.png`, `/admin/` all served by the dev server |

Deliberately **not** verified because it is unreachable without deployment: live OTP delivery through Termii, presigned R2 uploads and private signed reads, Paystack checkout and webhook fulfilment, and therefore the full onboarding → match → chat → pay journey.

## 3. Blockers (nothing works until these are cleared)

| # | Blocker | Effect | Fix |
|---|---|---|---|
| B1 | Edge Functions not deployed | Every `/functions/v1/api/*` call 404s; the SPA cannot restore a session | Deploy `api` and `send-sms` |
| B2 | Phone auth disabled in Supabase | Sign-up and sign-in impossible; the only entry point is Google | Authentication → Providers → Phone, then configure the Send SMS hook |
| B3 | `VITE_GOOGLE_CLIENT_ID` absent from `frontend/.env` | `GoogleSignInButton` returns `null`, so the sign-in screen offers **no** method | Add the Web client ID and the authorized origins |
| B4 | Hosted Edge secrets unset | Even after deploying, uploads, payments and SMS return 503 | Set the secret set listed in `knowledgebase.md` §12 |
| B5 | `wassaa_admin_users` is empty | `POST /admin/*` returns 403; no one can review verifications or reports | Insert the moderator's Auth UUID |
| B6 | No frontend host or production origin | The PWA is unreachable to users; R2 CORS and Google origins reference `wassaa.app`, which is not serving this build | Deploy `frontend/dist` and align `APP_ORIGINS` + R2 CORS |
| B7 | 14 orphan demo profiles | They appear in discovery but have no `auth_user_id`, so they can never like or reply | Delete them before launch (see §7) |

`supabase projects list` does not include `avlbsficfejvwokxkgyl` for the account this machine's CLI is logged into, so the deploy cannot be performed from this workspace until the correct account is authenticated.

## 4. Defects found and fixed

1. **Sign-out did not sign the user out.** `App.tsx` called the legacy `signOutLocal()`, which only removes `wassaa_session_token`; the live session lives in `wassaa_supabase_auth_v1`. The user stayed signed in after tapping Sign out, and the refresh token was never revoked. Now calls Supabase `logout` and clears local state; the dead `services/auth.ts` shim is removed.
2. **"Start chat" after a match opened the wrong conversation.** It used `matches[0]`, which is the most recent *existing* match, not the one just created. The like response already carries the match id; it is now captured in `pendingMatch` and used.
3. **The Messages tab opened an empty thread with yourself.** With no `activeMatchId` the chat screen rendered `partner = currentUser`. The tab now routes to the match list.
4. **Discovery broke for active members.** The API built `id=not.in.(<every swiped uuid>)` into the query string; around a few hundred swipes that exceeds URL limits and the deck stops loading. Replaced with `wassaa_discovery` (migration `20261024000005_discovery_rpc.sql`): exclusions, block checks, reciprocal gender/age preferences and filters now run in SQL, returning at most 30 rows. Verified against live data for `female`/`women`/`male`/`men`/none and for `minAge`/`maxAge` windows.
5. **Message polling swallowed errors.** `GET /matches/:id/messages?since=<garbage>` returned an empty thread (the PostgREST error was discarded). It now validates the timestamp (400) and surfaces load failures.
6. **`send-sms` did not typecheck under Deno 2.9** (`Uint8Array<ArrayBufferLike>` is not a `BufferSource`). Fixed; `deno check` is clean.
7. **Gender-filter vocabulary bug** in the new discovery RPC, caught during verification: the UI sends `men`/`women`, the data uses `male`/`female`. Both are now accepted and an explicit filter overrides the saved preference.

## 5. Remaining risks (not fixed, ranked)

1. **Untyped database client.** `deno check` reports 29 errors because `createClient` is unparameterised and there are no generated types. Runtime is unaffected, but schema drift will not be caught at build time. Generate types and run the check in CI.
2. **Profile photos accept any `https://` URL.** A member can point a photo at a third-party host, leaking viewers' IPs to that host and injecting arbitrary remote content. Restrict to `R2_PUBLIC_BASE_URL` + same-origin `/paths`.
3. **Admin review deletes the ID/selfie objects before the database update.** If the update fails, the documents are gone but the submission is still `pending`, and the member cannot resubmit. Make the decision first, purge after, or add a compensating retry.
4. **No generated types, tests or CI.** There is no integration coverage for the API, no staging project, and no automated gate on the typecheck/build that did run here.
5. **Polling, not realtime.** 4 s messages / 8 s match summaries; no push notifications. Costly at scale and poor for chat.
6. **Monetisation is one-time only.** No expiry, renewal, refund, receipt or reconciliation; `billing/activate` trusts only the webhook, which is correct, but nothing reconciles missed webhooks.
7. **Account deletion cascades `payments`.** Financial history disappears with the profile (Paystack retains its own records). Confirm this is the intended retention policy.
8. **Rate limiting is per profile only.** The unauthenticated OTP endpoint depends entirely on Supabase Auth's own controls; verify them before launch.
9. **`maxDistanceKm` is stored but never enforced**; no pagination cursor and no ranking, so discovery is `order by created_at desc`.
10. **Infrastructure hygiene:** `r2.dev` dev domain, dev origins in `backend/r2-cors.json`, console-only logging, no error tracking, no backup/restore drill, no CSP on the static host.
11. **Terms, privacy notice, retention and data-subject process** are still unwritten, which matters for NDPR and for the identity-review claim.

## 6. Go-live runbook

```bash
# 0. Authenticate the CLI with the account that owns the project
supabase login
supabase link --project-ref avlbsficfejvwokxkgyl

# 1. Rotate every credential that was pasted into chat (Termii, R2, DB password,
#    service-role key) before uploading anything.

# 2. Enable Phone auth + the Send SMS hook in the dashboard, using the deployed
#    send-sms URL and a secret that matches SEND_SMS_HOOK_SECRET exactly.

# 3. Upload hosted secrets, then deploy both functions
npm run deploy:supabase -- --credentials-rotated

# 4. Verify the deployment before touching the frontend
curl -s https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api/health
curl -s https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/api/billing/plans-public

# 5. Create the first moderator
#    insert into wassaa_admin_users (user_id, display_name) values ('<auth uuid>', 'Name');

# 6. Set frontend/.env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
#    VITE_GOOGLE_CLIENT_ID), rebuild, deploy frontend/dist to the production origin.

# 7. Smoke test on the deployed origin: OTP sign-in, onboarding, discovery,
#    like → match, chat text + photo, block/report, verification submit,
#    admin review, Paystack test-mode purchase, account deletion.
```

## 7. Pre-launch data cleanup

The 14 demo profiles use `+234…` phone numbers while Supabase Auth stores digits only, so they can never be linked. Delete them before launch, and normalise any retained legacy rows:

```sql
delete from profiles where auth_user_id is null;
-- only if real legacy accounts are being migrated:
update profiles set phone = regexp_replace(phone, '\D', '', 'g') where phone like '+%';
```

## 8. Roadmap

**P0 — make it run (days).** Clear B1–B7. Rotate leaked credentials. Deploy and smoke test on the real origin.

**P1 — make it safe (1–2 weeks).** Photo URL allowlist, CSP and security headers on the host, error tracking (Sentry) and structured logs, database backups + a restore drill, admin 2FA, OTP throttles, moderation coverage, privacy notice + terms.

**P2 — make it complete (3–6 weeks).** Realtime chat and push notifications, subscription renewal/refunds and webhook reconciliation, discovery ranking + pagination, distance filtering, generated DB types.

**P3 — make it durable.** API contract tests against a staging project, Playwright smoke suite, CI gates (typecheck, Deno check, build), staging → production promotion, load test with concurrent swipes/messages.
