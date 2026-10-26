import React from 'react';
import { ChevronLeft, Check, Heart, Crown, Sparkles } from 'lucide-react';
import { SubscriptionTier } from '../../types';

interface SubscriptionPlansScreenProps {
  currentTier: SubscriptionTier;
  onSelectTier: (tier: SubscriptionTier) => void;
  onClose: () => void;
}

export const SubscriptionPlansScreen: React.FC<SubscriptionPlansScreenProps> = ({
  currentTier,
  onSelectTier,
  onClose
}) => {
  return (
    <div className="w-full pb-2">
      <div className="max-w-5xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B665F] hover:text-[#1A1816] transition-colors p-2 -ml-2 rounded-lg hover:bg-white"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B85A3C] bg-[#F5EAE5] px-3.5 py-1.5 rounded-full border border-[#E8D5CD]">
            <Heart className="w-3.5 h-3.5 fill-[#B85A3C] text-[#B85A3C]" />
            <span>WASSAA Privileges</span>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center max-w-xl mx-auto mb-10">
          <h1 className="font-['Cormorant_Garamond',serif] text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1A1816] leading-tight">
            Choose Your Experience
          </h1>
          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm sm:text-base text-[#6B665F] mt-2.5 leading-relaxed">
            Choose a plan for the discovery features currently available in WASSAA.
          </p>
        </div>

        {/* 3 Tier Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Card 1: Free / Basic */}
          <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 sm:p-7 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                  WASSAA Basic
                </h3>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#1A1816] font-['Plus_Jakarta_Sans',sans-serif]">₦0</span>
                  <span className="text-[0.8125rem] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">Free Forever</span>
                </div>
              </div>
              <p className="text-xs text-[#6B665F] mb-6 leading-relaxed font-['Plus_Jakarta_Sans',sans-serif]">
                Core discovery and genuine connections.
              </p>

              <div className="space-y-3 text-xs text-[#1A1816] mb-8 font-['Plus_Jakarta_Sans',sans-serif]">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#2C6B56] shrink-0" />
                  <span>Browse member profiles</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#2C6B56] shrink-0" />
                  <span>Mutual match & connect</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#2C6B56] shrink-0" />
                  <span>Standard chat with your matches</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={currentTier === 'free'}
              onClick={() => onSelectTier('free')}
              className={`w-full py-3 px-5 rounded-full text-xs font-semibold transition-all ${
                currentTier === 'free'
                  ? 'bg-[#F7F5F0] text-[#6B665F] border border-[#E8E4DC] cursor-default'
                  : 'border border-[#E8E4DC] bg-white text-[#1A1816] hover:border-[#B85A3C] hover:text-[#B85A3C]'
              }`}
            >
              {currentTier === 'free' ? 'Current Plan' : 'Select Free Plan'}
            </button>
          </div>

          {/* Card 2: WASSAA Plus */}
          <div className="bg-white rounded-2xl border-2 border-[#B85A3C] p-6 sm:p-7 shadow-[0_4px_16px_-2px_rgba(184,90,60,0.12)] flex flex-col justify-between relative">
            <span className="absolute -top-3 left-1/2 -translate-y-0 -translate-x-1/2 bg-[#B85A3C] text-white text-[0.75rem] font-semibold px-3 py-0.5 rounded-full shadow-xs uppercase tracking-wider font-['Space_Mono',monospace]">
              Recommended
            </span>
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center">
                    <Heart className="w-4 h-4 fill-[#B85A3C]" />
                  </div>
                  <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                    WASSAA Plus
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#B85A3C] font-['Plus_Jakarta_Sans',sans-serif]">₦1,500</span>
                  <span className="text-[0.8125rem] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">one-time</span>
                </div>
              </div>
              <p className="text-xs text-[#6B665F] mb-6 leading-relaxed font-['Plus_Jakarta_Sans',sans-serif]">
                Expand your possibilities and discovery reach.
              </p>

              <div className="space-y-3 text-xs text-[#1A1816] mb-8 font-['Plus_Jakarta_Sans',sans-serif]">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <span>Unlimited profile likes</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <span>See who liked your profile</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#B85A3C] shrink-0" />
                  <span>5 Super Likes per week</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={currentTier === 'premium'}
              onClick={() => onSelectTier('premium')}
              className={`w-full py-3 px-5 rounded-full text-xs font-semibold transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99] ${
                currentTier === 'premium'
                  ? 'bg-[#F7F5F0] text-[#6B665F] border border-[#E8E4DC] cursor-default'
                  : 'bg-[#B85A3C] hover:bg-[#A04E33] text-white'
              }`}
            >
              {currentTier === 'premium' ? 'Current Plan' : 'Get WASSAA Plus (₦1,500)'}
            </button>
          </div>

          {/* Card 3: WASSAA VIP */}
          <div className="bg-white rounded-2xl border border-[#E8E4DC] p-6 sm:p-7 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.08)] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#2A3A2C]/10 text-[#2A3A2C] flex items-center justify-center">
                    <Crown className="w-4 h-4" />
                  </div>
                  <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold text-[#1A1816]">
                    WASSAA VIP
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-[#1A1816] font-['Plus_Jakarta_Sans',sans-serif]">₦5,000</span>
                  <span className="text-[0.8125rem] text-[#6B665F] block font-['Space_Mono',monospace] uppercase">one-time</span>
                </div>
              </div>
              <p className="text-xs text-[#6B665F] mb-6 leading-relaxed font-['Plus_Jakarta_Sans',sans-serif]">
                Refined warmth, discretion, and priority matchmaking.
              </p>

              <div className="space-y-3 text-xs text-[#1A1816] mb-8 font-['Plus_Jakarta_Sans',sans-serif]">
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#2A3A2C] shrink-0" />
                  <span>15 Super Likes per week</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-[#2A3A2C] shrink-0" />
                  <span>See who liked your profile</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={currentTier === 'hyper_premium'}
              onClick={() => onSelectTier('hyper_premium')}
              className={`w-full py-3 px-5 rounded-full text-xs font-semibold transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)] active:scale-[0.99] ${
                currentTier === 'hyper_premium'
                  ? 'bg-[#F7F5F0] text-[#6B665F] border border-[#E8E4DC] cursor-default'
                  : 'bg-[#2A3A2C] hover:bg-[#1E2B20] text-white'
              }`}
            >
              {currentTier === 'hyper_premium' ? 'Active VIP Member' : 'Join WASSAA VIP (₦5,000)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
