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
  Sparkles,
  Phone
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

interface BlockedItem {
  id: string;
  name: string;
  reason?: string;
  date?: string;
}

interface SettingsPrivacyScreenProps {
  currentUser: UserProfile;
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
  blockedUsersList = [],
  onUpdatePrivacy,
  onOpenUpgrade,
  onUnblockUser,
  onSignOut,
  onUpdateUser,
  onDeleteAccount,
  onLogOut,
  onVerifyPhone
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
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);

  // Form states for inline editing
  const [bioInput, setBioInput] = useState(currentUser?.bio || '');
  const [professionTitleInput, setProfessionTitleInput] = useState(currentUser?.professionTitle || '');
  const [companyInput, setCompanyInput] = useState(currentUser?.companyOrOrg || '');
  const [almaMaterInput, setAlmaMaterInput] = useState(currentUser?.almaMater || '');
  const [cityInput, setCityInput] = useState(currentUser?.city || '');
  const [stateInput, setStateInput] = useState(currentUser?.state || '');
  const [neighborhoodInput, setNeighborhoodInput] = useState(currentUser?.neighborhood || '');
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

  // Privacy toggles
  const [privacy, setPrivacy] = useState(currentUser?.privacy || {
    serviceVisibility: 'matches' as VisibilitySetting,
    rankVisibility: 'private' as VisibilitySetting,
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
      onUpdateUser({
        ...currentUser,
        professionTitle: professionTitleInput.trim() || currentUser.professionTitle,
        companyOrOrg: companyInput.trim(),
        almaMater: almaMaterInput.trim(),
        city: cityInput.trim() || currentUser.city,
        state: stateInput.trim() || currentUser.state,
        neighborhood: neighborhoodInput.trim()
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
    <div className="w-full min-h-screen bg-[#F7F5F0] text-[#1A1816] font-['Plus_Jakarta_Sans',sans-serif] pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-[#E8E4DC] px-4 py-3.5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-bold tracking-tight text-[#1A1816]">
              Profile & Settings
            </h1>
            {currentUser?.verification?.status === 'verified' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#2C6B56]/10 text-[#2C6B56] text-[11px] font-semibold font-['Space_Mono',monospace] tracking-wider uppercase border border-[#2C6B56]/20">
                <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                Verified
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreviewModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FFFFFF] border border-[#E8E4DC] text-xs font-semibold text-[#B85A3C] hover:bg-[#F5EAE5] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Card</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container: Clean Sectioned Layout */}
      <main className="max-w-2xl mx-auto px-4 py-6 sm:py-8 space-y-8">

        {/* PROFILE OVERVIEW HERO */}
        <section className="p-5 sm:p-6 bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] flex items-center gap-4 sm:gap-6">
          <div className="relative group shrink-0">
            {primaryPhoto ? (
              <img src={primaryPhoto} alt={currentUser?.name || 'Profile photo'} className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-2 ring-[#B85A3C]/20 shadow-[0_1px_3px_rgba(0,0,0,0.06)] cursor-pointer" onClick={() => setLightboxPhotoUrl(primaryPhoto)} referrerPolicy="no-referrer" />
            ) : (
              <div aria-label="No profile photo added" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#F5EAE5] ring-2 ring-[#B85A3C]/20 flex items-center justify-center text-[#B85A3C]"><UserX className="w-7 h-7" /></div>
            )}
            <button
              onClick={() => setShowAddPhotoModal(true)}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#B85A3C] text-white flex items-center justify-center shadow-md hover:bg-[#A04E33] transition-colors cursor-pointer"
              title="Add or Change Photo"
              aria-label="Add or change photo"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="font-['Cormorant_Garamond',serif] text-xl sm:text-2xl font-bold text-[#1A1816] truncate">
              {currentUser?.name}{currentUser?.age ? `, ${currentUser.age}` : ''}
            </h2>
            <p className="text-xs sm:text-sm text-[#6B665F] truncate mt-0.5">
              {currentUser?.professionTitle}
              {currentUser?.companyOrOrg ? ` · ${currentUser.companyOrOrg}` : ''}
              {currentUser?.city ? ` · ${currentUser.city}` : ''}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-wider text-[#9C958D]">
                {(currentUser?.photos || []).length} of 6 photos added
              </span>
            </div>
          </div>

          <button
            onClick={onOpenUpgrade}
            className="px-3.5 py-1.5 rounded-full bg-[#F5EAE5] border border-[#E8D5CD] text-xs font-bold text-[#B85A3C] hover:bg-[#B85A3C] hover:text-white transition-all shrink-0 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          >
            Upgrade
          </button>
        </section>

        {/* ============================================================ */}
        {/* SECTION 1: PROFILE PHOTOS */}
        {/* ============================================================ */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#6B665F] uppercase block">
                01 / Profile Photos
              </span>
              <p className="text-xs text-[#6B665F] mt-0.5">
                Curate up to 6 photos. Select star to designate your main lookbook portrait.
              </p>
            </div>

            <button
              onClick={() => setShowAddPhotoModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#B85A3C] text-white text-xs font-semibold hover:bg-[#A04E33] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Add Photo</span>
            </button>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-4 sm:p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)]">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
              {Array.from({ length: 6 }).map((_, index) => {
                const photoUrl = currentUser?.photos?.[index];
                const isPrimary = index === 0;

                if (photoUrl) {
                  return (
                    <div 
                      key={index} 
                      className="relative aspect-[3/4] rounded-xl overflow-hidden border border-[#E8E4DC] bg-[#F7F5F0] group shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    >
                      <img
                        src={photoUrl}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                        onClick={() => setLightboxPhotoUrl(photoUrl)}
                        referrerPolicy="no-referrer"
                      />

                      {/* Primary Portrait Badge */}
                      {isPrimary && (
                        <div className="absolute top-1.5 left-1.5 bg-[#B85A3C] text-white px-2 py-0.5 rounded-full text-[9px] font-['Space_Mono',monospace] font-bold uppercase tracking-wider flex items-center gap-1 shadow-xs">
                          <Star className="w-2.5 h-2.5 fill-white" />
                          <span>Main</span>
                        </div>
                      )}

                      {/* Action Controls Bar */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity">
                        {!isPrimary && (
                          <button
                            onClick={() => handleMakePrimaryPhoto(index)}
                            className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-amber-300 backdrop-blur-xs transition-colors cursor-pointer"
                            title="Set as main portrait"
                            aria-label="Set as main portrait"
                          >
                            <Star className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => setLightboxPhotoUrl(photoUrl)}
                          className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white backdrop-blur-xs transition-colors cursor-pointer ml-auto mr-1"
                          title="View enlarged"
                          aria-label="View enlarged"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeletePhoto(index)}
                          className="p-1 rounded-md bg-[#9B2C2C]/80 hover:bg-[#9B2C2C] text-white backdrop-blur-xs transition-colors cursor-pointer"
                          title="Delete photo"
                          aria-label="Delete photo"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                }

                // Empty Slot
                return (
                  <button
                    key={index}
                    onClick={() => setShowAddPhotoModal(true)}
                    className="aspect-[3/4] rounded-xl border-2 border-dashed border-[#E8E4DC] hover:border-[#B85A3C] bg-[#F7F5F0] hover:bg-[#F5EAE5] flex flex-col items-center justify-center gap-1.5 text-[#6B665F] hover:text-[#B85A3C] transition-colors cursor-pointer"
                    aria-label="Upload photo to empty slot"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#FFFFFF] border border-[#E8E4DC] flex items-center justify-center shadow-xs">
                      <Plus className="w-4 h-4" />
                    </div>
                    <span className="font-['Space_Mono',monospace] text-[10px] font-medium uppercase">Slot {index + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 2: BIO & PROMPTS */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <div className="px-1">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#6B665F] uppercase block">
              02 / Bio & Prompts
            </span>
            <p className="text-xs text-[#6B665F] mt-0.5">
              Personalize your narrative with editorial prompts and a rich biography.
            </p>
          </div>

          {/* BIO CARD */}
          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E4DC]">
              <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F]">
                About Me / Bio
              </span>
              <button
                onClick={() => {
                  setBioInput(currentUser?.bio || '');
                  setShowEditBioModal(true);
                }}
                className="text-xs font-semibold text-[#B85A3C] hover:text-[#A04E33] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Bio</span>
              </button>
            </div>
            <p className="text-sm text-[#1A1816] leading-relaxed italic bg-[#F7F5F0] p-4 rounded-xl border border-[#E8E4DC]">
              "{currentUser?.bio || "No bio added yet. Tell prospective matches about what you love and what makes you unique."}"
            </p>
          </div>

          {/* PROMPTS CARD */}
          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E4DC]">
              <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F]">
                Editorial Prompts & Starters
              </span>
              <button
                onClick={() => setShowEditPromptsModal(true)}
                className="text-xs font-semibold text-[#B85A3C] hover:text-[#A04E33] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Prompts</span>
              </button>
            </div>

            {currentUser?.prompts && currentUser.prompts.length > 0 ? (
              <div className="space-y-3">
                {currentUser.prompts.map((p) => (
                  <div key={p.id} className="p-4 bg-[#F7F5F0] border border-[#E8E4DC] rounded-xl space-y-1">
                    <span className="font-['Space_Mono',monospace] text-[11px] font-bold text-[#B85A3C] uppercase tracking-wider block">
                      {p.question}
                    </span>
                    <p className="font-['Cormorant_Garamond',serif] text-lg font-semibold text-[#1A1816] italic leading-snug">
                      "{p.answer}"
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-[#F7F5F0] border border-dashed border-[#E8E4DC] rounded-xl text-center space-y-2">
                <p className="text-xs text-[#6B665F]">No conversation prompts added yet.</p>
                <button
                  onClick={() => setShowEditPromptsModal(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#B85A3C] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add your first prompt</span>
                </button>
              </div>
            )}
          </div>

          {/* PASSIONS & INTERESTS */}
          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F] block">
              Passions & Interests
            </span>
            <div className="flex flex-wrap gap-2">
              {(currentUser?.interests || ['Fitness', 'Culinary Arts', 'Architecture', 'Literature', 'Travel']).map((item) => (
                <span
                  key={item}
                  className="px-3.5 py-1.5 rounded-full bg-[#F7F5F0] border border-[#E8E4DC] text-xs font-medium text-[#1A1816] shadow-2xs"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-4">
            <div>
              <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F]">Discovery & Distance</span>
              <p className="mt-1 text-xs leading-relaxed text-[#6B665F]">Your exact device coordinates stay private. Distance is calculated on the server and shown in 5 km increments.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1A1816] mb-2">Preferred age range: {minAgeInput}–{maxAgeInput}</label>
              <div className="space-y-3">
                <input aria-label="Minimum preferred age" type="range" min={18} max={60} value={minAgeInput} onChange={(e) => { const next = Number(e.target.value); setMinAgeInput(next); if (next > maxAgeInput) setMaxAgeInput(next); }} className="w-full accent-[#B85A3C]" />
                <input aria-label="Maximum preferred age" type="range" min={18} max={80} value={maxAgeInput} onChange={(e) => { const next = Number(e.target.value); setMaxAgeInput(next); if (next < minAgeInput) setMinAgeInput(next); }} className="w-full accent-[#B85A3C]" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#1A1816]">
              <input type="checkbox" checked={distanceEnabled} onChange={(e) => setDistanceEnabled(e.target.checked)} className="h-4 w-4 accent-[#B85A3C]" />
              Limit discovery by distance
            </label>
            {distanceEnabled && currentUser.hasPreciseLocation ? (
              <div className="flex items-center gap-3">
                <input aria-label="Maximum discovery distance in kilometres" type="range" min={5} max={500} step={5} value={maxDistanceInput} onChange={(e) => setMaxDistanceInput(Number(e.target.value))} className="flex-1 accent-[#B85A3C]" />
                <span className="w-20 text-right text-xs font-semibold text-[#1A1816]">{maxDistanceInput} km</span>
              </div>
            ) : distanceEnabled ? (
              <button type="button" onClick={capturePreciseLocation} disabled={locationBusy} className="rounded-full border border-[#E8E4DC] px-4 py-2 text-xs font-semibold text-[#1A1816] disabled:opacity-50">
                {locationBusy ? 'Getting location…' : 'Use device location'}
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveDiscoveryPreferences()} className="rounded-full bg-[#B85A3C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#A04E33]">Save preferences</button>
              {currentUser.hasPreciseLocation && <button type="button" onClick={() => { setDistanceEnabled(false); void saveDiscoveryPreferences(null, false); }} className="rounded-full border border-[#E8E4DC] px-4 py-2 text-xs font-semibold text-[#6B665F]">Remove precise location</button>}
            </div>
            {locationStatus && <p role="status" className="text-xs text-[#6B665F]">{locationStatus}</p>}
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 3: PREFERENCES */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <div className="px-1">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#6B665F] uppercase block">
              03 / Preferences & Details
            </span>
            <p className="text-xs text-[#6B665F] mt-0.5">
              Specify your dating goals, career, alma mater, and geographic residence.
            </p>
          </div>

          {/* DATING INTENTIONS CARD */}
          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E4DC]">
              <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F]">
                Dating Intentions & Direction
              </span>
              <button
                onClick={() => {
                  setDatingGoalInput(currentUser?.datingGoal || 'marriage');
                  setShowEditIntentionsModal(true);
                }}
                className="text-xs font-semibold text-[#B85A3C] hover:text-[#A04E33] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="flex items-center gap-3 p-3.5 bg-[#F5EAE5] border border-[#E8D5CD] rounded-xl text-xs sm:text-sm font-semibold text-[#B85A3C]">
              <Heart className="w-4 h-4 fill-[#B85A3C] shrink-0" />
              <span>
                {currentUser?.datingGoal === 'marriage' 
                  ? '💍 Looking for Marriage / Life Partner' 
                  : currentUser?.datingGoal === 'long_term' 
                  ? '❤️ Serious relationship leading to marriage'
                  : currentUser?.datingGoal === 'intentional'
                  ? '✨ Intentional dating with clear direction'
                  : currentUser?.intentions?.join(', ') || 'Intentional Dating & Connection'}
              </span>
            </div>
          </div>

          {/* CAREER, EDUCATION & LOCATION CARD */}
          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E4DC]">
              <span className="font-['Space_Mono',monospace] text-[11px] font-semibold uppercase tracking-wider text-[#6B665F]">
                Career, Education & Location
              </span>
              <button
                onClick={() => {
                  setProfessionTitleInput(currentUser?.professionTitle || '');
                  setCompanyInput(currentUser?.companyOrOrg || '');
                  setAlmaMaterInput(currentUser?.almaMater || '');
                  setCityInput(currentUser?.city || '');
                  setStateInput(currentUser?.state || '');
                  setNeighborhoodInput(currentUser?.neighborhood || '');
                  setShowEditCareerModal(true);
                }}
                className="text-xs font-semibold text-[#B85A3C] hover:text-[#A04E33] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs sm:text-sm">
              <div className="flex items-center gap-3 text-[#1A1816]">
                <Briefcase className="w-4 h-4 text-[#B85A3C] shrink-0" />
                <div>
                  <span className="font-semibold block">{currentUser?.professionTitle}</span>
                  {currentUser?.companyOrOrg && (
                    <span className="text-[#6B665F] text-xs">{currentUser.companyOrOrg}</span>
                  )}
                </div>
              </div>

              {currentUser?.almaMater && (
                <div className="flex items-center gap-3 text-[#1A1816]">
                  <GraduationCap className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="font-semibold block">{currentUser.almaMater}</span>
                    <span className="text-[#6B665F] text-xs">Higher Education</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-[#1A1816]">
                <MapPin className="w-4 h-4 text-[#B85A3C] shrink-0" />
                <div>
                  <span className="font-semibold block">
                    {[currentUser?.neighborhood, currentUser?.city].filter(Boolean).join(', ')}
                  </span>
                  <span className="text-[#6B665F] text-xs">{currentUser?.state || 'Nigeria'}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 4: PRIVACY */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <div className="px-1">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#6B665F] uppercase block">
              04 / Privacy & Controls
            </span>
            <p className="text-xs text-[#6B665F] mt-0.5">
              Manage your notifications, verification badge, and blocked users.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl divide-y divide-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)]">
            {/* Identity Verification Item */}
            <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#2C6B56]/10 text-[#2C6B56] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-[#1A1816] block">
                    Identity Check Status
                  </span>
                  <span className="text-[11px] text-[#6B665F]">
                    ID and selfie reviewed by a WASSAA moderator
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#2C6B56]/10 text-[#2C6B56] text-[10px] font-['Space_Mono',monospace] font-bold tracking-wider uppercase border border-[#2C6B56]/20 shrink-0">
                {currentUser?.verification?.status === 'verified' ? 'Verified' : 'Standard'}
              </span>
            </div>

            {/* Optional Phone Verification */}
            <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-[#1A1816] block">
                    Phone Verification
                  </span>
                  <span className="text-[11px] text-[#6B665F]">
                    {currentUser?.phoneVerified
                      ? 'Your mobile number is confirmed'
                      : 'Optional — a confirmed number earns a trust badge'}
                  </span>
                </div>
              </div>
              {currentUser?.phoneVerified ? (
                <span className="px-2.5 py-1 rounded-full bg-[#2C6B56]/10 text-[#2C6B56] text-[10px] font-['Space_Mono',monospace] font-bold tracking-wider uppercase border border-[#2C6B56]/20 shrink-0">
                  Verified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onVerifyPhone}
                  className="px-3.5 py-2 rounded-full border border-[#E8E4DC] hover:bg-[#F7F5F0] text-xs font-semibold text-[#1A1816] transition-colors cursor-pointer shrink-0"
                >
                  Add phone
                </button>
              )}
            </div>

            {/* Chat Notifications Toggle */}
            <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-[#1A1816] block">
                    Chat & Match Notifications
                  </span>
                  <span className="text-[11px] text-[#6B665F]">
                    Save your notification preference. Push alerts are not currently available.
                  </span>
                </div>
              </div>
              <button
                onClick={toggleChatNotifications}
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  privacy.chatNotifications ? 'bg-[#B85A3C]' : 'bg-[#E8E4DC]'
                }`}
                aria-label="Toggle chat notifications"
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 shadow-xs ${
                    privacy.chatNotifications ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* Blocked Contacts Trigger */}
            <div
              onClick={() => setShowBlockedModal(true)}
              className="p-4 sm:p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F7F5F0] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#F7F5F0] text-[#6B665F] flex items-center justify-center shrink-0">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs sm:text-sm font-semibold text-[#1A1816] block">
                    Blocked Contacts
                  </span>
                  <span className="text-[11px] text-[#6B665F]">
                    {blockedUsersList.length === 0
                      ? 'No blocked accounts'
                      : `${blockedUsersList.length} contact${blockedUsersList.length > 1 ? 's' : ''} blocked`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {blockedUsersList.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#9B2C2C]/10 text-[#9B2C2C] text-[10px] font-['Space_Mono',monospace] font-bold">
                    {blockedUsersList.length}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-[#9C958D]" />
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 5: ACCOUNT */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <div className="px-1">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#6B665F] uppercase block">
              05 / Account & Membership
            </span>
            <p className="text-xs text-[#6B665F] mt-0.5">
              Manage your authenticated session and subscription tier.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E8E4DC] rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-4">
            {/* Membership Upgrade Banner */}
            <div className="p-4 rounded-xl bg-[#F5EAE5] border border-[#E8D5CD] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="font-['Space_Mono',monospace] text-[10px] font-bold uppercase tracking-wider text-[#B85A3C] block">
                  WASSAA Membership
                </span>
                <p className="text-xs sm:text-sm font-semibold text-[#1A1816]">
                  Unlimited likes, spotlight boosts & intentional matching
                </p>
              </div>
              <button
                onClick={onOpenUpgrade}
                className="px-4 py-2 rounded-full bg-[#B85A3C] text-white text-xs font-bold hover:bg-[#A04E33] transition-colors shrink-0 shadow-xs cursor-pointer text-center"
              >
                View Plans
              </button>
            </div>

            {/* Account & Session */}
            <div className="pt-2">
              <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-wider text-[#6B665F] block mb-2">
                Account & Session
              </span>

              <div className="p-3.5 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] space-y-2">
                <div className="text-xs">
                  <span className="text-[#6B665F] block text-[11px]">Signed in with:</span>
                  <span className="font-bold text-[#1A1816] break-all">
                    {currentUser?.email || 'Mobile number + one-time code'}
                  </span>
                  {currentUser?.email && (
                    <span className="text-[10px] text-[#9C958D]">Email code, no password</span>
                  )}
                </div>
                <div className="pt-2 border-t border-[#E8E4DC] flex items-center justify-between">
                  <span className="text-[10px] text-[#9C958D] font-['Space_Mono',monospace]">
                    ID: {currentUser?.id ? `${currentUser.id.slice(0, 8)}…` : '—'}
                  </span>
                  <span className="text-[10px] text-[#2C6B56] font-['Space_Mono',monospace] font-bold">
                    SESSION ACTIVE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* SECTION 6: DANGER ZONE */}
        {/* ============================================================ */}
        <section className="space-y-4">
          <div className="px-1">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#9B2C2C] uppercase flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              06 / Danger Zone
            </span>
            <p className="text-xs text-[#6B665F] mt-0.5">
              Session termination and permanent account deletion.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#9B2C2C]/20 rounded-2xl p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-4 divide-y divide-[#E8E4DC]">
            {/* Log Out */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div>
                <h3 className="text-sm font-bold text-[#1A1816]">Log Out</h3>
                <p className="text-xs text-[#6B665F] mt-0.5">Sign out of your active session on this device</p>
              </div>
              <button
                onClick={() => setShowLogOutConfirm(true)}
                className="px-4 py-2 rounded-full border border-[#E8E4DC] hover:bg-[#F7F5F0] text-xs font-semibold text-[#1A1816] flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-[#B85A3C]" />
                <span>Log Out</span>
              </button>
            </div>

            {/* Delete Account */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
              <div>
                <h3 className="text-sm font-bold text-[#9B2C2C]">Delete Account</h3>
                <p className="text-xs text-[#6B665F] mt-0.5">Hide your profile and end your current session</p>
              </div>
              <button
                onClick={() => {
                  setDeleteConfirmationText('');
                  setShowDeleteConfirm(true);
                }}
                className="px-4 py-2 rounded-full bg-[#9B2C2C]/10 hover:bg-[#9B2C2C]/20 border border-[#9B2C2C]/30 text-xs font-semibold text-[#9B2C2C] flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#9B2C2C]" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* ============================================================ */}
      {/* MODAL: ADD PHOTO */}
      {/* ============================================================ */}
      {showAddPhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-[#B85A3C]" />
                <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                  Add Profile Photo
                </h3>
              </div>
              <button
                onClick={() => setShowAddPhotoModal(false)}
                className="w-8 h-8 rounded-full bg-[#F7F5F0] text-[#6B665F] hover:text-[#1A1816] flex items-center justify-center cursor-pointer transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Upload a real member photo */}
            <div className="space-y-2">
              <span className="font-['Space_Mono',monospace] text-[10px] font-bold uppercase tracking-wider text-[#6B665F]">
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
                className="w-full py-3.5 px-4 rounded-xl border-2 border-dashed border-[#B85A3C]/40 hover:border-[#B85A3C] bg-[#F5EAE5] text-[#B85A3C] font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Select from Phone or Computer</span>
              </button>
            </div>

            <p className="text-[11px] text-[#6B665F] leading-relaxed">
              Add photos of yourself. Photos of other people or stock images may be removed during safety review.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: FULLSCREEN PHOTO LIGHTBOX */}
      {/* ============================================================ */}
      {lightboxPhotoUrl && (
        <div 
          onClick={() => setLightboxPhotoUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-lg max-h-[85vh] flex flex-col items-center">
            <img
              src={lightboxPhotoUrl}
              alt="Enlarged photo"
              className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => setLightboxPhotoUrl(null)}
              className="mt-3 px-5 py-2 rounded-full bg-white/20 text-white text-xs font-bold hover:bg-white/30 backdrop-blur-md transition-colors"
            >
              Close Lightbox
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: PREVIEW PROFILE AS SEEN BY MATCHES */}
      {/* ============================================================ */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl overflow-hidden shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] flex flex-col max-h-[90vh]">
            <div className="relative h-72 sm:h-80 w-full bg-neutral-900 shrink-0">
              <img
                src={primaryPhoto}
                alt={currentUser?.name || 'Preview'}
                className="w-full h-full object-cover object-top"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <button
                onClick={() => setShowPreviewModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="absolute bottom-4 inset-x-5 text-white">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-bold">
                    {currentUser?.name}{currentUser?.age ? `, ${currentUser.age}` : ''}
                  </h3>
                  {currentUser?.verification?.status === 'verified' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/90 text-[#2C6B56] text-[10px] font-['Space_Mono',monospace] font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-3 h-3 stroke-[2.5]" />
                      Verified
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-white/90">
                  {currentUser?.professionTitle} · {currentUser?.city || 'Lagos'}
                </p>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="bg-[#F7F5F0] p-4 rounded-xl border border-[#E8E4DC]">
                <h4 className="font-['Space_Mono',monospace] font-bold text-[10px] uppercase text-[#6B665F] mb-1.5 tracking-wider">
                  About Me
                </h4>
                <p className="text-[#1A1816] leading-relaxed italic text-xs sm:text-sm">
                  "{currentUser?.bio}"
                </p>
              </div>

              {currentUser?.intentions && (
                <div className="bg-[#F7F5F0] p-4 rounded-xl border border-[#E8E4DC]">
                  <h4 className="font-['Space_Mono',monospace] font-bold text-[10px] uppercase text-[#6B665F] mb-1.5 tracking-wider">
                    Looking For
                  </h4>
                  <p className="text-[#B85A3C] font-semibold text-xs sm:text-sm">
                    {currentUser.intentions.join(', ')}
                  </p>
                </div>
              )}

              {currentUser?.photos && currentUser.photos.length > 1 && (
                <div className="space-y-2">
                  <h4 className="font-['Space_Mono',monospace] font-bold text-[10px] uppercase text-[#6B665F] tracking-wider">
                    Lookbook Gallery Preview
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {currentUser.photos.slice(1).map((p, i) => (
                      <img
                        key={i}
                        src={p}
                        alt="Gallery preview"
                        className="aspect-[3/4] object-cover rounded-xl border border-[#E8E4DC]"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowPreviewModal(false)}
                className="w-full py-3 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-bold text-xs mt-2 transition-colors cursor-pointer"
              >
                Back to Profile Editor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT BIO */}
      {/* ============================================================ */}
      {showEditBioModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                Edit About Me
              </h3>
              <button
                onClick={() => setShowEditBioModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-[#6B665F]">
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
            <div className="flex justify-between items-center text-[10px] text-[#9C958D] font-['Space_Mono',monospace]">
              <span>Max 300 characters</span>
              <span>{bioInput.length}/300</span>
            </div>

            <button
              onClick={handleSaveBio}
              className="w-full py-3 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                Career & Location
              </h3>
              <button
                onClick={() => setShowEditCareerModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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

              <div>
                <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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

              <div>
                <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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
                  <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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
                  <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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
                <label className="text-[11px] font-bold text-[#6B665F] block mb-1">
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
              className="w-full py-3 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer mt-2"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                Dating Intentions
              </h3>
              <button
                onClick={() => setShowEditIntentionsModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-[#6B665F]">
              Honesty about your relationship direction helps connect you with genuine partners.
            </p>

            <div className="space-y-2.5 text-xs sm:text-sm">
              {[
                { id: 'marriage', label: '💍 Marriage / Long-term Life Partner' },
                { id: 'long_term', label: '❤️ Serious relationship leading to marriage' },
                { id: 'intentional', label: '✨ Intentional dating with clear direction' },
                { id: 'exploring', label: '🌿 Open to exploring a genuine connection' }
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setDatingGoalInput(opt.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    datingGoalInput === opt.id
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#B85A3C] font-semibold'
                      : 'border-[#E8E4DC] bg-[#F7F5F0] text-[#1A1816] hover:bg-[#FFFFFF]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {datingGoalInput === opt.id && <Check className="w-4 h-4 stroke-[3]" />}
                </div>
              ))}
            </div>

            <button
              onClick={handleSaveIntentions}
              className="w-full py-3 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer mt-2"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E8E4DC] pb-3">
              <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                Profile Prompts
              </h3>
              <button
                onClick={() => setShowEditPromptsModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>

            <p className="text-xs text-[#6B665F]">
              Prompts show off your personality, conversational warmth, and lifestyle values.
            </p>

            <div className="space-y-3.5 text-xs">
              {POPULAR_PROMPTS.slice(0, 4).map((promptQuestion, idx) => {
                const existing = currentUser?.prompts?.find((p) => p.question === promptQuestion);
                return (
                  <div key={idx} className="p-3.5 bg-[#F7F5F0] border border-[#E8E4DC] rounded-xl space-y-2">
                    <span className="font-['Space_Mono',monospace] text-[10px] font-bold text-[#B85A3C] uppercase tracking-wider block">
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
              className="w-full py-3 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E8E4DC]">
              <div className="flex items-center gap-2.5">
                <UserX className="w-5 h-5 text-[#9B2C2C]" />
                <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
                  Blocked Contacts
                </h3>
              </div>
              <button
                onClick={() => setShowBlockedModal(false)}
                className="text-[#6B665F] hover:text-[#1A1816] text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>

            {blockedUsersList.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6B665F] space-y-2">
                <ShieldCheck className="w-8 h-8 text-[#2C6B56] mx-auto opacity-70" />
                <p className="font-semibold text-[#1A1816]">No blocked contacts</p>
                <p className="text-[11px] text-[#9C958D]">
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
                        <p className="text-[10px] text-[#6B665F]">{item.reason}</p>
                      )}
                    </div>
                    {onUnblockUser && (
                      <button
                        onClick={() => onUnblockUser(item.id)}
                        className="px-3 py-1 rounded-full text-[11px] font-semibold text-[#9B2C2C] bg-[#9B2C2C]/10 hover:bg-[#9B2C2C]/20 transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#E8E4DC] space-y-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#F5EAE5] border border-[#E8D5CD] text-[#B85A3C] flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#1A1816]">
              Log out of WASSAA?
            </h3>
            <p className="text-xs text-[#6B665F] leading-relaxed">
              Your lookbook profile, photos, and messages are securely saved. You can log back in at any time.
            </p>

            <div className="flex gap-2.5 pt-3">
              <button
                onClick={() => setShowLogOutConfirm(false)}
                className="flex-1 py-2.5 rounded-full border border-[#E8E4DC] text-xs font-semibold text-[#1A1816] hover:bg-[#F7F5F0] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogOutConfirm(false);
                  if (onLogOut) onLogOut();
                  else if (onSignOut) onSignOut();
                }}
                className="flex-1 py-2.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#FFFFFF] rounded-2xl p-6 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] border border-[#9B2C2C]/30 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#9B2C2C]/10 border border-[#9B2C2C]/20 text-[#9B2C2C] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="font-['Cormorant_Garamond',serif] font-bold text-xl text-[#9B2C2C]">
                Remove Account?
              </h3>
              <p className="text-xs text-[#6B665F] mt-1.5 leading-relaxed">
                This hides your profile and ends your current session. Some account and transaction records may be retained for safety, legal, or payment reasons. Contact support to request data erasure.
              </p>
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <label className="font-['Space_Mono',monospace] text-[10px] font-bold text-[#6B665F] block uppercase">
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
                className="flex-1 py-2.5 rounded-full border border-[#E8E4DC] text-xs font-semibold text-[#1A1816] hover:bg-[#F7F5F0] transition-colors cursor-pointer"
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
                className="flex-1 py-2.5 rounded-full bg-[#9B2C2C] hover:bg-[#852525] disabled:opacity-40 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Remove Account
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export const ProfileScreen = SettingsPrivacyScreen;
