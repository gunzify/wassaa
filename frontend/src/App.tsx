import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home,
  Heart,
  MessageSquare,
  User,
  CheckCircle2,
  ChevronLeft,
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
import { ProfileDetailScreen } from './components/screens/ProfileDetailScreen';
import { MatchCelebrationScreen } from './components/screens/MatchCelebrationScreen';
import { ChatScreen } from './components/screens/ChatScreen';
import { MatchesListScreen } from './components/screens/MatchesListScreen';
import { SettingsPrivacyScreen } from './components/screens/SettingsPrivacyScreen';
import { SubscriptionPlansScreen } from './components/screens/SubscriptionPlansScreen';
import { RealDatingOnboardingFlow } from './components/onboarding/RealDatingOnboardingFlow';
import { ReportCategoryKey } from './components/chat/BlockReportModal';
import { WassaaApi } from './services/api';
import { preparePhoto } from './services/media';
import { signOut, clearSession } from './services/supabase-auth';
import { getProfileCompletion } from './services/profile-readiness';
import { subscribeToMatch } from './services/realtime';
import { UserProfile, MatchItem, SubscriptionTier, ChatMessage } from './types';

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
  | 'profile_view'
  | 'match_screen'
  | 'chat'
  | 'matches_list'
  | 'settings_privacy'
  | 'subscription_plans';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('splash');

  // Discovery
  const [deck, setDeck] = useState<UserProfile[]>([]);
  const [deckIndex, setDeckIndex] = useState(0);

  // Matches & chat
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [likesReceived, setLikesReceived] = useState<UserProfile[]>([]);
  const [activeMatchId, setActiveMatchId] = useState<string>('');
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [activeChatPartner, setActiveChatPartner] = useState<UserProfile | null>(null);

  // Misc
  const [currentTier, setCurrentTier] = useState<SubscriptionTier>('free');
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

  // ---------- Boot: restore session ----------
  useEffect(() => {
    (async () => {
      try {
        const user = await WassaaApi.fetchSession();
        if (user) {
          setCurrentUser(user);
          setCurrentTier('free');
          const profileComplete = getProfileCompletion(user).complete;
          setCurrentScreen(profileComplete ? 'discover' : 'onboarding_dating');
          if (profileComplete) {
            const [ens, blocked] = await Promise.all([
              WassaaApi.getEntitlements(),
              WassaaApi.listBlocked()
            ]);
            setCurrentTier(ens.tier);
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

  const currentDiscoverProfile = deck[deckIndex];
  const nextDiscoverProfile = deck[deckIndex + 1];

  // ---------- Swipe handlers (server-authoritative) ----------
  const advanceDeck = useCallback(() => setDeckIndex((i) => i + 1), []);

  const handleSwipeLeft = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    advanceDeck();
    try { await WassaaApi.pass(profile.id); } catch { /* pass is best-effort */ }
  }, [advanceDeck]);

  const handleSwipeRight = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    try {
      const res = await WassaaApi.like(profile.id);
      if (res.isMatch) {
        if (res.match) setPendingMatch({ id: res.match.id, partner: profile });
        setCurrentScreen('match_screen');
        WassaaApi.getMatches().then(setMatches).catch(() => undefined);
      } else {
        showToast(`Liked ${profile.name}`);
      }
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'LIKE_LIMIT') showToast('Daily like limit reached — upgrade for unlimited likes');
      else showToast(e.message);
    }
    advanceDeck();
  }, [advanceDeck, showToast]);

  const handleSuperLike = useCallback(async (profile: UserProfile) => {
    setLastInteractedProfile(profile);
    try {
      const res = await WassaaApi.like(profile.id, { superLike: true });
      if (res.isMatch) {
        if (res.match) setPendingMatch({ id: res.match.id, partner: profile });
        setCurrentScreen('match_screen');
        WassaaApi.getMatches().then(setMatches).catch(() => undefined);
      } else {
        showToast(`Super Liked ${profile.name}!`);
      }
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'SUPER_LIMIT') showToast('You have used this week’s Super Likes. Try again next week.');
      else showToast(e.message);
    }
    advanceDeck();
  }, [advanceDeck, showToast]);

  // ---------- Matches & chat polling ----------
  const refreshMatches = useCallback(async () => {
    try {
      const ms = await WassaaApi.getMatches();
      setMatches(ms);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (currentScreen !== 'matches_list' || currentTier === 'free') {
      if (currentTier === 'free') setLikesReceived([]);
      return;
    }
    WassaaApi.getLikesReceived().then(setLikesReceived).catch(() => setLikesReceived([]));
  }, [currentScreen, currentTier]);

  const handleLikeBack = useCallback(async (profile: UserProfile) => {
    try {
      const result = await WassaaApi.like(profile.id);
      setLikesReceived((prev) => prev.filter((item) => item.id !== profile.id));
      await refreshMatches();
      if (result.isMatch) {
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
    if (!['matches_list', 'chat'].includes(currentScreen)) return;
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

  const openMatch = useCallback(async (id: string, partner?: UserProfile) => {
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
      const msg = await WassaaApi.sendMessage(activeMatchId, { kind: 'text', text });
      setActiveMessages((prev) => [...prev, msg]);
      lastMessageTs.current = msg.createdAt;
      void refreshMatches();
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Message failed to send');
      return false;
    }
  }, [activeMatchId, chatPartner, blockedUserIds, showToast, refreshMatches]);

  const handleSendPhoto = useCallback(async (file: File) => {
    if (!activeMatchId) return;
    if (file.size > 8 * 1024 * 1024) { showToast('Choose an image under 8 MB.'); return; }
    const partner = chatPartner;
    if (partner && blockedUserIds.includes(partner.id)) { showToast('Cannot message a blocked contact.'); return; }
    try {
      const prepared = await preparePhoto(file);
      const mediaUrl = await WassaaApi.uploadImage('chat_photo', prepared);
      if (!mediaUrl) throw new Error('Private photo sharing is unavailable until secure storage is configured.');
      const msg = await WassaaApi.sendMessage(activeMatchId, { kind: 'photo', mediaUrl });
      setActiveMessages((prev) => [...prev, msg]);
      showToast('Photo shared!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Photo failed');
    }
  }, [activeMatchId, chatPartner, blockedUserIds, showToast]);

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

  const handleReportUser = useCallback(async (params: { category: ReportCategoryKey; categoryLabel: string; details: string; alsoBlock: boolean }) => {
    const partner = chatPartner || lastInteractedProfile;
    if (!partner) { showToast('Nothing to report.'); return; }
    try {
      await WassaaApi.submitReport({
        reportedUserId: partner.id,
        category: params.category,
        categoryLabel: params.categoryLabel,
        details: params.details,
        alsoBlock: params.alsoBlock,
        serviceBranch: partner.service
      });
      if (params.alsoBlock) await handleBlockUser(partner, `Reported for ${params.categoryLabel}`);
      showToast('Report submitted. Our team will review it.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Report failed');
    }
  }, [chatPartner, lastInteractedProfile, handleBlockUser, showToast]);

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

  // ---------- Billing ----------
  const handleSelectTier = useCallback(async (tier: SubscriptionTier) => {
    if (tier === 'free') { showToast('You are on the Free plan.'); return; }
    // Open synchronously from the click so popup blockers do not discard checkout
    // after the network request resolves.
    const checkoutWindow = window.open('about:blank', '_blank');
    if (checkoutWindow) checkoutWindow.opener = null;
    try {
      showToast('Starting secure checkout…');
      const res = await WassaaApi.checkout(tier);
      if (res.authorizationUrl) {
        if (checkoutWindow) checkoutWindow.location.replace(res.authorizationUrl);
        else {
          window.location.assign(res.authorizationUrl);
          return;
        }
        showToast('Complete payment in the Paystack window. We’ll confirm your plan here.');
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          try {
            const activation = await WassaaApi.activate(res.reference);
            setCurrentTier(activation.tier as SubscriptionTier);
            showToast(`Your ${activation.tier === 'hyper_premium' ? 'WASSAA VIP' : 'WASSAA Plus'} plan is active.`);
            return;
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('Payment not confirmed yet')) throw error;
          }
        }
        showToast('Payment is still processing. Your plan will appear after confirmation; reopen Plans to refresh.');
        return;
      }
      checkoutWindow?.close();
      await WassaaApi.sandboxComplete(res.reference);
      const act = await WassaaApi.activate(res.reference);
      setCurrentTier(act.tier as SubscriptionTier);
      showToast(`Upgraded to ${act.tier === 'hyper_premium' ? 'WASSAA VIP' : 'WASSAA Plus'} (sandbox)`);
    } catch (err) {
      checkoutWindow?.close();
      showToast(err instanceof Error ? err.message : 'Checkout failed');
    }
  }, [showToast]);

  // ---------- Sign-in ----------
  // A verified email (or Google, which verifies the address for us) is the only
  // requirement to enter the app. Phone verification is an optional extra.
  const enterWithProfile = useCallback((profile: UserProfile) => {
    const user = profile.name === 'New member' ? { ...profile, name: '' } : profile;
    setCurrentUser(user);
    const complete = getProfileCompletion(user).complete;
    setCurrentScreen(complete ? 'discover' : 'onboarding_dating');
    if (complete) {
      void WassaaApi.getEntitlements().then((entitlements) => setCurrentTier(entitlements.tier)).catch(() => undefined);
      void WassaaApi.listBlocked().then(setBlockedUsers).catch(() => undefined);
      void WassaaApi.getMatches().then(setMatches).catch(() => undefined);
    }
  }, []);

  const handleEmailVerified = useCallback((profile: UserProfile) => {
    enterWithProfile(profile);
  }, [enterWithProfile]);

  const handleGoogleCredential = useCallback(async (credential: string, nonce: string) => {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      const result = await WassaaApi.signInWithGoogle(credential, nonce);
      if (!result.user) throw new Error('Google sign-in did not return a Wassaa profile. Try again.');
      enterWithProfile(result.user);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Google sign-in failed. Try again.');
    } finally {
      setGoogleBusy(false);
    }
  }, [enterWithProfile, googleBusy, showToast]);

  const handlePhoneLinked = useCallback((profile: UserProfile) => {
    setCurrentUser(profile);
    setCurrentScreen('settings_privacy');
    showToast('Phone verified. Your trust badge is active.');
  }, [showToast]);

  // ---------- Rendering ----------

  // Boot loading state
  if (booting) {
    return (
      <div className="min-h-screen bg-[#F7F5F0] flex items-center justify-center">
        <span className="font-['Cormorant_Garamond',serif] font-semibold text-2xl tracking-[0.12em] text-[#B85A3C]">WASSAA</span>
      </div>
    );
  }

  // Screens where the bottom navigation dock is visible
  const showTabs = ['discover', 'profile_view', 'matches_list', 'chat', 'settings_privacy', 'subscription_plans'].includes(currentScreen) && currentUser;

  // Screens that are full-bleed (no padding/centering from shell)
  const isFullBleed = ['splash', 'match_screen'].includes(currentScreen);

  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1816] flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1816] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_32px_-4px_rgba(0,0,0,0.25)] flex items-center gap-2.5 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#2C6B56] shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Main content area */}
      <main className={`flex-1 flex flex-col ${isFullBleed ? '' : 'items-center'}`}>
        <div className={`w-full flex flex-col ${isFullBleed ? 'flex-1' : 'max-w-[480px] mx-auto px-4 sm:px-5 py-4'} ${showTabs ? 'pb-20' : ''}`}>
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
                    setCurrentScreen('identity_verify');
                  }}
                />
              )}

              {currentScreen === 'identity_verify' && (
                <IdentityVerificationScreen
                  onBack={() => setCurrentScreen('profile_setup')}
                  onContinue={() => {
                    void handleUpdateUser({
                      ...(currentUser as UserProfile),
                      verification: { ...currentUser!.verification, status: 'pending' }
                    });
                    setCurrentScreen('discover');
                  }}
                />
              )}

              {currentScreen === 'onboarding_dating' && (
                <RealDatingOnboardingFlow
                  initialUser={currentUser}
                  onComplete={async (updatedProfile) => {
                    setCurrentUser(updatedProfile);
                    if (await handleUpdateUser(updatedProfile)) {
                      setCurrentScreen('discover');
                      showToast('Profile activated! Your match queue is ready.');
                    }
                  }}
                />
              )}

              {currentScreen === 'discover' && (
                <DiscoverScreen
                  currentProfile={currentDiscoverProfile}
                  nextProfile={nextDiscoverProfile}
                  onSwipeLeft={handleSwipeLeft}
                  onSwipeRight={handleSwipeRight}
                  onSuperLike={handleSuperLike}
                  onOpenProfile={() => setCurrentScreen('profile_view')}
                  onOpenFilter={() => setCurrentScreen('settings_privacy')}
                  onResetDeck={() => void loadDeck()}
                />
              )}

              {currentScreen === 'profile_view' && (
                <ProfileDetailScreen
                  profile={lastInteractedProfile || currentDiscoverProfile || undefined as unknown as UserProfile}
                  onBack={() => setCurrentScreen('discover')}
                  onSwipeLeft={handleSwipeLeft}
                  onSwipeRight={handleSwipeRight}
                  onSuperLike={handleSuperLike}
                />
              )}

              {currentScreen === 'match_screen' && (
                <MatchCelebrationScreen
                  userA={currentUser}
                  userB={lastInteractedProfile || currentUser}
                  onStartChat={() => {
                    if (pendingMatch) {
                      void openMatch(pendingMatch.id, pendingMatch.partner);
                      setPendingMatch(null);
                      return;
                    }
                    const newest = matches[0];
                    if (newest) void openMatch(newest.id, newest.profile);
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
                  onBack={() => setCurrentScreen('matches_list')}
                  onSendMessage={handleSendMessage}
                  onSendPhoto={(file) => { void handleSendPhoto(file); }}
                  onBlockUser={handleBlockUser}
                  onReportUser={handleReportUser}
                  onUnblockUser={(partner) => void handleUnblockUser(partner.id)}
                  onViewProfile={(partner) => {
                    setLastInteractedProfile(partner);
                    setCurrentScreen('profile_view');
                  }}
                />
              )}

              {currentScreen === 'matches_list' && (
                <MatchesListScreen
                  matches={matches}
                  likesReceived={likesReceived}
                  canSeeLikes={currentTier !== 'free'}
                  onSelectMatch={(id) => void openMatch(id)}
                  onLikeBack={(profile) => { void handleLikeBack(profile); }}
                  onOpenUpgrade={() => setCurrentScreen('subscription_plans')}
                  onDiscover={() => setCurrentScreen('discover')}
                />
              )}

              {currentScreen === 'settings_privacy' && (
                <SettingsPrivacyScreen
                  currentUser={currentUser}
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
                />
              )}

              {currentScreen === 'phone_verify' && (
                <PhoneVerificationScreen
                  onBack={() => setCurrentScreen('settings_privacy')}
                  onVerified={handlePhoneLinked}
                  onSkip={() => setCurrentScreen('settings_privacy')}
                />
              )}

              {currentScreen === 'subscription_plans' && (
                <SubscriptionPlansScreen
                  currentTier={currentTier}
                  onSelectTier={(tier) => void handleSelectTier(tier)}
                  onClose={() => setCurrentScreen('discover')}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom navigation */}
      {showTabs && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-[#E8E4DC]">
          <div className="w-full max-w-[480px] mx-auto grid grid-cols-4 h-16 items-center px-2">
            {([
              { id: 'discover' as ScreenId, icon: Home, label: 'Discover' },
              { id: 'matches_list' as ScreenId, icon: Heart, label: 'Matches' },
              { id: 'chat' as ScreenId, icon: MessageSquare, label: 'Messages' },
              { id: 'settings_privacy' as ScreenId, icon: User, label: 'Profile' },
            ] as const).map(({ id, icon: Icon, label }) => {
              const isActive = currentScreen === id ||
                (id === 'discover' && currentScreen === 'profile_view') ||
                (id === 'settings_privacy' && currentScreen === 'subscription_plans');
              return (
                <button
                  key={id}
                  onClick={() => {
                    // The Messages tab needs a conversation; without one the chat
                    // screen rendered an empty thread with the signed-in user as
                    // the partner. Send people to their match list instead.
                    if (id === 'chat' && !activeMatchId) { setCurrentScreen('matches_list'); return; }
                    setCurrentScreen(id);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                    isActive ? 'text-[#B85A3C]' : 'text-[#9C958D] hover:text-[#6B665F]'
                  }`}
                >
                  <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.5} />
                  <span className={`text-[11px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
                </button>
              );
            })}
          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </nav>
      )}
    </div>
  );
}
