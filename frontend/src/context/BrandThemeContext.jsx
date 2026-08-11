import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from './AuthContext';
import { REPORT_THEME_NAMES, DEFAULT_REPORT_THEME, getReportTheme } from '../theme/reportThemes';

const BrandThemeContext = createContext(null);
export const useBrandTheme = () => useContext(BrandThemeContext);

const applyCssVars = (name) => {
  const vars = getReportTheme(name).cssVars;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
  root.setAttribute('data-report-theme', name);
};

// Agency-wide brand/report theme -- independent of ThemeContext's personal
// light/dark surface preference. This context only ever touches accent-
// family CSS variables (--primary/--purple/--accent-gradient/chart colors),
// never --bg/--text/--border, so it layers cleanly on top of whichever
// light/dark mode the current user has chosen.
export const BrandThemeProvider = ({ children }) => {
  const { user } = useAuth();
  const [savedTheme, setSavedTheme] = useState(DEFAULT_REPORT_THEME);
  const [previewTheme, setPreviewTheme] = useState(null); // null = not previewing
  const loadedForAgency = useRef(null);

  const activeTheme = previewTheme || savedTheme;

  useEffect(() => {
    applyCssVars(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    if (!user?.agencyId || loadedForAgency.current === user.agencyId) return;
    loadedForAgency.current = user.agencyId;

    api.get('/agency')
      .then((res) => {
        const theme = res.data?.report_theme;
        if (REPORT_THEME_NAMES.includes(theme)) setSavedTheme(theme);
      })
      .catch(() => {
        // Fall back silently to the default theme -- a failed fetch here
        // must never block the app from rendering.
      });
  }, [user]);

  // Applies a theme immediately (before saving) so Settings can show a live
  // preview. Does not touch the server or the persisted saved value.
  const preview = useCallback((name) => {
    if (!REPORT_THEME_NAMES.includes(name)) return;
    setPreviewTheme(name);
  }, []);

  const cancelPreview = useCallback(() => {
    setPreviewTheme(null);
  }, []);

  // Persists the given (or currently previewed) theme as the agency's
  // report theme. Reverts to the last saved value on failure so the UI
  // never shows a false "saved" state.
  const saveTheme = useCallback(async (name) => {
    const target = name || previewTheme || savedTheme;
    if (!REPORT_THEME_NAMES.includes(target)) return false;

    try {
      const updated = await api.put('/agency', { reportTheme: target });
      const confirmed = REPORT_THEME_NAMES.includes(updated.data?.report_theme)
        ? updated.data.report_theme
        : target;
      setSavedTheme(confirmed);
      setPreviewTheme(null);
      toast.success('Report theme updated');
      return true;
    } catch (err) {
      setPreviewTheme(null); // revert live preview back to the saved theme
      toast.error(err.response?.data?.error || 'Failed to save report theme');
      return false;
    }
  }, [previewTheme, savedTheme]);

  return (
    <BrandThemeContext.Provider
      value={{ savedTheme, activeTheme, isPreviewing: previewTheme !== null, preview, cancelPreview, saveTheme }}
    >
      {children}
    </BrandThemeContext.Provider>
  );
};
