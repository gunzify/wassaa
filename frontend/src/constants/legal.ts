/**
 * Public policy pages.
 *
 * Source of truth is the markdown in `legal/`; `node scripts/build-legal.mjs`
 * renders it and the output is deployed as its own static Vercel project
 * (see legal/README.md). Keep this base URL in step with that deployment —
 * it is the only place the app needs it.
 */
export const LEGAL_BASE_URL = 'https://wassaa-legal.vercel.app';

export const LEGAL_LINKS = {
  terms: { label: 'Terms of Service', href: `${LEGAL_BASE_URL}/terms.html` },
  privacy: { label: 'Privacy Policy', href: `${LEGAL_BASE_URL}/privacy.html` },
  automatedProfiles: { label: 'Automated profiles', href: `${LEGAL_BASE_URL}/automated-profiles.html` },
} as const;

/** Shared attributes for a policy link that opens away from the app. */
export const LEGAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;
