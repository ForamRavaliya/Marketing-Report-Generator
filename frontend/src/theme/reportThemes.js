// Frontend mirror of backend/src/utils/pdf/reportThemes.js -- the same 5
// named themes, same hex values, kept in sync by hand (documented at each
// theme). This is what makes the app's accent/chart colors visually match
// the PDF a given agency generates. Only the *values* are duplicated (CRA
// can't import across the frontend/backend package boundary without a
// shared workspace) -- the *definitions* are authored once conceptually
// and mirrored deliberately, not reinvented per surface.
//
// Each theme supplies CSS custom-property overrides (applied via
// `data-report-theme="<name>"` on <html>, layered on top of the existing
// light/dark `data-theme` tokens -- these two attributes are independent:
// data-theme controls page background/surface/text (personal preference),
// data-report-theme controls brand accent/chart colors (agency-wide)) plus
// a `swatch` used for the Settings preview card and a `chartPalette` used
// by chart-consuming pages.

export const REPORT_THEME_NAMES = ['professional-blue', 'purple-gradient', 'emerald', 'dark', 'minimal-bw'];
export const DEFAULT_REPORT_THEME = 'professional-blue';

export const REPORT_THEMES = {
  'professional-blue': {
    label: 'Professional Blue',
    description: 'Balanced modern SaaS blue — the default.',
    swatch: ['#3B82F6', '#8B5CF6'],
    cssVars: {
      '--primary': '#2563EB',
      '--primary-light': '#EFF6FF',
      '--primary-dark': '#1D4ED8',
      '--purple': '#7C3AED',
      '--purple-light': '#F5F3FF',
      '--accent-gradient': 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    },
    chartPalette: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4'],
  },
  'purple-gradient': {
    label: 'Purple Gradient',
    description: 'Bold purple-to-pink gradient, vivid accents.',
    swatch: ['#7C3AED', '#DB2777'],
    cssVars: {
      '--primary': '#7C3AED',
      '--primary-light': '#F5F3FF',
      '--primary-dark': '#6D28D9',
      '--purple': '#DB2777',
      '--purple-light': '#FCE7F3',
      '--accent-gradient': 'linear-gradient(135deg, #7C3AED, #DB2777)',
    },
    chartPalette: ['#7C3AED', '#DB2777', '#A78BFA', '#F472B6', '#C026D3', '#8B5CF6'],
  },
  emerald: {
    label: 'Emerald',
    description: 'Clean green identity, calm and confident.',
    swatch: ['#059669', '#0D9488'],
    cssVars: {
      '--primary': '#059669',
      '--primary-light': '#ECFDF5',
      '--primary-dark': '#047857',
      '--purple': '#0D9488',
      '--purple-light': '#F0FDFA',
      '--accent-gradient': 'linear-gradient(135deg, #059669, #0D9488)',
    },
    chartPalette: ['#059669', '#0D9488', '#0891B2', '#65A30D', '#16A34A', '#0EA5E9'],
  },
  dark: {
    label: 'Dark',
    description: 'Premium near-black chrome with a gold accent.',
    swatch: ['#18181B', '#F59E0B'],
    cssVars: {
      '--primary': '#F59E0B',
      '--primary-light': '#FEF3C7',
      '--primary-dark': '#D97706',
      '--purple': '#22D3EE',
      '--purple-light': '#CFFAFE',
      '--accent-gradient': 'linear-gradient(135deg, #18181B, #F59E0B)',
      '--sidebar-bg': '#09090B',
    },
    chartPalette: ['#F59E0B', '#22D3EE', '#A78BFA', '#34D399', '#FB7185', '#818CF8'],
  },
  'minimal-bw': {
    label: 'Minimal Black & White',
    description: 'Pure grayscale, zero hue, maximum whitespace.',
    swatch: ['#18181B', '#A1A1AA'],
    cssVars: {
      '--primary': '#18181B',
      '--primary-light': '#F4F4F5',
      '--primary-dark': '#000000',
      '--purple': '#52525B',
      '--purple-light': '#F4F4F5',
      '--accent-gradient': 'linear-gradient(135deg, #18181B, #52525B)',
    },
    chartPalette: ['#18181B', '#3F3F46', '#71717A', '#A1A1AA', '#52525B', '#D4D4D8'],
  },
};

export const getReportTheme = (name) => REPORT_THEMES[REPORT_THEME_NAMES.includes(name) ? name : DEFAULT_REPORT_THEME];
