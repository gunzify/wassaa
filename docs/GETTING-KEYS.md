# Getting the keys â€” step by step

Everything the API needs lives in **`backend/.env`**. That file is git-ignored
(`.env*`), must never be committed, screenshotted or pasted into chat, and is read
once at boot â€” restart the API after changing it.

```bash
cd backend
cp .env.example .env        # first time only
npm run dev                 # restarts on change with tsx watch
```

Current status of this project:

| Credential | State | Needed for |
|---|---|---|
| `SUPABASE_DB_URL` | âœ… configured | all persistent data |
| `SESSION_JWT_SECRET` | âœ… generated | sign-in sessions |
| `ADMIN_API_KEY` | âœ… generated | the integrity console |
| `TERMII_API_KEY` | configured locally; delivery not verified | real OTP SMS |
| `PAYSTACK_*` | â¬œ missing | subscriptions & the verification fee |
| R2 account, endpoint, S3 credentials | configured locally; connection not verified | private object storage |
| `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL` | bucket created; assigned development URL configured locally; CORS pending | public profile photo delivery |

---

## 1. Session and admin secrets (2 minutes)

Generate two long random strings â€” never reuse them across environments:

```bash
openssl rand -hex 32   # SESSION_JWT_SECRET  (64 hex chars)
openssl rand -hex 24   # ADMIN_API_KEY       (48 hex chars)
```

In production the API **refuses to start** if `SESSION_JWT_SECRET` is unset, if the
admin key is shorter than 24 characters, or if it still equals the development
default â€” see `assertProductionConfig()` in `backend/src/server.ts`.

Rotating `ADMIN_API_KEY` invalidates the console immediately: everyone re-enters the
new key at `/admin`. Rotating `SESSION_JWT_SECRET` signs everyone out.

---

## 2. Supabase (already connected)

Dashboard: <https://supabase.com/dashboard/project/avlbsficfejvwokxkgyl>

**Connection string** â€” Dashboard â†’ *Project Settings* â†’ *Database* â†’ *Connection string*.

Use the **Supavisor pooler**, not `db.<ref>.supabase.co`:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

- `db.<ref>.supabase.co` resolves to **IPv6 only** on newer projects. It is unreachable
  from IPv4-only networks (which is most hosts, and the machine this was built on).
- The pooler username is `postgres.<project-ref>`, not `postgres`.
- Port **5432** = session mode (right for this long-lived Express server);
  **6543** = transaction mode (for serverless functions).
- Do **not** append `?sslmode=require`. `pg` negotiates TLS itself in
  `backend/src/store/pg.ts`; the parameter forces certificate verification against
  Supabase's self-signed chain and the connection fails.

Apply schema and demo data:

```bash
cd backend
npm run db:migrate   # idempotent; migrations/*.sql
npm run db:seed      # optional: 7 demo profiles
```

**Least-privilege role.** The API currently connects as `postgres`. Before real users,
create a dedicated role in the SQL editor and point `SUPABASE_DB_URL` at it:

```sql
create role wassaa_app login password 'REPLACE_WITH_A_LONG_PASSWORD';
grant usage on schema public to wassaa_app;
grant select, insert, update, delete on all tables in schema public to wassaa_app;
grant usage, select on all sequences in schema public to wassaa_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to wassaa_app;
```

Then the pooler user becomes `wassaa_app.avlbsficfejvwokxkgyl`.

Also turn on **Database â†’ Backups** (PITR on paid plans) and *SSL enforcement*.

---

## 3. SMS for OTP â€” Termii (recommended for Nigeria)

Dashboard: <https://accounts.termii.com> Â· Docs: <https://developers.termii.com/messaging>

1. Create an account and verify your email/phone.
2. **Sender ID**: request `WASSAA` (or your brand). Approval usually takes a day; until
   then messages go out on a shared sender ID.
3. Copy the **API key** from *Settings â†’ API Keys*.
4. Fill in `backend/.env`:

```bash
TERMII_API_KEY=...
TERMII_SENDER_ID=WASSAA
```

**Twilio alternative** (more expensive in Nigeria, instant approval):
<https://console.twilio.com> â†’ Account Info for the SID, *Account â†’ API keys & tokens*
for the secret, and buy a number with SMS capability.

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...
```

For WASSAA OTP delivery, Termii must have its DND transactional route enabled and the `WASSAA` sender ID approved (or use an approved sender). The API sends OTP using the DND route. This key has not been validated by sending a message. Without a provider, the API returns `devCode` only in development. The API throttles to 3 codes per phone and 10 per IP per 10 minutes.

---

## 4. Payments â€” Paystack

Dashboard: <https://dashboard.paystack.com> Â· Docs: <https://paystack.com/docs/payments/webhooks/>

1. Create a business account. **Live keys require business KYC** (CAC, ID, bank
   account) â€” start this early, it is the slowest step.
2. Start with **Test mode** (toggle top-right) â†’ *Settings â†’ API Keys & Webhooks*.
3. Copy the **Secret key** (`sk_test_â€¦` / `sk_live_â€¦`). Never use the public key in
   the API; it belongs in a client that talks to Paystack directly.
4. Set the **Webhook URL** to `https://<your-api-domain>/api/v1/billing/webhook`.
   Paystack sends `x-paystack-signature`; the API verifies it against
   `PAYSTACK_SECRET_KEY` over the raw body (`lib/paystack.ts`).
5. Set the **Callback URL** to your app, e.g. `https://<your-app>/billing/callback`.

```bash
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_CALLBACK_URL=http://localhost:5173/billing/callback
```

Without a secret the API uses the sandbox completion endpoint
(`/billing/sandbox/complete`) so the upgrade flow can still be tested locally. That
endpoint is disabled when `NODE_ENV=production`.

---

## 5. Object storage â€” Cloudflare R2

Dashboard: <https://dash.cloudflare.com/?to=/:account/r2> Â·
API tokens: <https://dash.cloudflare.com/?to=/:account/r2/api-tokens>

Two buckets are configured in this R2 account. Do not use one public bucket for both profile
photos and identity documents; public access could expose sensitive files.

```
private bucket  wassaa (verification IDs/selfies and private chat media)
public bucket   wassaa-public (profile photos only)
S3 endpoint     https://<account-id>.r2.cloudflarestorage.com
development URL https://pub-90fd040b0f2f472da193086253476916.r2.dev
```

1. Keep the verification bucket private. ID media is served only through short-lived
   presigned GETs to the review console.
2. Enable public access or attach a custom domain to the profile-photo bucket only.
3. Create an S3 API token with Object Read & Write, scoped to both buckets.
4. Copy the Access Key ID and Secret Access Key; the secret is shown once.

```bash
R2_ACCOUNT_ID=<account-id>
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=wassaa
R2_PUBLIC_BUCKET=wassaa-public
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE_URL=https://pub-90fd040b0f2f472da193086253476916.r2.dev
```

5. **CORS** - the browser PUTs directly to R2, so both buckets need CORS. Apply the local rule set from `backend/r2-cors.json`:

```powershell
npx wrangler r2 bucket cors set wassaa --file backend/r2-cors.json
npx wrangler r2 bucket cors set wassaa-public --file backend/r2-cors.json
```

Add the deployed frontend origin to that JSON before launch. The `r2.dev` address is development-only; use a custom domain in production.

6. **Lifecycle** â€” optional but recommended: delete objects under `verification/`
   after 30 days as a belt-and-braces measure behind the immediate purge.

When the private bucket credentials are present the API reports storage enabled and ID media never touches Postgres. Profile photo uploads also require a distinct public bucket and its configured asset domain.

---

## 6. The integrity console

URL: **`/admin`** (served by the API itself â€” no separate deploy).

- Enter the key from `ADMIN_API_KEY` plus a desk name; both stay in `sessionStorage`
  and are gone when the tab closes.
- The panel compares the **ID photo**, the **live selfie**, and the **profile name and
  date of birth**, then approves or rejects with a note.
- Approving sets the general verified badge; rejecting records the reason. In both
  cases the images are deleted from R2 and nulled in the database in the same action
  (zero retention), and the decision is appended to `admin_audit`.
- Reports tab: change a case status, or block the reported account â€” blocking ends
  their sessions immediately and removes them from discovery.

Every console action writes to `admin_audit` (`verification.approved`,
`verification.rejected`, `report.status`, `user.blocked`, `user.unblocked`) with the
admin desk, target id and details.

If the key leaks: rotate `ADMIN_API_KEY`, restart, and check `GET /api/v1/admin/audit`.

---

## 7. Verify the wiring

```bash
curl -s http://localhost:8787/api/v1/health
# {"ok":true,"service":"wassaa-api","dataBackend":"supabase","storage":true,...}

# admin guard (401 without the key, 200 with it)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8787/api/v1/admin/verifications
curl -s -H "x-admin-key: $ADMIN_API_KEY" http://localhost:8787/api/v1/admin/verifications

# webhook signature check (Paystack dashboard can resend)
# OTP delivery
curl -s -X POST http://localhost:8787/api/v1/auth/otp/request \
  -H 'Content-Type: application/json' -d '{"phone":"08031234567"}'
```

`delivered:false` in the OTP response means no SMS provider is configured. In
production the API never returns `devCode`.

---

## 8. House rules

1. One `.env` per environment. Never copy production secrets into development.
2. Rotate anything that has been pasted into a chat, ticket or screenshot.
3. `NODE_ENV=production` before launch â€” it enables HSTS, strict CORS, the config
   checks, and removes `devCode` from OTP responses.
4. Keep the R2 bucket private; only `R2_PUBLIC_BASE_URL` media is public.
5. Run `npm run db:migrate` on deploy; it is idempotent.
