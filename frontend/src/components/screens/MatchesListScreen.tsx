import React, { useState } from 'react';
import { Heart, ShieldCheck, ChevronRight, Lock } from 'lucide-react';
import { MatchItem, UserProfile } from '../../types';

interface MatchesListScreenProps {
  matches: MatchItem[];
  likesReceived?: UserProfile[];
  canSeeLikes?: boolean;
  onSelectMatch: (matchId: string) => void;
  onLikeBack?: (profile: UserProfile) => void;
  onOpenUpgrade?: () => void;
  onDiscover?: () => void;
}

export const MatchesListScreen: React.FC<MatchesListScreenProps> = ({
  matches,
  likesReceived = [],
  canSeeLikes = false,
  onSelectMatch,
  onLikeBack,
  onOpenUpgrade,
  onDiscover
}) => {
  const [activeTab, setActiveTab] = useState<'matches' | 'likes'>('matches');

  return (
    <div className="w-full max-w-3xl mx-auto bg-[#F7F5F0] text-[#1A1816] flex flex-col p-4 md:p-6 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="font-['Cormorant_Garamond',serif] text-3xl md:text-4xl font-semibold tracking-tight">
            {activeTab === 'matches' ? 'Your Matches' : 'Likes you'}
          </h2>
          <p className="text-xs md:text-sm text-[#6B665F] mt-1">
            {activeTab === 'matches' ? 'Mutual connections ready to start a conversation.' : 'People who have already shown interest in you.'}
          </p>
        </div>
        <span className="text-xs font-semibold font-['Space_Mono',monospace] text-[#B85A3C] bg-[#F5EAE5] px-3.5 py-1.5 rounded-full border border-[#E8D5CD]">
          {activeTab === 'matches' ? matches.length : canSeeLikes ? likesReceived.length : '•'} {activeTab === 'matches' ? 'Matches' : 'Likes'}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-5" role="tablist" aria-label="Connections">
        {([['matches', 'Matches'], ['likes', 'Likes you']] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${activeTab === tab
              ? 'bg-[#B85A3C] text-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
              : 'bg-white border border-[#E8E4DC] text-[#6B665F] hover:text-[#1A1816] hover:border-[#B85A3C]/40'}`}
          >{label}</button>
        ))}
      </div>

      {activeTab === 'likes' && !canSeeLikes ? (
        <div className="bg-white border border-[#E8E4DC] rounded-2xl p-7 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center"><Lock className="w-5 h-5" /></div>
          <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">See who likes you</h3>
          <p className="mt-2 mb-5 text-xs text-[#6B665F]">Incoming likes are private until you choose to view them.</p>
          <button type="button" onClick={onOpenUpgrade} className="px-5 py-2.5 rounded-full bg-[#B85A3C] text-white text-xs font-semibold">View with WASSAA Plus</button>
        </div>
      ) : activeTab === 'likes' && likesReceived.length > 0 ? (
        <div className="space-y-3">
          {likesReceived.map((profile) => (
            <article key={profile.id} className="p-4 bg-white border border-[#E8E4DC] rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {profile.photos[0] ? <img src={profile.photos[0]} alt={profile.name} className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-14 h-14 rounded-full bg-[#F0ECE6]" />}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{profile.name}{profile.age ? `, ${profile.age}` : ''}</h3>
                  <p className="text-xs text-[#6B665F] truncate">{profile.professionTitle}{profile.city ? ` · ${profile.city}` : ''}</p>
                </div>
              </div>
              <button type="button" onClick={() => onLikeBack?.(profile)} className="shrink-0 px-4 py-2 rounded-full bg-[#B85A3C] text-white text-xs font-semibold">Like back</button>
            </article>
          ))}
        </div>
      ) : activeTab === 'matches' && matches.length > 0 ? (
        <div className="space-y-3">
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              onClick={() => onSelectMatch(match.id)}
              className="w-full text-left p-4 bg-white border border-[#E8E4DC] hover:border-[#B85A3C] hover:shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] rounded-2xl flex items-center justify-between transition-all group shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <span className="flex items-center gap-3.5 min-w-0">
                {match.profile.photos[0] ? <img src={match.profile.photos[0]} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-[#E8E4DC] group-hover:ring-[#B85A3C]" referrerPolicy="no-referrer" /> : <span className="w-14 h-14 rounded-full bg-[#F0ECE6]" />}
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{match.profile.name}{match.profile.age ? `, ${match.profile.age}` : ''}</span>
                    {match.profile.verification?.status === 'verified' && <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2C6B56] shrink-0"><ShieldCheck className="w-3.5 h-3.5" />Verified</span>}
                  </span>
                  <span className="block text-xs text-[#6B665F] truncate mt-0.5">{match.profile.professionTitle}{match.profile.city ? ` · ${match.profile.city}` : ''}</span>
                  <span className="block text-[11px] text-[#B85A3C] mt-1 truncate">{match.lastMessage || 'You matched'}</span>
                </span>
              </span>
              <ChevronRight className="w-5 h-5 text-[#9C958D] group-hover:text-[#B85A3C] shrink-0 ml-3" />
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E8E4DC] rounded-2xl p-8 md:p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] my-4">
          <div className="w-14 h-14 rounded-full bg-[#F5EAE5] text-[#B85A3C] mx-auto flex items-center justify-center mb-4"><Heart className="w-6 h-6 stroke-[1.75]" /></div>
          <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold mb-2">
            {activeTab === 'likes' ? 'No likes waiting' : 'No mutual connections yet'}
          </h3>
          <p className="text-xs md:text-sm text-[#6B665F] max-w-sm mx-auto leading-relaxed mb-6">
            {activeTab === 'likes' ? 'When someone likes your profile, they will appear here.' : 'When you and another member like each other, they will appear here ready to start a conversation.'}
          </p>
          <button type="button" onClick={onDiscover} className="px-6 py-2.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-xs font-semibold tracking-wide transition-colors">Discover people</button>
        </div>
      )}
    </div>
  );
};
