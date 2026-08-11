const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const https = require('https');
const fs = require('fs');
const db = require('../db');
const {
 getSummaryMetrics,
   getMonthlyTrends,
   getPlatformMetrics,
   getCampaignMetrics,
   normalizeMetricRecord,
   calculatePercentChange,
   isMetricAvailable,
} = require('../utils/metrics');
const { authenticate } = require('../middleware/auth');
const {
  uploadReportPdf,
  validateLocalPdf,
  validateRemotePdfUrl,
} = require('../utils/cloudinary');

const { buildReportTheme, PDF_THEME_NAMES, DEFAULT_PDF_THEME, REPORT_THEME_NAMES, DEFAULT_REPORT_THEME } = require('../utils/pdf/theme');
const { createPageFlow } = require('../utils/pdf/layout');
const {
  drawCard,
  drawSectionTitle,
  drawEmptyState,
  drawStarRating,
  drawBadge,
  drawAgencyLogo,
  drawKpiGrid,
} = require('../utils/pdf/components');
const { drawLineChart, drawNumberBarChart, drawPieChart } = require('../utils/pdf/charts');
const { fitWidths, drawSimpleTable, drawComparisonTable, drawCampaignTablePages } = require('../utils/pdf/tables');

router.use(authenticate);

const downloadImageToBuffer = (url) => {
  return new Promise((resolve) => {
    if (!url) return resolve(null);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) return resolve(null);

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', () => resolve(null));
  });
};

const isAbsoluteUrl = (value = '') => /^https?:\/\//i.test(String(value));

const legacyReportLocalPath = (filePath = '') => {
  if (!filePath || isAbsoluteUrl(filePath)) return null;
  return path.join(__dirname, '../../data/reports', path.basename(String(filePath)));
};

const reportFileAvailability = (filePath = '') => {
  if (!filePath) return false;
  if (isAbsoluteUrl(filePath)) return true;

  const localPath = legacyReportLocalPath(filePath);
  return Boolean(localPath && fs.existsSync(localPath));
};

const CURRENCY_SYMBOLS = {
  INR: 'INR ',
  USD: '$',
  EUR: 'EUR ',
  GBP: 'GBP ',
};


const formatNum = (value, decimals = 0) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';

  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatCurrency = (value, currency = 'INR') => {
  const symbol = CURRENCY_SYMBOLS[currency] || currency || '₹';
  return `${symbol}${formatNum(value, 2)}`;
};

const formatPct = (value) => {
  return `${formatNum(value, 2)}%`;
};

const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const positiveNumber = (value) => Math.max(0, safeNumber(value, 0));

const getPreviousDateRange = (dateStart, dateEnd) => {
  if (!dateStart || !dateEnd) return null;

  const start = new Date(`${String(dateStart).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(dateEnd).slice(0, 10)}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);

  return {
    start: previousStart.toISOString().slice(0, 10),
    end: previousEnd.toISOString().slice(0, 10),
  };
};


// Generate PDF report
router.post('/generate', async (req, res) => {
  try {
    const {
      clientId,
      title,
      dateStart,
      dateEnd,
      platform,
      includeComparison = true,
      customTitle,
      agencyBranding = true,
      currency = 'INR',
    } = req.body;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId required' });
    }
    if (!dateStart || !dateEnd) {
      return res.status(400).json({ error: 'dateStart and dateEnd are required' });
    }

    if (new Date(dateEnd) < new Date(dateStart)) {
      return res.status(400).json({ error: 'dateEnd must be on or after dateStart' });
    }

    const metricOptions = {
      clientId,
      dateStart,
      dateEnd,
      platform,
    };

    const [summary, trends, platforms, campaignsRaw, aiInsightResult] = await Promise.all([
      getSummaryMetrics(db, metricOptions),
      getMonthlyTrends(db, metricOptions),
      getPlatformMetrics(db, metricOptions),
      getCampaignMetrics(db, metricOptions),
      db.query(
        `SELECT summary, recommendations, created_at
         FROM ai_insights
         WHERE client_id = $1 AND agency_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [clientId, req.user.agency_id]
      ),
    ]);

    const clientResult = await db.query(
      `SELECT * FROM clients WHERE id = $1 AND agency_id = $2 LIMIT 1`,
      [clientId, req.user.agency_id]
    );

    const client = clientResult.rows[0];
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const agencyResult = await db.query(
      `SELECT * FROM agencies WHERE id = $1 LIMIT 1`,
      [req.user.agency_id]
    );
    const agency = agencyResult.rows[0] || {};
    console.log("Agency:", agency.name);
    console.log("Logo URL:", agency.logo_url);

    const subscriptionResult = await db.query(
      `SELECT plan_name FROM subscriptions WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.agency_id]
    );

    const currentPlan = subscriptionResult.rows[0]?.plan_name || 'free';
    if (currentPlan === 'free') {
      const usageResult = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM report_usage_logs
         WHERE agency_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND created_at < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
        [req.user.agency_id]
      );

      const monthlyCount = Number(usageResult.rows[0]?.count || 0);

      if (monthlyCount >= 5) {
        return res.status(403).json({
          error: 'Free plan limit reached. You can generate 5 reports per month. Upgrade to Pro for unlimited reports.',
        });
      }
    }
    const isFreePlan = currentPlan === 'free';
    const isProPlan = currentPlan === 'pro';
    const isAgencyPlan = currentPlan === 'agency';

    const canUseAgencyBranding = isProPlan || isAgencyPlan;

   let agencyLogoBuffer = null;

   if (agency.logo_url) {
     agencyLogoBuffer = await downloadImageToBuffer(agency.logo_url);
     console.log(
       "Logo buffer size:",
       agencyLogoBuffer ? agencyLogoBuffer.length : 0
     );
   }

   if (!agencyLogoBuffer && agency.logo_path) {
     const localizedPath = path.resolve(__dirname, '../../', agency.logo_path);
     const literalPath = path.resolve(__dirname, '../../public', agency.logo_path);

     if (fs.existsSync(agency.logo_path)) {
       agencyLogoBuffer = fs.readFileSync(agency.logo_path);
     } else if (fs.existsSync(localizedPath)) {
       agencyLogoBuffer = fs.readFileSync(localizedPath);
     } else if (fs.existsSync(literalPath)) {
       agencyLogoBuffer = fs.readFileSync(literalPath);
     }
   }

  const displayedTrends = trends.slice(-6);
  const rawCampaigns = campaignsRaw || [];
    const campaigns = rawCampaigns
      .map((campaign) => normalizeMetricRecord(campaign))
      .sort((a, b) => {
        const spendDiff = Number(b.spend || 0) - Number(a.spend || 0);
        if (spendDiff !== 0) return spendDiff;

        const conversionDiff = Number(b.conversions || 0) - Number(a.conversions || 0);
        if (conversionDiff !== 0) return conversionDiff;

        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    const totalCampaignSpend = campaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
    const campaignConversionsTotal = campaigns.reduce((sum, c) => sum + Number(c.conversions || 0), 0);
    const platformSpendTotal = platforms.reduce((sum, p) => sum + Number(p.spend || 0), 0);
    const reportMismatchWarnings = [];
    const percentDiff = (a, b) => {
      const base = Math.max(Math.abs(Number(a || 0)), Math.abs(Number(b || 0)), 1);
      return (Math.abs(Number(a || 0) - Number(b || 0)) / base) * 100;
    };

    if (campaigns.length && percentDiff(totalCampaignSpend, summary.spend) > 5) {
      reportMismatchWarnings.push({
        metric: 'spend',
        summary: Number(summary.spend || 0),
        campaigns: totalCampaignSpend,
        differencePercent: percentDiff(totalCampaignSpend, summary.spend),
      });
    }

    if (campaigns.length && Number(summary.conversions || 0) > 0 && percentDiff(campaignConversionsTotal, summary.conversions) > 5) {
      reportMismatchWarnings.push({
        metric: 'conversions',
        summary: Number(summary.conversions || 0),
        campaigns: campaignConversionsTotal,
        differencePercent: percentDiff(campaignConversionsTotal, summary.conversions),
      });
    }

    if (platforms.length && percentDiff(platformSpendTotal, summary.spend) > 1) {
      reportMismatchWarnings.push({
        metric: 'platform_spend',
        summary: Number(summary.spend || 0),
        platforms: platformSpendTotal,
        differencePercent: percentDiff(platformSpendTotal, summary.spend),
      });
    }

    if (reportMismatchWarnings.length) {
      console.warn('[Report Data Consistency Warning]', {
        clientId,
        dateStart,
        dateEnd,
        platform,
        warnings: reportMismatchWarnings,
      });
    }
    const hasTrendChart = displayedTrends.length > 1;

    const bestCampaign = campaigns.length > 0
      ? [...campaigns].sort((a, b) => {
          const leadDiff = Number(b.conversions || 0) - Number(a.conversions || 0);
          if (leadDiff !== 0) return leadDiff;
          return Number(a.cpa || Number.MAX_SAFE_INTEGER) - Number(b.cpa || Number.MAX_SAFE_INTEGER);
        })[0]
      : null;

    const distinctTrendMonths = [...new Map(
      trends
        .filter((row) => row && row.month)
        .map((row) => [String(row.month), row])
    ).values()];
    const hasComparableTrendMonths = distinctTrendMonths.length >= 2;
    const bestMonth = hasComparableTrendMonths
      ? [...distinctTrendMonths].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))[0]
      : null;

   const latestMonth = trends.length >= 1 ? trends[trends.length - 1] : null;
   const previousMonth = trends.length >= 2 ? trends[trends.length - 2] : null;
   const previousSummary = previousMonth ? normalizeMetricRecord(previousMonth) : null;

    // Create PDF
    const outputDir = path.join(__dirname, '../../data/reports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const fileName = `report-${clientId}-${Date.now()}.pdf`;
    const filePath = path.join(outputDir, fileName);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Agency's own stored report-theme choice is authoritative here -- a
    // client-submitted theme value is never trusted/read from req.body.
    // `report_theme` (Phase 6b -- 5 named themes) takes precedence over the
    // legacy `pdf_theme` (Phase 6a professional/minimal/branded) column,
    // which is left in place but no longer drives new reports.
    const resolvedPdfTheme = PDF_THEME_NAMES.includes(agency.pdf_theme) ? agency.pdf_theme : DEFAULT_PDF_THEME;
    const resolvedReportTheme = REPORT_THEME_NAMES.includes(agency.report_theme) ? agency.report_theme : DEFAULT_REPORT_THEME;

    const theme = buildReportTheme({
      primaryColor: agency.primary_color,
      secondaryColor: agency.secondary_color,
      canUseAgencyBranding,
      variant: resolvedPdfTheme,
      reportTheme: resolvedReportTheme,
    });

    const dateLabel =
      dateStart && dateEnd
        ? `${new Date(dateStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(dateEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const generatedDateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const platformScopeLabel = platform ? String(platform).toUpperCase() : 'All Platforms';

    const reportTitle = customTitle || title || 'Marketing Performance Report';
    const planLabel = currentPlan === 'free' ? 'Free Plan Report' : currentPlan === 'pro' ? 'Pro Plan Report' : 'Agency White-Label Report';

    const footerLeftText = isAgencyPlan
      ? `${agency?.name || 'Agency Report'} - ${client.name}`
      : isProPlan
      ? `Prepared for ${client.name} - ${agency?.name || 'Agency Report'}`
      : `Prepared for ${client.name} - Generated with Marketing Report Generator`;

    const pageFlow = createPageFlow(doc, { theme, footerLeftText });

    const rawReportType = String(summary?.report_type || client.report_type || '').toLowerCase();

    const reportType =
              rawReportType === 'sales_campaign' ||
              rawReportType === 'sales_data'
                ? 'sales_campaign'
                : 'lead_generation';

         const metricLabels =
           reportType === 'sales_campaign'
             ? {
                 conversion: 'Purchases',
                 conversionSingular: 'purchase',
                 conversionLower: 'purchases',
                 cpa: 'Cost / Purchase',
                 cpaFull: 'Cost Per Purchase',
                 cpaShort: 'CPP',
                 volume: 'Purchase Volume',
                 funnel: 'Purchase Funnel',
                 analysis: 'Sales Performance',
                 quality: 'purchase quality',
               }
             : reportType === 'sales_data'
             ? {
                 conversion: 'Orders',
                 conversionSingular: 'order',
                 conversionLower: 'orders',
                 cpa: 'Cost / Order',
                 cpaFull: 'Cost Per Order',
                 cpaShort: 'CPO',
                 volume: 'Order Volume',
                 funnel: 'Order Funnel',
                 analysis: 'Sales Analysis',
                 quality: 'order quality',
               }
             : {
                 conversion: 'Leads',
                 conversionSingular: 'lead',
                 conversionLower: 'leads',
                 cpa: 'Cost / Lead',
                 cpaFull: 'Cost Per Lead',
                 cpaShort: 'CPL',
                 volume: 'Lead Volume',
                 funnel: 'Lead Funnel',
                 analysis: 'Lead Generation',
                 quality: 'lead quality',
               };

    const normalizedSummary = normalizeMetricRecord(summary);
    const safeSummary = {
      spend: positiveNumber(normalizedSummary.spend),
      reach: positiveNumber(normalizedSummary.reach),
      impressions: positiveNumber(normalizedSummary.impressions),
      clicks: positiveNumber(normalizedSummary.clicks),
      conversions: positiveNumber(normalizedSummary.conversions),
      ctr: positiveNumber(normalizedSummary.ctr),
      cpc: positiveNumber(normalizedSummary.cpc),
      cpa: positiveNumber(normalizedSummary.cpa),
      roas: positiveNumber(normalizedSummary.roas),
      revenue: positiveNumber(normalizedSummary.revenue),
      hasSpend: Boolean(summary?.has_spend_field) || Number(summary?.spend ?? 0) > 0,
      hasReach: Boolean(summary?.has_reach_field) || Number(summary?.reach ?? 0) > 0,
      hasClicks: Boolean(summary?.has_clicks_field) || Number(summary?.clicks ?? 0) > 0,
      hasRevenue: Boolean(summary?.has_revenue_field) || Number(summary?.revenue ?? 0) > 0,
      hasImpressions: Boolean(summary?.has_impressions_field) || Number(summary?.impressions ?? 0) > 0,
      hasConversions: Boolean(summary?.has_conversions_field) || Number(summary?.conversions ?? 0) > 0,
    };

    safeSummary.hasCpa = safeSummary.hasSpend && safeSummary.hasConversions && safeSummary.conversions > 0;
    safeSummary.hasCpc = safeSummary.hasSpend && safeSummary.hasClicks && safeSummary.clicks > 0;
    safeSummary.hasCtr = safeSummary.hasClicks && safeSummary.hasImpressions && safeSummary.clicks <= safeSummary.impressions;
    safeSummary.hasRoas = safeSummary.hasSpend && safeSummary.hasRevenue && safeSummary.spend > 0;

    safeSummary.ctr = safeSummary.hasCtr ? safeSummary.ctr : 0;
    safeSummary.cpc = safeSummary.hasCpc ? safeSummary.cpc : 0;
    safeSummary.cpa = safeSummary.hasCpa ? safeSummary.cpa : 0;
    safeSummary.roas = safeSummary.hasRoas ? safeSummary.roas : 0;

    const metricAvailable = (metricKey) => isMetricAvailable(metricKey, safeSummary);

    const weakestMetricName = !safeSummary.hasRoas
      ? 'Revenue / ROAS tracking'
      : !safeSummary.hasCtr
      ? 'Click-through tracking'
      : safeSummary.hasCpa && safeSummary.cpa > 500
      ? metricLabels.cpaFull
      : 'Campaign scaling';

    const calcChange = (current, previous) => calculatePercentChange(current, previous).value;

    const formatGrowth = (change, metricKey) => {
      if (change === null || change === undefined || Number.isNaN(change)) {
        return null;
      }

      const sign = change >= 0 ? '+' : '';
      const isCostMetric = ['cpc', 'cpa', 'cpl', 'cpp'].includes(String(metricKey || '').toLowerCase());

      return {
        value: change,
        shortText: `${sign}${change.toFixed(1)}%`,
        text: `${sign}${change.toFixed(1)}%`,
        fullText: `${sign}${change.toFixed(1)}% vs previous month`,
        isGood: isCostMetric ? change <= 0 : change >= 0,
        positive: change >= 0,
      };
    };

    const latestMetrics = latestMonth ? normalizeMetricRecord(latestMonth) : safeSummary;

    const growth = {
      spend: formatGrowth(calcChange(latestMetrics.spend, previousSummary?.spend), 'spend'),
      impressions: formatGrowth(calcChange(latestMetrics.impressions, previousSummary?.impressions), 'impressions'),
      clicks: formatGrowth(calcChange(latestMetrics.clicks, previousSummary?.clicks), 'clicks'),
      conversions: formatGrowth(calcChange(latestMetrics.conversions, previousSummary?.conversions), 'conversions'),
      ctr: formatGrowth(calcChange(latestMetrics.ctr, previousSummary?.ctr), 'ctr'),
      cpc: formatGrowth(calcChange(latestMetrics.cpc, previousSummary?.cpc), 'cpc'),
      cpa: formatGrowth(calcChange(latestMetrics.cpa, previousSummary?.cpa), 'cpa'),
      roas: formatGrowth(calcChange(latestMetrics.roas, previousSummary?.roas), 'roas'),
    };

    const formatComparisonValue = (metricKey, value) => {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';

      if (['spend', 'cpc', 'cpa'].includes(metricKey)) {
        return formatCurrency(value, currency);
      }

      if (metricKey === 'ctr') return formatPct(value);
      if (metricKey === 'roas') return Number(value || 0) > 0 ? `${formatNum(value, 2)}x` : 'N/A';

      return formatNum(value);
    };

    const momComparisonRows = [
      { key: 'spend', label: 'Total Spend', previous: previousSummary?.spend, current: latestMetrics.spend, change: growth.spend },
      { key: 'conversions', label: metricLabels.conversion, previous: previousSummary?.conversions, current: latestMetrics.conversions, change: growth.conversions },
      { key: 'cpa', label: metricLabels.cpaFull, previous: previousSummary?.cpa, current: latestMetrics.cpa, change: growth.cpa },
      { key: 'ctr', label: 'CTR', previous: previousSummary?.ctr, current: latestMetrics.ctr, change: growth.ctr },
      { key: 'cpc', label: 'CPC', previous: previousSummary?.cpc, current: latestMetrics.cpc, change: growth.cpc },
      { key: 'clicks', label: 'Clicks', previous: previousSummary?.clicks, current: latestMetrics.clicks, change: growth.clicks },
      { key: 'impressions', label: 'Impressions', previous: previousSummary?.impressions, current: latestMetrics.impressions, change: growth.impressions },
    ].filter((row) => metricAvailable(row.key));

    const reportSummaryText =
      `${client.name} spent ${formatCurrency(safeSummary.spend, currency)} and generated ${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} ${metricLabels.conversion.toLowerCase()} during ${dateStart} to ${dateEnd}. ` +
      `${safeSummary.hasCpa
        ? `Average ${metricLabels.cpa.toLowerCase()} was ${formatCurrency(safeSummary.cpa, currency)}. `
        : `${metricLabels.cpa} is not available because spend or conversion data is missing. `}` +
      `${bestCampaign ?`Top campaign by ${metricLabels.conversion.toLowerCase()} was ${bestCampaign.name} with ${formatNum(bestCampaign.conversions)} ${metricLabels.conversion.toLowerCase()}. ` : 'No valid campaign-level rows were available. '}` +
      `${bestMonth ? `Best month was ${bestMonth.month} with ${formatNum(bestMonth.conversions)}  ${metricLabels.conversionLower}. ` : ''}` +
      `${safeSummary.hasCtr ? `CTR was ${formatPct(safeSummary.ctr)} from ${formatNum(safeSummary.clicks)} clicks and ${formatNum(safeSummary.impressions)} impressions. ` : 'CTR is not available because click or impression data is missing or inconsistent. '}` +
      `${safeSummary.hasRoas ? `Revenue was ${formatCurrency(safeSummary.revenue, currency)} and ROAS was ${formatNum(safeSummary.roas, 2)}x.` : `Weakest area: ${weakestMetricName}. Revenue and ROAS are not available from this source data.`}`;

    const activePlatforms = (platforms || []).filter(
      (p) =>
        Number(p.spend || 0) > 0 ||
        Number(p.clicks || 0) > 0 ||
        Number(p.conversions || 0) > 0
    );

    const topPlatform = activePlatforms.length
      ? [...activePlatforms].sort(
          (a, b) => Number(b.spend || 0) - Number(a.spend || 0)
        )[0]
      : null;

    const topCampaignSimple = campaigns.length
      ? [...campaigns].sort(
          (a, b) => Number(b.conversions || 0) - Number(a.conversions || 0)
        )[0]
      : null;

    const reportTypeTitle =
      reportType === 'sales_campaign'
        ? 'Sales Campaign Report'
        : reportType === 'sales_data'
        ? 'Sales Data Report'
        : 'Lead Generation Report';

    let campaignHealth = 'Not Enough Data';
    let campaignHealthNote =
      'More conversion and cost data is required to evaluate campaign performance.';

    if (safeSummary.hasCpa) {
      if (safeSummary.cpa <= 100) {
        campaignHealth = 'Excellent';
        campaignHealthNote =
          'Campaign is performing efficiently with a low cost per result.';
      } else if (safeSummary.cpa <= 300) {
        campaignHealth = 'Good';
        campaignHealthNote =
          'Campaign performance is stable with acceptable acquisition cost.';
      } else {
        campaignHealth = 'Needs Improvement';
        campaignHealthNote =
          'Campaign cost is high. Review targeting, creatives and budget allocation.';
      }
    }
    const bestCampaignByCost = campaigns.length
      ? [...campaigns]
          .filter((c) => Number(c.conversions || 0) > 0)
          .sort((a, b) => Number(a.cpa || 999999999) - Number(b.cpa || 999999999))[0]
      : null;

    const needsImprovementCampaign = campaigns.length > 1
      ? [...campaigns]
          .filter((c) => Number(c.spend || 0) > 0 && c.name !== bestCampaignByCost?.name)
          .sort((a, b) => Number(b.cpa || 0) - Number(a.cpa || 0))[0]
      : null;

    const campaignHealthScore =
      campaignHealth === 'Excellent'
        ? 91
        : campaignHealth === 'Good'
        ? 78
        : campaignHealth === 'Needs Improvement'
        ? 62
        : 0;

    const campaignHealthChecks = [
      {
        ok: safeSummary.hasConversions && safeSummary.conversions > 0,
        label: `Strong ${metricLabels.conversion} Volume`,
      },
      {
        ok: safeSummary.hasCpa && campaignHealth !== 'Needs Improvement',
        label: `Low ${metricLabels.cpaFull}`,
      },
      {
        ok: safeSummary.hasCtr,
        label: 'Healthy Engagement',
      },
      {
        ok: safeSummary.hasRoas,
        label: safeSummary.hasRoas ? 'Revenue Tracking Active' : 'Revenue Tracking Missing',
      },
    ];

    const comparableTrendMonths = [...new Map(
      displayedTrends
        .filter((row) => row && row.month)
        .map((row) => [String(row.month), row])
    ).values()];
    const hasComparableTrendCards = comparableTrendMonths.length >= 2;
    const bestTrendMonth = hasComparableTrendCards
      ? [...comparableTrendMonths].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))[0]
      : null;
    const worstTrendMonth = hasComparableTrendCards
      ? [...comparableTrendMonths].sort((a, b) => Number(a.conversions || 0) - Number(b.conversions || 0))[0]
      : null;
    const avgCpaFromTrends =
      displayedTrends.length && displayedTrends.reduce((sum, row) => sum + Number(row.conversions || 0), 0) > 0
        ? displayedTrends.reduce((sum, row) => sum + Number(row.spend || 0), 0) /
          displayedTrends.reduce((sum, row) => sum + Number(row.conversions || 0), 0)
        : null;

    const hasValidComparison = Boolean(growth.conversions || growth.cpa || growth.clicks);
    const volumeImproved = hasValidComparison && growth.conversions ? growth.conversions.value >= 0 : false;
    const costImproved = hasValidComparison && growth.cpa ? growth.cpa.value <= 0 : campaignHealth !== 'Needs Improvement';
    const engagementHealthy = safeSummary.hasCtr || (growth.clicks && growth.clicks.value >= 0);
    const aiExecutiveSummaryText =
      !hasValidComparison
        ? `${metricLabels.conversion} totaled ${formatNum(safeSummary.conversions)} from ${formatCurrency(safeSummary.spend, currency)} spend. Previous-period comparison is unavailable because only one valid reporting period is present. ${safeSummary.hasRoas ? `ROAS is available at ${formatNum(safeSummary.roas, 2)}x for profitability review.` : 'Revenue tracking is currently unavailable, so profitability analysis will become more accurate after revenue mapping is enabled.'}`
        : safeSummary.hasRoas
        ? `Overall campaign performance ${volumeImproved ? 'improved' : 'remained mixed'} during this reporting period. ${metricLabels.conversion} performance and acquisition efficiency indicate ${costImproved ? 'healthier budget utilization' : 'an opportunity to improve cost control'}, while engagement ${engagementHealthy ? 'remained healthy across the funnel' : 'needs closer monitoring'}. With ROAS available at ${formatNum(safeSummary.roas, 2)}x, profitability can be reviewed alongside ${metricLabels.quality} before scaling further.`
        : `Overall campaign performance ${volumeImproved ? 'improved' : 'remained mixed'} during this reporting period. ${metricLabels.conversion} generation and acquisition cost trends indicate ${costImproved ? 'better campaign efficiency' : 'room for efficiency improvement'}, while engagement ${engagementHealthy ? 'remained healthy' : 'should be monitored closely'}. Revenue tracking is currently unavailable, so profitability analysis will become more accurate after revenue mapping is enabled.`;

    const prioritizedRecommendations = [
      safeSummary.hasRoas
        ? `Increase budget for ${bestCampaignByCost?.name || bestCampaign?.name || 'the best performing campaign'} while monitoring ${metricLabels.cpa.toLowerCase()} and ${metricLabels.quality}.`
        : 'Enable revenue tracking so profitability and ROI recommendations are available.',
      bestCampaignByCost
        ? `Scale ${bestCampaignByCost.name || 'the most efficient campaign'} because it currently has stronger acquisition efficiency.`
        : `Improve the highest-volume campaign before increasing spend.`,
      needsImprovementCampaign
        ? `Pause or optimize ${needsImprovementCampaign.name || 'the weakest campaign'} before allocating additional budget.`
        : `Review campaigns with higher ${metricLabels.cpa.toLowerCase()} before adding more budget.`,
      activePlatforms.length > 1
        ? 'Compare budget allocation across platforms and shift spend toward the strongest performer.'
        : 'Upload Google Ads or other platform data for stronger cross-platform comparison.',
    ];

    const truncateCampaignName = (name, maxLength = 26) => {
      const value = String(name || 'Not Available');
      return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    };

    // =====================================================================
    // PAGE 1 -- COVER
    // =====================================================================
    const drawCoverPage = () => {
      pageFlow.beginCoverPage();
      pageFlow.setContext(reportTypeTitle, dateLabel);

      const pageW = pageFlow.pageW;
      const pageH = pageFlow.pageH;

      const hasCoverBand = (theme.headerBandHeight ?? 88) > 0;
      const coverTitleColor = hasCoverBand ? (theme.headerTextColor || '#FFFFFF') : theme.text;
      const coverSubtleColor = hasCoverBand
        ? (coverTitleColor === '#FFFFFF' ? '#DBEAFE' : theme.muted)
        : theme.muted;

      doc.rect(0, 0, pageW, pageH).fill(theme.bg);

      if (hasCoverBand) {
        if (Array.isArray(theme.headerBandGradient) && theme.headerBandGradient.length === 2) {
          const mainGrad = doc.linearGradient(0, 0, pageW, 230);
          mainGrad.stop(0, theme.headerBandGradient[0]).stop(1, theme.headerBandGradient[1]);
          doc.rect(0, 0, pageW, 230).fill(mainGrad);
        } else {
          doc.rect(0, 0, pageW, 230).fill(theme.headerBandColor || theme.navy);
        }

        if (Array.isArray(theme.coverBandGradient) && theme.coverBandGradient.length === 2) {
          const stripGrad = doc.linearGradient(0, 190, pageW, 230);
          stripGrad.stop(0, theme.coverBandGradient[0]).stop(1, theme.coverBandGradient[1]);
          doc.rect(0, 190, pageW, 40).fill(stripGrad);
        } else {
          doc.rect(0, 190, pageW, 40).fill(theme.coverBandColor || theme.royal);
        }
      } else {
        // Minimal variant: plain cover, no colored bands -- a thin rule
        // stands in for the accent strip, consistent with internal pages.
        doc.moveTo(0, 225).lineTo(pageW, 225).strokeColor(theme.border).lineWidth(1).stroke();
      }

      drawAgencyLogo(doc, theme, { logoBuffer: agencyLogoBuffer, canUseBranding: canUseAgencyBranding });

      doc.fillColor(coverTitleColor).fontSize(9).font('Helvetica-Bold').text(
        (canUseAgencyBranding ? agency?.name || 'Agency Report' : 'Marketing Report Generator').toUpperCase(),
        canUseAgencyBranding ? 108 : 50,
        48,
        { width: 400, ellipsis: true }
      );

      doc.fillColor(coverTitleColor).fontSize(28).font('Helvetica-Bold').text(reportTypeTitle, 50, 95, {
        width: pageW - 100,
        height: 40,
        ellipsis: true,
      });

      doc.fillColor(coverSubtleColor).fontSize(14).font('Helvetica-Bold').text(client.name, 50, 145, {
        width: 400,
        ellipsis: true,
      });

      doc.roundedRect(pageW - 190, 195, 155, 30, 15).fillAndStroke('#FFFFFF', theme.border);
      doc.fillColor(isAgencyPlan ? '#047857' : isProPlan ? '#1D4ED8' : '#475569').fontSize(8).font('Helvetica-Bold').text(
        planLabel.toUpperCase(),
        pageW - 190,
        205,
        { width: 155, align: 'center' }
      );

      // Cover meta card: reporting period, platform scope, generated date --
      // no metrics/KPIs here, kept intentionally uncluttered.
      const metaY = 270;
      drawCard(doc, theme, 35, metaY, pageFlow.pageW - 70, 130);

      const metaItems = [
        ['Reporting Period', dateLabel],
        ['Platform Scope', platformScopeLabel],
        ['Report Type', reportTypeTitle],
        ['Generated On', generatedDateLabel],
      ];

      metaItems.forEach(([label, value], i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 55 + col * 245;
        const y = metaY + 24 + row * 46;

        doc.fillColor(theme.muted).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x, y, { width: 220 });
        doc.fillColor(theme.text).fontSize(12).font('Helvetica-Bold').text(value, x, y + 14, { width: 220, ellipsis: true });
      });
      // No custom bottom text here -- the standard footer (with the same
      // "Prepared for..." wording) is drawn automatically once the next
      // page begins; adding another line here duplicated/overlapped it.
    };

    // =====================================================================
    // PAGE 2 -- EXECUTIVE SUMMARY
    // =====================================================================
    const drawExecutiveSummaryPage = () => {
      pageFlow.newPage('Executive Summary', `${client.name} | ${dateLabel}`);

      const summaryItems = [
        safeSummary.hasSpend ? ['Marketing Investment', formatCurrency(safeSummary.spend, currency)] : null,
        safeSummary.hasConversions ? [`Total ${metricLabels.conversion}`, formatNum(safeSummary.conversions)] : null,
        safeSummary.hasCpa ? [metricLabels.cpaFull, formatCurrency(safeSummary.cpa, currency)] : null,
        safeSummary.hasRoas ? ['Return on Investment', `${formatNum(safeSummary.roas, 2)}x`] : null,
      ].filter(Boolean);

      drawCard(doc, theme, 35, 120, 525, 130);
      drawSectionTitle(doc, theme, 'Executive Summary', 55, 138);

      summaryItems.forEach(([label, value], i) => {
        const itemWidth = Math.min(150, 480 / summaryItems.length);
        const gap = summaryItems.length > 1 ? (480 - itemWidth * summaryItems.length) / (summaryItems.length - 1) : 0;
        const x = 55 + i * (itemWidth + gap);

        doc.fillColor(theme.muted).fontSize(7.5).font('Helvetica-Bold').text(label, x, 178, { width: itemWidth - 8, height: 18 });
        doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(value, x, 196, { width: itemWidth - 8, height: 30, ellipsis: true });
      });

      drawCard(doc, theme, 35, 265, 525, 130, { bg: '#F8FAFC' });
      drawSectionTitle(doc, theme, 'Summary', 55, 283, { color: theme.emerald });
      doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(reportSummaryText, 55, 316, {
        width: 480,
        height: 70,
        lineGap: 2,
      });

      // Key highlights -- short factual chips derived from already-computed
      // bestCampaign/bestMonth, hidden entirely when unavailable rather than
      // shown as empty/"N/A" boxes.
      const highlightItems = [
        bestCampaign ? ['Top Campaign', truncateCampaignName(bestCampaign.name, 32)] : null,
        bestMonth ? ['Best Month', bestMonth.month] : null,
        !safeSummary.hasRoas ? ['Watch Area', weakestMetricName] : null,
      ].filter(Boolean);

      if (highlightItems.length) {
        drawCard(doc, theme, 35, 410, 525, 90, { bg: theme.softBlue, border: '#BFDBFE' });
        doc.fillColor(theme.text).fontSize(11).font('Helvetica-Bold').text('Key Highlights', 55, 425);

        highlightItems.forEach(([label, value], i) => {
          const w = 480 / highlightItems.length;
          const x = 55 + i * w;
          doc.fillColor(theme.muted).fontSize(7).font('Helvetica-Bold').text(label.toUpperCase(), x, 450, { width: w - 12 });
          doc.fillColor(theme.text).fontSize(9.5).font('Helvetica-Bold').text(value, x, 464, { width: w - 12, height: 24, ellipsis: true });
        });
      }
    };

    // =====================================================================
    // PAGE 3 -- KPI PERFORMANCE
    // =====================================================================
    const drawKpiPerformancePage = () => {
      pageFlow.newPage('KPI Performance', `${client.name} | ${dateLabel}`);

      const kpis = [
        safeSummary.hasSpend ? { key: 'spend', label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), color: theme.royal, bg: theme.softBlue, growth: growth.spend } : null,
        safeSummary.hasConversions ? { key: 'conversions', label: `Total ${metricLabels.conversion}`, value: formatNum(safeSummary.conversions), color: theme.emerald, bg: theme.softGreen, growth: growth.conversions } : null,
        safeSummary.hasCpa ? { key: 'cpa', label: metricLabels.cpaFull, value: formatCurrency(safeSummary.cpa, currency), color: theme.amber, bg: theme.softAmber, growth: growth.cpa } : null,
        safeSummary.hasClicks ? { key: 'clicks', label: 'Clicks', value: formatNum(safeSummary.clicks), color: theme.violet, bg: theme.softPurple, growth: growth.clicks } : null,
        safeSummary.hasCtr ? { key: 'ctr', label: 'CTR', value: formatPct(safeSummary.ctr), color: theme.cyan, bg: theme.softCyan, growth: growth.ctr } : null,
        safeSummary.hasCpc ? { key: 'cpc', label: 'CPC', value: formatCurrency(safeSummary.cpc, currency), color: theme.rose, bg: theme.softRose, growth: growth.cpc } : null,
        safeSummary.hasImpressions ? { key: 'impressions', label: 'Impressions', value: formatNum(safeSummary.impressions), color: theme.royal, bg: theme.softBlue, growth: growth.impressions } : null,
        safeSummary.hasRoas ? { key: 'roas', label: 'ROAS', value: `${formatNum(safeSummary.roas, 2)}x`, note: 'Return on Ad Spend', color: theme.rose, bg: theme.softRose, growth: growth.roas } : null,
      ].filter(Boolean);

      drawSectionTitle(doc, theme, 'Key Performance Indicators', 35, 120, { color: theme.royal });
      const kpiBottom = drawKpiGrid(doc, theme, kpis, 35, 155, 525, { maxPerRow: 3, cardHeight: 76, gap: 15 });

      const scoreY = kpiBottom + 20;
      drawCard(doc, theme, 35, scoreY, 525, 90);
      doc.fillColor(theme.text).fontSize(11).font('Helvetica-Bold').text('Performance Score', 55, scoreY + 14);

      const healthColor =
        campaignHealth === 'Excellent' ? theme.emerald
        : campaignHealth === 'Good' ? theme.royal
        : campaignHealth === 'Needs Improvement' ? theme.amber
        : theme.muted;

      doc.fillColor(healthColor).fontSize(20).font('Helvetica-Bold').text(`${campaignHealthScore || 'N/A'} /100`, 55, scoreY + 32, {
        width: 100,
        height: 24,
      });
      drawStarRating(doc, theme, 160, scoreY + 42, campaignHealthScore || 0);
      doc.fillColor(healthColor).fontSize(8.5).font('Helvetica-Bold').text(campaignHealth, 160, scoreY + 56, { width: 95 });

      campaignHealthChecks.forEach((check, i) => {
        const checkX = 285 + (i % 2) * 138;
        const checkY = scoreY + 16 + Math.floor(i / 2) * 22;
        doc.roundedRect(checkX, checkY, 22, 12, 6).fill(check.ok ? theme.softGreen : theme.softRose);
        doc.fillColor(check.ok ? theme.emerald : theme.rose).fontSize(6.2).font('Helvetica-Bold').text(check.ok ? 'OK' : 'X', checkX + 4, checkY + 3, {
          width: 14,
          align: 'center',
        });
        doc.fillColor(theme.text).fontSize(6.8).font('Helvetica').text(check.label, checkX + 28, checkY + 2, { width: 112, height: 12, ellipsis: true });
      });

      doc.fillColor(theme.muted).fontSize(7.5).font('Helvetica').text(campaignHealthNote, 55, scoreY + 74, { width: 480, height: 14, ellipsis: true });
    };

    // =====================================================================
    // PAGE 4 -- TRENDS & MONTHLY ANALYSIS (tables always shown; charts are
    // Pro/Agency only, matching the plan gating that already existed).
    // =====================================================================
    const monthlyColumns = [
      { key: 'month', label: 'Month', width: 120, value: (row) => row.month },
      { key: 'spend', label: 'Spend', width: 115, value: (row) => formatCurrency(row.spend, currency) },
      metricAvailable('impressions') ? { key: 'impressions', label: 'Impressions', width: 95, value: (row) => formatNum(row.impressions) } : null,
      metricAvailable('clicks') ? { key: 'clicks', label: 'Clicks', width: 80, value: (row) => formatNum(row.clicks) } : null,
      { key: 'conversions', label: metricLabels.conversion, width: 95, value: (row) => formatNum(row.conversions) },
      metricAvailable('roas') ? { key: 'roas', label: 'ROAS', width: 75, value: (row) => (Number(row.roas || 0) > 0 ? `${formatNum(row.roas, 2)}x` : '0.00x') } : null,
    ].filter(Boolean);

    const drawTrendsTablesPage = () => {
      pageFlow.newPage('Trends & Monthly Analysis', `${client.name} | ${dateLabel}`);

      drawCard(doc, theme, 35, 120, 525, 210);
      drawSectionTitle(doc, theme, 'Monthly Summary', 55, 140, { color: theme.royal });
      drawSimpleTable(doc, theme, {
        x: 55,
        y: 176,
        width: 485,
        headerColor: theme.royal,
        columns: monthlyColumns,
        rows: displayedTrends.slice(-6),
        emptyMessage: 'No monthly trend rows were available for this period.',
      });

      drawCard(doc, theme, 35, 345, 525, 205, { bg: '#F8FAFC' });
      drawSectionTitle(doc, theme, 'Month-over-Month Comparison', 55, 365, { color: theme.emerald });
      drawComparisonTable(doc, theme, {
        x: 55,
        y: 400,
        width: 485,
        headerColor: theme.emerald,
        rows: momComparisonRows.map((row) => ({
          key: row.key,
          label: row.label,
          previousText: previousSummary ? formatComparisonValue(row.key, row.previous) : 'N/A',
          currentText: formatComparisonValue(row.key, row.current),
          change: row.change,
        })),
        getBadgeColor: () => theme.royal,
        getBadgeBg: () => theme.softBlue,
      });
    };

    const drawTrendsChartsPage = () => {
      if (isFreePlan) return;

      pageFlow.newPage('Trends & Monthly Analysis', 'Spend trend and monthly performance');

      drawCard(doc, theme, 35, 120, 525, 220);
      if (hasTrendChart) {
        drawLineChart(doc, theme, displayedTrends, {
          x: 55,
          y: 145,
          width: 480,
          height: 175,
          title: 'Monthly Spend Trend',
          labelKey: 'month',
          valueKey: 'spend',
          color: theme.royal,
          formatValue: (v) => formatCurrency(v, currency),
        });
      } else {
        drawEmptyState(doc, theme, 35, 120, 525, 220, 'Monthly Spend Trend Not Available', 'At least two comparable months are required to show a trend.');
      }

      drawCard(doc, theme, 35, 365, 525, 220);
      if (displayedTrends.length > 0) {
        drawNumberBarChart(doc, theme, displayedTrends, {
          x: 55,
          y: 390,
          width: 480,
          title: `${metricLabels.conversion} by Month`,
          labelKey: 'month',
          valueKey: 'conversions',
          color: theme.emerald,
          maxRows: 6,
          formatValue: (v) => formatNum(v),
        });
      } else {
        doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text('No monthly data available.', 55, 420, { width: 480, align: 'center' });
      }

      drawSectionTitle(doc, theme, 'Trend Highlights', 35, 610, { color: theme.violet });
      const trendHighlightItems = [
        bestTrendMonth ? { label: 'Best Month', value: bestTrendMonth.month, color: theme.emerald, bg: theme.softGreen } : null,
        worstTrendMonth ? { label: 'Worst Month', value: worstTrendMonth.month, color: theme.rose, bg: theme.softRose } : null,
        avgCpaFromTrends !== null ? { label: `Average ${metricLabels.cpaShort}`, value: formatCurrency(avgCpaFromTrends, currency), color: theme.amber, bg: theme.softAmber } : null,
      ].filter(Boolean);

      if (trendHighlightItems.length) {
        drawKpiGrid(doc, theme, trendHighlightItems.map((item) => ({ ...item, key: item.label })), 35, 645, 525, {
          maxPerRow: 3,
          cardHeight: 68,
          gap: 15,
        });
      } else {
        doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text('At least two comparable months are required for best/worst month comparison.', 35, 645, { width: 525 });
      }
    };

    // =====================================================================
    // PAGE 5 -- CAMPAIGN PERFORMANCE
    // =====================================================================
    const campaignTableColumns = [
      { key: 'name', label: 'Campaign Name', weight: 0.34, align: 'left', value: (row) => (row.name && row.name !== 'Unknown Campaign' ? row.name : 'Campaign Name N/A') },
      { key: 'platform', label: 'Platform', weight: 0.11, align: 'center', value: (row) => String(row.platform || 'N/A').toUpperCase() },
      { key: 'spend', label: 'Spend', weight: 0.16, align: 'right', value: (row) => formatCurrency(row.spend, currency) },
      metricAvailable('impressions') ? { key: 'impressions', label: 'Impressions', shortLabel: 'Impr.', weight: 0.14, align: 'right', value: (row) => formatNum(row.impressions) } : null,
      metricAvailable('clicks') ? { key: 'clicks', label: 'Clicks', weight: 0.1, align: 'right', value: (row) => formatNum(row.clicks) } : null,
      { key: 'conversions', label: metricLabels.conversion, weight: 0.105, align: 'right', value: (row) => formatNum(row.conversions) },
      metricAvailable('ctr') ? { key: 'ctr', label: 'CTR', weight: 0.08, align: 'right', value: (row) => formatPct(row.ctr) } : null,
      metricAvailable('cpc') ? { key: 'cpc', label: 'CPC', weight: 0.12, align: 'right', value: (row) => formatCurrency(row.cpc, currency) } : null,
      metricAvailable('cpa') ? { key: 'cpa', label: metricLabels.cpaShort, weight: 0.145, align: 'right', value: (row) => (Number(row.cpa || 0) > 0 ? formatCurrency(row.cpa, currency) : 'N/A') } : null,
      metricAvailable('revenue') ? { key: 'revenue', label: 'Revenue', weight: 0.15, align: 'right', value: (row) => formatCurrency(row.revenue, currency) } : null,
      metricAvailable('roas') ? { key: 'roas', label: 'ROAS', weight: 0.085, align: 'right', value: (row) => (Number(row.roas || 0) > 0 ? `${formatNum(row.roas, 2)}x` : '0.00x') } : null,
    ].filter(Boolean);

    const drawCampaignOverviewPage = () => {
      pageFlow.newPage('Campaign Performance', `${client.name} | ${dateLabel}`);

      drawSectionTitle(doc, theme, 'Campaign Summary', 35, 120, { color: theme.violet });
      const overviewItems = [
        { key: 'count', label: 'Total Campaigns', value: formatNum(campaigns.length), color: theme.violet, bg: theme.softPurple },
        { key: 'spend', label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), color: theme.royal, bg: theme.softBlue },
        topCampaignSimple
          ? { key: 'top', label: 'Top Campaign', value: truncateCampaignName(topCampaignSimple.name, 20), color: theme.emerald, bg: theme.softGreen }
          : { key: 'top', label: 'Top Campaign', value: 'N/A', color: theme.muted, bg: theme.bg },
      ];
      let cursorY = drawKpiGrid(doc, theme, overviewItems, 35, 155, 525, { maxPerRow: 3, cardHeight: 72, gap: 15 });

      if (!isFreePlan && (bestCampaignByCost || needsImprovementCampaign)) {
        cursorY += 20;
        drawSectionTitle(doc, theme, 'Campaign Insights', 35, cursorY, { color: theme.emerald });
        cursorY += 32;

        const bestName = truncateCampaignName(bestCampaignByCost?.name || bestCampaign?.name);
        const weakName = truncateCampaignName(needsImprovementCampaign?.name);

        if (bestCampaignByCost || bestCampaign) {
          drawCard(doc, theme, 35, cursorY, 255, 60, { bg: theme.softGreen, border: '#A7F3D0' });
          doc.rect(35, cursorY, 4, 60).fill(theme.emerald);
          doc.fillColor(theme.emerald).fontSize(7).font('Helvetica-Bold').text('BEST PERFORMING', 48, cursorY + 10, { width: 130 });
          doc.fillColor(theme.text).fontSize(9).font('Helvetica-Bold').text(bestName, 48, cursorY + 24, { width: 230, height: 12, ellipsis: true });
          doc.fillColor(theme.muted).fontSize(6.8).font('Helvetica').text(`Best ${metricLabels.quality} and acquisition efficiency.`, 48, cursorY + 40, {
            width: 230,
            height: 16,
            ellipsis: true,
          });
        }

        if (needsImprovementCampaign) {
          drawCard(doc, theme, 305, cursorY, 255, 60, { bg: theme.softRose, border: '#FECDD3' });
          doc.rect(305, cursorY, 4, 60).fill(theme.rose);
          doc.fillColor(theme.rose).fontSize(7).font('Helvetica-Bold').text('NEEDS REVIEW', 318, cursorY + 10, { width: 130 });
          doc.fillColor(theme.text).fontSize(9).font('Helvetica-Bold').text(weakName, 318, cursorY + 24, { width: 230, height: 12, ellipsis: true });
          doc.fillColor(theme.muted).fontSize(6.8).font('Helvetica').text('Weakest efficiency this period -- review before additional budget.', 318, cursorY + 40, {
            width: 230,
            height: 16,
            ellipsis: true,
          });
        }
      }
    };

    // =====================================================================
    // PAGE 6 -- PLATFORM PERFORMANCE (Pro/Agency only, matching the same
    // plan gate the platform summary already had)
    // =====================================================================
    const drawPlatformPerformancePage = () => {
      if (isFreePlan) return;

      pageFlow.newPage('Platform Performance', `${client.name} | ${dateLabel}`);

      if (!activePlatforms.length) {
        drawEmptyState(doc, theme, 35, 120, 525, 180, 'No Platform Data Available', 'Upload campaign data to see platform-level performance.');
        return;
      }

      drawCard(doc, theme, 35, 120, 525, 210);
      drawSectionTitle(doc, theme, 'Platform Summary', 55, 140, { color: theme.royal });

      const platformCpa = topPlatform && Number(topPlatform.conversions || 0) > 0
        ? formatCurrency(Number(topPlatform.spend || 0) / Number(topPlatform.conversions || 0), currency)
        : 'N/A';
      const platformSpendShare = topPlatform && safeSummary.spend > 0
        ? `${formatNum((Number(topPlatform.spend || 0) / safeSummary.spend) * 100, 1)}%`
        : 'N/A';

      const summaryItems = [
        ['Top Platform', String(topPlatform?.platform || 'N/A').toUpperCase()],
        ['Spend', formatCurrency(topPlatform?.spend, currency)],
        ['Share of Spend', platformSpendShare],
        [metricLabels.conversion, formatNum(topPlatform?.conversions)],
        metricAvailable('cpa') ? [metricLabels.cpa, platformCpa] : null,
      ].filter(Boolean);

      summaryItems.forEach(([label, value], i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 55 + col * 160;
        const y = 178 + row * 60;
        doc.fillColor(theme.muted).fontSize(7.5).font('Helvetica-Bold').text(label.toUpperCase(), x, y, { width: 145 });
        doc.fillColor(theme.text).fontSize(11).font('Helvetica-Bold').text(String(value), x, y + 14, { width: 145, ellipsis: true });
      });

      if (activePlatforms.length > 1) {
        drawPieChart(doc, theme, activePlatforms, {
          x: 150,
          y: 470,
          radius: 65,
          title: 'Spend Allocation by Platform',
          titleX: 330,
          titleY: 355,
        });
      } else {
        doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(
          'All activity in this period is attributed to a single platform, so a comparison chart is not shown.',
          55,
          365,
          { width: 480 }
        );
      }

      // Platform breakdown table -- one row per active platform, using only
      // fields already present on the fetched `platforms` array.
      const platformColumns = [
        { key: 'platform', label: 'Platform', width: 130, value: (row) => String(row.platform || 'N/A').toUpperCase() },
        { key: 'spend', label: 'Spend', width: 110, value: (row) => formatCurrency(row.spend, currency) },
        { key: 'share', label: 'Share', width: 90, value: (row) => (safeSummary.spend > 0 ? `${formatNum((Number(row.spend || 0) / safeSummary.spend) * 100, 1)}%` : 'N/A') },
        { key: 'conversions', label: metricLabels.conversion, width: 100, value: (row) => formatNum(row.conversions) },
        metricAvailable('cpa') ? { key: 'cpa', label: metricLabels.cpaShort, width: 95, value: (row) => (Number(row.conversions || 0) > 0 ? formatCurrency(Number(row.spend || 0) / Number(row.conversions || 0), currency) : 'N/A') } : null,
      ].filter(Boolean);

      drawSectionTitle(doc, theme, 'Platform Breakdown', 35, 605, { color: theme.cyan });
      drawSimpleTable(doc, theme, {
        x: 55,
        y: 640,
        width: 485,
        headerColor: theme.cyan,
        columns: platformColumns,
        rows: [...activePlatforms].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)).slice(0, 4),
        emptyMessage: 'No platform data available.',
      });
    };

    // =====================================================================
    // PAGE 7 -- INSIGHTS & RECOMMENDATIONS (Pro/Agency only, matching the
    // existing gating)
    // =====================================================================
    const drawInsightsPage = () => {
      if (isFreePlan) return;

      pageFlow.newPage(
        isAgencyPlan ? 'AI Insights & Recommendations' : 'Recommendations',
        isAgencyPlan ? 'AI-powered client-ready insights' : 'Clear actions for next month'
      );

      drawCard(doc, theme, 35, 120, 525, 130, { bg: isAgencyPlan ? theme.softPurple : theme.softBlue, border: isAgencyPlan ? '#C4B5FD' : '#BFDBFE' });
      doc.fillColor(theme.text).fontSize(14).font('Helvetica-Bold').text(isAgencyPlan ? 'AI Executive Summary' : 'Executive Summary', 55, 140);
      doc.fillColor(theme.text).fontSize(9).font('Helvetica').text(aiExecutiveSummaryText, 55, 165, {
        width: 480,
        height: 74,
        lineGap: 3,
      });

      drawCard(doc, theme, 35, 265, 525, 220);
      doc.fillColor(theme.text).fontSize(15).font('Helvetica-Bold').text(isAgencyPlan ? 'AI Recommended Actions' : 'Next Month Actions', 55, 288);

      prioritizedRecommendations.slice(0, 4).forEach((item, i) => {
        const y = 316 + i * 44;
        drawBadge(doc, theme, `Priority ${i + 1}`, 55, y, {
          width: 58,
          bg: [theme.softBlue, theme.softGreen, theme.softRose, theme.softPurple][i % 4],
          color: [theme.royal, theme.emerald, theme.rose, theme.violet][i % 4],
          fontSize: 7,
        });
        doc.fillColor(theme.text).fontSize(8.6).font('Helvetica').text(item, 128, y + 2, {
          width: 390,
          height: 34,
          lineGap: 2,
        });
      });

      drawCard(doc, theme, 35, 505, 525, 90, { bg: theme.softGreen, border: '#A7F3D0' });
      doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text('Priority Focus', 55, 523);
      doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(
        safeSummary.hasRoas
          ? `Continue scaling profitable campaigns while monitoring ${metricLabels.cpa.toLowerCase()} and ${metricLabels.quality}. Use ROAS to guide budget allocation across the strongest campaigns.`
          : `Revenue tracking should be enabled to unlock profitability analysis and ROI recommendations. Once mapped, future reports can identify which campaigns deserve more budget.`,
        55,
        546,
        { width: 480, height: 40, lineGap: 3 }
      );
    };

    // =====================================================================
    // Agency closing page -- kept fully intact but NOT wired into the draw
    // sequence below (matches its previous dormant state; not activated by
    // this visual redesign).
    // =====================================================================
    const drawAgencyFinalPage = () => {
      if (!isAgencyPlan) return;

      pageFlow.newPage('Agency Action Plan', 'Prepared for client review');

      drawCard(doc, theme, 35, 125, 525, 115);
      doc.fillColor(theme.text).fontSize(18).font('Helvetica-Bold').text(agency?.name || 'Agency Report', 55, 145);
      drawAgencyLogo(doc, theme, { logoBuffer: agencyLogoBuffer, canUseBranding: canUseAgencyBranding });
      doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(`Prepared For : ${client.name}`, 55, 170);
      doc.text(`Report Period : ${dateLabel}`, 55, 188);
      if (agency?.email) doc.text(`Email : ${agency.email}`, 55, 206);
      if (agency?.website) doc.text(`Website : ${agency.website}`, 55, 224);

      drawCard(doc, theme, 35, 265, 525, 180, { bg: theme.softBlue });
      doc.fillColor(theme.text).fontSize(16).font('Helvetica-Bold').text('Next Month Strategy', 55, 285);

      const agencyActions = [
        safeSummary.hasRoas
          ? 'Review revenue quality before increasing campaign budget.'
          : 'Add revenue tracking before scaling paid campaigns.',
        `Focus budget on campaigns with stronger ${metricLabels.conversion.toLowerCase()} and lower ${metricLabels.cpa.toLowerCase()}.`,
        reportType === 'lead_generation'
          ? 'Improve landing page and form quality to improve lead quality.'
          : 'Improve product page and checkout conversion to increase purchases.',
      ];

      agencyActions.forEach((item, i) => {
        doc.circle(65, 340 + i * 35, 8).fill(theme.royal);
        doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(String(i + 1), 62, 336 + i * 35, { width: 6, align: 'center' });
        doc.fillColor(theme.text).fontSize(9).font('Helvetica').text(item, 85, 333 + i * 35, { width: 430, height: 20, ellipsis: true });
      });

      drawCard(doc, theme, 35, 465, 525, 95, { bg: '#F8FAFC' });
      doc.fillColor(theme.text).fontSize(14).font('Helvetica-Bold').text('Client-Friendly Summary', 55, 485);
      doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(
        `${client.name} should continue improving ${metricLabels.conversion.toLowerCase()} quality while keeping ${metricLabels.cpa.toLowerCase()} under control.`,
        55,
        512,
        { width: 480, height: 28, lineGap: 4 }
      );

      doc.roundedRect(35, 600, 525, 28, 8).fill('#EEF2FF');
      doc.fillColor(theme.royal).fontSize(8).font('Helvetica-Bold').text('CONFIDENTIAL - Prepared exclusively for this client.', 50, 610);
    };

    drawCoverPage();
    drawExecutiveSummaryPage();
    drawKpiPerformancePage();
    drawTrendsTablesPage();
    drawTrendsChartsPage();
    drawCampaignOverviewPage();
    drawCampaignTablePages(doc, pageFlow, theme, {
      columns: campaignTableColumns,
      rows: campaigns,
      pageTitle: 'Campaign Performance',
      subtitleFirst: `All campaign rows for ${client.name} | ${dateLabel}`,
      subtitleContinued: `Continued | ${client.name} | ${dateLabel}`,
    });
    drawPlatformPerformancePage();
    drawInsightsPage();
    // drawAgencyFinalPage(); -- left disabled, same as before this redesign

    pageFlow.finishDocument();
    doc.end();

    writeStream.on('finish', async () => {
      let fileUrl = null;
      let cloudinaryPublicId = null;

      try {
        validateLocalPdf(filePath);
        const uploadedReport = await uploadReportPdf(
          filePath,
          fileName
        );
        fileUrl = uploadedReport.url;
        cloudinaryPublicId = uploadedReport.publicId;

        await validateRemotePdfUrl(fileUrl);

        fs.unlink(filePath, (unlinkError) => {
          if (unlinkError) {
            console.warn('Temporary report cleanup failed:', unlinkError.message);
          }
        });
      } catch (uploadError) {
        if (process.env.NODE_ENV === 'production') {
          console.error('Persistent PDF upload failed:', {
            message: uploadError.message,
            code: uploadError.code,
            httpStatus: uploadError.httpStatus,
            xCldError: uploadError.xCldError,
          });
          return res.status(500).json({
            error:
              uploadError.code === 'CLOUDINARY_PDF_DELIVERY_DISABLED'
                ? "Cloudinary PDF delivery is disabled. Enable 'Allow delivery of PDF and ZIP files' in Cloudinary Security settings."
                : 'Report generated but persistent PDF storage failed. Please check Cloudinary configuration.',
          });
        }

        console.warn('Cloudinary unavailable; using local development report URL:', uploadError.message);
        fileUrl = `${req.protocol}://${req.get('host')}/data/reports/${fileName}`;
      }

      try {
        const savedReport = await db.query(
          `INSERT INTO generated_reports (
             client_id,
             agency_id,
             created_by,
             title,
             date_range_start,
             date_range_end,
             file_path,
             currency,
             pdf_theme,
             report_theme
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            clientId,
            req.user.agency_id,
            req.user.id,
            customTitle || title || `Report - ${client.name}`,
            dateStart,
            dateEnd,
            fileUrl,
            currency || 'INR',
            resolvedPdfTheme,
            resolvedReportTheme,
          ]
        );

        await db.query(
          `INSERT INTO report_usage_logs (
             agency_id,
             client_id,
             user_id,
             plan_name,
             action
           )
           VALUES ($1,$2,$3,$4,'generate')`,
          [
            req.user.agency_id,
            clientId,
            req.user.id,
            currentPlan,
          ]
        );

        res.json({
          url: fileUrl,
          pdfUrl: fileUrl,
          reportId: savedReport.rows[0]?.id,
          fileName,
          storage: cloudinaryPublicId ? 'cloudinary' : 'local',
        });
      } catch (saveError) {
        console.error('Report persistence error:', saveError);
        res.status(500).json({ error: 'Report generated but could not be saved.' });
      }
    });

    writeStream.on('error', (err) => {
      console.error('PDF write error:', err);
      res.status(500).json({ error: 'Failed to generate PDF' });
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Delete generated report
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const reportResult = await db.query(
      `SELECT * FROM generated_reports WHERE id = $1 AND agency_id = $2`,
      [reportId, req.user.agency_id]
    );

    if (!reportResult.rows[0]) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await db.query(`DELETE FROM generated_reports WHERE id = $1 AND agency_id = $2`, [reportId, req.user.agency_id]);
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Get report history
router.get('/history/:clientId', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gr.*, u.full_name as created_by_name
       FROM generated_reports gr
       LEFT JOIN users u ON gr.created_by = u.id
       WHERE gr.client_id=$1 AND gr.agency_id=$2
       ORDER BY gr.created_at DESC LIMIT 20`,
      [req.params.clientId, req.user.agency_id]
    );
    res.json(
      result.rows.map((report) => ({
        ...report,
        pdf_url: report.file_path || null,
        file_available: reportFileAvailability(report.file_path),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

module.exports = router;
