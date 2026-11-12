# WASSAA legal documents

Draft policy documents. **Not legal advice** — they must be reviewed and finalised by counsel admitted in each launch jurisdiction (at minimum Nigeria; also wherever you actively market) before publication.

| Document | Purpose |
|---|---|
| [`terms-of-service.md`](./terms-of-service.md) | The contract: eligibility, credits and refunds, acceptable use, liability cap, dispute resolution. |
| [`privacy-policy.md`](./privacy-policy.md) | Controller identity, data categories, lawful bases, retention, transfers, rights. |
| [`synthetic-profiles-and-automated-messaging-disclosure.md`](./synthetic-profiles-and-automated-messaging-disclosure.md) | How automated profiles and generated replies are identified, charged for, and limited. Incorporated into the Terms as Clause 4. |

The markdown files are the source of truth. Do not edit `site/` — it is generated.

## Build and deploy

```bash
node scripts/build-legal.mjs      # renders legal/site/ from the markdown above
cd legal/site && npx vercel deploy --prod --yes
```

The static site is its own Vercel project, **`wassaa-legal`**, live at <https://wassaa-legal.vercel.app>:

| Page | URL |
|---|---|
| Index | <https://wassaa-legal.vercel.app/> |
| Terms of Service | <https://wassaa-legal.vercel.app/terms.html> |
| Privacy Policy | <https://wassaa-legal.vercel.app/privacy.html> |
| Automated profiles | <https://wassaa-legal.vercel.app/automated-profiles.html> |

The app reads the base URL from one place, `frontend/src/constants/legal.ts`. Change it there if you move the documents to a custom domain (`legal.wassaa.app`, or copy `legal/site/` into `frontend/public/legal/` to serve them same-origin at `/legal/terms.html`).

## Placeholders to fill before publishing

Edit `legal/site.config.json`, rebuild, redeploy. Anything left blank renders as a bracketed token **and** puts a draft banner on every page.

- `companyName`, `registrationNumber`, `address` — the contracting entity. Still blank.
- `supportEmail`, `privacyEmail`, `dpoEmail` — set to `@wassaa.app` addresses; **confirm the mailboxes exist** before members rely on them.
- `liabilityCap` — set to `₦30,000`. An unrealistically low cap reads as unfair and may be struck out; an unlimited one is uninsurable.
- Confirm the retention table in Privacy Clause 8 against the deployed configuration.
- Confirm the processor list in Privacy Clause 6.2 against what is actually deployed (Supabase, Cloudflare R2, Paystack, SMS provider, AI provider if enabled).

## Where the app links them

- `frontend/src/components/screens/SignUpScreen.tsx` — consent line under "Continue with email", covering the Google button below it.
- `frontend/src/components/screens/SettingsPrivacyScreen.tsx` — "Legal" section with all three documents, after Account.

## What the product must actually do for these documents to be true

1. Show an **"Automated profile"** marker on the persona's card, in the conversation header, and beside the first generated message.
2. Provide the **filter** to exclude automated profiles, free of charge.
3. Never let an automated profile solicit payment, request identity documents, or claim a real identity or rank.
4. Confirm the AI provider's retention and training terms before relying on Privacy Clause 5.3.
5. Remove or qualify the phrase "Real People" from marketing copy while unmarked automated profiles remain in discovery.

If any of these is untrue, the documents are inaccurate, and an inaccurate disclosure is worse than a short honest one.
