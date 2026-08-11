// Canonical registry of the 5 named report themes. This is the single
// source of truth for PDF presentation tokens -- theme.js's buildReportTheme
// reads from here, and frontend/src/theme/reportThemes.js mirrors the same
// hex values (kept in sync by hand, documented at each theme below) so the
// web app's accent/chart colors visually match the PDF a given agency
// generates. No metrics, report-type config, availability rules, charts/
// data, tables, insights, or pagination logic lives here -- presentation
// tokens only.
//
// Every theme supplies the exact same key set so layout.js/components.js/
// tables.js/charts.js never need to branch on which theme is active --
// they just read theme.<key>, same as Phase 5/6a.

const REPORT_THEME_NAMES = ['professional-blue', 'purple-gradient', 'emerald', 'dark', 'minimal-bw'];
const DEFAULT_REPORT_THEME = 'professional-blue';

const REPORT_THEME_META = {
  'professional-blue': { label: 'Professional Blue', description: 'Balanced modern SaaS blue -- the default.' },
  'purple-gradient': { label: 'Purple Gradient', description: 'Bold purple-to-pink gradient header, vivid accents.' },
  emerald: { label: 'Emerald', description: 'Clean green identity, calm and confident.' },
  dark: { label: 'Dark', description: 'Premium near-black header with gold accent; body stays print-safe light.' },
  'minimal-bw': { label: 'Minimal Black & White', description: 'Pure grayscale, zero hue, maximum whitespace.' },
};

const REPORT_THEMES = {
  'professional-blue': {
    // Neutrals
    dark: '#111827', navy: '#0B1220', navySoft: '#152238',
    bg: '#F1F5F9', card: '#FFFFFF',
    text: '#1E293B', muted: '#64748B', subtle: '#94A3B8',
    border: '#E2E8F0', borderStrong: '#CBD5E1',
    // Accents
    royal: '#3B82F6', violet: '#8B5CF6', cyan: '#06B6D4',
    emerald: '#10B981', amber: '#F59E0B', rose: '#F43F5E',
    softBlue: '#EFF6FF', softPurple: '#F5F3FF', softGreen: '#ECFDF5',
    softAmber: '#FFFBEB', softRose: '#FFF1F2', softCyan: '#ECFEFF',
    // Structural
    headerBandHeight: 88,
    headerBandColor: '#0B1220',
    headerTextColor: '#FFFFFF',
    headerSubtitleColor: '#CBD5E1',
    coverBandColor: '#3B82F6',
    tableHeaderAccent: '#8B5CF6',
    tableStripe: ['#F8FAFC', '#EEF2FF'],
    comparisonStripe: ['#FFFFFF', '#ECFDF5'],
    campaignStripe: ['#F8FAFC', '#F5F3FF'],
    chartPalette: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4'],
    cardShadowOpacity: 0.10,
  },

  'purple-gradient': {
    dark: '#1E1033', navy: '#3B0764', navySoft: '#4C1D7A',
    bg: '#FAF5FF', card: '#FFFFFF',
    text: '#1E293B', muted: '#64748B', subtle: '#94A3B8',
    border: '#E9D5FF', borderStrong: '#D8B4FE',
    royal: '#7C3AED', violet: '#DB2777', cyan: '#A78BFA',
    emerald: '#10B981', amber: '#F59E0B', rose: '#EC4899',
    softBlue: '#F5F3FF', softPurple: '#FCE7F3', softGreen: '#ECFDF5',
    softAmber: '#FFFBEB', softRose: '#FDF2F8', softCyan: '#F3E8FF',
    headerBandHeight: 88,
    headerBandColor: '#7C3AED',
    headerBandGradient: ['#7C3AED', '#DB2777'],
    headerTextColor: '#FFFFFF',
    headerSubtitleColor: '#F3E8FF',
    coverBandColor: '#DB2777',
    coverBandGradient: ['#DB2777', '#F472B6'],
    tableHeaderAccent: '#7C3AED',
    tableStripe: ['#FAF5FF', '#F5F3FF'],
    comparisonStripe: ['#FFFFFF', '#FDF4FF'],
    campaignStripe: ['#FAF5FF', '#F3E8FF'],
    chartPalette: ['#7C3AED', '#DB2777', '#A78BFA', '#F472B6', '#C026D3', '#8B5CF6'],
    cardShadowOpacity: 0.10,
  },

  emerald: {
    dark: '#052E2B', navy: '#064E3B', navySoft: '#0F5132',
    bg: '#F0FDF4', card: '#FFFFFF',
    text: '#1E293B', muted: '#64748B', subtle: '#94A3B8',
    border: '#D1FAE5', borderStrong: '#A7F3D0',
    royal: '#059669', violet: '#0D9488', cyan: '#0891B2',
    emerald: '#10B981', amber: '#D97706', rose: '#DC2626',
    softBlue: '#ECFDF5', softPurple: '#F0FDFA', softGreen: '#DCFCE7',
    softAmber: '#FEF9C3', softRose: '#FEE2E2', softCyan: '#CFFAFE',
    headerBandHeight: 88,
    headerBandColor: '#064E3B',
    headerTextColor: '#FFFFFF',
    headerSubtitleColor: '#D1FAE5',
    coverBandColor: '#0D9488',
    tableHeaderAccent: '#059669',
    tableStripe: ['#F0FDF4', '#ECFDF5'],
    comparisonStripe: ['#FFFFFF', '#F0FDFA'],
    campaignStripe: ['#F0FDF4', '#E6FFFA'],
    chartPalette: ['#059669', '#0D9488', '#0891B2', '#65A30D', '#16A34A', '#0EA5E9'],
    cardShadowOpacity: 0.10,
  },

  dark: {
    // "Dark" is a premium near-black HEADER/ACCENT identity, not a
    // dark-background document -- report bodies stay on a light/white
    // surface deliberately, since a literal dark-background PDF is poor
    // for printing (heavy toner/ink coverage) and for on-screen review
    // tools that assume a light page. The dark identity reads clearly
    // through the header band, table headers, and gold accent instead.
    dark: '#09090B', navy: '#0A0A0A', navySoft: '#18181B',
    bg: '#FAFAF9', card: '#FFFFFF',
    text: '#18181B', muted: '#52525B', subtle: '#71717A',
    border: '#E4E4E7', borderStrong: '#D4D4D8',
    royal: '#F59E0B', violet: '#22D3EE', cyan: '#38BDF8',
    emerald: '#10B981', amber: '#F59E0B', rose: '#F43F5E',
    softBlue: '#FEF3C7', softPurple: '#CFFAFE', softGreen: '#D1FAE5',
    softAmber: '#FEF3C7', softRose: '#FFE4E6', softCyan: '#CFFAFE',
    headerBandHeight: 88,
    headerBandColor: '#0A0A0A',
    headerTextColor: '#FFFFFF',
    headerSubtitleColor: '#D4D4D8',
    coverBandColor: '#F59E0B',
    tableHeaderAccent: '#18181B',
    tableStripe: ['#FAFAF9', '#F5F5F4'],
    comparisonStripe: ['#FFFFFF', '#FAFAF9'],
    campaignStripe: ['#FAFAF9', '#F0F0EF'],
    chartPalette: ['#F59E0B', '#22D3EE', '#A78BFA', '#34D399', '#FB7185', '#818CF8'],
    cardShadowOpacity: 0.14,
  },

  'minimal-bw': {
    // True grayscale -- no hue anywhere, including the KPI-card accent
    // dots and chart series, per the theme's name. Cards keep faint
    // lightness variation only, for scannability without color.
    dark: '#09090B', navy: '#09090B', navySoft: '#27272A',
    bg: '#FAFAFA', card: '#FFFFFF',
    text: '#18181B', muted: '#52525B', subtle: '#A1A1AA',
    border: '#E4E4E7', borderStrong: '#D4D4D8',
    royal: '#18181B', violet: '#3F3F46', cyan: '#A1A1AA',
    emerald: '#52525B', amber: '#71717A', rose: '#27272A',
    softBlue: '#FAFAFA', softPurple: '#F5F5F4', softGreen: '#F4F4F5',
    softAmber: '#FAFAF9', softRose: '#F5F5F5', softCyan: '#FAFAFA',
    headerBandHeight: 0,
    headerBandColor: '#FAFAFA',
    headerTextColor: '#18181B',
    headerSubtitleColor: '#52525B',
    coverBandColor: '#18181B',
    tableHeaderAccent: '#18181B',
    tableStripe: ['#FFFFFF', '#FAFAFA'],
    comparisonStripe: ['#FFFFFF', '#FAFAFA'],
    campaignStripe: ['#FFFFFF', '#F4F4F5'],
    chartPalette: ['#18181B', '#3F3F46', '#71717A', '#A1A1AA', '#52525B', '#D4D4D8'],
    cardShadowOpacity: 0.03,
  },
};

const getReportTheme = (name) => REPORT_THEMES[REPORT_THEME_NAMES.includes(name) ? name : DEFAULT_REPORT_THEME];

module.exports = {
  REPORT_THEME_NAMES,
  DEFAULT_REPORT_THEME,
  REPORT_THEME_META,
  REPORT_THEMES,
  getReportTheme,
};
