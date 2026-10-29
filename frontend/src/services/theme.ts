export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'wassaa_theme';
/** Kept lower-case to match what the inline boot script in index.html writes. */
const DARK_QUERY = '(prefers-color-scheme: dark)';
const BROWSER_CHROME: Record<ResolvedTheme, string> = { light: '#F7F5F0', dark: '#131110' };

export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch { /* storage can be unavailable in private browsing */ }
  return 'system';
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/** Writes the resolved theme onto <html>; the dark palette keys off it. */
export function applyTheme(preference: ThemePreference = readThemePreference()): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_CHROME[resolved]);
  return resolved;
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* ignore */ }
  const resolved = applyTheme(preference);
  window.dispatchEvent(new CustomEvent('wassaa:theme', { detail: { preference, resolved } }));
  return resolved;
}

/**
 * Applies the stored preference at boot and follows the OS while the member
 * has not made an explicit choice.
 */
export function initTheme(): void {
  applyTheme(readThemePreference());
  window.matchMedia?.(DARK_QUERY).addEventListener?.('change', () => {
    if (readThemePreference() === 'system') applyTheme('system');
  });
}
