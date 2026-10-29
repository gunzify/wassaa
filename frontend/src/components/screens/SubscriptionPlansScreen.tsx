import React from 'react';
import { Coins, X, Zap, MessageCircle, Gift, TrendingUp } from 'lucide-react';
import { CreditPack } from '../../types';

interface SubscriptionPlansScreenProps {
  credits: number;
  packs: CreditPack[];
  onSelectPack: (packId: string) => void;
  onBoost: () => void;
  onClose: () => void;
}

/** Used when entitlements could not be fetched (offline, first paint). */
const FALLBACK_PACKS: CreditPack[] = [
  { id: 'credit_40', name: 'Quick Top-Up', tagline: 'Keep a conversation going', priceNgn: 300, credits: 40, features: ['40 credits', 'Quick top-up', 'Credits never expire'] },
  { id: 'credit_240', name: 'Standard', tagline: 'For the curious', priceNgn: 1500, credits: 240, features: ['240 credits', '₦6.25 per credit', 'Credits never expire'], isPopular: true },
  { id: 'credit_600', name: 'Premium', tagline: 'Best value per credit', priceNgn: 3300, credits: 600, features: ['600 credits', '₦5.50 per credit', 'Credits never expire'] },
];

/**
 * The credit store (KB §18E). Every message a member sends costs 1 credit;
 * replies never cost the member anything.
 */
export const SubscriptionPlansScreen: React.FC<SubscriptionPlansScreenProps> = ({
  credits,
  packs,
  onSelectPack,
  onBoost,
  onClose
}) => {
  const visiblePacks = packs.length ? packs : FALLBACK_PACKS;

  return (
    <div className="w-full max-w-[430px] mx-auto bg-[#F7F5F0] text-[#1A1816] flex flex-col p-4 md:p-6 font-['Plus_Jakarta_Sans',sans-serif] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-['Cormorant_Garamond',serif] text-3xl md:text-4xl font-semibold tracking-tight">Credits</h2>
          <p className="text-xs md:text-sm text-[#6B665F] mt-1">One credit keeps one conversation going.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold font-['Space_Mono',monospace] text-[#B85A3C] bg-[#F5EAE5] px-3.5 py-1.5 rounded-full border border-[#E8D5CD]">
            <Coins className="w-3.5 h-3.5" />{credits}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#EFEAE2] text-[#6B665F] hover:text-[#1A1816] transition-colors"
            aria-label="Close credit store"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* How credits work */}
      <div className="bg-white border border-[#E8E4DC] rounded-2xl p-4 mb-5 space-y-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {[
          { icon: MessageCircle, text: 'Every message you send costs 1 credit.' },
          { icon: Gift, text: 'Replies never cost you anything — only what you send does.' },
          { icon: TrendingUp, text: 'New members start with 25 free credits and 1 more each day.' },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-2.5 text-xs text-[#6B665F] leading-relaxed">
            <Icon className="w-3.5 h-3.5 text-[#B85A3C] mt-0.5 shrink-0" />
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* Boost */}
      <button
        type="button"
        onClick={onBoost}
        disabled={credits < 10}
        className="w-full text-left bg-white border border-[#E8E4DC] rounded-2xl p-4 mb-5 flex items-center justify-between hover:border-[#B85A3C] transition-colors disabled:opacity-50 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
      >
        <span className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-[#F5EAE5] text-[#B85A3C] flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Boost — be seen first for 1 hour</span>
            <span className="block text-xs text-[#6B665F]">Jump to the top of everyone’s deck nearby.</span>
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold font-['Space_Mono',monospace] text-[#B85A3C] bg-[#F5EAE5] px-3 py-1.5 rounded-full border border-[#E8D5CD]">10</span>
      </button>

      {/* Packs */}
      <div className="space-y-3 pb-4">
        {visiblePacks.map((pack) => (
          <article
            key={pack.id}
            className={`bg-white rounded-2xl p-4 border relative ${pack.isPopular ? 'border-[#B85A3C] shadow-[0_4px_16px_-2px_rgba(184,90,60,0.18)]' : 'border-[#E8E4DC] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'}`}
          >
            {pack.isPopular && (
              <span className="absolute -top-2.5 left-4 text-[0.65rem] font-semibold tracking-wide uppercase bg-[#B85A3C] text-white px-2.5 py-0.5 rounded-full">
                Most popular
              </span>
            )}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-['Cormorant_Garamond',serif] text-2xl font-semibold">{pack.name}</h3>
                <p className="text-xs text-[#6B665F]">{pack.tagline}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-['Space_Mono',monospace] text-lg font-semibold text-[#B85A3C]">₦{pack.priceNgn.toLocaleString()}</p>
                <p className="text-[0.7rem] text-[#9C958D]">{pack.credits} credits</p>
              </div>
            </div>
            <ul className="mt-3 mb-4 space-y-1">
              {pack.features.map((feature) => (
                <li key={feature} className="text-xs text-[#6B665F] flex items-center gap-2">
                  <Coins className="w-3 h-3 text-[#B85A3C] shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onSelectPack(pack.id)}
              className="w-full py-2.5 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] text-white text-xs font-semibold tracking-wide transition-colors"
            >
              Get {pack.credits} credits — ₦{pack.priceNgn.toLocaleString()}
            </button>
          </article>
        ))}
        <p className="text-[0.7rem] text-[#9C958D] text-center leading-relaxed px-2">
          Payments are processed securely by Paystack. Credits never expire and are added the moment payment is confirmed.
        </p>
      </div>
    </div>
  );
};
