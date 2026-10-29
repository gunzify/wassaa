import type { PostHog } from 'posthog-js';
import { getProfileCompletion } from './profile-readiness';
import { UserProfile } from '../types';

/**
 * Product analytics — PostHog.
 *
 * Consent first. This app handles identity documents and dating preferences, so
 * the SDK is neither downloaded nor initialised until the member turns on
 * "Product analytics" in Settings → Trust & privacy. The consent flag itself is
 * the only thing written before that.
 *
 * posthog-js is loaded with a dynamic import so members who never consent (the
 * default) do not pay for the bundle on a metered mobile connection.
 *
 * Configuration is build-time and public: `VITE_POSTHOG_KEY` (the project API
 * key, `phc_…`) and the optional `VITE_POSTHOG_HOST`. Never put a personal API
 * key in a `VITE_` variable. Without a key this module is a no-op.
 *
 * Event payloads must stay free of personal data: no email, phone, name, bio,
 * photos, document numbers, coordinates, or message text.
 */

const consentKey = 'wassaa_analytics_consent_v1';
const projectKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com';
const maxQueuedEvents = 50;

export type AnalyticsConsent = 'granted' | 'denied';

export type AnalyticsEvent =
  | 'app_opened'
  | 'screen_viewed'
  | 'sign_in_completed'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'like_sent'
  | 'pass_sent'
  | 'match_created'
  | 'chat_opened'
  | 'message_sent'
  | 'store_opened'
  | 'analytics_consent_granted';

export type AnalyticsProperties = Record<string, string | number | boolean | undefined>;

let client: PostHog | null = null;
let loading: Promise<void> | null = null;
let consented = false;
let appOpened = false;
let knownUser: UserProfile | null = null;
let lastIdentityKey: string | null = null;
const queue: { event: AnalyticsEvent; properties?: AnalyticsProperties }[] = [];

/** True when a PostHog project key is present in the build. */
export function analyticsConfigured(): boolean {
  return Boolean(projectKey);
}

export function getAnalyticsConsent(): AnalyticsConsent {
  try {
    return localStorage.getItem(consentKey) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied'; // private browsing: treat as no consent
  }
}

/** Boot analytics for members who already consented. Safe to call once per load. */
export function initAnalytics(): void {
  if (getAnalyticsConsent() !== 'granted') return;
  void startCapturing();
  if (!appOpened) {
    appOpened = true;
    track('app_opened');
  }
}

/** Record/withdraw consent from Settings. Granting starts capturing immediately. */
export function setAnalyticsConsent(granted: boolean): void {
  try {
    localStorage.setItem(consentKey, granted ? 'granted' : 'denied');
  } catch {
    /* storage may be unavailable; the in-memory state below still applies */
  }

  if (!granted) {
    consented = false;
    queue.length = 0;
    lastIdentityKey = null;
    client?.reset();
    client?.opt_out_capturing();
    return;
  }

  void enableCapturing();
}

/** Grant path: clears a previous opt-out and re-attaches the known identity. */
async function enableCapturing(): Promise<void> {
  await startCapturing();
  if (!client) return;
  client.opt_in_capturing();
  if (knownUser) sendIdentity(client, knownUser);
  track('analytics_consent_granted');
}

/**
 * Tie subsequent events to the signed-in member. Only stable identifiers and
 * non-personal profile facts are sent; the rest stays with the API.
 */
export function identifyUser(user: UserProfile | null): void {
  knownUser = user;
  if (client && user) sendIdentity(client, user);
}

/** Detach the current identity (sign-out, account deletion). Consent is unchanged. */
export function resetAnalytics(): void {
  knownUser = null;
  lastIdentityKey = null;
  client?.reset();
}

export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!consented || !projectKey) return;
  if (!client) {
    if (queue.length >= maxQueuedEvents) queue.shift();
    queue.push({ event, properties });
    return;
  }
  client.capture(event, properties);
}

async function startCapturing(): Promise<void> {
  if (!projectKey) return;
  consented = true; // events raised while the chunk loads are queued, not dropped
  if (client) return;
  if (!loading) {
    loading = (async () => {
      try {
        const { default: posthog } = await import('posthog-js');
        posthog.init(projectKey, {
          api_host: apiHost,
          // The shell is a state machine, not a router: screen views are
          // captured explicitly so they line up with the product's funnel steps.
          capture_pageview: false,
          capture_pageleave: false,
          autocapture: false,
          disable_session_recording: true,
          person_profiles: 'identified_only',
          persistence: 'localStorage',
          respect_dnt: true,
        });
        posthog.opt_in_capturing();
        client = posthog;
        if (knownUser) sendIdentity(posthog, knownUser);
        for (const item of queue.splice(0)) posthog.capture(item.event, item.properties);
      } catch {
        // Offline or the chunk failed: keep consent, retry on the next call.
        loading = null;
        throw new Error('PostHog could not be loaded');
      }
    })();
  }
  try {
    await loading;
  } catch {
    /* analytics must never break a product flow */
  }
}

function sendIdentity(posthog: PostHog, user: UserProfile): void {
  const traits = {
    onboarding_complete: getProfileCompletion(user).complete,
    identity_verified: user.verification?.status === 'verified',
    account_status: user.accountStatus ?? 'active',
    dating_goal: user.datingGoal,
  };
  // Avoid duplicate identify calls when consent is granted and the app boot
  // both attach the same member in the same session.
  const key = JSON.stringify([user.id, traits]);
  if (key === lastIdentityKey) return;
  lastIdentityKey = key;
  posthog.identify(user.id, traits);
}
