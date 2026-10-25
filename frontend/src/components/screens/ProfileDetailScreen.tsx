import React from 'react';
import { 
  ChevronLeft, 
  Heart, 
  X, 
  Star, 
  ShieldCheck, 
  MapPin, 
  Briefcase,
  GraduationCap,
  Sparkles,
  Compass,
  Quote,
  Activity,
  Wine,
  Cigarette,
  PawPrint,
  HeartHandshake
} from 'lucide-react';
import { UserProfile } from '../../types';

interface ProfileDetailScreenProps {
  profile: UserProfile;
  onBack: () => void;
  onSwipeLeft: (profile: UserProfile) => void;
  onSwipeRight: (profile: UserProfile) => void;
  onSuperLike: (profile: UserProfile) => void;
}

export const ProfileDetailScreen: React.FC<ProfileDetailScreenProps> = ({
  profile,
  onBack,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
}) => {
  if (!profile) return null;

  const photos = profile.photos || [];

  const prompts = profile.prompts || [];

  return (
    <div className="w-full min-h-screen bg-[#F7F5F0] text-[#1A1816] font-['Plus_Jakarta_Sans',sans-serif] relative pb-32">
      {/* Top Floating Editorial Header */}
      <div className="sticky top-0 z-30 bg-[#F7F5F0]/90 backdrop-blur-md border-b border-[#E8E4DC] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E8E4DC] text-[#1A1816] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:bg-[#F5EAE5] hover:text-[#B85A3C] transition-all cursor-pointer"
            aria-label="Back to discovery"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center flex-1">
            <span className="font-['Space_Mono',monospace] text-[11px] font-semibold tracking-widest text-[#6B665F] uppercase block">
              Lookbook
            </span>
            <span className="font-['Cormorant_Garamond',serif] text-base font-semibold text-[#1A1816]">
              {profile.name}
            </span>
          </div>

          <span className="w-10" aria-hidden="true" />
        </div>
      </div>

      {/* Main Lookbook Vertical Scroll */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        
        {/* HERO PHOTO (Photo 0) */}
        <div className="relative rounded-2xl overflow-hidden bg-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] border border-[#E8E4DC]">
          <div className="aspect-[3/4] sm:aspect-[4/5] w-full relative">
            {photos[0] ? (
              <img src={photos[0]} alt={profile.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#F0ECE6] text-[#6B665F] text-sm">No photo provided</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent pointer-events-none" />

            {/* In-photo metadata overlay */}
            <div className="absolute bottom-5 inset-x-5 text-white">
              <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                  {profile.name}{profile.age ? `, ${profile.age}` : ''}
                </h1>
                {profile.verification?.status === 'verified' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFFFFF]/90 backdrop-blur-md text-[#2C6B56] text-[11px] font-semibold border border-[#2C6B56]/30 font-['Space_Mono',monospace] tracking-wider uppercase shadow-xs">
                    <ShieldCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                    Verified
                  </span>
                )}
              </div>

              <p className="text-sm sm:text-base text-white/90 font-medium">
                {profile.professionTitle}
                {profile.companyOrOrg ? ` · ${profile.companyOrOrg}` : ''}
              </p>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                {[profile.neighborhood, profile.city, profile.state].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>
        </div>

        {/* PROFILE ESSENTIALS CARD */}
        <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-5 sm:p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E8E4DC]">
            <span className="font-['Space_Mono',monospace] text-[11px] uppercase tracking-wider text-[#6B665F]">
              Profile Essentials
            </span>
            {profile.distanceKm !== undefined && (
              <span className="font-['Space_Mono',monospace] text-[11px] text-[#6B665F] uppercase">
                {profile.distanceKm} km away
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm text-[#1A1816]">
            <div className="flex items-center gap-3">
              <Briefcase className="w-4 h-4 text-[#B85A3C] shrink-0" />
              <span className="truncate">
                {profile.professionTitle}
                {profile.companyOrOrg ? ` at ${profile.companyOrOrg}` : ''}
              </span>
            </div>

            {profile.almaMater && (
              <div className="flex items-center gap-3">
                <GraduationCap className="w-4 h-4 text-[#B85A3C] shrink-0" />
                <span className="truncate">{profile.almaMater}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-[#B85A3C] shrink-0" />
              <span className="truncate">
                {[profile.neighborhood, profile.city, profile.state].filter(Boolean).join(', ')}
              </span>
            </div>

            {profile.datingGoal && (
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[#B85A3C] shrink-0" />
                <span className="font-medium text-[#B85A3C] capitalize">
                  {profile.datingGoal.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>

          {profile.intentions && profile.intentions.length > 0 && (
            <div className="pt-3 border-t border-[#E8E4DC]">
              <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-wider text-[#6B665F] block mb-1.5">
                Dating Intentions
              </span>
              <p className="text-xs sm:text-sm font-semibold text-[#B85A3C]">
                {profile.intentions.join(' · ')}
              </p>
            </div>
          )}
        </div>

        {/* BIO / ABOUT ME CARD */}
        {profile.bio && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-5 sm:p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] relative">
            <Quote className="w-8 h-8 text-[#B85A3C]/15 absolute top-4 right-4 pointer-events-none" />
            <span className="font-['Space_Mono',monospace] text-[11px] uppercase tracking-wider text-[#6B665F] block mb-2">
              About Me
            </span>
            <p className="text-sm sm:text-base text-[#1A1816] leading-relaxed italic font-['Plus_Jakarta_Sans',sans-serif]">
              "{profile.bio}"
            </p>
          </div>
        )}

        {/* FIRST PROMPT (if available) */}
        {prompts[0] && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-2">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#B85A3C] uppercase block">
              {prompts[0].question}
            </span>
            <p className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-semibold text-[#1A1816] leading-snug italic">
              "{prompts[0].answer}"
            </p>
          </div>
        )}

        {/* SECOND PHOTO (Photo 1) */}
        {photos[1] && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-widest text-[#9C958D]">
                02 / Lookbook
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden bg-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] border border-[#E8E4DC]">
              <div className="aspect-[3/4] sm:aspect-[4/5] w-full">
                <img
                  src={photos[1]}
                  alt={`${profile.name} gallery 2`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        )}

        {/* INTERESTS & PASSIONS TAG CLOUD */}
        {profile.interests && profile.interests.length > 0 && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-5 sm:p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-3">
            <span className="font-['Space_Mono',monospace] text-[11px] uppercase tracking-wider text-[#6B665F] block">
              Passions & Interests
            </span>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((tag) => (
                <span
                  key={tag}
                  className="px-3.5 py-1.5 rounded-full bg-[#F7F5F0] border border-[#E8E4DC] text-xs font-medium text-[#1A1816] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* SECOND PROMPT (if available) */}
        {prompts[1] && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-2">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#B85A3C] uppercase block">
              {prompts[1].question}
            </span>
            <p className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-semibold text-[#1A1816] leading-snug italic">
              "{prompts[1].answer}"
            </p>
          </div>
        )}

        {/* THIRD PHOTO (Photo 2) */}
        {photos[2] && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-widest text-[#9C958D]">
                03 / Lookbook
              </span>
            </div>
            <div className="rounded-2xl overflow-hidden bg-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] border border-[#E8E4DC]">
              <div className="aspect-[3/4] sm:aspect-[4/5] w-full">
                <img
                  src={photos[2]}
                  alt={`${profile.name} gallery 3`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        )}

        {/* LIFESTYLE & VALUES CARD */}
        {(profile.lifestyle || profile.values) && (
          <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-5 sm:p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-4">
            <span className="font-['Space_Mono',monospace] text-[11px] uppercase tracking-wider text-[#6B665F] block pb-2 border-b border-[#E8E4DC]">
              Lifestyle & Values
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {profile.lifestyle?.exercise && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Exercise</span>
                    <span className="font-semibold text-[#1A1816] capitalize">{profile.lifestyle.exercise}</span>
                  </div>
                </div>
              )}

              {profile.lifestyle?.drinking && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <Wine className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Drinking</span>
                    <span className="font-semibold text-[#1A1816] capitalize">{profile.lifestyle.drinking}</span>
                  </div>
                </div>
              )}

              {profile.lifestyle?.smoking && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <Cigarette className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Smoking</span>
                    <span className="font-semibold text-[#1A1816] capitalize">{profile.lifestyle.smoking}</span>
                  </div>
                </div>
              )}

              {profile.lifestyle?.pets && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <PawPrint className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Pets</span>
                    <span className="font-semibold text-[#1A1816] capitalize">{profile.lifestyle.pets}</span>
                  </div>
                </div>
              )}

              {profile.values?.faith && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <Compass className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Faith</span>
                    <span className="font-semibold text-[#1A1816]">{profile.values.faith}</span>
                  </div>
                </div>
              )}

              {profile.values?.familyPlans && (
                <div className="p-3 rounded-xl bg-[#F7F5F0] border border-[#E8E4DC] flex items-center gap-2.5">
                  <HeartHandshake className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Family Plans</span>
                    <span className="font-semibold text-[#1A1816] capitalize">
                      {profile.values.familyPlans.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* REMAINING PROMPTS & PHOTOS */}
        {photos.slice(3).map((photoUrl, photoIndex) => {
          const promptForThisPhoto = prompts[photoIndex + 2];
          return (
            <React.Fragment key={photoIndex}>
              {promptForThisPhoto && (
                <div className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-2">
                  <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#B85A3C] uppercase block">
                    {promptForThisPhoto.question}
                  </span>
                  <p className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-semibold text-[#1A1816] leading-snug italic">
                    "{promptForThisPhoto.answer}"
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="font-['Space_Mono',monospace] text-[10px] uppercase tracking-widest text-[#9C958D]">
                    {String(photoIndex + 4).padStart(2, '0')} / Lookbook
                  </span>
                </div>
                <div className="rounded-2xl overflow-hidden bg-[#E8E4DC] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] border border-[#E8E4DC]">
                  <div className="aspect-[3/4] sm:aspect-[4/5] w-full">
                    <img
                      src={photoUrl}
                      alt={`${profile.name} gallery ${photoIndex + 4}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}

        {/* Any extra prompts beyond photo count */}
        {prompts.slice(Math.max(2, photos.length - 1)).map((prompt) => (
          <div key={prompt.id} className="bg-[#FFFFFF] rounded-2xl border border-[#E8E4DC] p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] space-y-2">
            <span className="font-['Space_Mono',monospace] text-xs font-semibold tracking-wider text-[#B85A3C] uppercase block">
              {prompt.question}
            </span>
            <p className="font-['Cormorant_Garamond',serif] text-2xl sm:text-3xl font-semibold text-[#1A1816] leading-snug italic">
              "{prompt.answer}"
            </p>
          </div>
        ))}
      </main>

      {/* STICKY BOTTOM ACTION BAR (3 Buttons: Pass / SuperLike / Like) */}
      <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto bg-[#FFFFFF]/90 backdrop-blur-xl border border-[#E8E4DC] rounded-full px-6 py-2.5 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] flex items-center gap-6">
          {/* Pass button */}
          <button
            onClick={() => onSwipeLeft(profile)}
            className="w-12 h-12 rounded-full bg-[#FFFFFF] border border-[#E8E4DC] text-[#6B665F] hover:text-[#9B2C2C] hover:bg-[#F5EAE5] hover:border-[#E8D5CD] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="Pass"
            title="Pass"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>

          {/* Super Like button */}
          <button
            onClick={() => onSuperLike(profile)}
            className="w-11 h-11 rounded-full bg-[#FFFFFF] border border-[#E8E4DC] text-[#B85A3C] hover:bg-[#F5EAE5] hover:border-[#B85A3C] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="Super Like"
            title="Super Like"
          >
            <Star className="w-5 h-5 fill-[#B85A3C]" />
          </button>

          {/* Like button */}
          <button
            onClick={() => onSwipeRight(profile)}
            className="w-14 h-14 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white flex items-center justify-center shadow-[0_4px_16px_-2px_rgba(184,90,60,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="Like"
            title="Like"
          >
            <Heart className="w-6 h-6 fill-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
