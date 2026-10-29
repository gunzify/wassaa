import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  Heart,
  X,
  Star,
  MapPin,
  Briefcase,
  GraduationCap,
  Sparkles,
  Quote,
  Activity,
  Wine,
  Cigarette,
  PawPrint,
  HeartHandshake,
  Compass
} from 'lucide-react';
import { UserProfile } from '../../types';
import { VerifiedMark } from '../common/VerifiedMark';
import { affiliationLine, locationLine, nameLine, quoteLine } from '../../lib/profile-display';

interface ProfileDetailScreenProps {
  profile: UserProfile;
  onBack: () => void;
  onSwipeLeft: (profile: UserProfile) => void;
  onSwipeRight: (profile: UserProfile) => void;
  onSuperLike: (profile: UserProfile) => void;
}

/**
 * The full profile a member opens from the centre of a Discover card.
 * One scrollable column, a swipeable photo hero, and a pinned action bar.
 */
export const ProfileDetailScreen: React.FC<ProfileDetailScreenProps> = ({
  profile,
  onBack,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike
}) => {
  const [photoIndex, setPhotoIndex] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);

  if (!profile) return null;

  const photos = (profile.photos || []).filter(Boolean);
  const prompts = (profile.prompts || []).filter((p) => p.answer?.trim());
  const interests = profile.interests || [];
  const bio = quoteLine(profile);

  const lifestyle = [
    profile.lifestyle?.exercise && { icon: Activity, label: 'Exercise', value: profile.lifestyle.exercise },
    profile.lifestyle?.drinking && { icon: Wine, label: 'Drinking', value: profile.lifestyle.drinking },
    profile.lifestyle?.smoking && { icon: Cigarette, label: 'Smoking', value: profile.lifestyle.smoking },
    profile.lifestyle?.pets && { icon: PawPrint, label: 'Pets', value: profile.lifestyle.pets },
    profile.values?.faith && { icon: Compass, label: 'Faith', value: profile.values.faith },
    profile.values?.familyPlans && {
      icon: HeartHandshake,
      label: 'Family plans',
      value: profile.values.familyPlans.replace(/_/g, ' ')
    }
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[34rem] items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-brand-tint"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Profile
            </span>
            <span className="block truncate text-[0.9375rem] font-semibold leading-tight">{profile.name}</span>
          </div>
          <span className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[34rem] px-4 pb-36 pt-3">
          {/* Photo hero */}
          <div className="relative overflow-hidden rounded-[1.75rem] bg-black shadow-card">
            {photos.length ? (
              <div
                ref={galleryRef}
                onScroll={(event) => {
                  const el = event.currentTarget;
                  const next = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
                  if (next !== photoIndex) setPhotoIndex(next);
                }}
                className="-mx-px flex h-[clamp(22rem,58dvh,34rem)] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label={`${profile.name}'s photos`}
              >
                {photos.map((photo, index) => (
                  <img
                    key={photo + index}
                    src={photo}
                    alt={`${profile.name}, photo ${index + 1}`}
                    className="h-full w-full shrink-0 snap-center object-cover object-[50%_28%]"
                    referrerPolicy="no-referrer"
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-72 items-center justify-center bg-surface-subtle text-[0.875rem] text-ink-muted">
                No photo provided
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/5" />

            {photos.length > 1 && (
              <div className="pointer-events-none absolute inset-x-0 top-0 flex gap-1.5 px-3 pt-3">
                {photos.map((_, index) => (
                  <span
                    key={index}
                    className={`h-[3px] flex-1 rounded-full transition-all ${index === photoIndex ? 'bg-white' : 'bg-white/30'}`}
                  />
                ))}
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 text-white">
              <div className="flex items-end gap-2">
                <h1 className="font-['Cormorant_Garamond',serif] text-[2rem] font-semibold leading-none tracking-tight">
                  {nameLine(profile)}
                </h1>
                {profile.verification?.status === 'verified' && (
                  <VerifiedMark size={20} variant="onPhoto" className="mb-0.5" />
                )}
              </div>
              <p className="mt-2 text-[0.8125rem] font-semibold uppercase tracking-[0.13em] text-white/80">
                {affiliationLine(profile)}
              </p>
              {locationLine(profile) && (
                <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-white/70">
                  <MapPin className="h-3.5 w-3.5 text-white/55" />
                  {locationLine(profile)}
                  {profile.distanceKm !== undefined ? ` · ${profile.distanceKm} km` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Quick facts */}
          <section className="card card-pad mt-4 space-y-3">
            <div className="flex items-start gap-3 border-b border-line-soft pb-3">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Service & work
                </p>
                <p className="mt-0.5 text-[0.9375rem] font-medium leading-snug">{affiliationLine(profile)}</p>
                {profile.skill ? (
                  <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{profile.skill}</p>
                ) : null}
              </div>
            </div>

            {profile.almaMater && (
              <div className="flex items-center gap-3">
                <GraduationCap className="h-4 w-4 shrink-0 text-brand" />
                <p className="text-[0.875rem] text-ink">{profile.almaMater}</p>
              </div>
            )}

            {profile.datingGoal && (
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 shrink-0 text-brand" />
                <p className="text-[0.875rem] font-medium capitalize text-brand">
                  {profile.datingGoal.replace(/_/g, ' ')}
                </p>
              </div>
            )}
          </section>

          {/* About */}
          {bio && (
            <section className="card card-pad relative mt-3">
              <Quote className="pointer-events-none absolute right-4 top-4 h-7 w-7 text-brand/15" />
              <h2 className="t-section mb-2">In their words</h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink">{bio}</p>
            </section>
          )}

          {/* Conversation prompts */}
          {prompts.slice(0, 3).map((prompt) => (
            <section key={prompt.id} className="card card-pad mt-3">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-brand">
                {prompt.question}
              </p>
              <p className="mt-2 font-['Cormorant_Garamond',serif] text-[1.5rem] font-medium italic leading-snug">
                “{prompt.answer}”
              </p>
            </section>
          ))}

          {/* Interests */}
          {interests.length > 0 && (
            <section className="mt-5">
              <h2 className="t-section mb-2 px-1">Hobbies</h2>
              <div className="flex flex-wrap gap-2">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.8125rem] font-medium text-ink"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Lifestyle */}
          {lifestyle.length > 0 && (
            <section className="card card-flush mt-5">
              <h2 className="t-section px-4 pb-2 pt-4">Lifestyle</h2>
              <div className="grid grid-cols-2 gap-px bg-line-soft">
                {lifestyle.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-2.5 bg-surface px-3.5 py-3">
                    <Icon className="h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0">
                      <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-ink-muted">{label}</p>
                      <p className="truncate text-[0.8125rem] font-semibold capitalize text-ink">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex items-center gap-5 rounded-full border border-line bg-surface/90 px-5 py-2.5 shadow-raised backdrop-blur-xl">
          <button
            type="button"
            onClick={() => onSwipeLeft(profile)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink-soft transition-colors hover:border-danger/30 hover:text-danger"
            aria-label="Pass"
            title="Pass"
          >
            <X className="h-5 w-5 stroke-[2.4]" />
          </button>
          <button
            type="button"
            onClick={() => onSuperLike(profile)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-verified transition-colors hover:bg-verified-tint"
            aria-label="Super like"
            title="Super like"
          >
            <Star className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onSwipeRight(profile)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-brand transition-colors hover:bg-brand-dark"
            aria-label="Like"
            title="Like"
          >
            <Heart className="h-6 w-6 fill-white" />
          </button>
        </div>
      </div>
    </div>
  );
};
