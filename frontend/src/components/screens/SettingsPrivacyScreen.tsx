import React, { useState, useRef } from 'react';
import { 
  ChevronRight, 
  ShieldCheck, 
  Lock, 
  Eye, 
  Bell, 
  UserX, 
  Check, 
  LogOut, 
  Trash2, 
  Camera, 
  Plus, 
  X, 
  Upload, 
  Star, 
  Edit3, 
  Briefcase, 
  GraduationCap, 
  MapPin, 
  Heart, 
  Sliders, 
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  Calendar,
  Layers,
  Gem,
  Target,
  Compass,
  Settings,
  Phone,
  Mail,
  BarChart3,
  Coins,
  Moon,
  Sun,
  Smartphone
} from 'lucide-react';
import { 
  UserProfile, 
  VisibilitySetting, 
  ProfilePrompt, 
  ProfessionCategory, 
  UniformedService 
} from '../../types';
import { WassaaApi } from '../../services/api';
import { preparePhoto } from '../../services/media';
import { analyticsConfigured, getAnalyticsConsent, setAnalyticsConsent } from '../../services/analytics';
import { readThemePreference, setThemePreference, type ThemePreference } from '../../services/theme';
import { ORG_ROLES, skillsForCategory, isUniformedCategory } from '../../constants/career';
import { VerifiedMark } from '../common/VerifiedMark';
import { PhotoViewer } from '../common/PhotoViewer';
import { affiliationLine, locationLine, serviceLine } from '../../lib/profile-display';

interface BlockedItem {
  id: string;
  name: string;
  reason?: string;
  date?: string;
}

interface SettingsPrivacyScreenProps {
  currentUser: UserProfile;
  /** Current credit balance, shown on the profile so it never hides in a tab. */
  credits?: number;
  blockedUsersList?: BlockedItem[];
  onUpdatePrivacy: (privacy: UserProfile['privacy']) => void;
  onOpenUpgrade: () => void;
  onUnblockUser?: (blockedId: string) => void;
  onSignOut?: () => void;
  onUpdateUser?: (updatedUser: UserProfile) => Promise<boolean> | boolean | void;
  onDeleteAccount?: () => void;
  onLogOut?: () => void;
  /** Opens the optional phone-verification step. */
  onVerifyPhone?: () => void;
  /** Opens the identity-verification flow (selfie + government ID). */
  onOpenIdentityVerify?: () => void;
  /** Which half of the split screen the shell is rendering. */
  view?: 'profile' | 'settings';
  /** Profile header gear → settings. */
  onOpenSettings?: () => void;
  /** Settings header back → profile. */
  onBackToProfile?: () => void;
}

// Available Nigerian Dating Prompts
const POPULAR_PROMPTS = [
  "A Sunday well spent in Lagos or Abuja looks like...",
  "The quickest way to win over my heart is...",
  "My non-negotiables in a long-term partner are...",
  "Together, we could build...",
  "My love language in action is...",
  "The most important value I was raised with..."
];

export const SettingsPrivacyScreen: React.FC<SettingsPrivacyScreenProps> = ({
  currentUser,
  credits,
  blockedUsersList = [],
  onUpdatePrivacy,
  onOpenUpgrade,
  onUnblockUser,
  onSignOut,
  onUpdateUser,
  onDeleteAccount,
  onLogOut,
  onVerifyPhone,
  onOpenIdentityVerify,
  view = 'profile',
  onOpenSettings,
  onBackToProfile
}) => {
  // Modals state
  const [showAddPhotoModal, setShowAddPhotoModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditBioModal, setShowEditBioModal] = useState(false);
  const [showEditCareerModal, setShowEditCareerModal] = useState(false);
  const [showEditIntentionsModal, setShowEditIntentionsModal] = useState(false);
  const [showEditPromptsModal, setShowEditPromptsModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showLogOutConfirm, setShowLogOutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Form states for inline editing
  const [bioInput, setBioInput] = useState(currentUser?.bio || '');
  const [professionTitleInput, setProfessionTitleInput] = useState(currentUser?.professionTitle || '');
  const [companyInput, setCompanyInput] = useState(currentUser?.companyOrOrg || '');
  const [almaMaterInput, setAlmaMaterInput] = useState(currentUser?.almaMater || '');
  const [cityInput, setCityInput] = useState(currentUser?.city || '');
  const [stateInput, setStateInput] = useState(currentUser?.state || '');
  const [neighborhoodInput, setNeighborhoodInput] = useState(currentUser?.neighborhood || '');
  const [orgRoleInput, setOrgRoleInput] = useState<'officer' | 'soldier' | ''>(currentUser?.orgRole || '');
  const [skillInput, setSkillInput] = useState(currentUser?.skill || '');
  const [datingGoalInput, setDatingGoalInput] = useState<string>(currentUser?.datingGoal || 'marriage');
  const [minAgeInput, setMinAgeInput] = useState(currentUser?.matchPreferences?.minAge || 22);
  const [maxAgeInput, setMaxAgeInput] = useState(currentUser?.matchPreferences?.maxAge || 40);
  const [maxDistanceInput, setMaxDistanceInput] = useState(currentUser?.matchPreferences?.maxDistanceKm || 100);
  const [distanceEnabled, setDistanceEnabled] = useState(Boolean(currentUser?.matchPreferences?.maxDistanceKm));
  const [locationStatus, setLocationStatus] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const saveDiscoveryPreferences = async (coordinates?: UserProfile['locationCoordinates'], enableDistance = distanceEnabled) => {
    if (!onUpdateUser) return;
    const hasLocation = coordinates === null
      ? false
      : coordinates !== undefined || currentUser.hasPreciseLocation === true;
    if (enableDistance && !hasLocation) {
      setLocationStatus('Add device location before saving a distance limit.');
      return;
    }
    const updated: UserProfile = {
      ...currentUser,
      ...(coordinates !== undefined ? { locationCoordinates: coordinates } : {}),
      matchPreferences: {
        gender: currentUser.matchPreferences?.gender || 'everyone',
        minAge: minAgeInput,
        maxAge: maxAgeInput,
        ...(enableDistance && hasLocation ? { maxDistanceKm: maxDistanceInput } : {}),
      },
    };
    setLocationStatus('Saving discovery preferences…');
    const result = await onUpdateUser(updated);
    if (result === false) setLocationStatus('Could not save. Please try again.');
    else setLocationStatus('Discovery preferences saved.');
  };

  const capturePreciseLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('This browser does not provide device location.');
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationBusy(false);
        setDistanceEnabled(true);
        setLocationStatus('Location received. Saving securely…');
        void saveDiscoveryPreferences({ latitude: coords.latitude, longitude: coords.longitude }, true);
      },
      (error) => {
        setLocationBusy(false);
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'Location permission was declined.' : 'Could not get location. Check device settings and try again.');
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  };

  // Appearance: the preference is device-local, so it is not part of the profile.
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => readThemePreference());

  // Privacy toggles
  const [privacy, setPrivacy] = useState(currentUser?.privacy || {
    serviceVisibility: 'matches' as VisibilitySetting,
    verificationDisplay: 'badge' as const,
    chatNotifications: true,
    twoFactorAuth: false,
    privateIntroductionOptIn: false
  });

  const toggleChatNotifications = () => {
    const updated = { ...privacy, chatNotifications: !privacy.chatNotifications };
    setPrivacy(updated);
    onUpdatePrivacy(updated);
  };

  // Product analytics is opt-in and stays in the browser until the member
  // allows it (see services/analytics.ts).
  const [analyticsOn, setAnalyticsOn] = useState(() => getAnalyticsConsent() === 'granted');
  const toggleAnalytics = () => {
    const next = !analyticsOn;
    setAnalyticsConsent(next);
    setAnalyticsOn(next);
  };

  // Photo handlers
  const handleAddPhoto = (newPhotoUrl: string) => {
    if (!newPhotoUrl.trim()) return;
    const currentPhotos = [...(currentUser?.photos || [])];
    if (currentPhotos.length >= 6) {
      alert('You can upload up to 6 photos. Remove an existing photo to add a new one.');
      return;
    }
    const updatedPhotos = [...currentPhotos, newPhotoUrl.trim()];
    if (onUpdateUser && currentUser) {
      onUpdateUser({ ...currentUser, photos: updatedPhotos });
    }
    setShowAddPhotoModal(false);
  };

  const handleMakePrimaryPhoto = (index: number) => {
    if (index === 0) return;
    const currentPhotos = [...(currentUser?.photos || [])];
    const selected = currentPhotos[index];
    currentPhotos.splice(index, 1);
    currentPhotos.unshift(selected);
    if (onUpdateUser && currentUser) {
      onUpdateUser({ ...currentUser, photos: currentPhotos });
    }
  };

  const handleDeletePhoto = (index: number) => {
    const currentPhotos = [...(currentUser?.photos || [])];
    if (currentPhotos.length <= 1) {
      alert('Your profile must have at least one photo.');
      return;
    }
    currentPhotos.splice(index, 1);
    if (onUpdateUser && currentUser) {
      onUpdateUser({ ...currentUser, photos: currentPhotos });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Photo must be under 8MB');
      return;
    }
    // Upload directly to object storage; identity and profile images never go
    // through the app API as base64 request bodies.
    try {
      const prepared = await preparePhoto(file);
      const uploaded = await WassaaApi.uploadImage('photo', prepared);
      handleAddPhoto(uploaded);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Photo upload failed. Please choose another image and try again.');
    }
  };

  // Save Bio
  const handleSaveBio = () => {
    if (onUpdateUser && currentUser) {
      onUpdateUser({ ...currentUser, bio: bioInput.trim() });
    }
    setShowEditBioModal(false);
  };

  // Save Career & Education
  const handleSaveCareer = () => {
    if (onUpdateUser && currentUser) {
      const uniformed = ['military', 'police', 'paramilitary'].includes(currentUser.classOfService || '');
      onUpdateUser({
        ...currentUser,
        professionTitle: professionTitleInput.trim() || currentUser.professionTitle,
        companyOrOrg: companyInput.trim(),
        almaMater: almaMaterInput.trim(),
        city: cityInput.trim() || currentUser.city,
        state: stateInput.trim() || currentUser.state,
        neighborhood: neighborhoodInput.trim(),
        orgRole: uniformed && orgRoleInput ? orgRoleInput : undefined,
        skill: skillInput || undefined
      });
    }
    setShowEditCareerModal(false);
  };

  // Save Dating Intentions
  const handleSaveIntentions = () => {
    if (onUpdateUser && currentUser) {
      const intentionsMap: Record<string, string[]> = {
        marriage: ['Marriage', 'Long-term partnership'],
        long_term: ['Long-term relationship leading to marriage'],
        intentional: ['Intentional dating', 'Meaningful connection'],
        exploring: ['Dating with intention', 'Getting to know each other']
      };
      onUpdateUser({
        ...currentUser,
        datingGoal: datingGoalInput as any,
        intentions: intentionsMap[datingGoalInput] || ['Long-term relationship']
      });
    }
    setShowEditIntentionsModal(false);
  };

  const primaryPhoto = currentUser?.photos?.[0];

  return (
    <main className="w-full pb-4">
      {/* ---- Screen header ------------------------------------------------ */}
      <header className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex items-start gap-2">
          {view === 'settings' && (
            <button
              type="button"
              onClick={onBackToProfile}
              className="icon-btn icon-btn-ghost shrink-0"
              aria-label="Back to profile"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="t-title">{view === 'settings' ? 'Settings' : 'Profile'}</h1>
            <p className="t-meta mt-0.5">
              {view === 'settings' ? 'Account, discovery and privacy.' : 'How matches see you.'}
            </p>
          </div>
        </div>
        {view === 'profile' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="icon-btn icon-btn-ghost"
              aria-label="Preview my profile card"
              title="Preview my profile card"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="icon-btn icon-btn-ghost"
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      {view === 'profile' && (
        <>
      {/* ---- Identity card ------------------------------------------------ */}
      <section className="card mt-4 p-4">
        <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          {primaryPhoto ? (
            <img
              src={primaryPhoto}
              alt={currentUser?.name || 'Profile photo'}
              role="button"
              tabIndex={0}
              aria-label="View photo full screen"
              onClick={() => setLightboxIndex(0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(0);
                }
              }}
              className="h-[4.75rem] w-[4.75rem] cursor-pointer rounded-[1.15rem] object-cover object-[50%_32%] ring-1 ring-line"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              aria-label="No profile photo added"
              className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-[1.15rem] bg-brand-tint text-brand"
            >
              <UserX className="h-7 w-7" />
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddPhotoModal(true)}
            className="absolute -bottom-1.5 -right-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface bg-brand text-white shadow-[0_4px_12px_-2px_rgba(184,90,60,0.6)]"
            data-compact
            aria-label="Add or change photo"
          >
            <Camera className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="font-['Cormorant_Garamond',serif] text-[1.5rem] font-semibold leading-[1.15]">
            {currentUser?.name || 'Your name'}
            {currentUser?.age ? <span className="font-normal text-ink-soft">{`, ${currentUser.age}`}</span> : null}
          </h2>
          <p className="mt-1 line-clamp-2 text-[0.8125rem] font-semibold uppercase leading-snug tracking-[0.08em] text-ink-soft">
            {currentUser ? serviceLine(currentUser) : 'Complete your profile to be seen'}
          </p>
          {currentUser && locationLine(currentUser) ? (
            <p className="mt-1 flex items-center gap-1 text-[0.8125rem] text-ink-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {locationLine(currentUser)}
            </p>
          ) : null}
        </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {currentUser?.verification?.status === 'verified' ? (
              <span className="pill bg-verified-tint text-verified">
                <VerifiedMark size={14} withLabel />
              </span>
            ) : currentUser?.verification?.status === 'pending' ? (
              <span className="pill bg-surface-subtle text-ink-soft">In review</span>
            ) : (
              <button
                type="button"
                onClick={onOpenIdentityVerify}
                className="pill cursor-pointer bg-brand-tint text-brand hover:bg-brand-tint/70"
                title="Verify with a selfie and government ID"
              >
                Get verified
              </button>
            )}
            {currentUser?.phoneVerified ? (
              <span className="pill bg-verified-tint text-verified">
                <Phone className="h-3.5 w-3.5" />
                Phone
              </span>
            ) : null}
            <button
              type="button"
              onClick={onOpenUpgrade}
              className="pill cursor-pointer bg-surface-subtle text-ink-soft hover:text-ink"
              title="Credits — tap to top up"
              aria-label={`${typeof credits === 'number' ? credits : 0} credits. Open the store.`}
            >
              <Coins className="h-3.5 w-3.5" />
              {typeof credits === 'number' ? `${credits} credit${credits === 1 ? '' : 's'}` : 'Credits'}
            </button>
            <span className="pill bg-surface-subtle text-ink-soft">
              {(currentUser?.photos || []).length}/6 photos
            </span>
          </div>
        </section>
        </>
      )}

      {view === 'settings' && (
        <>
      {/* ---- Membership -------------------------------------------------- */}
      <button type="button" onClick={onOpenUpgrade} className="card card-pad mt-3 w-full flex items-center gap-3 text-left">
        <span className="row-icon">
          <Star className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="row-title block">Credits & membership</span>
          <span className="row-sub block">Top up to keep conversations going</span>
        </span>
        <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
      </button>
        </>
      )}

      {view === 'profile' && (
        <>
      {/* ---- Photos ------------------------------------------------------ */}
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 px-1">
          <h2 className="t-section">Photos</h2>
          <button
            type="button"
            onClick={() => setShowAddPhotoModal(true)}
            className="flex items-center gap-1 text-[0.9375rem] font-semibold text-[#B85A3C]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Add
          </button>
        </div>

        <div className="card card-pad">
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: Math.min(6, (currentUser?.photos?.length || 0) + 1) }).map((_, index) => {
              const photoUrl = currentUser?.photos?.[index];
              const isPrimary = index === 0;

              if (photoUrl) {
                return (
                  <div key={index} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-surface-subtle">
                    <img
                      src={photoUrl}
                      alt={`Profile photo ${index + 1}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`View photo ${index + 1} full screen`}
                      onClick={() => setLightboxIndex(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLightboxIndex(index);
                        }
                      }}
                      className="w-full h-full cursor-pointer object-cover object-[50%_32%]"
                      referrerPolicy="no-referrer"
                    />

                    {isPrimary ? (
                      <span className="absolute top-1.5 left-1.5 pill bg-[#B85A3C] text-white">
                        <Star className="w-3 h-3 fill-white" />
                        Main
                      </span>
                    ) : null}

                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      {!isPrimary ? (
                        <button
                          type="button"
                          data-compact
                          onClick={() => handleMakePrimaryPhoto(index)}
                          className="flex h-10 w-10 min-h-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55"
                          title="Set as main portrait"
                          aria-label="Set as main portrait"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-compact
                        onClick={() => handleDeletePhoto(index)}
                        className="flex h-10 w-10 min-h-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55"
                        title="Remove photo"
                        aria-label="Remove photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setShowAddPhotoModal(true)}
                  className="aspect-[3/4] rounded-xl border border-dashed border-[#D9D2C7] flex flex-col items-center justify-center gap-1.5 text-[#9C958D]"
                  aria-label={`Add photo in slot ${index + 1}`}
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[0.75rem] font-medium">Add</span>
                </button>
              );
            })}
          </div>
          <p className="t-tiny mt-3">
            Tap a photo to view it. The starred photo is your main portrait.
          </p>
        </div>
      </section>

      {/* ---- About ------------------------------------------------------- */}
      <section className="mt-6">
        <h2 className="t-section mb-2 px-1">About you</h2>

        <div className="card card-flush">
          <button
            type="button"
            className="row"
            onClick={() => {
              setBioInput(currentUser?.bio || '');
              setShowEditBioModal(true);
            }}
          >
            <span className="row-icon">
              <Edit3 className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">About me</span>
              <span className="row-sub block line-clamp-2">
                {currentUser?.bio || 'Add a short introduction'}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>

          <button type="button" className="row" onClick={() => setShowEditPromptsModal(true)}>
            <span className="row-icon">
              <Layers className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Conversation prompts</span>
              <span className="row-sub block">
                {currentUser?.prompts?.length
                  ? `${currentUser.prompts.length} added`
                  : 'Add starters so matches know how to open'}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>

          <div className="row items-start">
            <span className="row-icon">
              <Heart className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Interests</span>
              <span className="row-sub block line-clamp-1">
                {(currentUser?.interests?.length ? currentUser.interests.slice(0, 4) : []).join(' · ') || 'Add what you enjoy'}
              </span>
            </span>
          </div>

          <button
            type="button"
            className="row"
            onClick={() => {
              setProfessionTitleInput(currentUser?.professionTitle || '');
              setCompanyInput(currentUser?.companyOrOrg || '');
              setAlmaMaterInput(currentUser?.almaMater || '');
              setCityInput(currentUser?.city || '');
              setStateInput(currentUser?.state || '');
              setNeighborhoodInput(currentUser?.neighborhood || '');
              setShowEditCareerModal(true);
            }}
          >
            <span className="row-icon">
              <Briefcase className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Career & education</span>
              <span className="row-sub block line-clamp-1">
                {[
                  currentUser && isUniformedCategory(currentUser.professionCategory)
                    ? [affiliationLine(currentUser), currentUser.skill].filter(Boolean).join(' · ')
                    : [currentUser?.professionTitle, currentUser?.companyOrOrg, currentUser?.almaMater].filter(Boolean).join(' · '),
                  currentUser?.almaMater && isUniformedCategory(currentUser.professionCategory) ? currentUser.almaMater : null
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Add your work and school'}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>

          <button
            type="button"
            className="row"
            onClick={() => {
              setDatingGoalInput(currentUser?.datingGoal || 'marriage');
              setShowEditIntentionsModal(true);
            }}
          >
            <span className="row-icon">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Dating intentions</span>
              <span className="row-sub block">
                {currentUser?.datingGoal === 'marriage'
                  ? 'Marriage and a life partner'
                  : currentUser?.datingGoal === 'long_term'
                  ? 'Long-term, leading to marriage'
                  : currentUser?.datingGoal === 'intentional'
                  ? 'Intentional dating with direction'
                  : currentUser?.intentions?.join(', ') || 'Set your direction'}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>

          <div className="row items-start">
            <span className="row-icon">
              <MapPin className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Location</span>
              <span className="row-sub block line-clamp-1">
                {[currentUser?.neighborhood, currentUser?.city, currentUser?.state].filter(Boolean).join(', ') || 'Add your area'}
              </span>
            </span>
          </div>
        </div>
      </section>
        </>
      )}

      {view === 'settings' && (
        <>
      {/* ---- Discovery --------------------------------------------------- */}
      <section className="mt-6">
        <h2 className="t-section mb-2 px-1">Discovery</h2>

        <div className="card card-pad space-y-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="row-title">Age range</span>
              <span className="font-['Space_Mono',monospace] text-[0.9375rem] text-[#B85A3C] font-bold">
                {minAgeInput}–{maxAgeInput}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-3">
                <span className="w-[4.5rem] shrink-0 text-[0.8125rem] text-[#6B665F]">Youngest</span>
                <input
                  aria-label="Minimum preferred age"
                  type="range"
                  min={18}
                  max={60}
                  value={minAgeInput}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setMinAgeInput(next);
                    if (next > maxAgeInput) setMaxAgeInput(next);
                  }}
                  className="flex-1 accent-[#B85A3C]"
                />
              </label>
              <label className="flex items-center gap-3">
                <span className="w-[4.5rem] shrink-0 text-[0.8125rem] text-[#6B665F]">Oldest</span>
                <input
                  aria-label="Maximum preferred age"
                  type="range"
                  min={18}
                  max={80}
                  value={maxAgeInput}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setMaxAgeInput(next);
                    if (next < minAgeInput) setMinAgeInput(next);
                  }}
                  className="flex-1 accent-[#B85A3C]"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-[#F0ECE6] pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={distanceEnabled}
              onClick={() => setDistanceEnabled((prev) => !prev)}
              className="switch-hit !px-0"
            >
              <span className="min-w-0 flex-1 text-left">
                <span className="row-title block">Limit by distance</span>
                <span className="row-sub block">Your exact coordinates are never shown to matches</span>
              </span>
              <span className={`switch ${distanceEnabled ? 'switch-on' : ''}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>

            {distanceEnabled && currentUser.hasPreciseLocation ? (
              <div className="mt-3 flex items-center gap-3">
                <input
                  aria-label="Maximum discovery distance in kilometres"
                  type="range"
                  min={5}
                  max={500}
                  step={5}
                  value={maxDistanceInput}
                  onChange={(e) => setMaxDistanceInput(Number(e.target.value))}
                  className="flex-1 accent-[#B85A3C]"
                />
                <span className="w-16 shrink-0 text-right text-[0.9375rem] font-semibold">{maxDistanceInput} km</span>
              </div>
            ) : distanceEnabled ? (
              <button
                type="button"
                onClick={capturePreciseLocation}
                disabled={locationBusy}
                className="btn btn-secondary btn-sm btn-block mt-3"
              >
                <MapPin className="w-4 h-4" />
                {locationBusy ? 'Getting location…' : 'Use device location'}
              </button>
            ) : null}
          </div>

          <div className="space-y-2">
            <button type="button" onClick={() => void saveDiscoveryPreferences()} className="btn btn-primary btn-block">
              Save discovery preferences
            </button>
            {currentUser.hasPreciseLocation ? (
              <button
                type="button"
                onClick={() => {
                  setDistanceEnabled(false);
                  void saveDiscoveryPreferences(null, false);
                }}
                className="w-full text-center text-[0.9375rem] font-semibold text-[#6B665F] py-1"
              >
                Remove saved location
              </button>
            ) : null}
            {locationStatus ? (
              <p role="status" className="t-tiny text-center">
                {locationStatus}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---- Trust & privacy --------------------------------------------- */}
      <section className="mt-6">
        <h2 className="t-section mb-2 px-1">Trust & privacy</h2>

        <div className="card card-flush">
          <div className="row">
            <span className="row-icon">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Identity check</span>
              <span className="row-sub block">ID and selfie reviewed by a moderator</span>
            </span>
            <span
              className={`pill shrink-0 ${
                currentUser?.verification?.status === 'verified'
                  ? 'bg-[#2C6B56]/10 text-[#2C6B56]'
                  : 'bg-[#F2EFEA] text-[#6B665F]'
              }`}
            >
              {currentUser?.verification?.status === 'verified' ? 'Verified' : 'Standard'}
            </span>
          </div>

          {currentUser?.phoneVerified ? (
            <div className="row">
              <span className="row-icon">
                <Phone className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="row-title block">Phone</span>
                <span className="row-sub block">Confirmed number on your account</span>
              </span>
              <span className="pill shrink-0 bg-[#2C6B56]/10 text-[#2C6B56]">Verified</span>
            </div>
          ) : (
            <button type="button" className="row" onClick={onVerifyPhone}>
              <span className="row-icon">
                <Phone className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="row-title block">Add a phone number</span>
                <span className="row-sub block">Optional — earns a trust badge</span>
              </span>
              <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
            </button>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={privacy.chatNotifications}
            className="switch-hit"
            onClick={toggleChatNotifications}
          >
            <span className="min-w-0 flex-1 text-left">
              <span className="row-title block">Chat & match alerts</span>
              <span className="row-sub block">Push alerts are not available yet</span>
            </span>
            <span className={`switch ${privacy.chatNotifications ? 'switch-on' : ''}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>

          {analyticsConfigured() && (
            <button
              type="button"
              role="switch"
              aria-checked={analyticsOn}
              className="switch-hit"
              onClick={toggleAnalytics}
            >
              <span className="row-icon">
                <BarChart3 className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="row-title block">Product analytics</span>
                <span className="row-sub block">Anonymous usage data that shows what to fix. Never your photos, messages or documents.</span>
              </span>
              <span className={`switch ${analyticsOn ? 'switch-on' : ''}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
          )}

          <button type="button" className="row" onClick={() => setShowBlockedModal(true)}>
            <span className="row-icon">
              <UserX className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Blocked accounts</span>
              <span className="row-sub block">
                {blockedUsersList.length === 0
                  ? 'No blocked accounts'
                  : `${blockedUsersList.length} blocked`}
              </span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>
        </div>
      </section>

      {/* ---- Appearance --------------------------------------------------- */}
      <section className="mt-6">
        <h2 className="t-section mb-2 px-1">Appearance</h2>

        <div className="card card-flush">
          <div className="row items-start">
            <span className="row-icon">
              <Moon className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Theme</span>
              <span className="row-sub block">System follows this device's light or dark setting.</span>
            </span>
          </div>

          <div role="radiogroup" aria-label="Theme" className="px-4 pb-4 grid grid-cols-3 gap-2">
            {([
              { value: 'system', label: 'System', Icon: Smartphone },
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon }
            ] as const).map(({ value, label, Icon }) => {
              const active = themePreference === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setThemePreference(value);
                    setThemePreferenceState(value);
                  }}
                  className={`min-h-[56px] rounded-xl border flex flex-col items-center justify-center gap-1 text-[0.8125rem] font-semibold transition-colors ${
                    active
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Account ------------------------------------------------------ */}
      <section className="mt-6">
        <h2 className="t-section mb-2 px-1">Account</h2>

        <div className="card card-flush">
          <div className="row items-start">
            <span className="row-icon">
              <Mail className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Signed in with</span>
              <span className="row-sub block break-all">
                {currentUser?.email || 'Email code, no password'}
              </span>
            </span>
          </div>

          <div className="row">
            <span className="min-w-0 flex-1">
              <span className="row-sub block font-['Space_Mono',monospace]">
                ID {currentUser?.id ? `${currentUser.id.slice(0, 8)}…` : '—'} · session active
              </span>
            </span>
          </div>

          <button type="button" className="row" onClick={() => setShowLogOutConfirm(true)}>
            <span className="row-icon">
              <LogOut className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block">Log out</span>
              <span className="row-sub block">End this session on this device</span>
            </span>
            <ChevronRight className="w-5 h-5 text-[#9C958D] shrink-0" />
          </button>

          <button
            type="button"
            className="row-danger"
            onClick={() => {
              setDeleteConfirmationText('');
              setShowDeleteConfirm(true);
            }}
          >
            <span className="row-icon text-[#9B2C2C]">
              <Trash2 className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="row-title block text-[#9B2C2C]">Delete account</span>
              <span className="row-sub block">Permanently remove your profile and data</span>
            </span>
            <ChevronRight className="w-5 h-5 shrink-0 opacity-60" />
          </button>
        </div>
      </section>
        </>
      )}

      {/* ============================================================ */}
      {/* MODAL: ADD PHOTO */}
      {/* ============================================================ */}
      {showAddPhotoModal && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-5">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-[#B85A3C]" />
                <h3 className="modal-title">
                  Add Profile Photo
                </h3>
              </div>
              <button
                onClick={() => setShowAddPhotoModal(false)}
                className="w-11 h-11 rounded-full bg-[#F7F5F0] text-[#6B665F] hover:text-[#1A1816] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Upload a real member photo */}
            <div className="space-y-2">
              <span className="font-['Space_Mono',monospace] text-[0.75rem] font-bold uppercase tracking-wider text-[#6B665F]">
                Your photo
              </span>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-[#B85A3C]/40 hover:border-[#B85A3C] bg-[#F5EAE5] text-[#B85A3C] font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Select from Phone or Computer</span>
              </button>
            </div>

            <p className="text-sm text-[#6B665F] leading-relaxed">
              Add photos of yourself. Photos of other people or stock images may be removed during safety review.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: FULLSCREEN PHOTO LIGHTBOX */}
      {/* ============================================================ */}
      {lightboxIndex !== null && currentUser && (currentUser.photos || []).length > 0 && (
        <PhotoViewer
          photos={currentUser.photos || []}
          initialIndex={lightboxIndex}
          name={currentUser.name}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: PREVIEW PROFILE AS SEEN BY MATCHES */}
      {/* ============================================================ */}
      {showPreviewModal && (
        <div className="sheet-backdrop">
          <div className="sheet flex max-h-[92dvh] flex-col overflow-hidden p-0">
            {/* The whole frame, never a crop — this is what a match sees. */}
            <div className="relative flex h-[clamp(15rem,42dvh,24rem)] w-full shrink-0 items-center justify-center bg-neutral-950">
              {primaryPhoto ? (
                <img
                  src={primaryPhoto}
                  alt={currentUser?.name || 'Preview'}
                  className="h-full w-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-[0.875rem] text-white/50">No photo yet</span>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              <button
                onClick={() => setShowPreviewModal(false)}
                className="absolute top-4 right-4 w-11 h-11 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute bottom-4 inset-x-5 text-white">
                <div className="flex items-end gap-2 mb-1.5 flex-wrap">
                  <h3 className="font-['Cormorant_Garamond',serif] text-[1.9rem] font-semibold leading-none">
                    {currentUser?.name}{currentUser?.age ? `, ${currentUser.age}` : ''}
                  </h3>
                  {currentUser?.verification?.status === 'verified' && (
                    <VerifiedMark size={19} variant="onPhoto" className="mb-0.5" />
                  )}
                </div>
                <p className="text-[0.78125rem] font-bold uppercase tracking-[0.15em] text-white/85">
                  {currentUser ? serviceLine(currentUser) : ''}
                </p>
                {currentUser && locationLine(currentUser) ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-white/70">
                    <MapPin className="h-3.5 w-3.5 text-white/50" />
                    {locationLine(currentUser)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
              {currentUser?.bio?.trim() ? (
                <div className="card card-pad">
                  <h4 className="t-section mb-2">In their words</h4>
                  <p className="text-[0.9375rem] leading-relaxed text-ink">{currentUser.bio}</p>
                </div>
              ) : null}

              {currentUser?.intentions && currentUser.intentions.length > 0 && (
                <div className="card card-pad">
                  <h4 className="t-section mb-2">Looking for</h4>
                  <p className="text-[0.9375rem] font-medium capitalize text-brand">
                    {currentUser.intentions.join(', ')}
                  </p>
                </div>
              )}

              {currentUser?.interests && currentUser.interests.length > 0 && (
                <div className="card card-pad">
                  <h4 className="t-section mb-2.5">Hobbies</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentUser.interests.map((tag, i) => (
                      <span
                        key={`${tag}-${i}`}
                        className="rounded-full border border-line bg-surface px-3 py-1.5 text-[0.8125rem] font-medium text-ink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {currentUser?.photos && currentUser.photos.length > 1 && (
                <div className="card card-pad">
                  <h4 className="t-section mb-2.5">More photos</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {currentUser.photos.slice(1).map((p, i) => (
                      <img
                        key={i}
                        src={p}
                        alt="Profile photo"
                        className="aspect-[3/4] rounded-xl border border-line object-cover object-[50%_30%]"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowPreviewModal(false)}
                className="btn btn-primary btn-block mt-1"
              >
                Back to profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT BIO */}
      {/* ============================================================ */}
      {showEditBioModal && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="modal-title">
                Edit About Me
              </h3>
              <button
                onClick={() => setShowEditBioModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-sm text-[#6B665F]">
              Share what brings you joy, your passions, or a fun conversation starter.
            </p>

            <textarea
              rows={4}
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
              placeholder="e.g. Caring, ambitious, love Sunday brunches, tech, and deep conversations..."
              className="w-full p-3.5 rounded-xl border border-[#E8E4DC] text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
              maxLength={300}
            />
            <div className="flex justify-between items-center text-[0.75rem] text-[#9C958D] font-['Space_Mono',monospace]">
              <span>Max 300 characters</span>
              <span>{bioInput.length}/300</span>
            </div>

            <button
              onClick={handleSaveBio}
              className="btn btn-primary btn-block"
            >
              Save Bio
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT CAREER & LOCATION */}
      {/* ============================================================ */}
      {showEditCareerModal && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="modal-title">
                Career & Location
              </h3>
              <button
                onClick={() => setShowEditCareerModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              {!isUniformedCategory(currentUser?.professionCategory || '') && (
                <div>
                  <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                    Profession / Job Title
                  </label>
                  <input
                    type="text"
                    value={professionTitleInput}
                    onChange={(e) => setProfessionTitleInput(e.target.value)}
                    placeholder="e.g. Medical Doctor, Software Engineer, Architect"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                  />
                </div>
              )}

              {!isUniformedCategory(currentUser?.professionCategory || '') && (
                <div>
                  <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                    Company / Organization
                  </label>
                <input
                  type="text"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                    placeholder="e.g. Lagos Island General Hospital, Tech Firm, Studio"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                  />
                </div>
              )}

              {isUniformedCategory(currentUser?.professionCategory || '') && (
                <div>
                <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                  Cadre
                </label>
                <p className="mb-1.5 text-[0.75rem] leading-relaxed text-[#9C958D]">
                  We never show rank — only whether you are commissioned or non-commissioned.
                </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ORG_ROLES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setOrgRoleInput(value)}
                        className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                          orgRoleInput === value
                            ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                            : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/40'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                  Skill / Trade <span className="font-normal text-[#9C958D]">(optional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {skillsForCategory(currentUser?.professionCategory || 'Others').map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSkillInput(skillInput === s ? '' : s)}
                      className={`px-3 py-1.5 rounded-full border text-[0.75rem] font-medium transition-colors ${
                        skillInput === s
                          ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                          : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/40'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                  Alma Mater / University
                </label>
                <input
                  type="text"
                  value={almaMaterInput}
                  onChange={(e) => setAlmaMaterInput(e.target.value)}
                  placeholder="e.g. University of Lagos (UNILAG), UI, ABU"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    placeholder="e.g. Lagos, Abuja"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                  />
                </div>
                <div>
                  <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={stateInput}
                    onChange={(e) => setStateInput(e.target.value)}
                    placeholder="e.g. Lagos, FCT"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[0.8125rem] font-bold text-[#6B665F] block mb-1">
                  Neighborhood / District
                </label>
                <input
                  type="text"
                  value={neighborhoodInput}
                  onChange={(e) => setNeighborhoodInput(e.target.value)}
                  placeholder="e.g. Lekki Phase 1, Maitama, Ikeja GRA, Yaba"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8E4DC] text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                />
              </div>
            </div>

            <button
              onClick={handleSaveCareer}
              className="btn btn-primary btn-block mt-2"
            >
              Save Details
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT DATING INTENTIONS */}
      {/* ============================================================ */}
      {showEditIntentionsModal && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="modal-title">
                Dating Intentions
              </h3>
              <button
                onClick={() => setShowEditIntentionsModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-sm text-[#6B665F]">
              Honesty about your relationship direction helps connect you with genuine partners.
            </p>

            <div className="space-y-2.5 text-sm">
              {[
                { id: 'marriage', icon: <Gem className="w-4 h-4 shrink-0" />, label: 'Marriage / Long-term Life Partner' },
                { id: 'long_term', icon: <Heart className="w-4 h-4 shrink-0" />, label: 'Serious relationship leading to marriage' },
                { id: 'intentional', icon: <Target className="w-4 h-4 shrink-0" />, label: 'Intentional dating with clear direction' },
                { id: 'exploring', icon: <Compass className="w-4 h-4 shrink-0" />, label: 'Open to exploring a genuine connection' }
              ].map((opt) => (
                <div
                  key={opt.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDatingGoalInput(opt.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDatingGoalInput(opt.id);
                    }
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    datingGoalInput === opt.id
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#B85A3C] font-semibold'
                      : 'border-[#E8E4DC] bg-[#F7F5F0] text-[#1A1816] hover:bg-[#FFFFFF]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {opt.icon}
                    <span>{opt.label}</span>
                  </span>
                  {datingGoalInput === opt.id && <Check className="w-4 h-4 stroke-[3] shrink-0" />}
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveIntentions}
              className="btn btn-primary btn-block mt-2"
            >
              Update Intention
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT PROMPTS */}
      {/* ============================================================ */}
      {showEditPromptsModal && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="modal-title">
                Profile Prompts
              </h3>
              <button
                onClick={() => setShowEditPromptsModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-sm font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>

            <p className="text-sm text-[#6B665F]">
              Prompts show off your personality, conversational warmth, and lifestyle values.
            </p>

            <div className="space-y-3.5 text-xs">
              {POPULAR_PROMPTS.slice(0, 4).map((promptQuestion, idx) => {
                const existing = currentUser?.prompts?.find((p) => p.question === promptQuestion);
                return (
                  <div key={idx} className="p-3.5 bg-[#F7F5F0] border border-[#E8E4DC] rounded-xl space-y-2">
                    <span className="font-['Space_Mono',monospace] text-[0.75rem] font-bold text-[#B85A3C] uppercase tracking-wider block">
                      {promptQuestion}
                    </span>
                    <input
                      type="text"
                      defaultValue={existing?.answer || ''}
                      placeholder="Type your answer..."
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        const currentPrompts = [...(currentUser?.prompts || [])];
                        const existingIdx = currentPrompts.findIndex((p) => p.question === promptQuestion);
                        if (val) {
                          if (existingIdx >= 0) {
                            currentPrompts[existingIdx].answer = val;
                          } else {
                            currentPrompts.push({
                              id: `prompt-${Date.now()}-${idx}`,
                              question: promptQuestion,
                              answer: val
                            });
                          }
                        } else if (existingIdx >= 0) {
                          currentPrompts.splice(existingIdx, 1);
                        }
                        if (onUpdateUser && currentUser) {
                          onUpdateUser({ ...currentUser, prompts: currentPrompts });
                        }
                      }}
                      className="w-full px-3.5 py-2 rounded-lg border border-[#E8E4DC] bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#B85A3C]"
                    />
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowEditPromptsModal(false)}
              className="btn btn-primary btn-block"
            >
              Save Prompts
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: BLOCKED USERS */}
      {/* ============================================================ */}
      {showBlockedModal && (
        <div className="sheet-backdrop">
          <div className="sheet">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <div className="flex items-center gap-2.5">
                <UserX className="w-5 h-5 text-[#9B2C2C]" />
                <h3 className="modal-title">
                  Blocked Contacts
                </h3>
              </div>
              <button
                onClick={() => setShowBlockedModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-sm font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>

            {blockedUsersList.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B665F] space-y-2">
                <ShieldCheck className="w-8 h-8 text-[#2C6B56] mx-auto opacity-70" />
                <p className="font-semibold text-[#1A1816]">No blocked contacts</p>
                <p className="text-[0.8125rem] text-[#9C958D]">
                  You can block contacts from any chat screen or safety report.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {blockedUsersList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center justify-between"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-[#1A1816]">{item.name}</h4>
                      {item.reason && (
                        <p className="text-[0.75rem] text-[#6B665F]">{item.reason}</p>
                      )}
                    </div>
                    {onUnblockUser && (
                      <button
                        onClick={() => onUnblockUser(item.id)}
                        className="px-3 py-1 rounded-full text-[0.8125rem] font-semibold text-[#9B2C2C] bg-[#9B2C2C]/10 hover:bg-[#9B2C2C]/20 transition-colors cursor-pointer"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: LOG OUT CONFIRMATION */}
      {/* ============================================================ */}
      {showLogOutConfirm && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F5EAE5] border border-[#E8D5CD] text-[#B85A3C] flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <h3 className="modal-title">
              Log out of WASSAA?
            </h3>
            <p className="text-xs text-[#6B665F] leading-relaxed">
              Your lookbook profile, photos, and messages are securely saved. You can log back in at any time.
            </p>

            <div className="flex gap-2.5 pt-3">
              <button
                onClick={() => setShowLogOutConfirm(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogOutConfirm(false);
                  if (onLogOut) onLogOut();
                  else if (onSignOut) onSignOut();
                }}
                className="btn btn-primary flex-1"
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: DELETE ACCOUNT CONFIRMATION */}
      {/* ============================================================ */}
      {showDeleteConfirm && (
        <div className="sheet-backdrop">
          <div className="sheet space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#9B2C2C]/10 border border-[#9B2C2C]/20 text-[#9B2C2C] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="modal-title text-[#9B2C2C]">
                Remove Account?
              </h3>
              <p className="text-xs text-[#6B665F] mt-1.5 leading-relaxed">
                This hides your profile and ends your current session. Some account and transaction records may be retained for safety, legal, or payment reasons. Contact support to request data erasure.
              </p>
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <label className="font-['Space_Mono',monospace] text-[0.75rem] font-bold text-[#6B665F] block uppercase">
                Type <strong className="text-[#9B2C2C]">DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                placeholder="Type DELETE"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-[#9B2C2C]/40 bg-[#9B2C2C]/5 text-xs font-['Space_Mono',monospace] focus:outline-none focus:ring-1 focus:ring-[#9B2C2C]"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmationText('');
                }}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirmationText.trim() === 'DELETE') {
                    setShowDeleteConfirm(false);
                    if (onDeleteAccount) onDeleteAccount();
                  }
                }}
                disabled={deleteConfirmationText.trim() !== 'DELETE'}
                className="btn btn-danger flex-1 disabled:opacity-40"
              >
                Remove Account
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export const ProfileScreen = SettingsPrivacyScreen;
