// WASSAA Design Tokens — Warm Terracotta & Editorial
// Single source of truth for the entire design system.

export const colors = {
  // Canvas & surfaces
  canvas: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceSubtle: '#F2EFEA',

  // Borders
  border: '#E8E4DC',
  borderSubtle: '#F0ECE6',

  // Text hierarchy
  text: '#1A1816',
  textSecondary: '#6B665F',
  textMuted: '#9C958D',
  textInverse: '#FFFFFF',

  // Brand — Terracotta
  brand: '#B85A3C',
  brandHover: '#A04E33',
  brandLight: '#F5EAE5',
  brandSubtle: '#FDFAF8',

  // Accents
  olive: '#2A3A2C',
  oliveLight: '#E8EDE9',

  // Semantic
  verified: '#2C6B56',
  verifiedLight: '#E8F3EE',
  danger: '#9B2C2C',
  dangerLight: '#FDF2F2',
  success: '#2C6B56',
  warning: '#92620A',
  warningLight: '#FEF9EC',
} as const;

export const spacing = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  pill: '9999px',
} as const;

export const shadows = {
  subtle: '0 1px 3px rgba(0,0,0,0.06)',
  card: '0 4px 16px -2px rgba(0,0,0,0.08)',
  elevated: '0 8px 32px -4px rgba(0,0,0,0.12)',
  glow: '0 0 0 1px rgba(184,90,60,0.08), 0 4px 16px -2px rgba(184,90,60,0.12)',
} as const;

export const typography = {
  // Font families
  serif: "'Cormorant Garamond', Georgia, serif",
  sans: "'Plus Jakarta Sans', -apple-system, sans-serif",
  mono: "'Space Mono', 'JetBrains Mono', monospace",

  // Scale
  displayLg: { size: '48px', lineHeight: '1.05', tracking: '-0.03em', weight: '600' },
  displayMd: { size: '36px', lineHeight: '1.1', tracking: '-0.02em', weight: '600' },
  headingLg: { size: '28px', lineHeight: '1.2', tracking: '-0.02em', weight: '600' },
  headingMd: { size: '24px', lineHeight: '1.25', tracking: '-0.01em', weight: '600' },
  headingSm: { size: '20px', lineHeight: '1.3', tracking: '-0.01em', weight: '600' },
  bodyLg: { size: '16px', lineHeight: '1.5', tracking: '0', weight: '400' },
  bodySm: { size: '14px', lineHeight: '1.5', tracking: '0', weight: '400' },
  caption: { size: '12px', lineHeight: '1.4', tracking: '0', weight: '500' },
  captionMono: { size: '11px', lineHeight: '1.4', tracking: '0.08em', weight: '400' },
} as const;
