import React from 'react';
import { REPORT_THEME_NAMES, REPORT_THEMES } from '../../../theme/reportThemes';

// Renders the 5 real PDF/app report themes from theme/reportThemes.js --
// the same registry the product actually uses, so this can never drift
// into inventing a theme that doesn't exist.
export default function ThemeSwatches() {
  return (
    <div className="pub-grid-5">
      {REPORT_THEME_NAMES.map((name) => {
        const theme = REPORT_THEMES[name];
        return (
          <div key={name} className="pub-card" style={{ padding: 18, textAlign: 'center' }}>
            <div style={{
              height: 54, borderRadius: 10, marginBottom: 12,
              background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})`,
            }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{theme.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 4 }}>{theme.description}</div>
          </div>
        );
      })}
    </div>
  );
}
