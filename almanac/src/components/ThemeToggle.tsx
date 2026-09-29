import { useEffect, useState } from 'react';
import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { getCustomTheme, getThemePref, setThemePref, THEME_LABEL, THEME_ORDER, type CustomTheme, type ThemePref } from '../lib/theme.ts';

const ICON: Record<ThemePref, React.ReactNode> = {
  light: <Sun />,
  dark: <Moon />,
  custom: <Palette />,
  system: <Monitor />,
};

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  useEffect(() => {
    const on = (e: Event) => setPref((e as CustomEvent<ThemePref>).detail);
    window.addEventListener('almanac:theme', on);
    return () => window.removeEventListener('almanac:theme', on);
  }, []);
  return [pref, (p) => setThemePref(p)];
}

export function useCustomTheme(): CustomTheme {
  const [custom, setCustom] = useState<CustomTheme>(getCustomTheme);
  useEffect(() => {
    const on = (e: Event) => setCustom((e as CustomEvent<CustomTheme>).detail);
    window.addEventListener('almanac:custom-theme', on);
    return () => window.removeEventListener('almanac:custom-theme', on);
  }, []);
  return custom;
}

/** Light · Dark · Custom (your own accent, set in Settings) · System. */
export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [pref, set] = useThemePref();
  if (compact) {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    return (
      <button className="btn btn-ghost btn-icon" onClick={() => set(next)} aria-label={`Theme: ${THEME_LABEL[pref]}. Switch to ${THEME_LABEL[next]}`} title={`Theme: ${THEME_LABEL[pref]}`}>
        {ICON[pref]}
      </button>
    );
  }
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {THEME_ORDER.map((p) => (
        <button key={p} role="radio" aria-checked={pref === p} aria-label={THEME_LABEL[p]} title={THEME_LABEL[p]} onClick={() => set(p)} className={pref === p ? 'on' : ''}>
          {ICON[p]}
        </button>
      ))}
    </div>
  );
}
