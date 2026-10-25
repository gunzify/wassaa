# Supabase Auth and Edge Functions migration

## Current implementation status

The frontend now uses Supabase Auth for Google ID-token exchange and phone OTP, and calls the `api` Edge Function for the main member flows. The API includes profile/preferences, discovery, swipes and atomic mutual matches, chat, blocks/reports, verification, R2 presigning, Paystack checkout/webhook fulfillment, and an allowlisted admin API. The old Express API remains in the repository as a fallback during rollout.

The owner applied all five SQL migrations to project `avlbsficfejvwokxkgyl` on 2026-10-24. The baseline reported that the core tables already existed, so migration history is now recorded but the baseline did not reconcile those existing table definitions. Compare the live schema against the migrations before launch. Function deployment, hosted secrets, the Auth SMS hook, live provider calls, admin allowlisting, abuse monitoring, and production transaction checks still need completion. Do not remove the Express deployment until the Supabase path has passed end-to-end staging checks.

## Project setup

Use the existing Supabase project `avlbsficfejvwokxkgyl`. The migrations have already been applied to that project. The first migration uses `CREATE TABLE IF NOT EXISTS`; that records the baseline but does not update tables which were created earlier. Verify live columns, constraints, indexes, and permissions before launch.

For a new project, install the Supabase CLI, link the project, and review the SQL before applying it:

```sh
supabase login
supabase link --project-ref avlbsficfejvwokxkgyl
supabase migration list
```

The baseline preserves existing WASSAA table definitions. The following migration links an Auth user to an existing profile by verified E.164 phone, or creates a profile when the verified phone is new. Existing profile IDs remain unchanged.

The migration also installs the SQL operations used for concurrency-safe like limits, mutual match creation, shared API rate limits, and idempotent payment fulfillment. These functions must be applied before deploying the Edge API.

## Google Sign-In

In Supabase Dashboard → Authentication → Providers → Google:

- Enable Google.
- Put the Web OAuth client ID and client secret in the provider fields.
- Keep nonce validation enabled and require email unless the product explicitly decides otherwise.
- In Google Cloud Console, add the Supabase callback shown in the provider settings (`https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/callback`) as an **Authorized redirect URI**.
- Add the deployed app origin (for example `https://wassaa.app`) as an **Authorized JavaScript origin**. Add each local Vite origin used for development, such as `http://localhost:5173` or `http://localhost:5174`.
- Configure Supabase Auth URL settings with the production site URL and narrowly scoped redirect URLs.

Never put the Google client secret or Supabase service role key in frontend environment variables. The Google client secret shared during setup should be rotated before launch.

The app's web Google button uses Google Identity Services and exchanges its ID token with Supabase Auth. Set `VITE_GOOGLE_CLIENT_ID` to the same Web client ID used by the Supabase Google provider. This ID is public; the client secret remains only in Supabase's provider settings.

## Termii OTP delivery

Keep deployment credentials in the ignored `backend/.env`; never commit them or pass secret values as command-line arguments. The deployment helper checks the required fields, writes only Edge Function secrets to a short-lived temporary env file, uploads that file, then deploys both functions:

```sh
npm run deploy:supabase -- --credentials-rotated
```

Before running the helper, set `APP_ORIGINS`, `SEND_SMS_HOOK_SECRET`, `PAYSTACK_SECRET_KEY`, and a production HTTPS `PAYSTACK_CALLBACK_URL` in `backend/.env`; it refuses to deploy if any required field is missing. Use the app root as the callback URL (for example `https://wassaa.app/`), since the SPA does not define a separate payment callback route. The `--credentials-rotated` flag confirms that the Termii and R2 credentials previously exposed in chat have been replaced. The helper never prints secret values and excludes unrelated legacy backend credentials from the uploaded Edge secrets.

Create a Supabase Auth hook secret using the format required by Supabase's Send SMS Hook settings, store it as `SEND_SMS_HOOK_SECRET`, and configure Authentication → Hooks → Send SMS to call:

`https://avlbsficfejvwokxkgyl.supabase.co/functions/v1/send-sms`

The hosted Auth hook is configured in the Supabase Dashboard, not committed in `supabase/config.toml`. The CLI requires a literal webhook-secret value in local Auth hook configuration, so keeping it out of the tracked config avoids committing an SMS signing secret.

The hook verifies the signed webhook ID/timestamp/body, rejects stale deliveries, limits body size, and sends OTPs to Termii's DND route. Configure and test the approved Termii sender ID and DND route in Termii. A successful HTTP request is not proof of handset delivery; confirm delivery with a real Nigerian number before enabling production OTP.

The API and SMS hook use the credentials supplied to the Edge runtime. Do not paste API keys into source files or command history. The Cloudflare and Termii credentials previously posted in chat must be revoked and replaced before use. Set `R2_PRIVATE_BUCKET` only if the private bucket is not named `R2_BUCKET`.

## Admin access

The static integrity console is copied into `frontend/public/admin` and signs in through Google. A user must be added to `public.wassaa_admin_users` before the console grants access. First sign in to the deployed app, find the Supabase Auth user UUID in Authentication → Users, then add the UUID and a staff display name in the SQL editor:

```sql
insert into public.wassaa_admin_users (user_id, display_name)
values ('<auth-user-uuid>', 'Integrity team');
```

The table has RLS enabled and is only queried by the server-side Edge Function. Remove the row to revoke admin access.

## Edge Function secrets

The `api` function expects the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The service role key must remain server-side. The function validates the caller token with Supabase Auth before using its service-role database client. The user-facing app only gets the publishable key. The admin panel checks a server-side allowlist; never re-enable the legacy client-controlled admin key.

## Remaining launch work

The code points the frontend at the Supabase project configured in `frontend/.env`. The SQL migrations are applied; finish these steps before inviting users:

1. Compare the existing database schema with the baseline and auth bridge migrations; applied migration history does not prove that the pre-existing tables matched.
2. Rotate the Termii and Cloudflare R2 credentials exposed in chat. Rotate the Google OAuth client secret if it was exposed, then update Supabase Auth provider settings.
3. Add all required Edge values, including an SMS hook signing secret and Paystack key/callback, then deploy `send-sms` and `api` with the helper. Configure the hosted Auth Send SMS hook URI and same signing secret, enable phone and Google Auth, and allow the production app origin.
4. Confirm R2 private/public bucket names and the public domain. Prefer a custom production domain over the `r2.dev` development domain. Apply bucket CORS for the app and local dev origins.
5. Add the first integrity administrator to `wassaa_admin_users` and host the built `frontend/dist` assets, including `/admin/`.
6. Run end-to-end staging flows for OTP delivery, Google sign-in, existing phone-account linking, profile setup, photo upload, swipe/match, private chat media, block/report, verification purge, account deletion, Paystack success and webhook retries.
7. Add production monitoring/alerts for Edge errors, SMS failures, webhook fulfillment, storage deletion, abuse and database capacity; run a load test before broad launch.

Express and its old custom auth remain in the repository as a rollback path. They are not used by the new frontend. Remove them only after the deployed Supabase path has passed the staging and production smoke checks.

Supabase Auth owns Google/phone identity and access/refresh token issuance. Edge Functions own WASSAA-specific API business logic and provider webhooks. No traditional always-on backend is needed after the route and integration migration is complete.
