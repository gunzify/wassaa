import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { 
  Heart, 
  X, 
  Star, 
  Info,
  SlidersHorizontal,
  MapPin,
  RotateCcw
} from 'lucide-react';
import { UserProfile } from '../../types';

interface DiscoverScreenProps {
  currentProfile: UserProfile | undefined;
  nextProfile?: UserProfile | undefined;
  onSwipeLeft: (profile: UserProfile) => void;
  onSwipeRight: (profile: UserProfile) => void;
  onSuperLike: (profile: UserProfile) => void;
  onOpenProfile: (profile: UserProfile) => void;
  onOpenFilter: () => void;
  onResetDeck: () => void;
}

export const DiscoverScreen: React.FC<DiscoverScreenProps> = ({
  currentProfile,
  nextProfile,
  onSwipeLeft,
  onSwipeRight,
  onSuperLike,
  onOpenProfile,
  onOpenFilter,
  onResetDeck
}) => {
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | 'up' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    setCurrentPhotoIndex(0);
  }, [currentProfile?.id]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-18, 18]);
  const activeCardScale = useTransform(x, [-260, 0, 260], [0.97, 1, 0.97]);

  const likeOpacity = useTransform(x, [25, 90], [0, 1]);
  const likeScale = useTransform(x, [25, 90], [0.8, 1.06]);
  const likeRotate = useTransform(x, [25, 90], [-8, -14]);

  const nopeOpacity = useTransform(x, [-25, -90], [0, 1]);
  const nopeScale = useTransform(x, [-25, -90], [0.8, 1.06]);
  const nopeRotate = useTransform(x, [-25, -90], [8, 14]);

  const superLikeOpacity = useTransform(y, [-20, -85], [0, 1]);
  const superLikeScale = useTransform(y, [-20, -85], [0.8, 1.1]);

  const nextCardScale = useTransform(x, [-220, 0, 220], [1, 0.94, 1]);
  const nextCardY = useTransform(x, [-220, 0, 220], [0, 14, 0]);
  const nextCardOpacity = useTransform(x, [-220, 0, 220], [1, 0.65, 1]);

  const handleDragEnd = (_: any, info: { offset: { x: number; y: number }; velocity: { x: number; y: number } }) => {
    setIsDragging(false);
    if (!currentProfile || exitDirection) return;

    const thresholdX = 85;
    const velocityX = 350;
    const thresholdY = -90;
    const velocityY = -350;

    if (info.offset.y < thresholdY || info.velocity.y < velocityY) {
      if (Math.abs(info.offset.x) < 110) {
        setExitDirection('up');
        setTimeout(() => { onSuperLike(currentProfile); setExitDirection(null); }, 220);
        return;
      }
    }

    if (info.offset.x > thresholdX || info.velocity.x > velocityX) {
      setExitDirection('right');
      setTimeout(() => { onSwipeRight(currentProfile); setExitDirection(null); }, 220);
      return;
    }

    if (info.offset.x < -thresholdX || info.velocity.x < -velocityX) {
      setExitDirection('left');
      setTimeout(() => { onSwipeLeft(currentProfile); setExitDirection(null); }, 220);
      return;
    }
  };

  const triggerSwipeRight = () => {
    if (!currentProfile || exitDirection) return;
    setExitDirection('right');
    setTimeout(() => { onSwipeRight(currentProfile); setExitDirection(null); }, 220);
  };

  const triggerSwipeLeft = () => {
    if (!currentProfile || exitDirection) return;
    setExitDirection('left');
    setTimeout(() => { onSwipeLeft(currentProfile); setExitDirection(null); }, 220);
  };

  const triggerSuperLike = () => {
    if (!currentProfile || exitDirection) return;
    setExitDirection('up');
    setTimeout(() => { onSuperLike(currentProfile); setExitDirection(null); }, 220);
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentProfile && currentPhotoIndex < currentProfile.photos.length - 1) {
      setCurrentPhotoIndex((prev) => prev + 1);
    }
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex((prev) => prev - 1);
    }
  };

  const photosCount = currentProfile?.photos.length || 0;

  return (
    <div className="w-full flex flex-col select-none">
      {/* Minimal top bar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-['Cormorant_Garamond',serif] font-semibold text-2xl text-[#1A1816]">
          Discover
        </h1>
        <button
          onClick={onOpenFilter}
          className="p-2.5 text-[#6B665F] hover:text-[#1A1816] hover:bg-[#F0ECE6] rounded-xl transition-colors"
          title="Filters"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Card Deck */}
      <div className="relative w-full aspect-[3/4] max-h-[520px]">
        {/* Underlay next card */}
        {nextProfile && currentProfile && (
          <motion.div
            style={{ scale: nextCardScale, y: nextCardY, opacity: nextCardOpacity }}
            className="absolute inset-0 rounded-2xl overflow-hidden bg-[#1A1816] pointer-events-none will-change-transform"
          >
            {nextProfile.photos[0] && <img src={nextProfile.photos[0]} alt={nextProfile.name} className="w-full h-full object-cover object-top brightness-90" referrerPolicy="no-referrer" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-5 left-5 text-white">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">
                  {nextProfile.name}{nextProfile.age ? `, ${nextProfile.age}` : ''}
                </span>
              </div>
              <span className="text-xs text-white/80">{nextProfile.professionTitle}</span>
            </div>
          </motion.div>
        )}

        {/* Active swipeable card */}
        <AnimatePresence mode="wait">
          {currentProfile ? (
            <motion.div
              key={currentProfile.id}
              style={{ x, y, rotate, scale: activeCardScale }}
              drag={!exitDirection}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.65}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              whileDrag={{ 
                scale: 1.02,
                boxShadow: '0 20px 40px -8px rgba(0, 0, 0, 0.3)'
              }}
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={
                exitDirection === 'right'
                  ? { x: 450, rotate: 22, opacity: 0, transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } }
                  : exitDirection === 'left'
                  ? { x: -450, rotate: -22, opacity: 0, transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } }
                  : exitDirection === 'up'
                  ? { y: -450, scale: 1.06, opacity: 0, transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] } }
                  : { x: 0, y: 0, scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 400, damping: 28 } }
              }
              exit={{ opacity: 0 }}
              className="absolute inset-0 rounded-2xl overflow-hidden bg-[#1A1816] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.2)] flex flex-col justify-between cursor-grab active:cursor-grabbing select-none will-change-transform"
            >
              {/* Photo */}
              {currentProfile.photos[currentPhotoIndex] ? (
                <img src={currentProfile.photos[currentPhotoIndex]} alt={currentProfile.name} className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none transition-opacity duration-300" referrerPolicy="no-referrer" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[#F0ECE6] text-[#6B665F] text-sm">No photo available</div>
              )}

              {/* Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 pointer-events-none" />

              {/* Photo indicators */}
              {photosCount > 1 && (
                <div className="relative z-20 px-4 pt-3 flex gap-1 pointer-events-none">
                  {currentProfile.photos.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-0.5 flex-1 rounded-full transition-all duration-200 ${
                        idx === currentPhotoIndex ? 'bg-white' : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Photo tap zones */}
              {photosCount > 1 && !isDragging && (
                <div className="absolute inset-0 z-10 flex pointer-events-auto">
                  <div onClick={handlePrevPhoto} className="w-1/2 h-2/3 cursor-pointer" />
                  <div onClick={handleNextPhoto} className="w-1/2 h-2/3 cursor-pointer" />
                </div>
              )}

              {/* LIKE stamp */}
              <motion.div
                style={{ opacity: likeOpacity, scale: likeScale, rotate: likeRotate }}
                className="absolute top-12 left-6 z-30 border-2 border-emerald-400 text-emerald-400 px-4 py-1.5 rounded-lg text-lg font-bold tracking-widest uppercase bg-emerald-950/50 backdrop-blur-sm pointer-events-none"
              >
                LIKE
              </motion.div>

              {/* PASS stamp */}
              <motion.div
                style={{ opacity: nopeOpacity, scale: nopeScale, rotate: nopeRotate }}
                className="absolute top-12 right-6 z-30 border-2 border-rose-400 text-rose-400 px-4 py-1.5 rounded-lg text-lg font-bold tracking-widest uppercase bg-rose-950/50 backdrop-blur-sm pointer-events-none"
              >
                PASS
              </motion.div>

              {/* SUPER LIKE stamp */}
              <motion.div
                style={{ opacity: superLikeOpacity, scale: superLikeScale }}
                className="absolute top-12 left-1/2 -translate-x-1/2 z-30 border-2 border-sky-400 text-sky-400 px-4 py-1.5 rounded-lg text-lg font-bold tracking-widest uppercase bg-sky-950/50 backdrop-blur-sm pointer-events-none"
              >
                SUPER LIKE
              </motion.div>

              {/* Info button */}
              <div className="relative z-20 p-4 flex justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenProfile(currentProfile); }}
                  className="w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white flex items-center justify-center transition-colors border border-white/10 active:scale-95 cursor-pointer"
                  title="View profile"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>

              {/* Profile info overlay */}
              <div className="relative z-20 p-5 text-white">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-['Cormorant_Garamond',serif] text-3xl font-semibold">
                    {currentProfile.name}, {currentProfile.age}
                  </h3>
                  {currentProfile.verification?.status === 'verified' && (
                    <span className="text-[#2C6B56] text-xs font-semibold bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded" title="Verified">
                      ✓
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-sm text-white/85 mb-2">
                  <span>{currentProfile.professionTitle}</span>
                  <span className="text-white/40">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-white/60" />
                    {currentProfile.city}
                  </span>
                </div>

                {currentProfile.bio && (
                  <p className="text-sm text-white/75 line-clamp-2 leading-relaxed mb-3">
                    {currentProfile.bio}
                  </p>
                )}

                {currentProfile.interests && currentProfile.interests.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {currentProfile.interests.slice(0, 4).map((interest, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md bg-white/10 text-xs text-white/85 font-medium"
                      >
                        {interest}
                      </span>
                    ))}
                    {currentProfile.interests.length > 4 && (
                      <span className="px-2 py-1 text-xs text-white/50">
                        +{currentProfile.interests.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* Empty state */
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-[#E8E4DC]"
            >
              <div className="w-16 h-16 rounded-full bg-[#F5EAE5] flex items-center justify-center mb-4">
                <Heart className="w-7 h-7 text-[#B85A3C]" />
              </div>
              <h4 className="font-['Cormorant_Garamond',serif] text-xl font-semibold text-[#1A1816] mb-2">
                You're all caught up
              </h4>
              <p className="text-sm text-[#6B665F] mb-6 max-w-[240px] leading-relaxed">
                You've seen everyone matching your preferences. Check back soon or adjust your filters.
              </p>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={onResetDeck}
                className="py-2.5 px-6 rounded-full bg-[#B85A3C] text-white text-sm font-semibold shadow-[0_4px_16px_-2px_rgba(184,90,60,0.3)] hover:bg-[#A04E33] transition-colors cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Refresh
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action buttons — 3 core actions */}
      <div className="flex items-center justify-center gap-4 pt-5 pb-2">
        {/* Pass */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={triggerSwipeLeft}
          disabled={!currentProfile || !!exitDirection}
          className="w-14 h-14 rounded-full bg-white border border-[#E8E4DC] text-[#9C958D] hover:text-[#9B2C2C] hover:border-[#9B2C2C]/20 flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Pass"
        >
          <X className="w-6 h-6 stroke-[2]" />
        </motion.button>

        {/* Super Like */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={triggerSuperLike}
          disabled={!currentProfile || !!exitDirection}
          className="w-11 h-11 rounded-full bg-white border border-[#E8E4DC] text-[#2A3A2C] hover:text-[#2A3A2C] hover:bg-[#E8EDE9] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Super Like"
        >
          <Star className="w-5 h-5" />
        </motion.button>

        {/* Like */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={triggerSwipeRight}
          disabled={!currentProfile || !!exitDirection}
          className="w-14 h-14 rounded-full bg-[#B85A3C] text-white hover:bg-[#A04E33] flex items-center justify-center shadow-[0_4px_16px_-2px_rgba(184,90,60,0.3)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Like"
        >
          <Heart className="w-6 h-6 fill-white" />
        </motion.button>
      </div>
    </div>
  );
};
