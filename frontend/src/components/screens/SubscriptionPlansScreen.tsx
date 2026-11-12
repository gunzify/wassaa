import React from 'react';
import { Coins, X, Zap, Gift, TrendingUp } from 'lucide-react';
import { CreditPack } from '../../types';
import { packChargeNote, packPriceLabel } from '../../lib/money';

interface SubscriptionPlansScreenProps {
  credits: number;
  packs: CreditPack[];
  /** Retained for compatibility; free chat was retired when packs went global. */
  freeChat?: boolean;
  /** Every country can pay now: international cards settle in naira. */
  creditRegionSupported?: boolean;
  /** Credits granted at the next daily reset. */
  dailyCreditAllowance?: number;
  onSelectPack: (packId: string) => void;
  onBoost: () => void;
  onClose: () => void;
}

/** Used when entitlements could not be fetched (offline, first paint). */
const FALLBACK_PACKS: CreditPack[] = [
  { id: 'credit_150', name: 'Starter', tagline: 'Start strong', priceNgn: 2000, credits: 150, displayCurrency: 'NGN', displayPrice: 2000, features: ['150 credits', 'About 30 text messages', 'Credits never expire'] },
  { id: 'credit_450', name: 'Standard', tagline: 'Most members pick this', priceNgn: 5000, credits: 450, displayCurrency: 'NGN', displayPrice: 5000, features: ['450 credits', 'About 90 text messages', 'Credits never expire'], isPopular: true },
  { id: 'credit_1200', name: 'Best Value', tagline: 'Never run dry', priceNgn: 12000, credits: 1200, displayCurrency: 'NGN', displayPrice: 12000, features: ['1,200 credits', 'About 240 text messages', 'Credits never expire'] },
];

/**
 * The credit store (KB §18E). Texts cost 5 credits, photos 10; replies are
 * free and cold opens double until mutual (server-side pricing).
 */
export const SubscriptionPlansScreen: React.FC<SubscriptionPlansScreenProps> = ({
  credits,
  packs,
  freeChat = false,
  creditRegionSupported = true,
  dailyCreditAllowance = 1,
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
          <p className="text-xs md:text-sm text-[#6B665F] mt-1">Keep your conversations going.</p>
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

      <>
          {/* How credits work */}
          <div className="bg-white border border-[#E8E4DC] rounded-2xl p-4 mb-5 space-y-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            {[
              { icon: Gift, text: 'Replies never cost you anything — only what you send does.' },
              { icon: TrendingUp, text: `New members start with 25 free credits and ${dailyCreditAllowance} more each day.` },
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
            disabled={credits < 100}
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
            <span className="shrink-0 text-xs font-semibold font-['Space_Mono',monospace] text-[#B85A3C] bg-[#F5EAE5] px-3 py-1.5 rounded-full border border-[#E8D5CD]">100</span>
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
                    <p className="font-['Space_Mono',monospace] text-lg font-semibold text-[#B85A3C]">{packPriceLabel(pack)}</p>
                    <p className="text-[0.7rem] text-[#9C958D]">{pack.credits} credits</p>
                    {packChargeNote(pack) && (
                      <p className="text-[0.65rem] text-[#9C958D]">≈ {packChargeNote(pack)}</p>
                    )}
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
                  Get {pack.credits} credits — {packPriceLabel(pack)}
                </button>
              </article>
            ))}
            <p className="text-[0.7rem] text-[#9C958D] text-center leading-relaxed px-2">
              Payments are processed securely by Paystack. Credits never expire and are added the moment payment is confirmed.
            </p>
          </div>
      </>
    </div>
  );
};
