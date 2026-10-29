import React, { useState } from 'react';
import { Heart, ChevronRight, Lock, MessageSquare, ArrowRight, Sparkles } from 'lucide-react';
import { MatchItem, UserProfile } from '../../types';
import { VerifiedMark } from '../common/VerifiedMark';
import { locationLine, serviceShort } from '../../lib/profile-display';

interface MatchesListScreenProps {
  /** 'matches' = the Matches tab (matches + likes). 'messages' = the Messages tab (conversations only). */
  variant?: 'matches' | 'messages';
  matches: MatchItem[];
  likesReceived?: UserProfile[];
  canSeeLikes?: boolean;
  /** Credit reveal state: likes stay hidden until revealed (KB §18E). */
  likesLocked?: boolean;
  likesCost?: number;
  onRevealLikes?: () => void;
  onSelectMatch: (matchId: string) => void;
  onLikeBack?: (profile: UserProfile) => void;
  onOpenUpgrade?: () => void;
  onDiscover?: () => void;
  /** People from the deck, shown below a short list so the page still works. */
  suggestions?: UserProfile[];
  onOpenSuggestion?: (profile: UserProfile) => void;
}

/** "20:41" today, "Tue" this week, "12 Oct" after that. */
function formatStamp(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (days >= 0 && days < 6) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const MatchesListScreen: React.FC<MatchesListScreenProps> = ({
  variant = 'matches',
  matches,
  likesReceived = [],
  canSeeLikes = false,
  likesLocked = false,
  likesCost = 15,
  onRevealLikes,
  onSelectMatch,
  onLikeBack,
  onOpenUpgrade,
  onDiscover,
  suggestions = [],
  onOpenSuggestion
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'likes'>('matches');
  const isMessages = variant === 'messages';
  const count = isMessages ? matches.length : activeTab === 'matches' ? matches.length : likesReceived.length;

  const conversationList = (
    <div className="card card-flush overflow-hidden">
      {matches.map((match, index) => (
        <React.Fragment key={match.id}>
          {index > 0 && <div className="ml-[5.5rem] h-px bg-line-soft" />}
          <button
            type="button"
            onClick={() => onSelectMatch(match.id)}
            className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-subtle"
          >
            {match.profile.photos[0] ? (
              <img
                src={match.profile.photos[0]}
                alt=""
                className="h-[3.75rem] w-[3.75rem] shrink-0 rounded-full object-cover object-[50%_32%] ring-1 ring-line"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="h-[3.75rem] w-[3.75rem] shrink-0 rounded-full bg-surface-subtle" />
            )}

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[1.0625rem] font-semibold leading-tight text-ink">
                  {match.profile.name}
                  {match.profile.age ? <span className="font-normal text-ink-soft">, {match.profile.age}</span> : null}
                </span>
                {match.profile.verification?.status === 'verified' && <VerifiedMark size={16} />}
              </span>
              <span className="mt-0.5 block truncate text-[0.84375rem] text-ink-soft">
                {serviceShort(match.profile)}
                {locationLine(match.profile) ? ` · ${locationLine(match.profile)}` : ''}
              </span>
              <span
                className={`mt-1 block truncate text-[0.875rem] ${
                  match.unreadCount > 0 ? 'font-semibold text-ink' : 'text-brand'
                }`}
              >
                {match.lastMessage || 'You matched — say hello'}
              </span>
            </span>

            <span className="ml-1 flex shrink-0 flex-col items-end gap-1.5 self-stretch py-0.5">
              <span className="text-[0.6875rem] font-medium uppercase tracking-[0.06em] text-ink-muted">
                {formatStamp(match.lastMessageTime || match.matchedAt)}
              </span>
              <span className="flex items-center gap-1">
                {match.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[0.6875rem] font-bold text-white">
                    {match.unreadCount > 9 ? '9+' : match.unreadCount}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-ink-muted transition-colors group-hover:text-ink" />
              </span>
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );

  const suggestionRail = suggestions.length > 0 && (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
        <h2 className="t-section">More people to meet</h2>
        {onDiscover && (
          <button
            type="button"
            onClick={onDiscover}
            className="flex items-center gap-1 text-[0.8125rem] font-semibold text-brand"
          >
            Discover
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {suggestions.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => onOpenSuggestion?.(profile)}
            className="group relative aspect-[3/4] w-[8rem] shrink-0 overflow-hidden rounded-2xl bg-black text-left shadow-subtle"
            aria-label={`View ${profile.name}`}
          >
            {profile.photos[0] ? (
              <img
                src={profile.photos[0]}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover object-[50%_32%] transition-transform duration-500 group-hover:scale-[1.04]"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
            {profile.verification?.status === 'verified' && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-black/25 p-0.5 backdrop-blur-md">
                <VerifiedMark size={14} variant="onPhoto" />
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 p-2.5">
              <span className="flex items-baseline gap-1 font-['Cormorant_Garamond',serif] text-[1rem] font-semibold leading-tight text-white">
                <span className="truncate">{profile.name.split(' ')[0]}</span>
                {profile.age ? <span className="shrink-0 font-normal text-white/65">{profile.age}</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-[0.5625rem] font-semibold uppercase tracking-[0.07em] text-white/70">
                {serviceShort(profile)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="w-full">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-title">
            {isMessages ? 'Messages' : activeTab === 'matches' ? 'Your matches' : 'Likes you'}
          </h1>
          <p className="t-meta mt-0.5 max-w-[19rem]">
            {isMessages
              ? 'Your conversations — pick up where you left off.'
              : activeTab === 'matches'
              ? 'Mutual connections ready to start a conversation.'
              : 'People who have already shown interest.'}
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-[0.75rem] font-semibold text-brand">
          {count}{' '}
          {isMessages
            ? count === 1
              ? 'chat'
              : 'chats'
            : activeTab === 'matches'
            ? count === 1
              ? 'match'
              : 'matches'
            : count === 1
            ? 'like'
            : 'likes'}
        </span>
      </div>

      {!isMessages && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-surface-subtle p-1" role="tablist" aria-label="Connections">
          {(
            [
              ['matches', 'Matches'],
              ['likes', 'Likes you']
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full py-2.5 text-[0.875rem] font-semibold transition-colors ${
                activeTab === tab ? 'bg-surface text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {label}
              {tab === 'likes' && canSeeLikes && likesReceived.length > 0 ? (
                <span className="ml-1.5 text-[0.75rem] text-brand">{likesReceived.length}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {isMessages ? (
        matches.length > 0 ? (
          <>
            {conversationList}
            {suggestionRail}
          </>
        ) : (
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">No messages yet</h2>
            <p className="mt-2 max-w-[17rem] text-[0.875rem] leading-relaxed text-ink-soft">
              When you and another member like each other, your conversation lands here.
            </p>
            {onDiscover && (
              <button type="button" onClick={onDiscover} className="btn btn-sm btn-primary mt-6">
                Discover people
              </button>
            )}
          </div>
        )
      ) : activeTab === 'likes' && likesLocked ? (
        <div className="card flex flex-col items-center px-6 py-9 text-center">
          <div className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-tint text-brand">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">See who likes you</h2>
          <p className="mt-2 mb-5 max-w-[17rem] text-[0.875rem] leading-relaxed text-ink-soft">
            Unlock every incoming like for 24 hours.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRevealLikes} className="btn btn-sm btn-primary">
              Unlock for {likesCost} credits
            </button>
            {onOpenUpgrade && (
              <button type="button" onClick={onOpenUpgrade} className="btn btn-sm btn-secondary">
                Get credits
              </button>
            )}
          </div>
        </div>
      ) : activeTab === 'likes' && likesReceived.length > 0 ? (
        <>
          <div className="card card-flush overflow-hidden">
            {likesReceived.map((profile, index) => (
              <React.Fragment key={profile.id}>
                {index > 0 && <div className="ml-[4.5rem] h-px bg-line-soft" />}
                <article className="flex items-center gap-3 px-4 py-4">
                  {profile.photos[0] ? (
                    <img
                      src={profile.photos[0]}
                      alt={profile.name}
                      className="h-[3.75rem] w-[3.75rem] shrink-0 rounded-full object-cover object-[50%_32%] ring-1 ring-line"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="h-[3.75rem] w-[3.75rem] shrink-0 rounded-full bg-surface-subtle" />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="flex items-center gap-1.5 text-[1.0625rem] font-semibold leading-tight">
                      <span className="truncate">
                        {profile.name}
                        {profile.age ? <span className="font-normal text-ink-soft">, {profile.age}</span> : null}
                      </span>
                      {profile.verification?.status === 'verified' && <VerifiedMark size={15} />}
                    </h3>
                    <p className="mt-0.5 truncate text-[0.8125rem] text-ink-soft">
                      {serviceShort(profile)}
                      {locationLine(profile) ? ` · ${locationLine(profile)}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => onLikeBack?.(profile)} className="btn btn-sm btn-primary shrink-0 px-4">
                    Like back
                  </button>
                </article>
              </React.Fragment>
            ))}
          </div>
          {suggestionRail}
        </>
      ) : activeTab === 'matches' && matches.length > 0 ? (
        <>
          {conversationList}
          {suggestionRail}
        </>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-brand">
            {activeTab === 'likes' ? <Sparkles className="h-6 w-6" /> : <Heart className="h-6 w-6" />}
          </div>
          <h2 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">
            {activeTab === 'likes' ? 'No likes waiting' : 'No mutual connections yet'}
          </h2>
          <p className="mt-2 max-w-[17rem] text-[0.875rem] leading-relaxed text-ink-soft">
            {activeTab === 'likes'
              ? 'When someone likes your profile, they will appear here.'
              : 'Like someone in Discover — when they like you back, you both show up here.'}
          </p>
          <button type="button" onClick={onDiscover} className="btn btn-sm btn-primary mt-6">
            Discover people
          </button>
        </div>
      )}
    </div>
  );
};
