export type ThemePref = 'system' | 'light' | 'dark' | 'tiffany';
export type Theme = 'light' | 'dark' | 'tiffany';

const KEY = 'almanac-theme';

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'tiffany' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const THEME_COLOR: Record<Theme, string> = { light: '#f4f2ec', dark: '#111113', tiffany: '#060707' };

export function applyTheme(pref: ThemePref, animate = false) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 360);
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  applyTheme(pref, true);
  window.dispatchEvent(new CustomEvent('almanac:theme', { detail: pref }));
}

export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const on = () => getThemePref() === 'system' && applyTheme('system', true);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}

export const THEME_ORDER: ThemePref[] = ['light', 'dark', 'tiffany', 'system'];
export const THEME_LABEL: Record<ThemePref, string> = {
  light: 'Light',
  dark: 'Dark',
  tiffany: 'Tiffany',
  system: 'System',
};
