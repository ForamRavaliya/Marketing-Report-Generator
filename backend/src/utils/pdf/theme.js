// Centralized PDF visual design system. Pure constants/helpers only --
// no report data, no pdfkit `doc` instance. Keeping this file data-agnostic
// is what lets Phase 6 (theme switching) plug in alternate palettes later
// without touching reports.js or the drawing helpers in this folder.

const { REPORT_THEME_NAMES, DEFAULT_REPORT_THEME, REPORT_THEME_META, getReportTheme } = require('./reportThemes');

const BASE_THEME = {
  dark: '#111827',
  navy: '#0B1220',
  navySoft: '#152238',
  royal: '#3B82F6',
  violet: '#8B5CF6',
  cyan: '#06B6D4',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#F43F5E',
  bg: '#F1F5F9',
  card: '#FFFFFF',
  softBlue: '#EFF6FF',
  softPurple: '#F5F3FF',
  softGreen: '#ECFDF5',
  softAmber: '#FFFBEB',
  softRose: '#FFF1F2',
  softCyan: '#ECFEFF',
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
};

// Consistent type scale so cover/page/section/card/kpi/body/table/footnote
// text all trace back to one set of sizes instead of ad-hoc fontSize calls.
const TYPE = {
  coverTitle: 27,
  coverSubtitle: 13,
  coverMeta: 9,
  pageTitle: 21,
  pageSubtitle: 9.5,
  sectionHeading: 15,
  cardLabel: 7.5,
  kpiValueLg: 15,
  kpiValueMd: 12,
  kpiValueSm: 9,
  body: 9,
  bodySmall: 8,
  tableHeader: 8,
  tableCell: 7.5,
  footnote: 8,
};

const SPACING = {
  pageMarginX: 35,
  contentX: 55,
  cardRadius: 12,
  cardGap: 18,
  sectionGap: 24,
};

const LAYOUT = {
  pageContentTop: 120,
  contentBottom: 735,
  footerTop: 755,
};

const hexToRgb = (hex) => {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;

// Relative luminance (sRGB, simplified) -- used only to decide whether a
// color is safe as a small accent against white/light card backgrounds and
// with white cover-page text, not as a full WCAG engine.
const relativeLuminance = ({ r, g, b }) => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const blend = (rgb, target, amount) => ({
  r: rgb.r + (target.r - rgb.r) * amount,
  g: rgb.g + (target.g - rgb.g) * amount,
  b: rgb.b + (target.b - rgb.b) * amount,
});

/**
 * Returns a hex color safe to use as an accent against both white text
 * (cover band) and light card backgrounds. Falls back to `fallback` when
 * the input is missing/unparsable. Nudges colors that are too light
 * (would vanish against white/light backgrounds) or too dark (would read
 * as near-black, indistinguishable from body text) toward a usable range,
 * rather than rejecting them outright.
 */
const normalizeAccentColor = (hex, fallback = BASE_THEME.royal) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;

  const luminance = relativeLuminance(rgb);

  if (luminance > 0.82) {
    // Too light -- would disappear on white cards / behind white cover text.
    return rgbToHex(blend(rgb, { r: 30, g: 41, b: 59 }, 0.45));
  }
  if (luminance < 0.06) {
    // Too dark -- indistinguishable from body text / navy cover band.
    return rgbToHex(blend(rgb, { r: 255, g: 255, b: 255 }, 0.35));
  }
  return rgbToHex(rgb);
};

// Picks white or the theme's dark text color depending on which reads
// safely against `hex` -- used only for text drawn directly on top of an
// accent-colored band (e.g. the Branded variant's header band), never for
// deciding data values.
const pickReadableTextColor = (hex, darkFallback = BASE_THEME.text) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#FFFFFF';
  return relativeLuminance(rgb) > 0.55 ? darkFallback : '#FFFFFF';
};

const PDF_THEME_NAMES = ['professional', 'minimal', 'branded'];
const DEFAULT_PDF_THEME = 'professional';

// Structural + palette deltas per report-theme variant. Every variant is
// still built from BASE_THEME -- these only override which colors/structural
// flags layout.js/tables.js/charts.js consult, never the metrics, report-type
// config, availability rules, or pagination logic those files receive
// alongside `theme`.
const buildVariantTokens = (variant, { accent, secondaryAccent }) => {
  if (variant === 'minimal') {
    // Neutral, whitespace-heavy: no colored header band, muted accents,
    // no colored table header, near-white row striping.
    const neutralAccent = '#334155';
    return {
      variant,
      royal: neutralAccent,
      violet: '#475569',
      emerald: '#0F766E',
      amber: '#92400E',
      rose: '#9F1239',
      cyan: '#0369A1',
      headerBandHeight: 0,
      headerBandColor: BASE_THEME.bg,
      headerTextColor: BASE_THEME.text,
      headerSubtitleColor: BASE_THEME.muted,
      coverBandColor: neutralAccent,
      tableHeaderAccent: neutralAccent,
      tableStripe: ['#FFFFFF', '#FAFAFA'],
      comparisonStripe: ['#FFFFFF', '#FAFAFA'],
      campaignStripe: ['#FFFFFF', '#FAFAFA'],
      chartPalette: ['#1E293B', '#475569', '#0369A1', '#94A3B8', '#334155', '#0EA5E9'],
      cardShadowOpacity: 0.04,
    };
  }

  if (variant === 'branded' && accent) {
    const headerAccent = accent;
    const secondary = secondaryAccent || accent;
    return {
      variant,
      royal: headerAccent,
      violet: secondary,
      brandAccent: headerAccent,
      brandSecondaryAccent: secondary,
      headerBandHeight: 88,
      headerBandColor: headerAccent,
      headerTextColor: pickReadableTextColor(headerAccent),
      headerSubtitleColor: pickReadableTextColor(headerAccent) === '#FFFFFF' ? '#E2E8F0' : BASE_THEME.muted,
      coverBandColor: secondary,
      tableHeaderAccent: headerAccent,
      tableStripe: ['#F8FAFC', '#EEF2FF'],
      comparisonStripe: ['#FFFFFF', '#ECFDF5'],
      campaignStripe: ['#F8FAFC', '#F5F3FF'],
      chartPalette: [headerAccent, secondary, BASE_THEME.emerald, BASE_THEME.amber, BASE_THEME.rose, BASE_THEME.cyan],
      cardShadowOpacity: 0.10,
    };
  }

  // 'professional' (default), or 'branded' requested without a usable
  // agency accent (falls back to professional's structure/palette exactly).
  return {
    variant: 'professional',
    headerBandHeight: 88,
    headerBandColor: BASE_THEME.navy,
    headerTextColor: '#FFFFFF',
    headerSubtitleColor: '#CBD5E1',
    coverBandColor: accent || BASE_THEME.royal,
    tableHeaderAccent: BASE_THEME.violet,
    tableStripe: ['#F8FAFC', '#EEF2FF'],
    comparisonStripe: ['#FFFFFF', '#ECFDF5'],
    campaignStripe: ['#F8FAFC', '#F5F3FF'],
    chartPalette: [BASE_THEME.royal, BASE_THEME.violet, BASE_THEME.emerald, BASE_THEME.amber, BASE_THEME.rose, BASE_THEME.cyan],
    cardShadowOpacity: 0.10,
    ...(accent ? { royal: accent, brandAccent: accent } : {}),
  };
};

/**
 * Builds the effective per-report theme. Two independent selectors are
 * supported, checked in this order:
 *
 * 1. `reportTheme` (Phase 6b) -- one of the 5 named themes in
 *    reportThemes.js (professional-blue/purple-gradient/emerald/dark/
 *    minimal-bw). These are fixed, self-contained palettes and win outright
 *    when present/valid -- no agency-color blending, by design (the whole
 *    point of a named theme is a consistent, curated identity).
 * 2. `variant` (Phase 6a, legacy) -- professional/minimal/branded, where
 *    "branded" blends in the agency's own primary/secondary color. Still
 *    supported for any caller not yet passing `reportTheme`.
 *
 * Agency branding (primary/secondary color) only ever applies via the
 * legacy `variant: 'branded'` path, and only when the plan allows agency
 * branding and a usable color is present. This never reads or writes
 * agency settings -- callers pass in already-fetched values. Metrics,
 * report-type config, availability rules, charts/data, tables, insights,
 * and pagination are entirely unaffected by this function either way.
 */
const buildReportTheme = ({ primaryColor, secondaryColor, canUseAgencyBranding, variant, reportTheme } = {}) => {
  if (REPORT_THEME_NAMES.includes(reportTheme)) {
    return { ...getReportTheme(reportTheme) };
  }

  const resolvedVariant = PDF_THEME_NAMES.includes(variant) ? variant : DEFAULT_PDF_THEME;

  const accent = canUseAgencyBranding && primaryColor
    ? normalizeAccentColor(primaryColor, BASE_THEME.royal)
    : null;
  const secondaryAccent = canUseAgencyBranding && secondaryColor
    ? normalizeAccentColor(secondaryColor, BASE_THEME.violet)
    : null;

  const variantTokens = buildVariantTokens(resolvedVariant, { accent, secondaryAccent });

  return { ...BASE_THEME, ...variantTokens };
};

module.exports = {
  BASE_THEME,
  TYPE,
  SPACING,
  LAYOUT,
  PDF_THEME_NAMES,
  DEFAULT_PDF_THEME,
  REPORT_THEME_NAMES,
  DEFAULT_REPORT_THEME,
  REPORT_THEME_META,
  normalizeAccentColor,
  pickReadableTextColor,
  buildReportTheme,
};
