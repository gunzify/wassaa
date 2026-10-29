import React, { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { motion, animate, useMotionValue, useTransform } from 'motion/react';
import {
  Heart,
  X,
  Star,
  SlidersHorizontal,
  MapPin,
  RotateCcw,
  Coins,
  Maximize2
} from 'lucide-react';
import { UserProfile } from '../../types';
import { VerifiedMark } from '../common/VerifiedMark';
import {
  serviceLine,
  locationLine,
  quoteLine,
  interestChips,
  nameLine
} from '../../lib/profile-display';

interface DiscoverScreenProps {
  currentProfile: UserProfile | undefined;
  nextProfile?: UserProfile | undefined;
  /** Current credit balance shown in the top bar (KB §18E). */
  credits?: number;
  onSwipeLeft: (profile: UserProfile) => void;
  onSwipeRight: (profile: UserProfile) => void;
  onSuperLike: (profile: UserProfile) => void;
  onOpenProfile: (profile: UserProfile) => void;
  onOpenFilter: () => void;
  onOpenStore: () => void;
  onResetDeck: () => void;
}

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({
  currentProfile,
  nextProfile,
  credits,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
  onOpenProfile,
  onOpenFilter,
  onOpenStore,
  onResetDeck
}) => {
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | 'up' | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [currentProfile?.id]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const cardOpacity = useMotionValue(1);
  const rotate = useTransform(x, [-280, 280], [-12, 12]);

  const likeOpacity = useTransform(x, [20, 80], [0, 1]);
  const likeScale = useTransform(x, [20, 80], [0.82, 1.04]);
  const likeRotate = useTransform(x, [20, 80], [-5, -10]);

  const nopeOpacity = useTransform(x, [-20, -80], [0, 1]);
  const nopeScale = useTransform(x, [-20, -80], [0.82, 1.04]);
  const nopeRotate = useTransform(x, [-20, -80], [5, 10]);

  // A flick needs less travel than a slow drag, so the deck answers the same
  // gesture whether it was thrown or pushed.
  const SWIPE_TRAVEL = 78;
  const SWIPE_FLICK = 0.22;

  const superLikeOpacity = useTransform(y, [-16, -76], [0, 1]);
  const superLikeScale = useTransform(y, [-16, -76], [0.82, 1.04]);

  const nextCardScale = useTransform(x, [-220, 0, 220], [1, 0.95, 1]);
  const nextCardY = useTransform(x, [-220, 0, 220], [0, 12, 0]);
  const nextCardOpacity = useTransform(x, [-220, 0, 220], [1, 0.7, 1]);

  // A photo-zone tap must never fire straight after a real drag.
  const suppressTapUntil = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  // Reset before paint so the next card never flashes at the previous card's
  // flung-off position. Animating motion values directly (instead of relying on
  // AnimatePresence to swap keyed children) keeps the handoff frame-perfect.
  useLayoutEffect(() => {
    // The outgoing card's animation may still be in flight when the next
    // profile renders; stop it before resetting, or it lands the fresh card on
    // the old exit transform.
    x.stop();
    y.stop();
    cardOpacity.stop();
    x.set(0);
    y.set(0);
    cardOpacity.set(1);
    setExitDirection(null);
  }, [currentProfile?.id, x, y, cardOpacity]);

  const settleDeck = (direction: 'left' | 'right' | 'up') => {
    if (!currentProfile || exitDirection) return;
    setExitDirection(direction);
    const ease = [0.22, 0.61, 0.36, 1] as const;
    animate(x, direction === 'left' ? -520 : direction === 'right' ? 520 : 0, { duration: 0.24, ease });
    animate(y, direction === 'up' ? -520 : 0, { duration: 0.24, ease });
    animate(cardOpacity, 0, { duration: 0.22, ease });
    window.setTimeout(() => {
      if (direction === 'left') onSwipeLeft(currentProfile);
      if (direction === 'right') onSwipeRight(currentProfile);
      if (direction === 'up') onSuperLike(currentProfile);
      setExitDirection(null);
    }, 245);
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
    suppressTapUntil.current = Date.now() + 260;
    if (!currentProfile || exitDirection) return;

    const travelX = info.offset.x + info.velocity.x * SWIPE_FLICK;
    const travelY = info.offset.y + info.velocity.y * SWIPE_FLICK;

    if (travelY < -100 && Math.abs(info.offset.x) < Math.abs(info.offset.y)) {
      settleDeck('up');
      return;
    }
    if (travelX > SWIPE_TRAVEL) {
      settleDeck('right');
      return;
    }
    if (travelX < -SWIPE_TRAVEL) {
      settleDeck('left');
      return;
    }

    // Under threshold: spring home instead of leaving the card half-offset.
    animate(x, 0, { type: 'spring', stiffness: 480, damping: 34 });
    animate(y, 0, { type: 'spring', stiffness: 480, damping: 34 });
  };

  const canCyclePhotos = () => {
    if (!currentProfile || currentProfile.photos.length < 2) return false;
    return Date.now() >= suppressTapUntil.current;
  };

  const showPrevPhoto = () => {
    if (!canCyclePhotos()) return;
    setCurrentPhotoIndex((i) => (i > 0 ? i - 1 : currentProfile!.photos.length - 1));
  };

  const showNextPhoto = () => {
    if (!canCyclePhotos()) return;
    setCurrentPhotoIndex((i) => (i + 1) % currentProfile!.photos.length);
  };

  const photosCount = currentProfile?.photos.length || 0;
  const hobbies = currentProfile ? interestChips(currentProfile, 5) : [];

  return (
    <div className="flex w-full select-none flex-col">
      {/* Top bar: credits live here, not in the dock */}
      <div className="mb-2.5 flex items-center justify-between">
        <h1 className="t-title">Discover</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenStore}
            className="chip"
            title="Credits — tap to top up"
            aria-label={`Credits: ${typeof credits === 'number' ? credits : 0}. Open the credit store.`}
          >
            <Coins className="h-4 w-4 text-brand" />
            <span className="tabular-nums">{typeof credits === 'number' ? credits : 0}</span>
          </button>
          <button
            type="button"
            onClick={onOpenFilter}
            className="icon-btn icon-btn-ghost"
            aria-label="Discovery filters"
            title="Filters"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Stage — takes every pixel the header, actions and dock leave over, so
          the card is as bold as the device allows. */}
      <div className="relative h-[clamp(20rem,calc(100dvh-14.75rem),46rem)] w-full">
        {nextProfile && currentProfile && (
          <motion.div
            style={{ scale: nextCardScale, y: nextCardY, opacity: nextCardOpacity }}
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem] bg-black will-change-transform"
            aria-hidden="true"
          >
            {nextProfile.photos[0] ? (
              <img
                src={nextProfile.photos[0]}
                alt=""
                className="h-full w-full object-cover object-[50%_32%] brightness-90"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </motion.div>
        )}

        {currentProfile ? (
            <motion.div
              key={currentProfile.id}
              style={{ x, y, rotate, opacity: cardOpacity }}
              drag={exitDirection ? false : true}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.72}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              className="absolute inset-0 flex cursor-grab touch-none flex-col justify-end overflow-hidden rounded-[1.75rem] bg-black shadow-[0_18px_50px_-18px_rgba(26,24,22,0.55)] select-none will-change-transform active:cursor-grabbing"
            >
              {currentProfile.photos[currentPhotoIndex] ? (
                <img
                  src={currentProfile.photos[currentPhotoIndex]}
                  alt={currentProfile.name}
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[50%_32%]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-subtle text-sm text-ink-soft">
                  No photo available
                </div>
              )}

              {/* Readability scrim */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />

              {/* Photo progress */}
              {photosCount > 1 && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex gap-1.5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                  {currentProfile.photos.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                        idx === currentPhotoIndex ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Decorative cue that the centre opens the full profile */}
              <div className="pointer-events-none absolute right-3.5 top-3.5 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-black/30 text-white/80 backdrop-blur-md">
                <Maximize2 className="h-3.5 w-3.5" />
              </div>

              {/* Tap zones: left / right cycle photos, centre opens the profile */}
              <div className="absolute inset-0 z-10 flex" aria-hidden="false">
                <button
                  type="button"
                  onClick={showPrevPhoto}
                  onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY }; }}
                  onPointerUp={(e) => {
                    const start = pointerStart.current;
                    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
                  }}
                  className="h-full w-[32%] cursor-pointer bg-transparent"
                  aria-label={photosCount > 1 ? 'Previous photo' : undefined}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (Date.now() < suppressTapUntil.current) return;
                    onOpenProfile(currentProfile);
                  }}
                  className="h-full w-[36%] cursor-pointer bg-transparent"
                  aria-label={`Open ${currentProfile.name}'s full profile`}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  onClick={showNextPhoto}
                  onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY }; }}
                  className="h-full w-[32%] cursor-pointer bg-transparent"
                  aria-label={photosCount > 1 ? 'Next photo' : undefined}
                  tabIndex={-1}
                />
              </div>

              {/* Drag stamps */}
              <motion.div
                style={{ opacity: likeOpacity, scale: likeScale, rotate: likeRotate }}
                className="pointer-events-none absolute left-5 top-[22%] z-30 rounded-xl border-2 border-emerald-300/90 px-3.5 py-1.5 text-base font-extrabold uppercase tracking-[0.2em] text-emerald-200 backdrop-blur-sm"
              >
                Like
              </motion.div>
              <motion.div
                style={{ opacity: nopeOpacity, scale: nopeScale, rotate: nopeRotate }}
                className="pointer-events-none absolute right-5 top-[22%] z-30 rounded-xl border-2 border-rose-300/90 px-3.5 py-1.5 text-base font-extrabold uppercase tracking-[0.2em] text-rose-200 backdrop-blur-sm"
              >
                Pass
              </motion.div>
              <motion.div
                style={{ opacity: superLikeOpacity, scale: superLikeScale }}
                className="pointer-events-none absolute left-1/2 top-[18%] z-30 -translate-x-1/2 rounded-xl border-2 border-sky-300/90 px-3.5 py-1.5 text-sm font-extrabold uppercase tracking-[0.2em] text-sky-200 backdrop-blur-sm"
              >
                Super like
              </motion.div>

              {/* The card's story: name → service → place → words → hobbies */}
              <div className="pointer-events-none relative z-20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white">
                <div className="flex items-end gap-2">
                  <h2 className="font-['Cormorant_Garamond',serif] text-[2.35rem] font-semibold leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
                    {nameLine(currentProfile)}
                  </h2>
                  {currentProfile.verification?.status === 'verified' && (
                    <VerifiedMark size={21} variant="onPhoto" className="mb-2" />
                  )}
                </div>

                <p className="mt-1.5 truncate text-[0.78125rem] font-bold uppercase tracking-[0.15em] text-white/85">
                  {serviceLine(currentProfile)}
                </p>

                {locationLine(currentProfile) && (
                  <p className="mt-1 flex items-center gap-1.5 text-[0.875rem] text-white/70">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-white/50" />
                    {locationLine(currentProfile)}
                  </p>
                )}

                {quoteLine(currentProfile) && (
                  <>
                    <div className="mt-3 h-px w-10 bg-white/25" aria-hidden="true" />
                    <p className="mt-3 line-clamp-3 text-[0.9375rem] leading-relaxed text-white/85">
                      {quoteLine(currentProfile)}
                    </p>
                  </>
                )}

                {hobbies.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {hobbies.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/18 bg-white/12 px-2.5 py-1 text-[0.75rem] font-medium text-white/90 backdrop-blur-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.75rem] border border-line bg-surface px-8 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
                <Heart className="h-7 w-7 text-brand" />
              </div>
              <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">You're all caught up</h3>
              <p className="mt-2 mb-6 max-w-[16rem] text-sm leading-relaxed text-ink-soft">
                You've seen everyone matching your preferences. Check back soon, or widen your filters.
              </p>
              <button type="button" onClick={onResetDeck} className="btn btn-primary btn-sm">
                <RotateCcw className="h-4 w-4" />
                Refresh
              </button>
            </motion.div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-[1.1rem] pt-4">
        <button
          type="button"
          onClick={() => settleDeck('left')}
          disabled={!currentProfile || !!exitDirection}
          className="flex h-[3.5rem] w-[3.5rem] items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-[0_2px_10px_-2px_rgba(26,24,22,0.14)] transition-colors hover:border-danger/30 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Pass"
          title="Pass"
        >
          <X className="h-[1.5rem] w-[1.5rem]" strokeWidth={2.3} />
        </button>

        <button
          type="button"
          onClick={() => settleDeck('up')}
          disabled={!currentProfile || !!exitDirection}
          className="flex h-[3rem] w-[3rem] items-center justify-center rounded-full border border-line bg-surface text-verified shadow-[0_2px_10px_-2px_rgba(26,24,22,0.14)] transition-colors hover:border-verified/40 hover:bg-verified-tint disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Super like"
          title="Super like"
        >
          <Star className="h-[1.35rem] w-[1.35rem]" />
        </button>

        <button
          type="button"
          onClick={() => settleDeck('right')}
          disabled={!currentProfile || !!exitDirection}
          className="flex h-[3.5rem] w-[3.5rem] items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_22px_-8px_rgba(184,90,60,0.75)] transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Like"
          title="Like"
        >
          <Heart className="h-[1.5rem] w-[1.5rem] fill-white" />
        </button>
      </div>
    </div>
  );
};
