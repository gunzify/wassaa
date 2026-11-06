# Taking WASSAA global

**Scope:** what stands between the current build and a launch for military, paramilitary and law-enforcement members outside Nigeria. Written 2026-10-30 against commit `9d105e3`.

## The short answer

The architecture is not the obstacle. Authentication, the API, the profile contract, moderation, storage and the credit ledger are already country-agnostic. Five things are not, and only one of them is code-heavy:

| Gate | What it is | Size |
|---|---|---|
| **1. Getting paid** | Paystack is enabled for Nigeria and can take international cards, but settlement and issuer declines are real limits. | Business + ~1 week of code |
| **2. Nigeria-shaped product** | Service branches, states, phone prefix, ID types, currency and English-only copy are hardcoded. | 1–2 weeks |
| **3. Trust & safety at distance** | Manual ID review, local-language moderation, per-country document knowledge, law-enforcement channel. | Ongoing ops |
| **4. Law & tax** | GDPR/UK GDPR, EU DSA, UK Online Safety Act, US state privacy laws, VAT/sales tax, sanctions. | Weeks + counsel |
| **5. Distribution** | PWA today; iOS/Android wrappers need store billing and an 18+ review. | 2–4 weeks |

The onboarding flow itself genuinely is the same everywhere — but "the same" currently means "the Nigerian version of the same".

## What already travels

- **Email-first identity.** Accounts are created and verified by email OTP or Google (`supabase-auth.ts`). Phone is optional and only *adds* a number to an existing account, so `+234` is a rough edge rather than a blocker.
- **No rank.** Cadre (`officer` / `soldier`) replaced rank in the contract; nothing in the client or API exposes a rank field.
- **Free-text geography.** `city` and `state` are `text` columns with length checks, and the API validates only that they are present. Internationalising them is a catalog and UX change, not a migration.
- **Free-text service.** `service` is `text(80)` on the profile and is passed through unvalidated at the API layer (`index.ts`, `PATCH /me/profile`). A service catalog can replace the eight hardcoded options without touching the contract.
- **Media and delivery.** R2 + CDN for photos, a PWA shell with a service worker, and an edge API that already runs per-user and returns `no-store`.
- **Safety primitives.** Blocking, reporting with DM evidence, sanctions with reasons, appeals, verification retention rules, account deletion, analytics consent.

## Gate 1 — getting paid (the hiccup you flagged)

### What is actually true about Paystack

Paystack is **not** inherently unable to take foreign cards. A Nigerian business can request **international payments** in the dashboard; approval is reviewed within about 48 working hours and mainstream dating is not on the ineligible list (Ghana-registered dating businesses are separately excluded from card payments). Nigeria merchants can accept **NGN and USD**. International cards cost **3.9% + ₦100** (NGN) or **3.9%** (USD), against 1.5% + ₦100 for local cards.

Two limits remain:

1. **Settlement.** NGN settles automatically to a Nigerian bank. USD settlement needs a **USD domiciliary account** (Paystack's flow uses Zenith).
2. **The decline is not Paystack's decision.** A charge presented by a Nigerian merchant can be refused by the *issuing* bank — US/UK banks and military-affiliated cards often block that descriptor/geo pattern, and 3D Secure or address mismatches add friction. Paystack can approve and you can still lose the sale. No Paystack setting makes the storefront look American or European.

**So: enabling international payments is necessary and worth doing this week, but it will not fix the decline pattern on its own.**

### The realistic options

| Option | Nigerian seller | Worldwide cards | Tax handled | Dating allowed | Cost |
|---|---|---|---|---|---|
| **Paystack (international on, USD)** | Yes | Partial — issuer declines remain | No | Yes | 3.9% |
| **Flutterwave** | Yes | Same decline profile | No | Vague "adult audience" clause | 4.8% intl |
| **Stripe direct** | **No** — Nigeria is only in Stripe's "extended network" (via Paystack) | Yes | No (Stripe Tax helps) | Restricted, reviewed | 2.9% + 30¢ |
| **Paddle / Lemon Squeezy (MoR)** | Yes, payouts to Nigeria listed | Yes | **Yes** | **Prohibited — "dating services/applications"** | ~5%+ |
| **Apple IAP / Google Play** | Yes, via developer account | **Yes** — charged to the store account | Store handles its own tax | Yes, 18+ review | 15–30% |

Two findings that change the plan:

- **Merchant-of-record is closed for this product.** Paddle's acceptable-use policy lists "dating services/applications" as a prohibited category, not a restricted one. Lemon Squeezy's prohibited list names "dating sites". You cannot reframe a dating app out of that.
- **Stripe needs a US entity.** Stripe Atlas incorporates a Delaware company remotely, after which Stripe treats you as a US merchant. That also brings US filings, a US tax presence and Stripe's restricted-business review for dating. It is the only route to a non-Nigerian web descriptor, and it is a company-structure decision, not a checkout decision.

### Recommendation

1. **Enable Paystack international payments and open the USD domiciliary account.** Switch foreign-card pricing to USD so you are not absorbing FX on every sale. This is days, not weeks.
2. **Add Apple In-App Purchase and Google Play Billing as first-class channels.** Inside the apps they are mandatory for digital credits anyway (App Store Guideline 3.1.1; the US storefront is the only one where external purchase links are allowed), they remove the decline problem entirely, and the Small Business Program rate is 15%. Note the rule that credits may not expire — WASSAA already says they never do.
3. **Refactor checkout into one `grantCredits` path.** Every provider becomes an adapter that calls the same idempotent grant after a verified webhook. Your ledger already does the hard part; this keeps Paystack, Apple and Google from becoming three credit systems.
4. **Do not add Flutterwave as the "global" rail.** At 4.8% on international cards it is strictly worse than Paystack for the same decline profile. It is useful later as uptime redundancy, nothing more.
5. **Revisit a US entity + Stripe only when web volume justifies it.** That is when you also get Stripe Tax for US sales tax and EU VAT, and a descriptor that authorises like a local merchant.

If you want global tax handled *without* forming a foreign entity, you have no compliant MoR among the mainstream vendors and would need to qualify a high-risk/adult-friendly MoR that accepts dating and pays to Nigeria. Budget real diligence time for that; it is not a self-serve signup.

## Gate 2 — the product is Nigeria-shaped

Everything below is real, and all of it is shallow:

| Hardcoded | Where | What it needs |
|---|---|---|
| 8 service branches (`Nigerian Army` … `Customs`) | `types/index.ts` (`UniformedService`), `ServiceSelectionScreen.tsx`, `RealDatingOnboardingFlow.tsx` | A `service_catalog` of `(country_code, branch, kind)`; `profiles.service_id`; keep `service` text for display |
| 20 state options ending in "Other State" | `RealDatingOnboardingFlow.tsx` `NIGERIAN_STATES` | Country → region → city cascade, or free-text with a suggestion list |
| `+234` normalisation and fixed prefix | `PhoneVerificationScreen.tsx` | Country picker → E.164; phone is already optional |
| ID types: NIN, Nigerian passport, service ID | `IdentityCapturePanel.tsx`, `types/index.ts` | Per-country document list; ICAO passport as the universal fallback |
| NGN prices and `₦` | `SubscriptionPlansScreen.tsx`, `monetizationData.ts`, API `CREDIT_PACKS`, `payments.amount_kobo`/`currency` | `credit_packs` table keyed by region/currency; `amount_minor` + `currency` in payments |
| `lang="en-NG"`, "Nigeria's professionals" | `index.html`, `manifest.webmanifest` | Locale detection and neutral copy |
| Binary `female | male` | `types/index.ts`, API validation | Add a non-binary option and matching preferences before entering markets that expect it |
| 500 km maximum distance | `PATCH /me/preferences` | Fine for Nigeria; needs a country-aware default (a 500 km radius is a different product in Europe) |

**Minimum schema change** (one migration):

```sql
alter table profiles add column country_code text not null default 'NG';
alter table profiles add column service_id uuid references service_catalog(id);
create table service_catalog (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  branch text not null,
  kind text not null check (kind in ('military','police','paramilitary','civilian')),
  sort_order int not null default 0
);
alter table payments rename column amount_kobo to amount_minor;
-- currency is already text; make the pair explicit in code, not a CHECK.
```

Existing rows keep `NG`; personas stay Nigerian. Nothing else in the profile contract changes.

## Gate 3 — trust and safety at distance

- **Identity review is manual and Nigeria-only in its vocabulary.** A reviewer needs to recognise a Ghanaian voter card, a UK MOD ID, a US CAC, a Kenyan national ID and a Schengen residence permit. Either publish an accepted-document list per country and staff to it, or make the passport the universal path and treat everything else as secondary evidence.
- **Moderation is English-only and single-timezone.** Reports, appeals and chat evidence all need coverage in the languages and hours of the markets you open.
- **Impersonation of service members is the signature risk** of this niche. A self-reported "Nigerian Army" tag with an unverified service ID is an invitation. Consider requiring a service ID for the service badge, separate from general identity verification.
- **A local reporting channel.** UK/EU platforms need a way for authorities and users to flag illegal content, with response targets.

## Gate 4 — law and tax

- **GDPR / UK GDPR.** Dating data is not automatically special-category, but match preferences (`men`/`women`/`everyone`) can reveal sexual orientation, which is. That needs an explicit lawful basis, tight access control and a clear retention story. A non-EU controller targeting the EU also needs an Article 27 representative.
- **UK Online Safety Act.** Dating services are in scope: illegal-content risk assessment, age assurance and reporting duties. Do not launch the UK on a PWA and a hope.
- **EU Digital Services Act.** Notice-and-action, transparency and points of contact once you are an online platform serving the EU.
- **US state privacy laws.** Notice, access, deletion and opt-out of sale/share; the app already has deletion and analytics consent, which is a good start.
- **Tax.** Without an MoR, VAT/sales tax registration in each market is yours. This is the single strongest argument for the store-billing path early and a US entity later.
- **Sanctions and restricted countries.** Screen at signup and on payout; keep credits non-transferable and non-redeemable (that also keeps you clear of stored-value and gambling classifications).
- **Data protection operations.** DPA with Supabase/Cloudflare, region choice, breach process, records of processing.

## Gate 5 — distribution

The PWA is the right first surface, but a global military audience lives on iOS and Android. Wrapping it (Capacitor) means:

- **In-app purchase is mandatory** for credits in the app on every storefront except the US external-link exception.
- **18+ rating**, a public privacy policy, and in-app account deletion are review requirements for dating apps.
- Store privacy labels must match what the app actually collects (precise location, photos, ID documents, usage analytics).

## OPSEC — the risk unique to this audience

Many armed forces restrict members from publicly disclosing their service, unit, rank or location. A dating profile is public enough to matter.

Already right: rank is gone, `dutyStation` is gated by `serviceVisibility`, and the default is `matches`.

Still to do:

- Default `serviceVisibility` to **private** for uniformed members, with an explicit "show my service" opt-in and a one-line warning.
- Make duty station coarse by design (city, never barracks or unit).
- Never add rank, unit, deployment or posting date to the profile contract.
- Add an **OPSEC report category** so a profile exposing unit or deployment details can be removed quickly.
- Do not use national seals, flags or official insignia in branding; it implies endorsement you do not have.

## Suggested order

1. **This week:** enable Paystack international, open the USD domiciliary account, price foreign cards in USD. No code restructuring needed.
2. **Next two weeks:** `country_code` + `service_catalog` + per-country ID types; neutral manifest and copy; unify checkout behind `grantCredits`.
3. **Next month:** Apple/Google billing adapters; default-private service visibility; OPSEC report category; language/timezone coverage for the first two markets.
4. **When web volume justifies it:** US entity + Stripe + Stripe Tax; EU/UK representative and Online Safety Act work before those launches.

## What I would not do

- Add Flutterwave as a "global" fix.
- Chase Paddle or Lemon Squeezy for a dating product.
- Launch the UK or EU without the safety and tax work — the store review and the regulator both notice.
- Rebuild the credit system per provider.

## Sources

- Paystack: [enabling international payments](https://support.paystack.com/en/articles/2130690), [eligibility](https://support.paystack.com/en/articles/2127682), [ineligible businesses](https://support.paystack.com/en/articles/2127042), [pricing](https://paystack.com/pricing)
- [Stripe global availability](https://stripe.com/global), [Stripe Atlas](https://stripe.com/atlas), [restricted businesses](https://stripe.com/legal/restricted-businesses)
- [Paddle acceptable use](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle), [Paddle supported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)
- [Lemon Squeezy prohibited products](https://docs.lemonsqueezy.com/help/getting-started/prohibited-products), [supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)
- [Flutterwave pricing](https://flutterwave.com/ng/support/pricing/pricing-for-receiving-payment), [prohibited businesses](https://flutterwave.com/ng/support/my-account/businesses-and-services-prohibited-by-flutterwave)
- [Apple App Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/), [Google Play service fees](https://support.google.com/googleplay/android-developer/answer/112622)

## Status update — 2026-11-01

Gate 2 (Nigeria-shaped product) is largely closed in source:

- **Country is a real field.** `profiles.country_code` (ISO-2, default `NG`), set during onboarding and editable by the API; every profile payload carries it.
- **Onboarding is international.** Country picker → that country's actual armed forces, police and paramilitary agencies → that country's states/provinces; an "Other" path takes a two-letter ISO code. `frontend/src/data/countries.ts` holds 18 countries plus the fallback.
- **The deck is international.** 500 new uniformed personas across 17 countries (US-weighted), with real branches and agencies, culturally matched names, and portraits matched to gender and race. Legacy Nigerian personas were re-photographed from the Black pool and had their bios rewritten.
- **Payment is no longer a wall.** Paystack settles in `NG, GH, ZA, KE`; a verified member outside those markets messages free (`wassaa_is_free_chat`), and an unverified member there gets 5 credits/day until review. The store shows why packs are unavailable instead of a dead buy button. Since the 2026-11-06 audit the grant needs a reviewer-attested region (`region_attested_code` must equal `country_code`), so editing the country field no longer unlocks free chat; only the admin verification review can attest it.

Still open from this document: enabling international payments and solving issuer declines (gate 1), per-country document types and local-language moderation (gate 3), legal/tax (gate 4), and store distribution (gate 5). Currency display is still NGN.
