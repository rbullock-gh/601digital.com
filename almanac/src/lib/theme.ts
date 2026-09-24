export type ThemePref = 'system' | 'light' | 'dark' | 'custom';
export type Theme = 'light' | 'dark';
export type CustomBase = 'light' | 'dark';

export interface CustomTheme {
  base: CustomBase;
  /** #rrggbb */
  accent: string;
}

const KEY = 'almanac-theme';
const CUSTOM_KEY = 'almanac-custom-theme';

/** The old Tiffany theme, which Custom replaced. Anyone who had it keeps this look. */
export const DEFAULT_CUSTOM: CustomTheme = { base: 'dark', accent: '#81d8d0' };

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Tiffany', hex: '#81d8d0' },
  { name: 'Cobalt', hex: '#3d6df2' },
  { name: 'Violet', hex: '#8b6cf0' },
  { name: 'Rose', hex: '#e8618f' },
  { name: 'Coral', hex: '#f2795a' },
  { name: 'Amber', hex: '#e6ae3a' },
  { name: 'Emerald', hex: '#2fae7a' },
];

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'tiffany') return 'custom';
    if (v === 'light' || v === 'dark' || v === 'custom' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function normalizeHex(v: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

export function getCustomTheme(): CustomTheme {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<CustomTheme>;
      const accent = typeof v.accent === 'string' ? normalizeHex(v.accent) : null;
      const base = v.base === 'light' || v.base === 'dark' ? v.base : null;
      if (accent && base) return { base, accent };
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return DEFAULT_CUSTOM;
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'custom') return getCustomTheme().base;
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ── Colour maths for the custom accent ─────────────────────────────────────── */

type RGB = [number, number, number];

const BASE = {
  light: { bg: '#f4f2ec', text: '#1b1a18', onDark: '#fbfaf7', onLight: '#1b1a18' },
  dark: { bg: '#111113', text: '#edece8', onDark: '#edece8', onLight: '#141416' },
} as const;

const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB);
};
const rgba = (hex: string, a: number) => `rgba(${toRgb(hex).join(', ')}, ${a})`;

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * CSS variables for a custom theme, layered over its light or dark base.
 * Text drawn in the accent (active icons, focus rings) is pushed towards the
 * base's text colour until it reads at 3:1 on the background, so any picked
 * colour stays legible.
 */
export function customVars({ base, accent }: CustomTheme): Record<string, string> {
  const b = BASE[base];
  const contrastText = contrast(accent, b.onDark) >= contrast(accent, b.onLight) ? b.onDark : b.onLight;
  let ink = accent;
  for (let t = 0.1; contrast(ink, b.bg) < 3 && t <= 1; t += 0.1) ink = mix(accent, b.text, t);
  const vars: Record<string, string> = {
    '--accent': accent,
    '--accent-hover': mix(accent, b.text, 0.15),
    '--accent-contrast': contrastText,
    '--accent-soft': rgba(accent, 0.1),
    '--accent-ink': ink,
    '--highlight': ink,
    '--focus': ink,
    '--selection': rgba(accent, base === 'dark' ? 0.26 : 0.2),
  };
  if (base === 'dark') {
    // A faint cast of the accent in the dark surfaces, as the Tiffany theme had.
    Object.assign(vars, {
      '--bg': mix('#0c0c0e', accent, 0.025),
      '--bg-sunken': mix('#08080a', accent, 0.02),
      '--surface': mix('#141416', accent, 0.035),
      '--surface-2': mix('#1a1a1e', accent, 0.04),
      '--surface-hover': mix('#1e1e22', accent, 0.05),
      '--border': mix('#25252a', accent, 0.07),
      '--border-strong': mix('#323238', accent, 0.08),
      '--hairline': rgba(accent, 0.08),
      '--unrated': mix('#202024', accent, 0.06),
      '--future-border': mix('#1e1e22', accent, 0.05),
      '--grid': mix('#1e1e22', accent, 0.05),
      '--axis': mix('#32323a', accent, 0.07),
    });
  }
  return vars;
}

const THEME_COLOR: Record<Theme, string> = { light: '#f4f2ec', dark: '#111113' };

export function applyTheme(pref: ThemePref, animate = false) {
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 360);
  }
  // Clear anything a previous custom theme (or the pre-paint script) set inline.
  for (let i = root.style.length - 1; i >= 0; i--) {
    const k = root.style[i];
    if (k.startsWith('--')) root.style.removeProperty(k);
  }
  root.dataset.theme = theme;
  let color = THEME_COLOR[theme];
  if (pref === 'custom') {
    const custom = getCustomTheme();
    const vars = customVars(custom);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.dataset.accent = 'custom';
    color = vars['--bg'] ?? color;
    try {
      // Cached so index.html can paint the right colours before the app loads.
      localStorage.setItem(CUSTOM_KEY, JSON.stringify({ ...custom, vars }));
    } catch {
      /* ignore */
    }
  } else {
    delete root.dataset.accent;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
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

/** Saves the custom colours and switches to the custom theme. */
export function setCustomTheme(next: CustomTheme) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('almanac:custom-theme', { detail: next }));
  // Already custom: re-tint without the fade, which would lag behind a colour picker drag.
  if (getThemePref() === 'custom') applyTheme('custom');
  else setThemePref('custom');
}

export function watchSystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const on = () => getThemePref() === 'system' && applyTheme('system', true);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}

export const THEME_ORDER: ThemePref[] = ['light', 'dark', 'custom', 'system'];
export const THEME_LABEL: Record<ThemePref, string> = {
  light: 'Light',
  dark: 'Dark',
  custom: 'Custom',
  system: 'System',
};
