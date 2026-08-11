// Plan feature copy, hand-derived from the actual backend gating so the
// public site never invents a limit:
//  - client caps: backend/src/routes/clients.js limits = { free: 2, pro: 15, agency: Infinity }
//  - report cap: backend/src/routes/reports.js free plan = 5 PDF reports / month
//  - Free-plan PDF pages skipped: Trends & Monthly Analysis, Campaign Insights,
//    Platform Performance, Insights & Recommendations (all gated on isFreePlan)
//  - Agency branding: canUseAgencyBranding = isProPlan || isAgencyPlan
export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    tagline: 'Try the full workflow with one client.',
    highlight: false,
    clients: 'Up to 2 clients',
    reports: '5 PDF reports / month',
    features: [
      'CSV & Excel import with column mapping',
      'Dashboard, trends & campaign analytics',
      'Executive summary, KPIs & campaign table in PDF',
      '5 PDF report themes',
    ],
    notIncluded: [
      'Trends & platform performance pages in PDF',
      'Automated insights & recommendations page',
      'Agency branding on reports',
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'For active agencies managing several clients.',
    highlight: true,
    clients: 'Up to 15 clients',
    reports: 'Unlimited PDF reports',
    features: [
      'Everything in Free',
      'Full PDF report structure — trends, platform performance, recommendations',
      'Unlimited monthly report generation',
      'Agency branding (logo & colors) on reports',
    ],
    notIncluded: [],
  },
  agency: {
    name: 'Agency',
    tagline: 'For agencies managing a large client roster.',
    highlight: false,
    clients: 'Unlimited clients',
    reports: 'Unlimited PDF reports',
    features: [
      'Everything in Pro',
      'No client limit',
    ],
    notIncluded: [],
  },
};

export const PLAN_ORDER = ['free', 'pro', 'agency'];
