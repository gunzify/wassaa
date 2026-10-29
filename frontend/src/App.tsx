import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home,
  Heart,
  MessageSquare,
  User,
  CheckCircle2,
  ChevronLeft,
  ShieldAlert,
  Compass,
} from 'lucide-react';
import { SplashScreen } from './components/screens/SplashScreen';
import { SignUpScreen } from './components/screens/SignUpScreen';
import { EmailVerificationScreen } from './components/screens/EmailVerificationScreen';
import { PhoneVerificationScreen } from './components/screens/PhoneVerificationScreen';
import { ProfessionSelectionScreen } from './components/screens/ProfessionSelectionScreen';
import { ServiceSelectionScreen } from './components/screens/ServiceSelectionScreen';
import { ProfileSetupScreen } from './components/screens/ProfileSetupScreen';
import { IdentityVerificationScreen } from './components/screens/IdentityVerificationScreen';
import { DiscoverScreen } from './components/screens/DiscoverScreen';
import { ExploreScreen } from './components/screens/ExploreScreen';
import { ProfileDetailScreen } from './components/screens/ProfileDetailScreen';
import { MatchCelebrationScreen } from './components/screens/MatchCelebrationScreen';
import { ChatScreen } from './components/screens/ChatScreen';
import { MatchesListScreen } from './components/screens/MatchesListScreen';
import { SettingsPrivacyScreen } from './components/screens/SettingsPrivacyScreen';
import { SubscriptionPlansScreen } from './components/screens/SubscriptionPlansScreen';
import { AppealScreen } from './components/screens/AppealScreen';
import { RealDatingOnboardingFlow } from './components/onboarding/RealDatingOnboardingFlow';
import { ReportCategoryKey } from './components/chat/BlockReportModal';
import { WassaaApi } from './services/api';
import { preparePhoto } from './services/media';
import { signOut, clearSession } from './services/supabase-auth';
import { getProfileCompletion } from './services/profile-readiness';
import { subscribeToMatch } from './services/realtime';
import { initAnalytics, identifyUser, resetAnalytics, track } from './services/analytics';
import { UserProfile, MatchItem, SubscriptionTier, ChatMessage, CreditPack } from './types';

type ScreenId =
  | 'splash'
  | 'signup'
  | 'email_verify'
  | 'phone_verify'
  | 'profession'
  | 'service'
  | 'profile_setup'
  | 'identity_verify'
  | 'onboarding_dating'
  | 'discover'
  | 'explore'
  | 'profile_view'
  | 'match_screen'
  | 'chat'
  | 'matches_list'
  | 'messages'
  | 'settings_privacy'
  | 'settings'
  | 'subscription_plans'
  | 'appeal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('splash');

  // Discovery
  const [deck, setDeck] = useState<UserProfile[]>([]);
  const [deckIndex, setDeckIndex] = useState(0);
  // Explore keeps its own, wider page of people so browsing the grid never
  // reshuffles the deck the member was halfway through.
  const [exploreProfiles, setExploreProfiles] = useState<UserProfile[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [profileOrigin, setProfileOrigin] = useState<ScreenId>('discover');

  // Matches & chat
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [likesReceived, setLikesReceived] = useState<UserProfile[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string>('');
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeChatPartner, setActiveChatPartner] = useState<UserProfile | null>(null);
  // Which list the conversation was opened from, so Back lands where the
  // member came from (the Messages tab, the Matches list, or discovery).
  const [chatOrigin, setChatOrigin] = useState<ScreenId>('messages');

  // Misc
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
  const [credits, setCredits] = useState(0);
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [likesLocked, setLikesLocked] = useState(true);
  const [likesCost, setLikesCost] = useState(15);
  const [identityOrigin, setIdentityOrigin] = useState<ScreenId>('profile_setup');
  const [lastInteractedProfile, setLastInteractedProfile] = useState<UserProfile | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; name: string; reason?: string; date?: string }[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [pendingMatch, setPendingMatch] = useState<{ id: string; partner: UserProfile } | null>(null);
  const lastMessageTs = useRef<string | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  /** Open the credit store (the retired "Plans" screen, now a pack store). */
  const openStore = useCallback(() => {
    track('store_opened');
    setCurrentScreen('subscription_plans');
  }, []);

  /**
   * Shared API error handler: CREDITS_NEEDED (402) means the action ran out of
   * credits — surface the reason and take the member to the store (KB §18E).
   */
  const handleApiError = useCallback((err: unknown, fallback: string) => {
    const e = err as Error & { code?: string };
    if (e.code === 'CREDITS_NEEDED') {
      showToast(e.message || 'You are out of credits.');
      setCurrentScreen('subscription_plans');
      return;
    }
    showToast(e.message || fallback);
  }, [showToast]);

  // Product analytics stays off until the member consents (Settings → Trust &
  // privacy); this only boots the SDK for members who already did.
  useEffect(() => { initAnalytics(); }, []);

  // ---------- Boot: restore session ----------
  useEffect(() => {
    (async () => {
      try {
        const user = await WassaaApi.fetchSession();
        if (user) {
          setCurrentUser(user);
          identifyUser(user);
          setCurrentTier('free');
          setCredits(user.credits ?? 0);
          const profileComplete = getProfileCompletion(user).complete;
          // A banned account goes straight to its appeal screen (KB §18D).
          setCurrentScreen(user.accountStatus === 'banned' ? 'appeal' : profileComplete ? 'discover' : 'onboarding_dating');
          if (profileComplete) {
            const [ens, blocked] = await Promise.all([
              WassaaApi.getEntitlements(),
              WassaaApi.listBlocked()
            ]);
            setCurrentTier(ens.tier);
            setCredits(ens.credits);
            setPacks(ens.packs);
            if (ens.revealLikesCost) setLikesCost(ens.revealLikesCost);
            setBlockedUsers(blocked);
            WassaaApi.getMatches().then((ms) => setMatches(ms)).catch(() => undefined);
          }
        }
      } catch {
        // signed out / offline: start fresh
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // ---------- Discovery deck ----------
  const loadDeck = useCallback(async () => {
    try {
      const res = await WassaaApi.getDiscovery({ limit: 15 });
      setDeck(res.profiles);
      setDeckIndex(0);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not refresh profiles');
    }
  }, [showToast]);

  useEffect(() => {
    if (currentScreen === 'discover' && currentUser) void loadDeck();
  }, [currentScreen, currentUser, loadDeck]);

  const loadExplore = useCallback(async () => {
    setExploreLoading(true);
    try {
      const res = await WassaaApi.getDiscovery({ limit: 36 });
      setExploreProfiles(res.profiles);
    } catch {
      /* browsing is browse-only: keep whatever page is already on screen */
    } finally {
      setExploreLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentScreen === 'explore' && currentUser && exploreProfiles.length === 0) void loadExplore();
  }, [currentScreen, currentUser, exploreProfiles.length, loadExplore]);

  const openProfile = useCallback((profile: UserProfile, origin: ScreenId) => {
    setLastInteractedProfile(profile);
    setProfileOrigin(origin);
    setCurrentScreen('profile_view');
  }, []);

  const currentDiscoverProfile = deck[deckIndex];
  const nextDiscoverProfile = deck[deckIndex + 1];

  // ---------- Swipe handlers (server-authoritative) ----------
  const advanceDeck = useCallback(() => setDeckIndex((i) => i + 1), []);

  const handleSwipeLeft = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    advanceDeck();
    track('pass_sent');
    try { await WassaaApi.pass(profile.id); } catch { /* pass is best-effort */ }
  }, [advanceDeck]);

  const handleSwipeRight = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    try {
      const res = await WassaaApi.like(profile.id);
      track('like_sent', { kind: 'like', is_match: res.isMatch });
      if (res.isMatch) {
        track('match_created', { source: 'discover' });
        if (res.match) setPendingMatch({ id: res.match.id, partner: profile });
        setCurrentScreen('match_screen');
        WassaaApi.getMatches().then(setMatches).catch(() => undefined);
      } else {
        showToast(`Liked ${profile.name}`);
      }
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'LIKE_LIMIT') showToast('Daily like limit reached — try again tomorrow');
      else handleApiError(err, 'Could not send your like.');
    }
    advanceDeck();
  }, [advanceDeck, showToast, handleApiError]);

  const handleSuperLike = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    try {
      const res = await WassaaApi.like(profile.id, { superLike: true });
      track('like_sent', { kind: 'super_like', is_match: res.isMatch });
      if (res.isMatch) {
        track('match_created', { source: 'discover' });
        if (res.match) setPendingMatch({ id: res.match.id, partner: profile });
        setCurrentScreen('match_screen');
        WassaaApi.getMatches().then(setMatches).catch(() => undefined);
      } else {
        showToast(`Super Liked ${profile.name}! (3 credits)`);
      }
      if (typeof res.balance === 'number') setCredits(res.balance);
      else void WassaaApi.getEntitlements().then((ens) => setCredits(ens.credits)).catch(() => undefined);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'SUPER_LIMIT') showToast('Your Super Like could not be sent. Try again shortly.');
      else handleApiError(err, 'Super Like failed.');
    }
    advanceDeck();
  }, [advanceDeck, showToast, handleApiError]);

  // ---------- Matches & chat polling ----------
  const refreshMatches = useCallback(async () => {
    try {
      const ms = await WassaaApi.getMatches();
      setMatches(ms);
    } catch { /* silent */ }
  }, []);

  // Likes are a credit feature: the endpoint reports locked+price first, and
  // only charges when we explicitly ask for the reveal.
  useEffect(() => {
    if (currentScreen !== 'matches_list') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await WassaaApi.getLikesReceived();
        if (cancelled) return;
        setLikesLocked(res.locked);
        if (res.cost) setLikesCost(res.cost);
        setLikesReceived(res.locked ? [] : res.likes);
      } catch { if (!cancelled) setLikesReceived([]); }
    })();
    return () => { cancelled = true; };
  }, [currentScreen]);

  const handleRevealLikes = useCallback(async () => {
    try {
      const res = await WassaaApi.getLikesReceived({ reveal: true });
      setLikesLocked(res.locked);
      setLikesReceived(res.likes);
      if (res.locked) return;
      showToast('Likes unlocked for the next 24 hours.');
      if (typeof res.likes !== 'undefined') void WassaaApi.getEntitlements().then((ens) => setCredits(ens.credits)).catch(() => undefined);
    } catch (err) {
      handleApiError(err, 'Could not unlock likes.');
    }
  }, [showToast, handleApiError]);

  const handleLikeBack = useCallback(async (profile: UserProfile) => {
    try {
      const result = await WassaaApi.like(profile.id);
      track('like_sent', { kind: 'like', is_match: result.isMatch });
      setLikesReceived((prev) => prev.filter((item) => item.id !== profile.id));
      await refreshMatches();
      if (result.isMatch) {
        track('match_created', { source: 'likes_received' });
        setLastInteractedProfile(profile);
        if (result.match) setPendingMatch({ id: result.match.id, partner: profile });
        setCurrentScreen('match_screen');
      } else {
        showToast(`You liked ${profile.name} back.`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not like this profile.');
    }
  }, [refreshMatches, showToast]);

  useEffect(() => {
    if (!['matches_list', 'messages', 'chat'].includes(currentScreen)) return;
    void refreshMatches();
    const t = setInterval(refreshMatches, 30000);
    return () => clearInterval(t);
  }, [currentScreen, refreshMatches]);

  // Load messages and join the authorized match channel. Polling is a fallback
  // for realtime outages and a low-frequency recovery sync.
  useEffect(() => {
    if (currentScreen !== 'chat' || !activeMatchId) return;
    let cancelled = false;
    let realtimeActive = false;
    let stopRealtime: (() => void) | undefined;
    let pulling = false;
    lastMessageTs.current = undefined;
    setActiveMessages([]);

    const pull = async (initial = false) => {
      if (pulling) return;
      pulling = true;
      try {
        const previousTs = lastMessageTs.current;
        const overlapTs = !initial && previousTs
          ? new Date(Math.max(0, Date.parse(previousTs) - 2000)).toISOString()
          : undefined;
        const res = await WassaaApi.getMessages(activeMatchId, initial ? undefined : overlapTs);
        if (cancelled) return;
        const fresh = res.messages;
        if (initial) {
          setActiveMessages(fresh);
          lastMessageTs.current = fresh.length ? fresh[fresh.length - 1].createdAt : undefined;
          await WassaaApi.markRead(activeMatchId).catch(() => undefined);
        } else if (fresh.length) {
          setActiveMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            const add = fresh.filter((m) => !have.has(m.id));
            return add.length ? [...prev, ...add] : prev;
          });
          const newest = fresh[fresh.length - 1].createdAt;
          if (!lastMessageTs.current || Date.parse(newest) > Date.parse(lastMessageTs.current)) lastMessageTs.current = newest;
          await WassaaApi.markRead(activeMatchId).catch(() => undefined);
          void refreshMatches();
        }
      } catch { /* silent */ }
      finally { pulling = false; }
    };

    void (async () => {
      await pull(true);
      if (cancelled) return;
      try {
        stopRealtime = await subscribeToMatch(activeMatchId, () => { void pull(false); }, (status) => {
          realtimeActive = status === 'SUBSCRIBED';
        });
        if (cancelled) stopRealtime();
        else void pull(false); // close the fetch/subscribe race
      } catch {
        realtimeActive = false;
      }
    })();
    let pollTimer = 0;
    const poll = () => {
      void pull(false);
      pollTimer = window.setTimeout(poll, realtimeActive ? 30000 : 5000);
    };
    pollTimer = window.setTimeout(poll, 5000);
    return () => { cancelled = true; clearTimeout(pollTimer); stopRealtime?.(); };
  }, [currentScreen, activeMatchId, refreshMatches]);

  const activeMatch = matches.find((m) => m.id === activeMatchId);
  const chatPartner = activeChatPartner || activeMatch?.profile;

  const openMatch = useCallback(async (id: string, partner?: UserProfile, origin: ScreenId = 'messages') => {
    track('chat_opened', { origin });
    setActiveMatchId(id);
    if (partner) setActiveChatPartner(partner);
    else {
      const m = matches.find((x) => x.id === id);
      if (m) setActiveChatPartner(m.profile);
    }
    setCurrentScreen('chat');
  }, [matches]);

  const blockedUserIds = blockedUsers.map((b) => b.id);

  // ---------- Sending ----------
  const handleSendMessage = useCallback(async (text: string): Promise<boolean> => {
    if (!activeMatchId) return false;
    const partner = chatPartner;
    if (partner && blockedUserIds.includes(partner.id)) { showToast('Cannot message a blocked contact.'); return false; }
    try {
      const { message: msg, balance } = await WassaaApi.sendMessage(activeMatchId, { kind: 'text', text });
      if (msg) {
        setActiveMessages((prev) => [...prev, msg]);
        lastMessageTs.current = msg.createdAt;
      }
      track('message_sent', { kind: 'text' });
      if (typeof balance === 'number') setCredits(balance);
      void refreshMatches();
      return true;
    } catch (err) {
      handleApiError(err, 'Message failed to send');
      return false;
    }
  }, [activeMatchId, chatPartner, blockedUserIds, handleApiError, refreshMatches]);

  const handleSendPhoto = useCallback(async (file: File) => {
    if (!activeMatchId) return;
    if (file.size > 8 * 1024 * 1024) { showToast('Choose an image under 8 MB.'); return; }
    const partner = chatPartner;
    if (partner && blockedUserIds.includes(partner.id)) { showToast('Cannot message a blocked contact.'); return; }
    try {
      const prepared = await preparePhoto(file);
      const mediaUrl = await WassaaApi.uploadImage('chat_photo', prepared);
      if (!mediaUrl) throw new Error('Private photo sharing is unavailable until secure storage is configured.');
      const { message: msg, balance } = await WassaaApi.sendMessage(activeMatchId, { kind: 'photo', mediaUrl });
      if (msg) setActiveMessages((prev) => [...prev, msg]);
      track('message_sent', { kind: 'photo' });
      if (typeof balance === 'number') setCredits(balance);
      showToast('Photo shared!');
    } catch (err) {
      handleApiError(err, 'Photo failed');
    }
  }, [activeMatchId, chatPartner, blockedUserIds, showToast, handleApiError]);

  // ---------- Blocks / reports ----------
  const handleBlockUser = useCallback(async (partner: UserProfile, reason: string) => {
    try {
      await WassaaApi.block(partner.id, reason);
      setBlockedUsers((prev) => prev.some((b) => b.id === partner.id)
        ? prev
        : [...prev, { id: partner.id, name: partner.name, reason, date: new Date().toISOString() }]);
      showToast(`Blocked ${partner.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Block failed');
    }
  }, [showToast]);

  const handleUnblockUser = useCallback(async (id: string) => {
    try {
      await WassaaApi.unblock(id);
      setBlockedUsers((prev) => prev.filter((b) => b.id !== id));
      showToast('Contact unblocked');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unblock failed');
    }
  }, [showToast]);

  const handleReportUser = useCallback(async (params: { category: ReportCategoryKey; categoryLabel: string; details: string; alsoBlock: boolean; messageId?: string }) => {
    const partner = chatPartner || lastInteractedProfile;
    if (!partner) { showToast('Nothing to report.'); return; }
    try {
      await WassaaApi.submitReport({
        reportedUserId: partner.id,
        category: params.category,
        categoryLabel: params.categoryLabel,
        details: params.details,
        alsoBlock: params.alsoBlock,
        serviceBranch: partner.service,
        // Chat reports carry the conversation evidence so admins can review the
        // full DM history behind the report (KB §18D).
        matchId: chatPartner ? activeMatchId || undefined : undefined,
        messageId: params.messageId
      });
      if (params.alsoBlock) await handleBlockUser(partner, `Reported for ${params.categoryLabel}`);
      showToast('Report submitted. Our team will review it.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Report failed');
    }
  }, [chatPartner, lastInteractedProfile, activeMatchId, handleBlockUser, showToast]);

  // ---------- Profile updates ----------
  const handleUpdateUser = useCallback(async (updated: UserProfile): Promise<boolean> => {
    try {
      const saved = await WassaaApi.updateProfile(updated);
      if (updated.locationCoordinates !== undefined) {
        await WassaaApi.updateLocation(updated.locationCoordinates);
      }
      if (updated.matchPreferences) {
        await WassaaApi.updatePreferences(updated.matchPreferences);
      }
      const merged = {
        ...saved,
        ...(updated.locationCoordinates !== undefined
          ? { hasPreciseLocation: updated.locationCoordinates !== null }
          : {}),
      };
      setCurrentUser((prev) => (prev ? { ...prev, ...merged } : merged));
      showToast('Profile saved');
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save profile');
      return false;
    }
  }, [showToast]);

  const handleDeleteAccount = useCallback(async () => {
    try {
      await WassaaApi.deleteAccount();
      resetAnalytics();
      setCurrentUser(null);
      setMatches([]);
      setDeck([]);
      showToast('Your account has been permanently deleted.');
      setCurrentScreen('splash');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Deletion failed');
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    // Revoke the Supabase refresh token before dropping local state. The legacy
    // `wassaa_session_token` shim is not the active session store, so relying on
    // it left the user signed in after "Sign out".
    try { await signOut(); } catch { clearSession(); }
    resetAnalytics();
    setCurrentUser(null);
    setMatches([]);
    setDeck([]);
    setLikesReceived([]);
    setActiveMessages([]);
    setActiveMatchId('');
    setActiveChatPartner(null);
    setCurrentScreen('splash');
    showToast('Signed out.');
  }, [showToast]);

  // ---------- Billing: credit packs (KB §18E) ----------
  const handleSelectPack = useCallback(async (packId: string) => {
    const pack = packs.find((p) => p.id === packId);
    if (!pack) { showToast('Unknown credit pack.'); return; }
    // Open synchronously from the click so popup blockers do not discard checkout
    // after the network request resolves.
    const checkoutWindow = window.open('about:blank', '_blank');
    if (checkoutWindow) checkoutWindow.opener = null;
    try {
      showToast(`Starting secure checkout for ${pack.credits} credits…`);
      const res = await WassaaApi.checkout(packId);
      if (res.authorizationUrl) {
        if (checkoutWindow) checkoutWindow.location.replace(res.authorizationUrl);
        else {
          window.location.assign(res.authorizationUrl);
          return;
        }
        showToast('Complete payment in the Paystack window. Your credits appear here automatically.');
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          try {
            const activation = await WassaaApi.activate(res.reference);
            setCredits(activation.credits);
            showToast(`${activation.credits} credits added — your matches are waiting.`);
            return;
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('Payment not confirmed yet')) throw error;
          }
        }
        showToast('Payment is still processing. Your credits will appear shortly — reopen the store to refresh.');
        return;
      }
      checkoutWindow?.close();
      await WassaaApi.sandboxComplete(res.reference);
      const act = await WassaaApi.activate(res.reference);
      setCredits(act.credits);
      showToast(`${act.credits} credits added (sandbox).`);
    } catch (err) {
      checkoutWindow?.close();
      handleApiError(err, 'Checkout failed');
    }
  }, [packs, showToast, handleApiError]);

  const handleBoost = useCallback(async () => {
    try {
      const res = await WassaaApi.boost();
      setCredits(res.balance);
      showToast('Boost active — you are top of the deck for 1 hour.');
    } catch (err) {
      handleApiError(err, 'Boost failed.');
    }
  }, [showToast, handleApiError]);

  // ---------- Appeal (restricted or banned accounts) ----------
  const [appealBusy, setAppealBusy] = useState(false);
  const handleSubmitAppeal = useCallback(async (note: string) => {
    setAppealBusy(true);
    try {
      await WassaaApi.submitAppeal(note);
      showToast('Appeal submitted — our team will review it.');
      const fresh = await WassaaApi.fetchSession().catch(() => null);
      if (fresh) setCurrentUser(fresh);
    } catch (err) {
      handleApiError(err, 'Could not submit your appeal.');
    } finally {
      setAppealBusy(false);
    }
  }, [showToast, handleApiError]);

  // ---------- Sign-in ----------
  // A verified email (or Google, which verifies the address for us) is the only
  // requirement to enter the app. Phone verification is an optional extra.
  const enterWithProfile = useCallback((profile: UserProfile, method: 'email' | 'google') => {
    const user = profile.name === 'New member' ? { ...profile, name: '' } : profile;
    setCurrentUser(user);
    identifyUser(user);
    setCredits(user.credits ?? 0);
    const complete = getProfileCompletion(user).complete;
    track('sign_in_completed', { method, onboarding_complete: complete });
    setCurrentScreen(user.accountStatus === 'banned' ? 'appeal' : complete ? 'discover' : 'onboarding_dating');
    if (complete) {
      void WassaaApi.getEntitlements().then((entitlements) => {
        setCurrentTier(entitlements.tier);
        setCredits(entitlements.credits);
        setPacks(entitlements.packs);
        if (entitlements.revealLikesCost) setLikesCost(entitlements.revealLikesCost);
      }).catch(() => undefined);
      void WassaaApi.listBlocked().then(setBlockedUsers).catch(() => undefined);
      void WassaaApi.getMatches().then(setMatches).catch(() => undefined);
    }
  }, []);

  const handleEmailVerified = useCallback((profile: UserProfile) => {
    enterWithProfile(profile, 'email');
  }, [enterWithProfile]);

  const handleGoogleCredential = useCallback(async (credential: string, nonce: string) => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const result = await WassaaApi.signInWithGoogle(credential, nonce);
      if (!result.user) throw new Error('Google sign-in did not return a Wassaa profile. Try again.');
      enterWithProfile(result.user, 'google');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Google sign-in failed. Try again.');
    } finally {
      setGoogleBusy(false);
    }
  }, [enterWithProfile, googleBusy, showToast]);

  const signedIn = Boolean(currentUser);

  // Screen-level funnel: the app has no URL router, so each shell screen is a
  // step PostHog can build funnels and retention from.
  useEffect(() => {
    if (booting) return;
    track('screen_viewed', { screen: currentScreen, signed_in: signedIn });
  }, [currentScreen, booting, signedIn]);

  const handlePhoneLinked = useCallback((profile: UserProfile) => {
    setCurrentUser(profile);
    setCurrentScreen('settings');
    showToast('Phone verified. Your trust badge is active.');
  }, [showToast]);

  // ---------- Rendering ----------

  // Boot loading state
  if (booting) {
    return (
      <div className="min-h-[100dvh] bg-[#F7F5F0] flex items-center justify-center">
        <span className="font-['Cormorant_Garamond',serif] font-semibold text-2xl tracking-[0.12em] text-[#B85A3C]">WASSAA</span>
      </div>
    );
  }

  // Screens where the bottom navigation dock is visible. A conversation is
  // deliberately absent: opening a DM takes the whole screen.
  const showTabs = ['discover', 'explore', 'matches_list', 'messages', 'settings_privacy', 'settings', 'subscription_plans'].includes(currentScreen) && currentUser;

  // Screens that are full-bleed (no padding/centering from shell)
  const isFullBleed = ['splash', 'match_screen', 'chat', 'profile_view'].includes(currentScreen);

  return (
    <div className="min-h-[100dvh] bg-[#F7F5F0] text-[#1A1816] flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">

      {/* Toast notification */}
      {toast && (
        <div className="toast">
          <div className="toast-pill" role="status" aria-live="polite">
            <CheckCircle2 className="w-[18px] h-[18px] text-[#7FD1AE] shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Restriction notice: browsing stays open, interactions are blocked server-side */}
      {currentUser && currentScreen !== 'appeal' && currentScreen !== 'splash' && currentUser.accountStatus === 'restricted' && (
        <div className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#FBEFE6] border-b border-[#E8D9CE] text-[#8A4B32] text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="flex-1">Your account is restricted — you can browse, but not like or message.</span>
          <button type="button" onClick={() => setCurrentScreen('appeal')} className="underline font-semibold shrink-0">Appeal</button>
        </div>
      )}

      {/* Main content area */}
      <main className={`flex min-h-0 flex-1 flex-col ${isFullBleed ? '' : 'items-center'}`}>
        <div className={`w-full flex flex-col ${isFullBleed ? 'flex-1' : `screen ${showTabs ? 'screen-docked' : ''}`}`}>
          {!currentUser ? (
            <>
              {currentScreen === 'splash' && (
                <SplashScreen
                  onCreateAccount={() => setCurrentScreen('signup')}
                  onLogIn={() => setCurrentScreen('signup')}
                />
              )}

              {currentScreen === 'signup' && (
                <SignUpScreen
                  onBack={() => setCurrentScreen('splash')}
                  onContinueEmail={() => setCurrentScreen('email_verify')}
                  onLogIn={() => setCurrentScreen('email_verify')}
                  onGoogleCredential={handleGoogleCredential}
                  onGoogleError={showToast}
                  googleBusy={googleBusy}
                />
              )}

              {currentScreen === 'email_verify' && (
                <EmailVerificationScreen
                  onBack={() => setCurrentScreen('signup')}
                  onVerified={handleEmailVerified}
                />
              )}
            </>
          ) : (
            <div className={`w-full ${isFullBleed ? 'flex-1 flex flex-col' : ''}`}>
              {currentScreen === 'splash' && (
                <SplashScreen
                  onCreateAccount={() => setCurrentScreen('profession')}
                  onLogIn={() => setCurrentScreen('discover')}
                />
              )}

              {currentScreen === 'profession' && (
                <ProfessionSelectionScreen
                  onBack={() => setCurrentScreen('splash')}
                  onNext={(category, isUniform) => {
                    setCurrentUser((prev) => (prev ? ({ ...prev, professionCategory: category } as UserProfile) : prev));
                    setCurrentScreen(isUniform ? 'service' : 'profile_setup');
                  }}
                />
              )}

              {currentScreen === 'service' && (
                <ServiceSelectionScreen
                  onBack={() => setCurrentScreen('profession')}
                  onNext={(service) => {
                    setCurrentUser((prev) => (prev ? ({ ...prev, service } as UserProfile) : prev));
                    setCurrentScreen('profile_setup');
                  }}
                />
              )}

              {currentScreen === 'profile_setup' && (
                <ProfileSetupScreen
                  onBack={() => setCurrentScreen('profession')}
                  onNext={(data) => {
                    setCurrentUser((prev) => (prev ? ({ ...prev, ...data } as UserProfile) : prev));
                    setIdentityOrigin('profile_setup');
                    setCurrentScreen('identity_verify');
                  }}
                />
              )}

              {currentScreen === 'identity_verify' && (
                <IdentityVerificationScreen
                  onBack={() => setCurrentScreen(identityOrigin)}
                  onContinue={() => {
                    void handleUpdateUser({
                      ...(currentUser as UserProfile),
                      verification: { ...currentUser!.verification, status: 'pending' }
                    });
                    showToast('Documents submitted. We will review them shortly.');
                    setCurrentScreen(identityOrigin === 'profile_setup' ? 'discover' : 'settings_privacy');
                  }}
                />
              )}

              {currentScreen === 'onboarding_dating' && (
                <RealDatingOnboardingFlow
                  initialUser={currentUser}
                  onComplete={async (updatedProfile) => {
                    setCurrentUser(updatedProfile);
                    identifyUser(updatedProfile);
                    if (await handleUpdateUser(updatedProfile)) {
                      track('onboarding_completed');
                      setCurrentScreen('discover');
                      showToast("You're all set — fresh profiles land in Discover.");
                    }
                  }}
                />
              )}

              {currentScreen === 'discover' && (
                <DiscoverScreen
                  currentProfile={currentDiscoverProfile}
                  nextProfile={nextDiscoverProfile}
                  credits={credits}
                  onSwipeLeft={handleSwipeLeft}
                  onSwipeRight={handleSwipeRight}
                  onSuperLike={handleSuperLike}
                  onOpenProfile={(profile) => openProfile(profile, 'discover')}
                  onOpenFilter={() => setCurrentScreen('settings')}
                  onOpenStore={openStore}
                  onResetDeck={() => void loadDeck()}
                />
              )}

              {currentScreen === 'explore' && (
                <ExploreScreen
                  profiles={exploreProfiles}
                  loading={exploreLoading}
                  onOpenProfile={(profile) => openProfile(profile, 'explore')}
                  onRefresh={() => void loadExplore()}
                  onOpenFilter={() => setCurrentScreen('settings')}
                  onDiscover={() => setCurrentScreen('discover')}
                />
              )}

              {currentScreen === 'profile_view' && (
                <ProfileDetailScreen
                  profile={lastInteractedProfile || currentDiscoverProfile || undefined as unknown as UserProfile}
                  onBack={() => setCurrentScreen(profileOrigin)}
                  onSwipeLeft={(profile) => { void handleSwipeLeft(profile); setCurrentScreen(profileOrigin); }}
                  onSwipeRight={(profile) => { void handleSwipeRight(profile); setCurrentScreen(profileOrigin); }}
                  onSuperLike={(profile) => { void handleSuperLike(profile); setCurrentScreen(profileOrigin); }}
                />
              )}

              {currentScreen === 'match_screen' && (
                <MatchCelebrationScreen
                  userA={currentUser}
                  userB={lastInteractedProfile || currentUser}
                  onStartChat={() => {
                    setChatOrigin('messages');
                    if (pendingMatch) {
                      void openMatch(pendingMatch.id, pendingMatch.partner, 'match_screen');
                      setPendingMatch(null);
                      return;
                    }
                    const newest = matches[0];
                    if (newest) void openMatch(newest.id, newest.profile, 'match_screen');
                    else setCurrentScreen('matches_list');
                  }}
                  onKeepExploring={() => setCurrentScreen('discover')}
                />
              )}

              {currentScreen === 'chat' && (
                <ChatScreen
                  partner={chatPartner || (currentUser as UserProfile)}
                  currentUserId={currentUser.id}
                  messages={activeMessages}
                  isBlocked={chatPartner ? blockedUserIds.includes(chatPartner.id) : false}
                  credits={credits}
                  onOpenStore={openStore}
                  onBack={() => setCurrentScreen(chatOrigin)}
                  onSendMessage={handleSendMessage}
                  onSendPhoto={(file) => { void handleSendPhoto(file); }}
                  onBlockUser={handleBlockUser}
                  onReportUser={handleReportUser}
                  onUnblockUser={(partner) => void handleUnblockUser(partner.id)}
                  onViewProfile={(partner) => openProfile(partner, 'chat')}
                />
              )}

              {currentScreen === 'matches_list' && (
                <MatchesListScreen
                  matches={matches}
                  likesReceived={likesReceived}
                  canSeeLikes={!likesLocked}
                  likesLocked={likesLocked}
                  likesCost={likesCost}
                  onRevealLikes={() => void handleRevealLikes()}
                  onSelectMatch={(id) => { setChatOrigin('matches_list'); void openMatch(id, undefined, 'matches_list'); }}
                  onLikeBack={(profile) => { void handleLikeBack(profile); }}
                  onOpenUpgrade={openStore}
                  onDiscover={() => setCurrentScreen('discover')}
                  suggestions={deck.filter((p) => !matches.some((m) => m.profile.id === p.id)).slice(0, 8)}
                  onOpenSuggestion={(profile) => openProfile(profile, 'matches_list')}
                />
              )}

              {currentScreen === 'messages' && (
                <MatchesListScreen
                  variant="messages"
                  matches={matches}
                  onSelectMatch={(id) => { setChatOrigin('messages'); void openMatch(id, undefined, 'messages'); }}
                  onDiscover={() => setCurrentScreen('discover')}
                  suggestions={deck.filter((p) => !matches.some((m) => m.profile.id === p.id)).slice(0, 8)}
                  onOpenSuggestion={(profile) => openProfile(profile, 'messages')}
                />
              )}

              {(currentScreen === 'settings_privacy' || currentScreen === 'settings') && (
                <SettingsPrivacyScreen
                  view={currentScreen === 'settings' ? 'settings' : 'profile'}
                  currentUser={currentUser}
                  credits={credits}
                  blockedUsersList={blockedUsers}
                  onUpdatePrivacy={async (newPrivacy) => {
                    try {
                      const saved = await WassaaApi.updatePrivacy(newPrivacy);
                      setCurrentUser((prev) => (prev ? { ...prev, privacy: saved } : prev));
                      showToast('Privacy preferences updated');
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Update failed');
                    }
                  }}
                  onOpenUpgrade={() => setCurrentScreen('subscription_plans')}
                  onUnblockUser={handleUnblockUser}
                  onSignOut={handleSignOut}
                  onLogOut={handleSignOut}
                  onUpdateUser={handleUpdateUser}
                  onDeleteAccount={handleDeleteAccount}
                  onVerifyPhone={() => setCurrentScreen('phone_verify')}
                  onOpenIdentityVerify={() => { setIdentityOrigin('settings_privacy'); setCurrentScreen('identity_verify'); }}
                  onOpenSettings={() => setCurrentScreen('settings')}
                  onBackToProfile={() => setCurrentScreen('settings_privacy')}
                />
              )}

              {currentScreen === 'phone_verify' && (
                <PhoneVerificationScreen
                  onBack={() => setCurrentScreen('settings')}
                  onVerified={handlePhoneLinked}
                  onSkip={() => setCurrentScreen('settings')}
                />
              )}

              {currentScreen === 'subscription_plans' && (
                <SubscriptionPlansScreen
                  credits={credits}
                  packs={packs}
                  onSelectPack={(packId) => void handleSelectPack(packId)}
                  onBoost={() => void handleBoost()}
                  onClose={() => setCurrentScreen('discover')}
                />
              )}

              {currentScreen === 'appeal' && (
                <AppealScreen
                  user={currentUser}
                  busy={appealBusy}
                  onSubmit={handleSubmitAppeal}
                  onSignOut={handleSignOut}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom navigation — floating dock, lifted clear of the home indicator */}
      {showTabs && (
        <nav className="dock" aria-label="Primary">
          <div className="dock-inner">
            {([
              { id: 'discover' as ScreenId, icon: Home, label: 'Discover' },
              { id: 'explore' as ScreenId, icon: Compass, label: 'Explore' },
              { id: 'matches_list' as ScreenId, icon: Heart, label: 'Matches' },
              { id: 'messages' as ScreenId, icon: MessageSquare, label: 'Messages' },
              { id: 'settings_privacy' as ScreenId, icon: User, label: 'Profile' },
            ] as const).map(({ id, icon: Icon, label }) => {
              const isActive = currentScreen === id ||
                (id === 'discover' && currentScreen === 'profile_view' && profileOrigin === 'discover') ||
                (id === 'explore' && currentScreen === 'profile_view' && profileOrigin === 'explore') ||
                (id === 'messages' && currentScreen === 'chat') ||
                (id === 'settings_privacy' &&
                  ['settings', 'phone_verify'].includes(currentScreen));
              return (
                <button
                  key={id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setCurrentScreen(id)}
                  className={`dock-item ${isActive ? 'dock-item-active' : 'hover:text-[#6B665F]'}`}
                >
                  <Icon className="h-6 w-6" strokeWidth={isActive ? 2.3 : 1.7} />
                  <span className="dock-label">{label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
