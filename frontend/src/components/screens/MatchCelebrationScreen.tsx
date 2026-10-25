import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Heart } from 'lucide-react';
import { UserProfile } from '../../types';

interface MatchCelebrationScreenProps {
  userA: UserProfile;
  userB: UserProfile;
  onStartChat: () => void;
  onKeepExploring: () => void;
}

export const MatchCelebrationScreen: React.FC<MatchCelebrationScreenProps> = ({
  userA,
  userB,
  onStartChat,
  onKeepExploring
}) => {
  useEffect(() => {
    confetti({
      particleCount: 65,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#B85A3C', '#C47059', '#F5EAE5', '#2A3A2C', '#E8E4DC']
    });
  }, []);

  return (
    <div className="relative w-full max-w-xl mx-auto min-h-[620px] flex-1 bg-[#1A1816] text-[#F7F5F0] rounded-3xl flex flex-col justify-between p-6 md:p-10 select-none border border-[#2E2824] shadow-[0_8px_32px_-4px_rgba(0,0,0,0.3)] overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Warm ambient radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-gradient-to-tr from-[#B85A3C]/20 to-[#2A3A2C]/20 rounded-full blur-3xl pointer-events-none" />

      {/* Spacer for top balance */}
      <div className="h-4" />

      {/* Center match presentation */}
      <div className="relative z-10 my-auto text-center py-6">
        {/* Overlapping Avatars */}
        <div className="relative flex items-center justify-center mb-8">
          <div className="relative -mr-3.5 z-10">
            <img
              src={userA.photos[0]}
              alt={userA.name}
              className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover ring-4 ring-[#1A1816] shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Heart Badge at intersection */}
          <div className="absolute z-30 w-11 h-11 rounded-full bg-white text-[#B85A3C] flex items-center justify-center shadow-xl border border-[#E8D5CD]">
            <Heart className="w-5 h-5 fill-[#B85A3C] text-[#B85A3C]" />
          </div>

          <div className="relative -ml-3.5 z-20">
            <img
              src={userB.photos[0]}
              alt={userB.name}
              className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover ring-4 ring-[#1A1816] shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Headline */}
        <h2 className="font-['Cormorant_Garamond',serif] text-4xl md:text-5xl font-semibold tracking-tight mb-3 text-[#F7F5F0]">
          It's a Match!
        </h2>
        <p className="text-sm text-[#9C958D] max-w-xs mx-auto leading-relaxed">
          You and <span className="text-[#F7F5F0] font-medium">{userB.name}</span> have liked each other. The conversation begins here.
        </p>
      </div>

      {/* Bottom Action Controls */}
      <div className="relative z-10 space-y-3 pb-2">
        <button
          onClick={onStartChat}
          className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] active:scale-[0.98] text-white font-semibold text-sm tracking-wide transition-all shadow-[0_4px_16px_-2px_rgba(184,90,60,0.35)] cursor-pointer"
        >
          Send a message
        </button>

        <button
          onClick={onKeepExploring}
          className="w-full py-3 px-6 rounded-full bg-transparent hover:bg-white/5 active:scale-[0.98] text-[#F7F5F0] font-medium text-sm transition-colors border border-[#E8E4DC]/30 cursor-pointer"
        >
          Keep exploring
        </button>
      </div>
    </div>
  );
};
