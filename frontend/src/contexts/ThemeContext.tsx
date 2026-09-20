import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';
import { useToday } from '../hooks/useToday';
import { resolveSeasonalTheme } from '../lib/seasonalTheme';

export type ThemeId =
  | 'default'
  | 'dark-plus'
  | 'light-plus'
  | 'monokai'
  | 'dracula'
  | 'solarized-dark'
  | 'solarized-light'
  | 'one-dark-pro'
  | 'nord'
  | 'midnight'
  | 'paper'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'gruvbox-dark'
  | 'tokyo-night'
  | 'rose-pine'
  | 'halloween'
  | 'thanksgiving'
  | 'christmas'
  | 'dnd';

export type ThemeGroup = 'classic' | 'seasonal';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  group: ThemeGroup;
  /** Short line under the name in the picker. Only the themed ones need one. */
  blurb?: string;
}

/**
 * Everything a theme looks like lives in CSS under `[data-theme="<id>"]`
 * (src/styles/index.css). The picker previews a theme by rendering a card
 * with that attribute, so there is nothing to keep in sync here beyond the id.
 */
export const THEMES: ThemeMeta[] = [
  { id: 'default', name: 'Default', group: 'classic' },
  { id: 'dark-plus', name: 'Dark+', group: 'classic' },
  { id: 'light-plus', name: 'Light+', group: 'classic' },
  { id: 'monokai', name: 'Monokai', group: 'classic' },
  { id: 'dracula', name: 'Dracula', group: 'classic' },
  { id: 'solarized-dark', name: 'Solarized Dark', group: 'classic' },
  { id: 'solarized-light', name: 'Solarized Light', group: 'classic' },
  { id: 'one-dark-pro', name: 'One Dark Pro', group: 'classic' },
  { id: 'nord', name: 'Nord', group: 'classic' },
  { id: 'midnight', name: 'Midnight', group: 'classic' },
  { id: 'paper', name: 'Paper', group: 'classic' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', group: 'classic' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', group: 'classic' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', group: 'classic' },
  { id: 'tokyo-night', name: 'Tokyo Night', group: 'classic' },
  { id: 'rose-pine', name: 'Rosé Pine', group: 'classic' },
  { id: 'halloween', name: 'Halloween', group: 'seasonal', blurb: 'Pumpkin orange, bats and cobwebs' },
  { id: 'thanksgiving', name: 'Thanksgiving', group: 'seasonal', blurb: 'Warm harvest cream and rust' },
  { id: 'christmas', name: 'Christmas', group: 'seasonal', blurb: 'Pine green, red and gold, snowfall' },
  { id: 'dnd', name: 'Dungeons & Dragons', group: 'seasonal', blurb: 'Parchment, crimson and d20s' },
];

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.has(value);
}

const STORAGE_KEY = 'organizer-theme';
const SEASONAL_STORAGE_KEY = 'organizer-theme-seasonal';

interface ThemeContextValue {
  /** The theme the user picked. Persisted; the fallback outside holiday windows. */
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  /** Auto-switch to a holiday theme by date (see lib/seasonalTheme.ts). */
  seasonal: boolean;
  setSeasonal: (on: boolean) => void;
  /** What is actually applied right now: the seasonal pick if one is active, else `theme`. */
  effectiveTheme: ThemeId;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default',
  setTheme: () => {},
  seasonal: false,
  setSeasonal: () => {},
  effectiveTheme: 'default',
});

function applyTheme(id: ThemeId) {
  if (id === 'default') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: prefs } = useUserPreferences();
  const updatePrefs = useUpdateUserPreferencesMutation();
  const today = useToday();

  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : 'default';
  });
  const [seasonal, setSeasonalState] = useState<boolean>(
    () => localStorage.getItem(SEASONAL_STORAGE_KEY) === '1'
  );

  // `today` is the wall display's midnight-rollover key, so the holiday
  // switch happens on its own without anyone touching the screen.
  const effectiveTheme = useMemo<ThemeId>(
    () => (seasonal ? resolveSeasonalTheme() ?? theme : theme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seasonal, theme, today]
  );

  // Apply immediately from localStorage on mount (no flash), and whenever the
  // effective theme changes after that.
  useEffect(() => {
    applyTheme(effectiveTheme);
  }, [effectiveTheme]);

  // When per-user preferences load, sync from server (server wins)
  useEffect(() => {
    if (!prefs) return;
    if (isThemeId(prefs.theme) && prefs.theme !== theme) {
      setThemeState(prefs.theme);
      localStorage.setItem(STORAGE_KEY, prefs.theme);
    }
    if (typeof prefs.seasonalTheme === 'boolean' && prefs.seasonalTheme !== seasonal) {
      setSeasonalState(prefs.seasonalTheme);
      localStorage.setItem(SEASONAL_STORAGE_KEY, prefs.seasonalTheme ? '1' : '0');
    }
    // Only run when the server values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs?.theme, prefs?.seasonalTheme]);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      localStorage.setItem(STORAGE_KEY, id);
      // Persist to server per-user (fire and forget)
      updatePrefs.mutate({ theme: id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const setSeasonal = useCallback(
    (on: boolean) => {
      setSeasonalState(on);
      localStorage.setItem(SEASONAL_STORAGE_KEY, on ? '1' : '0');
      updatePrefs.mutate({ seasonalTheme: on });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, seasonal, setSeasonal, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
