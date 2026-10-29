import React, { useState } from 'react';
import { motion } from 'motion/react';
import { MapPin, RefreshCw, SlidersHorizontal, Compass } from 'lucide-react';
import { UserProfile } from '../../types';
import { VerifiedMark } from '../common/VerifiedMark';
import { locationLine, serviceShort } from '../../lib/profile-display';

interface ExploreScreenProps {
  profiles: UserProfile[];
  loading?: boolean;
  onOpenProfile: (profile: UserProfile) => void;
  onRefresh: () => void;
  onOpenFilter: () => void;
  onDiscover: () => void;
}

/**
 * Explore: the same people as the deck, shown as a grid for browsing rather
 * than judging. Tiles keep the card's hierarchy (name → service → place) so
 * the two surfaces read as one product.
 */
export const ExploreScreen: React.FC<ExploreScreenProps> = ({
  profiles,
  loading = false,
  onOpenProfile,
  onRefresh,
  onOpenFilter,
  onDiscover
}) => {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    <div className="w-full">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-title">Explore</h1>
          <p className="t-meta mt-0.5">
            {profiles.length > 0
              ? `${profiles.length} ${profiles.length === 1 ? 'person' : 'people'} near you`
              : 'People who match your preferences.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="icon-btn icon-btn-ghost"
            aria-label="Refresh people"
            title="Refresh"
          >
            <RefreshCw className={`h-[1.15rem] w-[1.15rem] ${refreshing ? 'animate-spin' : ''}`} />
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
      </header>

      {profiles.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Compass className="h-6 w-6" />
          </div>
          <h2 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">
            {loading ? 'Looking around…' : 'Nobody new right now'}
          </h2>
          <p className="mt-2 max-w-[17rem] text-[0.875rem] leading-relaxed text-ink-soft">
            {loading
              ? 'Gathering people who fit what you are looking for.'
              : 'Widen your filters or come back later — new members join every day.'}
          </p>
          {!loading && (
            <div className="mt-6 flex items-center gap-2">
              <button type="button" onClick={onOpenFilter} className="btn btn-sm btn-secondary">
                Adjust filters
              </button>
              <button type="button" onClick={onDiscover} className="btn btn-sm btn-primary">
                Back to Discover
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {profiles.map((profile, index) => (
            <motion.button
              key={profile.id}
              type="button"
              onClick={() => onOpenProfile(profile)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: Math.min(index, 7) * 0.035, ease: [0.22, 0.61, 0.36, 1] }}
              className="group relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-black text-left shadow-subtle"
              aria-label={`View ${profile.name}'s profile`}
            >
              {profile.photos[0] ? (
                <img
                  src={profile.photos[0]}
                  alt={profile.name}
                  loading="lazy"
                  className="h-full w-full object-cover object-[50%_28%] transition-transform duration-500 group-hover:scale-[1.03]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-subtle text-[0.75rem] text-ink-muted">
                  No photo
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

              {profile.verification?.status === 'verified' && (
                <span className="absolute right-2 top-2 rounded-full bg-black/25 p-1 backdrop-blur-md">
                  <VerifiedMark size={17} variant="onPhoto" />
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                <p className="flex items-end gap-1 font-['Cormorant_Garamond',serif] text-[1.05rem] font-semibold leading-[1.1]">
                  <span className="truncate">{profile.name}</span>
                  {profile.age ? <span className="shrink-0 text-white/70">{profile.age}</span> : null}
                </p>
                <p className="mt-0.5 truncate text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-white/75">
                  {serviceShort(profile)}
                </p>
                {locationLine(profile) && (
                  <p className="mt-1 flex items-center gap-1 truncate text-[0.6875rem] text-white/60">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {locationLine(profile)}
                  </p>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};
