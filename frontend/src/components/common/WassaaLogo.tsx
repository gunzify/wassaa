import React from 'react';
import { WASSAA_BRAND } from '../../assets/branding';

export interface WassaaLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark' | 'warm';
  showTagline?: boolean;
  tagline?: string;
  showEmblem?: boolean;
  use3DEmblem?: boolean;
  layout?: 'stacked' | 'horizontal';
  className?: string;
}

export const WassaaLogo: React.FC<WassaaLogoProps> = ({
  size = 'md',
  variant = 'dark',
  showTagline = false,
  tagline = WASSAA_BRAND.tagline,
  showEmblem = true,
  use3DEmblem = false,
  layout = 'horizontal',
  className = ''
}) => {
  const isLight = variant === 'light';
  const isWarm = variant === 'warm';

  const sizeConfig = {
    xs: {
      emblem: 'w-6 h-6',
      title: 'text-sm tracking-[0.12em]',
      tagline: 'text-[11px]',
      gap: 'gap-1.5'
    },
    sm: {
      emblem: 'w-8 h-8',
      title: 'text-base tracking-[0.12em]',
      tagline: 'text-xs',
      gap: 'gap-2'
    },
    md: {
      emblem: 'w-10 h-10',
      title: 'text-xl sm:text-2xl tracking-[0.12em]',
      tagline: 'text-xs',
      gap: 'gap-2.5'
    },
    lg: {
      emblem: 'w-16 h-16',
      title: 'text-3xl sm:text-4xl tracking-[0.12em]',
      tagline: 'text-xs sm:text-sm',
      gap: 'gap-3'
    },
    xl: {
      emblem: 'w-24 h-24',
      title: 'text-4xl sm:text-5xl tracking-[0.12em]',
      tagline: 'text-sm sm:text-base',
      gap: 'gap-3.5'
    }
  }[size];

  const textColor = isLight
    ? 'text-white'
    : isWarm
    ? 'text-[#B85A3C]'
    : 'text-[#1A1816]';

  const taglineColor = isLight
    ? 'text-white/70'
    : isWarm
    ? 'text-[#A04E33]/70'
    : 'text-[#6B665F]';

  return (
    <div
      className={`flex select-none ${
        layout === 'horizontal'
          ? 'flex-row items-center text-left'
          : 'flex-col items-center text-center'
      } ${sizeConfig.gap} ${className}`}
    >
      {showEmblem && (
        <div className={`relative ${sizeConfig.emblem} shrink-0 flex items-center justify-center`}>
          {use3DEmblem ? (
            <img
              src={WASSAA_BRAND.assets.emblem3D}
              alt="WASSAA"
              className="w-full h-full object-cover rounded-2xl shadow-sm"
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full relative z-10"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="wassaaWarmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#C47059" />
                    <stop offset="50%" stopColor="#B85A3C" />
                    <stop offset="100%" stopColor="#A04E33" />
                  </linearGradient>
                  <linearGradient id="wassaaOliveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#3D5140" />
                    <stop offset="100%" stopColor="#2A3A2C" />
                  </linearGradient>
                </defs>

                {/* Left heart */}
                <path
                  d="M38 72 C 22 58, 12 45, 12 32 C 12 21, 21 14, 31 16 C 36 17, 40 21, 42 25 C 44 21, 48 17, 53 16 C 60 14.5, 66 18, 68 24 C 62 26, 56 32, 53 38 C 48 48, 43 60, 38 72 Z"
                  fill="url(#wassaaWarmGrad)"
                />

                {/* Right heart */}
                <path
                  d="M62 72 C 78 58, 88 45, 88 32 C 88 21, 79 14, 69 16 C 64 17, 60 21, 58 25 C 56 21, 52 17, 47 16 C 40 14.5, 34 18, 32 24 C 38 26, 44 32, 47 38 C 52 48, 57 60, 62 72 Z"
                  fill="url(#wassaaOliveGrad)"
                  opacity="0.85"
                />

                {/* Connection nexus */}
                <circle cx="50" cy="46" r="4" fill="#FFFFFF" opacity="0.9" />
              </svg>
            </div>
          )}
        </div>
      )}

      <div className={`flex flex-col ${layout === 'horizontal' ? 'items-start' : 'items-center'}`}>
        <span
          className={`font-['Cormorant_Garamond',serif] font-semibold uppercase leading-none ${sizeConfig.title} ${textColor}`}
        >
          WASSAA
        </span>

        {showTagline && (
          <span
            className={`font-['Plus_Jakarta_Sans',sans-serif] font-medium tracking-normal mt-1 ${sizeConfig.tagline} ${taglineColor}`}
          >
            {tagline}
          </span>
        )}
      </div>
    </div>
  );
};
