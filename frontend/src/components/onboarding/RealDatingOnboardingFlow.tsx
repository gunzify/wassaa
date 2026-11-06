import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Camera,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  UserProfile,
  ProfessionCategory,
  UniformedService,
  ProfilePrompt,
  MatchPreferences,
  LifestyleHabits,
  ValuesAndFamily,
  CreditPack,
} from '../../types';
import { WassaaApi } from '../../services/api';
import { packPriceLabel } from '../../lib/money';
import { COUNTRY_OPTIONS, findCountry, servicesFor } from '../../data/countries';
import { preparePhoto } from '../../services/media';
import { track } from '../../services/analytics';
import { ORG_ROLES, skillsForCategory } from '../../constants/career';
import { IdentityCapturePanel } from '../common/IdentityCapturePanel';

interface RealDatingOnboardingFlowProps {
  initialUser?: UserProfile;
  onComplete: (profile: UserProfile) => void;
  /** Credit packs from entitlements — powers the optional top-up pitch step. */
  packs?: CreditPack[];
  /** Starts secure checkout (same flow as the credit store). */
  onBuyPack?: (packId: string) => void;
}

// â”€â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DATING_GOALS: { value: UserProfile['datingGoal']; label: string; desc: string }[] = [
  { value: 'marriage', label: 'Marriage', desc: 'Looking for a life partner' },
  { value: 'long_term', label: 'Long-term relationship', desc: 'Something serious and committed' },
  { value: 'intentional', label: 'Intentional dating', desc: 'Getting to know someone properly' },
  { value: 'exploring', label: 'Still figuring it out', desc: 'Open to possibilities' },
];

const PROFESSION_CATEGORIES: { value: ProfessionCategory; label: string }[] = [
  { value: 'Military', label: 'Military' },
  { value: 'Police', label: 'Police' },
  { value: 'Paramilitary', label: 'Paramilitary / Civil Defence' },
  { value: 'Healthcare', label: 'Healthcare' },
  { value: 'Engineering', label: 'Tech & Engineering' },
  { value: 'Education', label: 'Education' },
  { value: 'Business & Entrepreneurship', label: 'Business & Entrepreneurship' },
  { value: 'Law & Government', label: 'Law & Government' },
  { value: 'Others', label: 'Other' },
];

const DATING_PROMPTS = [
  'The way to win me over is\u2026',
  'A life goal of mine is\u2026',
  'My ideal Sunday looks like\u2026',
  'I get along best with people who\u2026',
  'Something I\'m looking for in a partner\u2026',
  'The most spontaneous thing I\'ve done is\u2026',
  'I\'m known among friends for\u2026',
  'My love language is\u2026',
  'Two truths and a lie\u2026',
  'I\'ll know it\'s real when\u2026',
  'My non-negotiable in a relationship is\u2026',
  'The key to my heart is\u2026',
];

const INTERESTS = [
  'Fitness', 'Travel', 'Cooking', 'Music', 'Movies', 'Reading',
  'Photography', 'Football', 'Dancing', 'Gaming', 'Art', 'Fashion',
  'Tech', 'Nature', 'Volunteering', 'Spirituality', 'Cars', 'Food',
  'Comedy', 'Podcasts', 'Hiking', 'Swimming', 'Running', 'Yoga',
];

const FAITH_OPTIONS = [
  'Christianity', 'Islam', 'Traditional', 'Spiritual', 'Agnostic', 'Other', 'Prefer not to say',
];

// Role/skill taxonomy (officer/soldier + trade) lives in constants/career.

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STEP_COUNT = 12;
// Analytics labels only — no member data. Keeps the onboarding funnel readable.
const STEP_NAMES = [
  'intent', 'basics', 'photos', 'profession', 'location',
  'about', 'lifestyle', 'values', 'interests', 'preferences', 'credits', 'verification',
] as const;
const resumeStep = (user?: UserProfile): number => {
  if (!user?.datingGoal) return 1;
  if (!user.name || user.name === 'New member' || !user.birthDate || !user.gender) return 2;
  if (user.photos.length < 2) return 3;
  // Uniformed members pick a branch and cadre instead of a job title — ranks
  // are deliberately never collected (KB: "WASSAA never shows rank").
  if (!user.professionCategory || (!isUniformedCategory(user.professionCategory) && !user.professionTitle)) return 4;
  if (!user.city || !user.state) return 5;
  if ((user.bio || '').trim().length < 10) return 6;
  if (user.interests.length < 3) return 9;
  if (!user.matchPreferences) return 10;
  return 10;
};

const isUniformedCategory = (cat: ProfessionCategory) =>
  ['Military', 'Police', 'Paramilitary'].includes(cat);

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const RealDatingOnboardingFlow: React.FC<RealDatingOnboardingFlowProps> = ({
  initialUser,
  onComplete,
  packs = [],
  onBuyPack,
}) => {
  const [step, setStep] = useState(() => resumeStep(initialUser));

  // Step 1 â€” Intent
  const [datingGoal, setDatingGoal] = useState<UserProfile['datingGoal']>(initialUser?.datingGoal);

  // Step 2 â€” Basics
  const existingName = initialUser?.name === 'New member' ? '' : initialUser?.name || '';
  const [firstName, setFirstName] = useState(existingName.split(' ')[0] || '');
  const [lastName, setLastName] = useState(existingName.split(' ').slice(1).join(' ') || '');
  const [birthDate, setBirthDate] = useState(initialUser?.birthDate || '');
  const [gender, setGender] = useState<'female' | 'male' | ''>(initialUser?.gender || '');

  // Step 3 â€” Photos
  const [photos, setPhotos] = useState<string[]>(initialUser?.photos || []);

  // Step 4 â€” Profession
  const [professionCategory, setProfessionCategory] = useState<ProfessionCategory | ''>(initialUser?.professionCategory || '');
  const [professionTitle, setProfessionTitle] = useState(initialUser?.professionTitle || '');
  const [service, setService] = useState<UniformedService | ''>(initialUser?.service || '');
  const [orgRole, setOrgRole] = useState<'officer' | 'soldier' | ''>(initialUser?.orgRole || '');
  const [skill, setSkill] = useState(initialUser?.skill || '');
  const [companyOrOrg, setCompanyOrOrg] = useState(initialUser?.companyOrOrg || '');

  // Step 5 — Location
  const [countryCode, setCountryCode] = useState(initialUser?.countryCode || 'NG');
  const [customCountryCode, setCustomCountryCode] = useState('');
  const [state, setState] = useState(initialUser?.state || '');
  const [city, setCity] = useState(initialUser?.city || '');
  const [locationCoordinates, setLocationCoordinates] = useState<UserProfile['locationCoordinates']>();
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  // Step 6 â€” About you
  const [bio, setBio] = useState(initialUser?.bio || '');
  const [educationLevel, setEducationLevel] = useState(initialUser?.educationLevel || '');
  const [almaMater, setAlmaMater] = useState(initialUser?.almaMater || '');

  // Step 7 â€” Lifestyle
  const [exercise, setExercise] = useState<LifestyleHabits['exercise']>(initialUser?.lifestyle?.exercise);
  const [drinking, setDrinking] = useState<LifestyleHabits['drinking']>(initialUser?.lifestyle?.drinking);
  const [smoking, setSmoking] = useState<LifestyleHabits['smoking']>(initialUser?.lifestyle?.smoking);
  const [pets, setPets] = useState<LifestyleHabits['pets']>(initialUser?.lifestyle?.pets);

  // Step 8 â€” Values
  const [faith, setFaith] = useState(initialUser?.values?.faith || '');
  const [faithImportance, setFaithImportance] = useState<ValuesAndFamily['faithImportance']>(initialUser?.values?.faithImportance);
  const [familyPlans, setFamilyPlans] = useState<ValuesAndFamily['familyPlans']>(initialUser?.values?.familyPlans);

  // Step 9 â€” Prompts & Interests
  const [prompts, setPrompts] = useState<ProfilePrompt[]>(initialUser?.prompts || []);
  const [interests, setInterests] = useState<string[]>(initialUser?.interests || []);
  const [activePromptQuestion, setActivePromptQuestion] = useState('');
  const [activePromptAnswer, setActivePromptAnswer] = useState('');

  // Step 10 â€” Preferences
  const [prefGender, setPrefGender] = useState<MatchPreferences['gender']>(initialUser?.matchPreferences?.gender || 'everyone');
  const [prefMinAge, setPrefMinAge] = useState(initialUser?.matchPreferences?.minAge || 22);
  const [prefMaxAge, setPrefMaxAge] = useState(initialUser?.matchPreferences?.maxAge || 40);
  const [distanceEnabled, setDistanceEnabled] = useState(Boolean(initialUser?.matchPreferences?.maxDistanceKm));
  const [maxDistanceKm, setMaxDistanceKm] = useState(initialUser?.matchPreferences?.maxDistanceKm || 100);
  const [savingStep, setSavingStep] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Step 11 — Identity verification (optional)
  const [verificationStatus, setVerificationStatus] = useState<'not_started' | 'pending' | 'verified' | 'rejected'>(
    initialUser?.verification?.status || 'not_started'
  );

  const requestPreciseLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('This browser cannot provide device location. You can still use city and state.');
      return;
    }
    setLocationBusy(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setDistanceEnabled(true);
        setLocationMessage('Location saved.');
        setLocationBusy(false);
      },
      (error) => {
        setLocationMessage(error.code === error.PERMISSION_DENIED
          ? 'Location permission was declined — city and state still work.'
          : 'Could not get your location. Try again in device settings.');
        setLocationBusy(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
    );
  };

  // â”€â”€ Navigation â”€â”€

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!datingGoal;
      case 2: return firstName.trim().length >= 2 && !!birthDate && !!gender;
      case 3: return photos.length >= 2;
      case 4: return !!professionCategory && (isUniformedCategory(professionCategory as ProfessionCategory) || professionTitle.trim().length >= 2);
      case 5: return !!state && city.trim().length >= 2 && /^[A-Z]{2}$/.test((countryCode || customCountryCode).toUpperCase());
      case 6: return bio.trim().length >= 10;
      case 7: return true; // lifestyle is optional
      case 8: return true; // values are optional
      case 9: return interests.length >= 3;
      case 10: return true; // preferences have usable defaults
      case 11: return true; // the top-up pitch is skippable
      case 12: return true; // identity verification is optional
      default: return false;
    }
  };

  const saveCurrentStep = async () => {
    if (step === 1) await WassaaApi.updateProfile({ datingGoal });
    if (step === 2) await WassaaApi.updateProfile({
      name: `${firstName.trim()} ${lastName.trim()}`.trim(), birthDate, gender: gender as 'female' | 'male'
    });
    if (step === 3) await WassaaApi.updateProfile({ photos });
    if (step === 4) await WassaaApi.updateProfile({
      professionCategory: professionCategory as ProfessionCategory,
      // No job title is collected for military, paramilitary or law-enforcement
      // members — their branch and cadre describe the work without a rank.
      professionTitle: isUniformedCategory(professionCategory as ProfessionCategory) ? undefined : professionTitle.trim(),
      service: (isUniformedCategory(professionCategory as ProfessionCategory) && service ? service : undefined) as UniformedService | undefined,
      orgRole: (isUniformedCategory(professionCategory as ProfessionCategory) && orgRole ? orgRole : undefined) as 'officer' | 'soldier' | undefined,
      skill: skill || undefined,
      companyOrOrg: companyOrOrg.trim() || undefined,
      educationLevel: educationLevel || undefined,
      almaMater: almaMater.trim() || undefined,
    });
    if (step === 5) {
      await WassaaApi.updateProfile({ city: city.trim(), state, countryCode: (countryCode || customCountryCode).toUpperCase() });
      if (locationCoordinates) await WassaaApi.updateLocation(locationCoordinates);
    }
    if (step === 6) await WassaaApi.updateProfile({ bio: bio.trim() });
    // Steps 7–9 used to live only in component state, so anything typed there
    // vanished if the member closed the app before the final step.
    if (step === 7) await WassaaApi.updateProfile({ lifestyle: { exercise, drinking, smoking, pets } });
    if (step === 8) await WassaaApi.updateProfile({ values: { faith: faith || undefined, faithImportance, familyPlans } });
    if (step === 9) await WassaaApi.updateProfile({ interests, prompts });
    if (step === 10) await WassaaApi.updatePreferences({
      gender: prefGender, minAge: prefMinAge, maxAge: prefMaxAge,
      ...(distanceEnabled && (locationCoordinates || initialUser?.hasPreciseLocation) ? { maxDistanceKm } : {}),
    });
  };

  const goNext = async () => {
    if (!canProceed() || savingStep) return;
    if (step === 4 && professionCategory && !isUniformedCategory(professionCategory) && service === '') {
      // Service is intentionally omitted for civilian professions.
    }
    setSavingStep(true);
    setSaveError('');
    try {
      await saveCurrentStep();
      track('onboarding_step_completed', { step, step_name: STEP_NAMES[step - 1] });
      if (step < STEP_COUNT) setStep(step + 1);
      else handleComplete();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this step. Try again.');
    } finally {
      setSavingStep(false);
    }
  };

  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const calculateAge = (bd: string): number => {
    const d = new Date(bd);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  };

  const handleComplete = () => {
    const profile: UserProfile = {
      id: initialUser?.id || crypto.randomUUID(),
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      age: birthDate ? calculateAge(birthDate) : 25,
      gender: gender as 'female' | 'male',
      birthDate,
      professionCategory: professionCategory as ProfessionCategory,
      professionTitle: professionTitle.trim(),
      companyOrOrg: companyOrOrg.trim() || undefined,
      service: (isUniformedCategory(professionCategory as ProfessionCategory) && service) ? service as UniformedService : undefined,
      orgRole: (isUniformedCategory(professionCategory as ProfessionCategory) && orgRole) ? orgRole : undefined,
      skill: skill || undefined,
      educationLevel: educationLevel || undefined,
      almaMater: almaMater.trim() || undefined,
      city: city.trim(),
      state,
      locationCoordinates,
      bio: bio.trim(),
      photos,
      interests,
      intentions: datingGoal ? [datingGoal] : [],
      datingGoal,
      matchPreferences: { gender: prefGender, minAge: prefMinAge, maxAge: prefMaxAge, ...(distanceEnabled && (locationCoordinates || initialUser?.hasPreciseLocation) ? { maxDistanceKm } : {}) },
      lifestyle: { exercise, drinking, smoking, pets },
      values: { faith: faith || undefined, faithImportance, familyPlans },
      prompts,
      verification: {
        ...(initialUser?.verification || { status: 'not_started', hasGovernmentId: false, hasLiveSelfie: false }),
        status: verificationStatus,
      },
      privacy: initialUser?.privacy || {
        serviceVisibility: 'matches',
        verificationDisplay: 'badge',
        chatNotifications: true,
        twoFactorAuth: false,
        privateIntroductionOptIn: false,
      },
    };
    onComplete(profile);
  };

  // â”€â”€ Photo handling â”€â”€

  const handlePhotoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      void (async () => {
        for (const file of Array.from(files).slice(0, Math.max(0, 6 - photos.length))) {
          if (file.size > 8 * 1024 * 1024) {
            window.alert('Each photo must be under 8 MB.');
            continue;
          }
          if (photos.length >= 6) break;
          try {
            const prepared = await preparePhoto(file);
            const uploaded = await WassaaApi.uploadImage('photo', prepared);
            setPhotos((prev) => prev.length < 6 ? [...prev, uploaded] : prev);
          } catch (err) {
            window.alert(err instanceof Error ? err.message : 'Photo upload failed.');
          }
        }
      })();
    };
    input.click();
  };

  const removePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  // â”€â”€ Prompt handling â”€â”€

  const addPrompt = () => {
    if (!activePromptQuestion || activePromptAnswer.trim().length < 5) return;
    setPrompts((prev) => [...prev, { id: crypto.randomUUID(), question: activePromptQuestion, answer: activePromptAnswer.trim() }]);
    setActivePromptQuestion('');
    setActivePromptAnswer('');
  };

  const removePrompt = (id: string) => setPrompts((prev) => prev.filter((p) => p.id !== id));

  const toggleInterest = (name: string) => {
    setInterests((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : prev.length < 8 ? [...prev, name] : prev
    );
  };

  // â”€â”€â”€ Layout (rendered once â€” NOT an inline component) â”€â”€â”€â”€â”€â”€â”€â”€

  const heading = (title: string, subtitle?: string) => (
    <div className="mb-8">
      <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-semibold text-[#1A1816] leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-[#6B665F] mt-2 leading-relaxed">{subtitle}</p>
      )}
    </div>
  );

  const renderStepContent = () => {

  // â”€â”€â”€ Steps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // STEP 1: What are you looking for?
  if (step === 1) return (
    <>
      {heading("What are you looking for?")}
      <div className="space-y-3">
        {DATING_GOALS.map(({ value, label, desc }) => (
          <button
            key={value}
            onClick={() => setDatingGoal(value)}
            className={`relative w-full text-left p-4 rounded-2xl border transition-all ${
              datingGoal === value
                ? 'border-[#B85A3C] bg-[#F5EAE5]'
                : 'border-[#E8E4DC] bg-white hover:border-[#B85A3C]/30'
            }`}
          >
            <span className="block text-[0.9375rem] font-semibold text-[#1A1816]">{label}</span>
            <span className="block text-xs text-[#6B665F] mt-0.5">{desc}</span>
            {datingGoal === value && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Check className="w-4 h-4 text-[#B85A3C]" />
              </div>
            )}
          </button>
        ))}
      </div>
    </>
  );

  // STEP 2: Your basics
  if (step === 2) return (
    <>
      {heading("The basics", "Let people know who you are.")}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Chioma"
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Okafor"
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Date of birth</label>
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
          />
          {birthDate && <p className="text-xs text-[#6B665F] mt-1">{calculateAge(birthDate)} years old</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">I am</label>
          <div className="grid grid-cols-2 gap-3">
            {(['male', 'female'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  gender === g
                    ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                    : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                }`}
              >
                {g === 'male' ? 'Man' : 'Woman'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // STEP 3: Photos
  if (step === 3) return (
    <>
      {heading("Add your photos", "At least 2 photos.")}
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((idx) => {
          const photo = photos[idx];
          return (
            <div key={idx} className="relative aspect-[3/4] rounded-xl overflow-hidden">
              {photo ? (
                <>
                  <img src={photo} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  {idx === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-white/90 text-[0.75rem] font-semibold text-[#1A1816]">
                      Main
                    </span>
                  )}
                </>
              ) : (
                <button
                  onClick={handlePhotoUpload}
                  className="w-full h-full bg-white border-2 border-dashed border-[#E8E4DC] rounded-xl flex flex-col items-center justify-center gap-1.5 text-[#9C958D] hover:border-[#B85A3C]/40 hover:text-[#B85A3C] transition-colors"
                >
                  {idx === 0 ? <Camera className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  <span className="text-[0.75rem] font-medium">{idx === 0 ? 'Add photo' : ''}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[#9C958D] mt-4 text-center">
        Clear, recent photos of you.
      </p>
    </>
  );

  // STEP 4: Profession
  if (step === 4) return (
    <>
      {heading("What do you do?", "Your profession helps people find common ground.")}
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Country</label>
          <select
            value={countryCode}
            onChange={(e) => {
              const code = e.target.value;
              setCountryCode(code);
              if (service && !servicesFor(code, professionCategory || '').includes(service)) setService('');
            }}
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors appearance-none"
          >
            {COUNTRY_OPTIONS.map((c) => <option key={c.code || 'other'} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Field</label>
          <div className="grid grid-cols-2 gap-2">
            {PROFESSION_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setProfessionCategory(value); if (!isUniformedCategory(value)) { setService(''); setOrgRole(''); } setSkill(''); }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-medium text-left transition-all ${
                  professionCategory === value
                    ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                    : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {professionCategory && isUniformedCategory(professionCategory) && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Branch</label>
            <div className="space-y-2">
              {servicesFor(countryCode, professionCategory).map((label) => (
                <button
                  key={label}
                  onClick={() => setService(label)}
                  className={`w-full text-left py-3 px-4 rounded-xl border text-sm transition-all ${
                    service === label
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816] font-medium'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {professionCategory && isUniformedCategory(professionCategory) && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] uppercase tracking-wider font-['Space_Mono',monospace]">Cadre</label>
            <div className="grid grid-cols-2 gap-2">
              {ORG_ROLES.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => setOrgRole(value)}
                  className={`py-2.5 px-3 rounded-xl border text-left transition-all ${
                    orgRole === value
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                  }`}
                >
                  <span className="block text-xs font-medium">{label}</span>
                  <span className="block text-[0.7rem] text-[#9C958D] mt-0.5">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {professionCategory && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Skill / Trade <span className="text-[#9C958D] normal-case">(optional)</span></label>
            <div className="flex flex-wrap gap-2">
              {skillsForCategory(professionCategory).map((s) => (
                <button
                  key={s}
                  onClick={() => setSkill(skill === s ? '' : s)}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    skill === s
                      ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                      : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {professionCategory && !isUniformedCategory(professionCategory as ProfessionCategory) && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Job title</label>
            <input
              value={professionTitle}
              onChange={(e) => setProfessionTitle(e.target.value)}
              placeholder="e.g. Software Engineer, Doctor"
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Organisation <span className="text-[#9C958D] normal-case">(optional)</span></label>
          <input
            value={companyOrOrg}
            onChange={(e) => setCompanyOrOrg(e.target.value)}
            placeholder="Where you work"
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
          />
        </div>
      </div>
    </>
  );

  // STEP 5: Location
  if (step === 5) return (
    <>
      {heading("Where are you based?")}
      <div className="space-y-5">
        {countryCode === '' && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Country code</label>
            <input
              value={customCountryCode}
              onChange={(e) => setCustomCountryCode(e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase())}
              placeholder="e.g. SE"
              maxLength={2}
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors uppercase"
            />
            <p className="mt-1.5 text-[0.7rem] text-[#9C958D]">Two-letter country code, e.g. SE.</p>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">State / region</label>
          {findCountry(countryCode).regions.length ? (
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors appearance-none"
            >
              <option value="">Select your state</option>
              {findCountry(countryCode).regions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State, province or region"
              className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">City or area</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={countryCode === 'NG' ? 'e.g. Lekki, Wuse II, GRA' : 'e.g. Brooklyn, Shoreditch, Mitte'}
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
          />
        </div>
        <div className="rounded-xl border border-[#E8E4DC] bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#1A1816]">Precise location</p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B665F]">Optional. Your exact coordinates are never shown on your profile.</p>
            </div>
            <MapPin className="h-5 w-5 shrink-0 text-[#B85A3C]" />
          </div>
          <button type="button" onClick={requestPreciseLocation} disabled={locationBusy} className="mt-3 rounded-full border border-[#E8E4DC] px-4 py-2 text-xs font-semibold text-[#1A1816] disabled:opacity-50">
            {locationBusy ? 'Getting location…' : locationCoordinates || initialUser?.hasPreciseLocation ? 'Refresh device location' : 'Use my device location'}
          </button>
          {!locationCoordinates && initialUser?.hasPreciseLocation && !locationMessage && <p className="mt-2 text-xs text-[#2C6B56]">Precise location is already saved privately.</p>}
          {locationMessage && <p role="status" className="mt-2 text-xs text-[#6B665F]">{locationMessage}</p>}
        </div>
      </div>
    </>
  );

  // STEP 6: Bio
  if (step === 6) return (
    <>
      {heading("Write your bio", "A few lines about you.")}
      <div className="space-y-5">
        <div>
          <textarea
            value={bio}
            onChange={(e) => { if (e.target.value.length <= 300) setBio(e.target.value); }}
            rows={4}
            placeholder="What should someone know about you before they swipe right?"
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors resize-none"
          />
          <p className="text-xs text-[#9C958D] text-right mt-1">{bio.length}/300</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">Education <span className="text-[#9C958D] normal-case">(optional)</span></label>
          <input
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            placeholder="e.g. BSc, MSc, HND"
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-1.5 uppercase tracking-wider font-['Space_Mono',monospace]">School <span className="text-[#9C958D] normal-case">(optional)</span></label>
          <input
            value={almaMater}
            onChange={(e) => setAlmaMater(e.target.value)}
            placeholder="e.g. NDA, UNILAG, ABU Zaria"
            className="w-full px-4 py-3 bg-white border border-[#E8E4DC] rounded-xl text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] focus:ring-1 focus:ring-[#B85A3C]/20 transition-colors"
          />
        </div>
      </div>
    </>
  );

  // STEP 7: Lifestyle
  if (step === 7) return (
    <>
      {heading("Your lifestyle", "Optional.")}
      <div className="space-y-6">
        {/* Exercise */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Exercise</label>
          <div className="flex flex-wrap gap-2">
            {([['daily', 'Daily'], ['frequently', 'Often'], ['occasionally', 'Sometimes'], ['rarely', 'Rarely']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setExercise(exercise === val ? undefined : val)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${exercise === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Drinking */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Drinking</label>
          <div className="flex flex-wrap gap-2">
            {([['never', 'Never'], ['socially', 'Socially'], ['regularly', 'Regularly']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setDrinking(drinking === val ? undefined : val)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${drinking === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Smoking */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Smoking</label>
          <div className="flex flex-wrap gap-2">
            {([['never', 'Never'], ['socially', 'Socially'], ['regularly', 'Regularly']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setSmoking(smoking === val ? undefined : val)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${smoking === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Pets */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Pets</label>
          <div className="flex flex-wrap gap-2">
            {([['dogs', 'Dog person'], ['cats', 'Cat person'], ['both', 'Both'], ['none', 'No pets']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setPets(pets === val ? undefined : val)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${pets === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // STEP 8: Values & faith
  if (step === 8) return (
    <>
      {heading("Values & family", "Optional.")}
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Faith</label>
          <div className="flex flex-wrap gap-2">
            {FAITH_OPTIONS.map((f) => (
              <button key={f} onClick={() => setFaith(faith === f ? '' : f)}
                className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${faith === f ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{f}</button>
            ))}
          </div>
        </div>

        {faith && (
          <div>
            <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">How important is faith?</label>
            <div className="flex flex-wrap gap-2">
              {([['very_important', 'Very important'], ['somewhat', 'Somewhat'], ['not_important', 'Not important']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFaithImportance(val)}
                  className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${faithImportance === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
                >{label}</button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Family plans</label>
          <div className="space-y-2">
            {([
              ['want_children', 'Want children'],
              ['open_to_children', 'Open to children'],
              ['have_children_want_more', 'Have children, want more'],
              ["dont_want_children", "Do not want children"],
              ['not_sure', 'Not sure yet'],
            ] as const).map(([val, label]) => (
              <button key={val} onClick={() => setFamilyPlans(familyPlans === val ? undefined : val)}
                className={`w-full text-left py-3 px-4 rounded-xl border text-sm transition-all ${familyPlans === val ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816] font-medium' : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'}`}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // STEP 9: Prompts & Interests
  if (step === 9) return (
    <>
      {heading("Show your personality", "Pick at least 3 interests, and answer a prompt or two.")}
      <div className="space-y-8">
        {/* Interests */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-3 uppercase tracking-wider font-['Space_Mono',monospace]">
            Interests <span className="text-[#9C958D] normal-case">({interests.length}/8)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((name) => (
              <button
                key={name}
                onClick={() => toggleInterest(name)}
                className={`px-3.5 py-2 rounded-full border text-xs font-medium transition-all ${
                  interests.includes(name)
                    ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                    : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Prompts */}
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-3 uppercase tracking-wider font-['Space_Mono',monospace]">
            Dating prompts <span className="text-[#9C958D] normal-case">(optional)</span>
          </label>

          {/* Existing prompts */}
          {prompts.map((p) => (
            <div key={p.id} className="mb-3 p-4 bg-white border border-[#E8E4DC] rounded-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.8125rem] font-semibold text-[#9C958D] uppercase tracking-wider mb-1">{p.question}</p>
                  <p className="text-sm text-[#1A1816]">{p.answer}</p>
                </div>
                <button onClick={() => removePrompt(p.id)} className="p-1 text-[#9C958D] hover:text-[#9B2C2C] transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Add new prompt */}
          {prompts.length < 3 && (
            <div className="p-4 bg-white border border-dashed border-[#E8E4DC] rounded-xl space-y-3">
              {!activePromptQuestion ? (
                <div className="space-y-2">
                  <p className="text-xs text-[#6B665F] mb-2">Pick a prompt to answer:</p>
                  {DATING_PROMPTS.filter((q) => !prompts.some((p) => p.question === q)).slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => setActivePromptQuestion(q)}
                      className="w-full text-left py-2.5 px-3.5 rounded-lg border border-[#E8E4DC] bg-[#F7F5F0] text-sm text-[#6B665F] hover:border-[#B85A3C]/30 hover:text-[#1A1816] transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-[0.8125rem] font-semibold text-[#B85A3C] uppercase tracking-wider mb-2">{activePromptQuestion}</p>
                  <textarea
                    value={activePromptAnswer}
                    onChange={(e) => { if (e.target.value.length <= 200) setActivePromptAnswer(e.target.value); }}
                    rows={3}
                    placeholder="Your answerâ€¦"
                    className="w-full px-3 py-2.5 bg-[#F7F5F0] border border-[#E8E4DC] rounded-lg text-sm text-[#1A1816] placeholder-[#9C958D] focus:outline-none focus:border-[#B85A3C] resize-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-between mt-2">
                    <button onClick={() => { setActivePromptQuestion(''); setActivePromptAnswer(''); }} className="text-xs text-[#9C958D] hover:text-[#1A1816]">Cancel</button>
                    <button
                      onClick={addPrompt}
                      disabled={activePromptAnswer.trim().length < 5}
                      className="px-4 py-1.5 rounded-full bg-[#B85A3C] disabled:bg-[#E8E4DC] text-white disabled:text-[#9C958D] text-xs font-semibold transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // STEP 10: Match preferences
  if (step === 10) return (
    <>
      {heading("Who are you looking for?", "You can change these anytime in settings.")}
      <div className="space-y-7">
        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">Show me</label>
          <div className="grid grid-cols-3 gap-2">
            {([['men', 'Men'], ['women', 'Women'], ['everyone', 'Everyone']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPrefGender(val)}
                className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                  prefGender === val
                    ? 'border-[#B85A3C] bg-[#F5EAE5] text-[#1A1816]'
                    : 'border-[#E8E4DC] bg-white text-[#6B665F] hover:border-[#B85A3C]/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#1A1816] mb-2 uppercase tracking-wider font-['Space_Mono',monospace]">
            Age range <span className="text-[#9C958D] normal-case font-['Plus_Jakarta_Sans',sans-serif]">{prefMinAge} â€“ {prefMaxAge}</span>
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#9C958D] w-8">Min</span>
              <input
                type="range" min={18} max={60}
                value={prefMinAge}
                onChange={(e) => { const v = +e.target.value; setPrefMinAge(v); if (v > prefMaxAge) setPrefMaxAge(v); }}
                className="flex-1 accent-[#B85A3C]"
              />
              <span className="text-xs font-semibold text-[#1A1816] w-6 text-right font-['Space_Mono',monospace]">{prefMinAge}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#9C958D] w-8">Max</span>
              <input
                type="range" min={18} max={60}
                value={prefMaxAge}
                onChange={(e) => { const v = +e.target.value; setPrefMaxAge(v); if (v < prefMinAge) setPrefMinAge(v); }}
                className="flex-1 accent-[#B85A3C]"
              />
              <span className="text-xs font-semibold text-[#1A1816] w-6 text-right font-['Space_Mono',monospace]">{prefMaxAge}</span>
            </div>
          </div>
        </div>

        {/* Ready summary */}
        <div className="mt-4 p-5 bg-white border border-[#E8E4DC] rounded-2xl text-center">
          <p className="font-['Cormorant_Garamond',serif] text-xl font-semibold text-[#1A1816] mb-1">You're all set</p>
          <p className="text-xs text-[#6B665F]">Your profile is ready. Time to start discovering.</p>
        </div>
        <div className="mt-4 p-5 bg-white border border-[#E8E4DC] rounded-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1A1816]">Distance preference</p>
              <p className="mt-1 text-xs text-[#6B665F]">{locationCoordinates || initialUser?.hasPreciseLocation ? 'Only show members within your chosen radius.' : 'Add device location to filter matches by distance.'}</p>
            </div>
            {(locationCoordinates || initialUser?.hasPreciseLocation) && <input aria-label="Limit discovery by distance" type="checkbox" checked={distanceEnabled} onChange={(e) => setDistanceEnabled(e.target.checked)} className="h-4 w-4 accent-[#B85A3C]" />}
          </div>
          {(locationCoordinates || initialUser?.hasPreciseLocation) && distanceEnabled ? (
            <div className="mt-4 flex items-center gap-3">
              <input aria-label="Maximum distance in kilometres" type="range" min={5} max={500} step={5} value={maxDistanceKm} onChange={(e) => setMaxDistanceKm(Number(e.target.value))} className="flex-1 accent-[#B85A3C]" />
              <span className="w-20 text-right text-xs font-semibold text-[#1A1816]">{maxDistanceKm} km</span>
            </div>
          ) : !locationCoordinates && !initialUser?.hasPreciseLocation ? (
            <button type="button" onClick={() => setStep(5)} className="mt-3 text-xs font-semibold text-[#B85A3C] underline underline-offset-2">Set device location</button>
          ) : null}
        </div>
      </div>
    </>
  );

  // STEP 11: Optional credit top-up pitch
  if (step === 11) {
    const available = packs.filter((p) => p.priceNgn > 0);
    return (
      <>
        {heading("Stand out from day one", "You start with 25 free credits. A one-time top-up keeps every conversation going, and credits never expire.")}
        {onBuyPack && available.length > 0 ? (
          <div className="space-y-3">
            {available.map((pack) => (
              <article key={pack.id} className={`w-full text-left p-4 rounded-2xl border transition-all bg-white relative ${
                pack.isPopular ? 'border-[#B85A3C] shadow-[0_4px_16px_-4px_rgba(184,90,60,0.25)]' : 'border-[#E8E4DC]'
              }`}>
                {pack.isPopular && (
                  <span className="absolute -top-2.5 left-4 text-[0.65rem] font-semibold tracking-wide uppercase bg-[#B85A3C] text-white px-2.5 py-0.5 rounded-full">
                    Most popular
                  </span>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-['Cormorant_Garamond',serif] text-xl font-semibold text-[#1A1816]">{pack.name}</p>
                    <p className="text-xs text-[#6B665F]">{pack.credits.toLocaleString()} credits · {pack.tagline}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBuyPack(pack.id)}
                    className="shrink-0 px-4 py-2.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:bg-[#EFEAE4] disabled:text-[#9C958D] text-white text-xs font-semibold transition-colors"
                  >
                    {packPriceLabel(pack)}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-[#E8E4DC] bg-white text-sm text-[#6B665F]">
            Your first 25 credits are on your account already — they unlock the first several messages.
          </div>
        )}
        <p className="mt-5 text-center text-xs leading-relaxed text-[#9C958D]">
          Skippable — send your free credits first and top up anytime from the Credits tab.
        </p>
      </>
    );
  }

  // STEP 12: Identity verification (optional)
  if (step === 12) return (
    <>
      {heading("Verify your identity", "Add your ID and a quick live selfie.")}
      <IdentityCapturePanel
        status={verificationStatus === 'verified' ? 'verified' : verificationStatus === 'pending' ? 'pending' : 'not_started'}
        uniformed={!!professionCategory && isUniformedCategory(professionCategory as ProfessionCategory)}
        onSubmitted={() => setVerificationStatus('pending')}
      />
      <p className="mt-4 text-center text-xs leading-relaxed text-[#9C958D]">
        Optional — you can skip this and verify anytime from Settings.
      </p>
    </>
  );

  return null;
  };

  return (
    <div className="w-full flex flex-col min-h-[calc(100dvh-2.5rem)]">
      <header className="sticky top-0 z-30 bg-[#F7F5F0]/95 backdrop-blur-sm px-4 pt-4 pb-3">
        <div className="max-w-[480px] mx-auto flex items-center justify-between">
          <button type="button" onClick={goBack} disabled={step === 1} aria-label={step === 1 ? 'You are at the first onboarding step' : 'Go back'} className="p-2 -ml-2 text-[#6B665F] hover:text-[#1A1816] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-white/60">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-['Space_Mono',monospace] text-[0.8125rem] uppercase tracking-widest text-[#9C958D]">{step} / {STEP_COUNT}</span>
          <span className="w-9" aria-hidden="true" />
        </div>
        <div className="max-w-[480px] mx-auto mt-3 h-1 bg-[#E8E4DC] rounded-full overflow-hidden">
          <div className="h-full bg-[#B85A3C] rounded-full transition-all duration-300" style={{ width: `${(step / STEP_COUNT) * 100}%` }} />
        </div>
      </header>
      <main className="flex-1 px-4 overflow-y-auto">
        <div className="max-w-[480px] mx-auto py-6">{renderStepContent()}</div>
      </main>
      <footer className="sticky bottom-0 bg-[#F7F5F0]/95 backdrop-blur-sm border-t border-[#E8E4DC] px-4 py-4">
        <div className="max-w-[480px] mx-auto">
          {saveError && <p role="alert" className="mb-3 text-center text-xs text-[#9B2C2C]">{saveError}</p>}
          <button type="button" onClick={() => void goNext()} disabled={!canProceed() || savingStep} className="w-full py-3.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] disabled:bg-[#E8E4DC] disabled:text-[#9C958D] text-white text-sm font-semibold transition-colors">
            {savingStep ? 'Saving…' : step === STEP_COUNT ? 'Finish profile' : 'Continue'}
          </button>
        </div>
      </footer>
    </div>
  );
};

