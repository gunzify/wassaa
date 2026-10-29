#!/usr/bin/env node
/**
 * Generates src/styles/theme-dark.css from the colour classes actually used in
 * the app. The design system is expressed as literal Tailwind values, so the
 * dark theme is a deterministic remap of those literals instead of a second
 * hand-written palette that can drift.
 *
 * Rule of thumb:
 *   - near-white surfaces  → dark surface, alpha preserved
 *   - ink text             → warm off-white
 *   - borders              → dark hairlines
 *   - brand / semantic     → only *text* brightens; solid fills keep white-text contrast
 *   - translucent photo overlays (bg-white/25 etc.) stay white
 *
 * Re-run after adding colours: node frontend/scripts/gen-dark-theme.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', 'src');
const outFile = path.join(root, 'styles', 'theme-dark.css');

const SURFACE = '#1c1917';   // card
const CANVAS = '#131110';    // page

// hex → { prop: darkValue }. Absent properties keep their light value.
const MAP = {
  // --- surfaces ------------------------------------------------------------
  '#FFFFFF': { bg: SURFACE },
  '#FDFBF7': { bg: '#191614' },
  '#FBFAF7': { bg: '#191614' },
  '#FAF8F5': { bg: '#181513' },
  '#F7F5F0': { bg: CANVAS },
  '#F5EAE5': { bg: '#37231b' },      // brand tint
  '#F2EFEA': { bg: '#221e1b' },
  '#F3EFEA': { bg: '#221e1b' },
  '#F1ECE4': { bg: '#221e1b' },
  '#F0ECE6': { bg: '#241f1c', border: '#2f2925' },
  '#EFEAE4': { bg: '#241f1c' },
  '#EFEAE2': { bg: '#241f1c' },
  '#EBE6DF': { bg: '#2a2522', border: '#2f2925' },
  '#F0E5DC': { bg: '#2a201c' },
  '#EFDDD4': { bg: '#38261f', border: '#4a3129' },
  '#FBEFE6': { bg: '#33241a' },      // restriction banner
  '#FDF2EE': { bg: '#2a1e1b' },
  '#FDF6F7': { bg: '#2a1c1f' },
  '#E8EDE9': { bg: '#1b2a22' },      // verified tint
  '#141210': { bg: '#0f0d0c' },

  // --- ink -----------------------------------------------------------------
  '#1A1816': { text: '#f3efe9', bg: '#2e2925', border: '#3a342f', ring: '#3a342f' },
  '#6B665F': { text: '#b7afa6' },
  '#9C958D': { text: '#8e867d' },
  '#A9A29A': { text: '#948c83' },
  '#9EA3A0': { text: '#9aa39e', border: '#3a403c' },

  // --- hairlines -----------------------------------------------------------
  '#E8E4DC': { border: '#332d28', bg: '#2c2724' },
  '#E8D5CD': { border: '#4a2f26' },
  '#E8D9CE': { border: '#4a3527' },
  '#D8D2C7': { border: '#3a342e', ring: '#3a342e' },
  '#D9D2C7': { border: '#3a342e' },
  '#B4ABA1': { border: '#4a423b' },

  // --- brand (fills/borders keep white-text contrast; text brightens) ------
  '#B85A3C': { text: '#e8916b', fill: '#e8916b', accent: '#e8916b', border: '#b85a3c' },
  '#A04E33': { text: '#e8916b' },

  // --- semantic ------------------------------------------------------------
  '#2C6B56': { text: '#7bcda6' },
  '#2A3A2C': { text: '#9fd8b6' },
  '#9B2C2C': { text: '#f08c8c', ring: '#f08c8c' },
  '#9B3944': { text: '#f0a0a6' },
  '#8A4B32': { text: '#e5a583' },
  '#B04A55': { text: '#f0a0a6' },
  '#E58992': { text: '#f0a0a6' },
};

const PROPERTY = {
  bg: 'background-color',
  text: 'color',
  border: 'border-color',
  ring: '--tw-ring-color',
  fill: 'fill',
  stroke: 'stroke',
  accent: 'accent-color',
  caret: 'caret-color',
};

const SURFACE_HEXES = new Set(['#FFFFFF', '#FDFBF7', '#FBFAF7', '#FAF8F5', '#F7F5F0', '#F5EAE5', '#F2EFEA', '#F3EFEA', '#F1ECE4', '#F0ECE6', '#EFEAE4', '#EFEAE2', '#EBE6DF', '#F0E5DC', '#EFDDD4', '#FBEFE6', '#FDF2EE', '#FDF6F7', '#E8EDE9']);

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
};
const rgba = (hex, alpha) => `rgb(${hexToRgb(hex).join(' ')} / ${(Number(alpha) / 100).toFixed(2)})`;
const esc = (cls) => cls.replace(/([#\[\]\/])/g, '\\$1');

// --- collect the colour classes the app actually uses -----------------------
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(p);
  }
})(root);

const classes = new Map();
const CLASS_RE = /\b(bg|text|border|from|to|via|ring|divide|fill|stroke|accent|caret)-\[(#(?:[0-9A-Fa-f]{3,8}))\](?:\/(\d+))?/g;
const NAMED_RE = /\b(bg|text|border|ring|fill|stroke)-(white|black)(?:\/(\d+))?/g;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(CLASS_RE)) classes.set(m[0], { prop: m[1], hex: m[2].toUpperCase(), alpha: m[3] });
  for (const m of src.matchAll(NAMED_RE)) classes.set(m[0], { named: m[2], prop: m[1], alpha: m[3] });
}

const darkRules = [];
const seen = new Set();
for (const [cls, info] of classes) {
  if (!PROPERTY[info.prop]) continue;             // gradients/shadows: already dark
  let value = null;

  if (info.named) {
    // White at high opacity is a surface; low opacity is an overlay on a photo.
    if (info.named === 'white' && info.prop === 'bg' && (!info.alpha || Number(info.alpha) >= 60)) {
      value = info.alpha ? rgba(SURFACE, info.alpha) : SURFACE;
    }
    if (info.named === 'white' && info.prop === 'border') value = info.alpha ? rgba('#FFFFFF', info.alpha) : null;
  } else {
    const mapped = MAP[info.hex]?.[info.prop];
    if (mapped) {
      if (!info.alpha) value = mapped;
      else if (SURFACE_HEXES.has(info.hex)) value = rgba(mapped, info.alpha);
      // accent tints with alpha stay as they are: they read correctly on dark.
    } else if (SURFACE_HEXES.has(info.hex) && info.alpha && (info.prop === 'bg' || info.prop === 'border')) {
      value = rgba(MAP[info.hex]?.bg || SURFACE, info.alpha);
    }
  }

  if (!value) continue;
  const selector = `html[data-theme="dark"] .${esc(cls)}`;
  if (seen.has(selector)) continue;
  seen.add(selector);
  darkRules.push(`${selector} { ${PROPERTY[info.prop]}: ${value}; }`);
}

const header = `/* ==========================================================================
   WASSAA dark theme
   GENERATED by frontend/scripts/gen-dark-theme.mjs — do not hand-edit.
   Re-run the generator after introducing new colour literals.
   ========================================================================== */

html[data-theme="dark"] {
  color-scheme: dark;

  /* Design-system tokens (used by the component classes in index.css) */
  --color-canvas: ${CANVAS};
  --color-surface: ${SURFACE};
  --color-surface-subtle: #221e1b;
  --color-line: #332d28;
  --color-line-soft: #2c2724;
  --color-ink: #f3efe9;
  --color-ink-soft: #b7afa6;
  --color-ink-muted: #8e867d;
  --color-brand-tint: #37231b;
  --color-verified: #7bcda6;
  --color-verified-tint: #1b2a22;
  --color-danger: #f08c8c;
  --color-danger-tint: #2a1a1a;
}

html[data-theme="dark"] body {
  background-color: ${CANVAS};
  color: #f3efe9;
}

/* Raised surfaces that used the ink colour as a fill need to stay legible. */
html[data-theme="dark"] .toast-pill {
  background-color: #2e2925;
  color: #f3efe9;
  border: 1px solid #3a342f;
}

html[data-theme="dark"] .dock-item-active {
  color: #e8916b;
}

html[data-theme="dark"] ::selection {
  background-color: #b85a3c;
  color: #fff;
}

html[data-theme="dark"] input,
html[data-theme="dark"] textarea,
html[data-theme="dark"] select {
  color-scheme: dark;
}

html[data-theme="light"] {
  color-scheme: light;
}

/* --- literal colour remap -------------------------------------------------- */

${darkRules.join('\n')}
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, header);
console.log(`wrote ${path.relative(process.cwd(), outFile)} — ${darkRules.length} dark rules from ${classes.size} colour classes`);
