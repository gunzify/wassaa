import React from 'react';
import { WassaaLogo } from '../common/WassaaLogo';
import { WASSAA_BRAND } from '../../assets/branding';

interface SplashScreenProps {
  onCreateAccount: () => void;
  onLogIn: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onCreateAccount,
  onLogIn
}) => {
  return (
    <div className="fixed inset-0 z-50 w-full bg-[#141210] flex flex-col overflow-y-auto select-none">
      {/* Home hero: uniformed professionals sharing dinner */}
      <div className="relative w-full h-[54dvh] min-h-[280px] shrink-0">
        <img
          src={WASSAA_BRAND.assets.dinnerHero}
          alt="Nigerian Army, Police, Navy and Civil Defence members sharing dinner together"
          className="absolute inset-0 w-full h-full object-cover object-[52%_center]"
          decoding="async"
        />
        {/* Fade the photo into the panel so the type never fights the scene */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141210] via-[#141210]/15 to-[#141210]/35 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#141210] to-transparent pointer-events-none" />
      </div>

      {/* Brand + actions */}
      <div className="relative z-10 flex-1 w-full max-w-[480px] mx-auto px-6 sm:px-8 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col justify-end gap-6">
        <div className="space-y-3">
          <WassaaLogo
            size="md"
            variant="light"
            layout="horizontal"
            showTagline
            tagline="Real People. Real Service. Lasting Connections."
          />

          <p className="font-['Plus_Jakarta_Sans',sans-serif] text-sm text-white/80 font-normal leading-relaxed max-w-[34ch]">
            A thoughtful dating community for military, paramilitary and uniformed professionals, with privacy designed around service.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onCreateAccount}
            className="w-full py-3.5 px-6 rounded-full bg-[#B85A3C] hover:bg-[#A04E33] active:scale-[0.99] text-white font-semibold text-sm sm:text-base tracking-wide transition-all shadow-[0_4px_16px_-2px_rgba(0,0,0,0.35)] cursor-pointer text-center"
          >
            Get Started
          </button>

          <button
            type="button"
            onClick={onLogIn}
            className="w-full py-3.5 px-6 rounded-full bg-white/5 hover:bg-white/12 active:scale-[0.99] text-white font-medium text-sm sm:text-base transition-all border border-white/60 backdrop-blur-xs cursor-pointer text-center"
          >
            Sign In
          </button>
        </div>

        <p className="text-[11px] sm:text-xs text-white/55 text-center font-normal leading-relaxed">
          Every account is verified by email. Adding a phone number is optional.
        </p>
      </div>
    </div>
  );
};
