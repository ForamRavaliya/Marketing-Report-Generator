import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'ui_theme_preference';
const VALID_THEMES = ['system', 'light', 'dark'];

// Product default is Light. 'system' is still a fully supported explicit
// choice -- this fallback only applies when nothing has ever been chosen
// (no cached value, private browsing, or storage failure).
const readCachedPreference = () => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    return VALID_THEMES.includes(cached) ? cached : 'light';
  } catch {
    return 'light';
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

const resolveEffective = (preference) =>
  (preference === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : preference);

const applyToDocument = (effective) => {
  document.documentElement.setAttribute('data-theme', effective);
};

// Reads/writes the shared 'system'|'light'|'dark' preference: this app's
// theme state, the tiny inline script in public/index.html (flash
// prevention), and the eventual server-side value all agree on this exact
// shape, so any of the three can act as the source of truth without a
// translation step.
export const ThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [uiTheme, setUiThemeState] = useState(readCachedPreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveEffective(readCachedPreference()));
  const reconciledUserId = useRef(null);

  useEffect(() => {
    const effective = resolveEffective(uiTheme);
    setResolvedTheme(effective);
    applyToDocument(effective);
    try {
      localStorage.setItem(STORAGE_KEY, uiTheme);
    } catch {
      // Private browsing / storage quota exceeded -- theme still applies
      // for this session, it just won't survive a reload.
    }
  }, [uiTheme]);

  // Follow OS theme changes live, but only while preference is 'system' --
  // an explicit light/dark choice must not be overridden by OS changes.
  useEffect(() => {
    if (uiTheme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const effective = systemPrefersDark() ? 'dark' : 'light';
      setResolvedTheme(effective);
      applyToDocument(effective);
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [uiTheme]);

  // Preference hierarchy: authenticated server preference wins over
  // whatever was cached locally, resolved once per login session so it
  // never clobbers a change the user makes afterward in this same session.
  useEffect(() => {
    if (!user || !user.id) return;
    if (reconciledUserId.current === user.id) return;
    reconciledUserId.current = user.id;

    if (VALID_THEMES.includes(user.uiTheme) && user.uiTheme !== uiTheme) {
      setUiThemeState(user.uiTheme);
    }
    // Deliberately only re-runs when the logged-in user identity changes.
  }, [user]);

  const setUiTheme = useCallback(async (nextTheme) => {
    if (!VALID_THEMES.includes(nextTheme)) return;

    const previous = uiTheme;
    setUiThemeState(nextTheme); // optimistic -- applies instantly, no flash

    if (!user) return;

    try {
      await api.put('/auth/theme', { uiTheme: nextTheme });
    } catch (err) {
      // Never leave a false "saved" state: revert to the last known-good
      // preference and tell the user explicitly.
      setUiThemeState(previous);
      toast.error(err.response?.data?.error || 'Failed to save theme preference');
    }
  }, [uiTheme, user]);

  return (
    <ThemeContext.Provider value={{ uiTheme, resolvedTheme, setUiTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
