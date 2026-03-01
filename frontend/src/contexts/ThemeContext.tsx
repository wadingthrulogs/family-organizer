import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useUserPreferences, useUpdateUserPreferencesMutation } from '../hooks/useUserPreferences';

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
  | 'github-dark'
  | 'github-light'
  | 'catppuccin-mocha'
  | 'catppuccin-latte'
  | 'gruvbox-dark'
  | 'tokyo-night'
  | 'rose-pine';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  colors: { bg: string; card: string; accent: string; text: string };
}

export const THEMES: ThemeMeta[] = [
  { id: 'default', name: 'Default', colors: { bg: '#F5F1EA', card: '#FFFFFF', accent: '#2F80ED', text: '#0F172A' } },
  { id: 'dark-plus', name: 'Dark+', colors: { bg: '#1E1E1E', card: '#252526', accent: '#0E639C', text: '#D4D4D4' } },
  { id: 'light-plus', name: 'Light+', colors: { bg: '#FFFFFF', card: '#F3F3F3', accent: '#007ACC', text: '#333333' } },
  { id: 'monokai', name: 'Monokai', colors: { bg: '#272822', card: '#2E2E28', accent: '#F92672', text: '#F8F8F2' } },
  { id: 'dracula', name: 'Dracula', colors: { bg: '#282A36', card: '#2C2F3E', accent: '#BD93F9', text: '#F8F8F2' } },
  { id: 'solarized-dark', name: 'Solarized Dark', colors: { bg: '#002B36', card: '#073642', accent: '#268BD2', text: '#EEE8D5' } },
  { id: 'solarized-light', name: 'Solarized Light', colors: { bg: '#FDF6E3', card: '#EEE8D5', accent: '#268BD2', text: '#073642' } },
  { id: 'one-dark-pro', name: 'One Dark Pro', colors: { bg: '#282C34', card: '#2C313A', accent: '#61AFEF', text: '#ABB2BF' } },
  { id: 'nord', name: 'Nord', colors: { bg: '#2E3440', card: '#3B4252', accent: '#88C0D0', text: '#D8DEE9' } },
  { id: 'github-dark', name: 'GitHub Dark', colors: { bg: '#0D1117', card: '#161B22', accent: '#238636', text: '#C9D1D9' } },
  { id: 'github-light', name: 'GitHub Light', colors: { bg: '#FFFFFF', card: '#F6F8FA', accent: '#2DA44E', text: '#1F2328' } },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', colors: { bg: '#1E1E2E', card: '#242435', accent: '#CBA6F7', text: '#CDD6F4' } },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', colors: { bg: '#EFF1F5', card: '#E6E9EF', accent: '#8839EF', text: '#4C4F69' } },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', colors: { bg: '#282828', card: '#3C3836', accent: '#FB4934', text: '#EBDBB2' } },
  { id: 'tokyo-night', name: 'Tokyo Night', colors: { bg: '#1A1B26', card: '#1F2335', accent: '#7AA2F7', text: '#A9B1D6' } },
  { id: 'rose-pine', name: 'Rosé Pine', colors: { bg: '#191724', card: '#1F1D2E', accent: '#C4A7E7', text: '#E0DEF4' } },
];

const STORAGE_KEY = 'organizer-theme';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'default',
  setTheme: () => {},
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

  const [theme, setThemeState] = useState<ThemeId>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    return stored ?? 'default';
  });

  // On mount, apply whatever is in localStorage immediately (no flash)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // When per-user preferences load, sync from server (server wins)
  useEffect(() => {
    if (prefs?.theme && prefs.theme !== theme) {
      const serverTheme = prefs.theme as ThemeId;
      setThemeState(serverTheme);
      localStorage.setItem(STORAGE_KEY, serverTheme);
      applyTheme(serverTheme);
    }
    // Only run when prefs.theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs?.theme]);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      localStorage.setItem(STORAGE_KEY, id);
      applyTheme(id);
      // Persist to server per-user (fire and forget)
      updatePrefs.mutate({ theme: id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
