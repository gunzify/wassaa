import React from 'react';

/**
 * The verified seal.
 *
 * A scalloped rosette — the shape real trust marks use — with a cut check, a
 * hairline inner ring for depth and a highlight across the crown. Drawn on a
 * 24-unit grid so it stays sharp from 14px in a list row to 24px on a card.
 *
 * `onPhoto` flips it to a white seal with a green check so it still reads on
 * top of imagery.
 */
interface VerifiedMarkProps {
  size?: number;
  variant?: 'solid' | 'onPhoto';
  /** Show the word "Verified" beside the seal (profile headers, lists). */
  withLabel?: boolean;
  className?: string;
}

/**
 * Seal outline: twelve points at the rim, joined by concave arcs that dip
 * toward the centre. That is the shape real trust marks use — pointed tips,
 * smooth hollows — and unlike a rounded-lobe rosette it still reads as a seal
 * and not a cog when it is drawn at 16px.
 */
function sealPath(tips: number, rHollow: number): string {
  const R_TIP = 11.5;
  const step = (Math.PI * 2) / tips;
  const at = (angle: number, radius: number) =>
    `${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`;

  let d = `M ${at(0, R_TIP)}`;
  for (let i = 0; i < tips; i += 1) {
    // Concave side (control point inside) up to the next point on the rim.
    d += ` Q ${at(i * step + step / 2, rHollow)} ${at((i + 1) * step, R_TIP)}`;
  }
  return `${d} Z`;
}

/* Twelve points is the real seal, but its tips are ~2.5px apart on a 20px row
   icon and blur into a smudge. Small marks use fewer, shallower points. */
const SEAL_LARGE = sealPath(12, 8.6);
const SEAL_SMALL = sealPath(8, 9.4);

export const VerifiedMark: React.FC<VerifiedMarkProps> = ({
  size = 18,
  variant = 'solid',
  withLabel = false,
  className = ''
}) => {
  const sealFill = variant === 'onPhoto' ? '#ffffff' : 'var(--color-verified)';
  const checkStroke = variant === 'onPhoto' ? '#1f7a5c' : '#ffffff';
  const ringStroke = variant === 'onPhoto' ? 'rgb(31 122 92 / 0.16)' : 'rgb(255 255 255 / 0.24)';
  const showRing = size >= 26;
  const sealPath = size >= 26 ? SEAL_LARGE : SEAL_SMALL;
  // Below ~18px a thick check turns into a smudge, so it thins with the seal.
  const checkWidth = size <= 15 ? 2.6 : size <= 20 ? 2.4 : 2.2;

  const seal = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      style={{ filter: variant === 'onPhoto' ? 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.28))' : undefined }}
    >
      <path d={sealPath} fill={sealFill} />

      {showRing && <circle cx="12" cy="12" r="8.2" fill="none" stroke={ringStroke} strokeWidth="0.9" />}

      <path
        d="M7.6 12.2l3 3.05 6-6.5"
        stroke={checkStroke}
        strokeWidth={checkWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <span
      className={`inline-flex items-center gap-1 align-middle ${className}`}
      title="Identity verified by WASSAA"
    >
      {seal}
      {withLabel ? (
        <span className="text-[0.75rem] font-semibold leading-none text-verified">Verified</span>
      ) : null}
      <span className="sr-only">Verified</span>
    </span>
  );
};
