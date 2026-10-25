# Google sign-in setup

WASSAA uses Google Identity Services in the browser and exchanges the ID token with Supabase Auth. Google verifies the email address, so a profile is created or linked immediately; a phone number is not required. The browser generates a random nonce, sends its SHA-256 hash to Google, and gives the original nonce to Supabase for validation.

## Google Cloud Console

Create/select a Google Cloud project and configure the OAuth consent screen for an external consumer app. Use test users while the app is in testing. Add app branding, support contact, privacy policy and terms before requesting production verification.

Create a **Web application** OAuth client. Add these JavaScript origins as needed:

```text
http://localhost
http://localhost:5173
http://localhost:5174
http://localhost:4173
https://wassaa.app
```

Add the callback shown in Supabase Authentication → Providers → Google as an Authorized redirect URI:

```text
https://avlbsficfejvwokxkgyl.supabase.co/auth/v1/callback
```

The GIS ID-token exchange in the app uses the Web client ID. Supabase's OAuth provider still uses the client ID and client secret for provider configuration. Never place the client secret in the frontend.

## Supabase Auth provider

In Supabase Dashboard → Authentication → Providers → Google:

- Enable Google and enter the Web client ID and client secret.
- Keep nonce checks enabled.
- Set the production site URL and exact allowed app redirect/origin URLs in Auth URL Configuration.
- Phone authentication is optional. Enable it and configure the Send SMS hook described in [SUPABASE-EDGE-MIGRATION.md](SUPABASE-EDGE-MIGRATION.md) only if you want members to add a number.

The GIS client ID must also be set as `VITE_GOOGLE_CLIENT_ID` for the frontend build and as `GOOGLE_CLIENT_ID` for the API's public configuration response. Client IDs are public values. Rotate the client secret previously shared in chat.

## Local environment

`frontend/.env` needs the Supabase project's URL and publishable key, plus the GIS client ID:

```dotenv
VITE_SUPABASE_URL=https://avlbsficfejvwokxkgyl.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Apply the Supabase migrations and deploy the Edge Functions before running the new auth flow. The old Express Google route is retained only for rollback and is no longer called by the frontend.

If the frontend host applies a Content Security Policy, allow Google's GIS script and frame origins. See Google's [ID token verification guidance](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token) and [production readiness requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), plus the [Supabase Google Auth guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
