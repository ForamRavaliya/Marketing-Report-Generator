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
   getLatestReportMonth,
   getPreviousReportMonth,
} = require('../utils/metrics');
const { authenticate } = require('../middleware/auth');



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

const calcRatio = (numerator, denominator) => {
  const num = safeNumber(numerator);
  const den = safeNumber(denominator);
  if (num < 0 || den <= 0) return null;
  return num / den;
};

const calcBoundedPct = (numerator, denominator) => {
  const ratio = calcRatio(numerator, denominator);
  if (ratio === null || ratio > 1) return null;
  return ratio * 100;
};

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

    // Fetch metrics
    let whereClause = `
      WHERE pd.client_id = $1
      AND pd.external_campaign_name = 'aggregate'
    `;

    const params = [clientId];
    let idx = 2;

    if (dateStart) {
      whereClause += ` AND COALESCE(pd.date_range_start, pd.report_month) >= $${idx++}::date`;
      params.push(dateStart);
    }

    if (dateEnd) {
      whereClause += ` AND COALESCE(pd.date_range_end, pd.report_month) <= $${idx++}::date`;
      params.push(dateEnd);
    }

    if (platform && platform !== 'all') {
      whereClause += ` AND pd.platform = $${idx++}`;
      params.push(platform);
    }

    const aggregateWhereClause = whereClause;

    const campaignWhereClause = whereClause.replace(
      "AND pd.external_campaign_name = 'aggregate'",
      "AND LOWER(TRIM(pd.external_campaign_name)) <> 'aggregate'"
    );

    const validCampaignNameSql = `
      COALESCE(
        CASE
          WHEN c.name IS NOT NULL
            AND NULLIF(TRIM(c.name), '') IS NOT NULL
            AND LOWER(TRIM(c.name)) NOT IN (
              'aggregate', 'total', 'overall', 'account total',
              'unknown campaign', 'unknown camp', 'campaign name n/a', 'name n/a'
            )
          THEN TRIM(c.name)
        END,
        CASE
          WHEN pd.external_campaign_name IS NOT NULL
            AND NULLIF(TRIM(pd.external_campaign_name), '') IS NOT NULL
            AND LOWER(TRIM(pd.external_campaign_name)) NOT IN (
              'aggregate', 'total', 'overall', 'account total',
              'unknown campaign', 'unknown camp', 'campaign name n/a', 'name n/a'
            )
          THEN TRIM(pd.external_campaign_name)
        END
      )
    `;

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
    const canUseExecutivePages = isProPlan || isAgencyPlan;

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
      .map((campaign) => ({
        ...campaign,
        spend: positiveNumber(campaign.spend),
        impressions: positiveNumber(campaign.impressions),
        clicks: positiveNumber(campaign.clicks),
        conversions: positiveNumber(campaign.conversions),
        ctr: calcBoundedPct(campaign.clicks, campaign.impressions),
        cpc: calcRatio(campaign.spend, campaign.clicks),
        cpa: calcRatio(campaign.spend, campaign.conversions),
      }))
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));

    const totalCampaignSpend = campaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
    const hasTrendChart = displayedTrends.length > 1;
    const hasCampaignChart = campaigns.length > 0;
    const campaignDisplayRows = campaigns.slice(0, 6);

    const bestCampaign = campaigns.length > 0
      ? [...campaigns].sort((a, b) => {
          const leadDiff = Number(b.conversions || 0) - Number(a.conversions || 0);
          if (leadDiff !== 0) return leadDiff;
          return Number(a.cpa || Number.MAX_SAFE_INTEGER) - Number(b.cpa || Number.MAX_SAFE_INTEGER);
        })[0]
      : null;

    const bestMonth = trends.length > 0
      ? [...trends].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))[0]
      : null;

   const latestMonth = trends.length >= 1 ? trends[trends.length - 1] : null;
   const previousMonth = trends.length >= 2 ? trends[trends.length - 2] : null;
   const previousSummary = previousMonth
     ? {
         spend: Number(previousMonth.spend || 0),
         impressions: Number(previousMonth.impressions || 0),
         clicks: Number(previousMonth.clicks || 0),
         conversions: Number(previousMonth.conversions || 0),
         revenue: Number(previousMonth.revenue || 0),
         ctr:
           Number(previousMonth.impressions || 0) > 0
             ? (Number(previousMonth.clicks || 0) / Number(previousMonth.impressions || 0)) * 100
             : 0,
         cpc:
           Number(previousMonth.clicks || 0) > 0
             ? Number(previousMonth.spend || 0) / Number(previousMonth.clicks || 0)
             : 0,
         cpa:
           Number(previousMonth.conversions || 0) > 0
             ? Number(previousMonth.spend || 0) / Number(previousMonth.conversions || 0)
             : 0,
         roas:
           Number(previousMonth.spend || 0) > 0
             ? Number(previousMonth.revenue || 0) / Number(previousMonth.spend || 0)
             : 0,
       }
     : null;

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

    const THEME = {
      dark: '#111827',
      navy: '#071028',
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
      text: '#1E293B',
      muted: '#64748B',
      border: '#E2E8F0',
    };

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    let pageNo = 1;
    const FOOTER_TOP = 755;
    const CONTENT_BOTTOM = 735;
    const PAGE_CONTENT_TOP = 120;

    const dateLabel =
      dateStart && dateEnd
        ? `${new Date(dateStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${new Date(dateEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    let currentPageTitle = 'Marketing Performance Report';
    let currentPageSubtitle = dateLabel;



const rawReportType = String(client.report_type || '').toLowerCase();

const hasSalesRevenue =
  Number(summary?.revenue || 0) > 0 &&
  Number(summary?.conversions || 0) > 0;

const reportType =
          rawReportType === 'sales_campaign' ||
          rawReportType === 'sales_data' ||
          hasSalesRevenue
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

    const safeSummary = {
      spend: positiveNumber(summary?.spend),
      reach: positiveNumber(summary?.reach),
      impressions: positiveNumber(summary?.impressions),
      clicks: positiveNumber(summary?.clicks),
      conversions: positiveNumber(summary?.conversions),
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
      revenue: positiveNumber(summary?.revenue),
      hasSpend: Boolean(summary?.has_spend_field) || Number(summary?.spend ?? 0) > 0,
      hasReach: Number(summary?.reach ?? 0) > 0,
      hasClicks: Boolean(summary?.has_clicks_field) || Number(summary?.clicks ?? 0) > 0,
      hasRevenue: Boolean(summary?.has_revenue_field) || Number(summary?.revenue ?? 0) > 0,
      hasImpressions: Boolean(summary?.has_impressions_field) || Number(summary?.impressions ?? 0) > 0,
      hasConversions: Boolean(summary?.has_conversions_field) || Number(summary?.conversions ?? 0) > 0,
    };

    safeSummary.hasCpa = safeSummary.hasSpend && safeSummary.hasConversions && safeSummary.conversions > 0;
    safeSummary.hasCpc = safeSummary.hasSpend && safeSummary.hasClicks && safeSummary.clicks > 0;
    safeSummary.hasCtr = safeSummary.hasClicks && safeSummary.hasImpressions && safeSummary.clicks <= safeSummary.impressions;
    safeSummary.hasRoas = safeSummary.hasSpend && safeSummary.hasRevenue;

    safeSummary.ctr = safeSummary.hasCtr ? (safeSummary.clicks / safeSummary.impressions) * 100 : 0;
    safeSummary.cpc = safeSummary.hasCpc ? safeSummary.spend / safeSummary.clicks : 0;
    safeSummary.cpa = safeSummary.hasCpa ? safeSummary.spend / safeSummary.conversions : 0;
    safeSummary.roas = safeSummary.hasRoas ? safeSummary.revenue / safeSummary.spend : 0;

    const weakestMetricName = !safeSummary.hasRoas
      ? 'Revenue / ROAS tracking'
      : !safeSummary.hasCtr
      ? 'Click-through tracking'
      : safeSummary.hasCpa && safeSummary.cpa > 500
      ? metricLabels.cpaFull
      : 'Campaign scaling';

    const calcChange = (current, previous) => {
      const curr = Number(current || 0);
      const prev = Number(previous || 0);
      if (!prev || prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

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

    const latestMetrics = latestMonth
      ? {
          spend: Number(latestMonth.spend || 0),
          impressions: Number(latestMonth.impressions || 0),
          clicks: Number(latestMonth.clicks || 0),
          conversions: Number(latestMonth.conversions || 0),
          ctr:
            Number(latestMonth.impressions || 0) > 0
              ? (Number(latestMonth.clicks || 0) / Number(latestMonth.impressions || 0)) * 100
              : 0,
          cpc:
            Number(latestMonth.clicks || 0) > 0
              ? Number(latestMonth.spend || 0) / Number(latestMonth.clicks || 0)
              : 0,
          cpa:
            Number(latestMonth.conversions || 0) > 0
              ? Number(latestMonth.spend || 0) / Number(latestMonth.conversions || 0)
              : 0,
          roas:
            Number(latestMonth.spend || 0) > 0
              ? Number(latestMonth.revenue || 0) / Number(latestMonth.spend || 0)
              : 0,
        }
      : safeSummary;

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
    ];

    const comparisonCards = [
      {
        label: 'Spend',
        current: formatCurrency(safeSummary.spend, currency),
        change: growth.spend,
      },
      {
        label: metricLabels.conversion,
        current: safeSummary.hasConversions
          ? formatNum(safeSummary.conversions)
          : 'N/A',
        change: growth.conversions,
      },
      {
        label: metricLabels.cpaShort,
        current: safeSummary.hasCpa
          ? formatCurrency(safeSummary.cpa, currency)
          : 'N/A',
        change: growth.cpa,
      },
      {
        label: 'ROAS',
        current: safeSummary.hasRoas
          ? `${formatNum(safeSummary.roas, 2)}x`
          : 'N/A',
        change: growth.roas,
      },
    ];

    const drawEmptyState = (x, y, w, h, title, message) => {
      drawCard(x, y, w, h, THEME.card, THEME.border);
      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(title, x + 25, y + 35, { width: w - 50, height: 18, align: 'center', ellipsis: true });
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(message, x + 35, y + 62, { width: w - 70, height: Math.max(20, h - 76), align: 'center', lineGap: 3, ellipsis: true });
    };

    const drawMiniMetricCards = (items, startX, startY) => {
      const cardWidth = items.length === 4 ? 120 : 105;
      const gap = items.length === 4 ? 130 : 112;

      items.forEach((item, i) => {
        const x = startX + i * gap;
        const y = startY;
        drawCard(x, y, cardWidth, 72, item.bg, THEME.border);

        doc.fillColor(item.color).fontSize(8).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 12, y + 14, { width: 95 });
        const valueText = String(item.value || '');
       const valueFont =
         valueText.length > 18 ? 8 :
         valueText.length > 14 ? 10 :
         valueText.length > 10 ? 12 :
         15;

        doc.fillColor(THEME.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, x + 12, y + 36, { width: cardWidth - 20, height: 26, ellipsis: true });
      });
    };

    const reportSummaryText =
      `${client.name} spent ${formatCurrency(safeSummary.spend, currency)} and generated ${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} ${metricLabels.conversion.toLowerCase()} during ${dateStart} to ${dateEnd}. ` +
      `${safeSummary.hasCpa
        ? `Average ${metricLabels.cpa.toLowerCase()} was ${formatCurrency(safeSummary.cpa, currency)}. `
        : `${metricLabels.cpa} is not available because spend or conversion data is missing. `}` +
      `${bestCampaign ?`Top campaign by ${metricLabels.conversion.toLowerCase()} was ${bestCampaign.name} with ${formatNum(bestCampaign.conversions)} ${metricLabels.conversion.toLowerCase()}. ` : 'No valid campaign-level rows were available. '}` +
      `${bestMonth ? `Best month was ${bestMonth.month} with ${formatNum(bestMonth.conversions)}  ${metricLabels.conversionLower}. ` : ''}` +
      `${safeSummary.hasCtr ? `CTR was ${formatPct(safeSummary.ctr)} from ${formatNum(safeSummary.clicks)} clicks and ${formatNum(safeSummary.impressions)} impressions. ` : 'CTR is not available because click or impression data is missing or inconsistent. '}` +
      `${safeSummary.hasRoas ? `Revenue was ${formatCurrency(safeSummary.revenue, currency)} and ROAS was ${formatNum(safeSummary.roas, 2)}x.` : `Weakest area: ${weakestMetricName}. Revenue and ROAS are not available from this source data.`}`;

    const reportTitle = customTitle || title || 'Marketing Performance Report';
    const planLabel = isFreePlan ? 'Free Plan Report' : isProPlan ? 'Pro Plan Report' : 'Agency White-Label Report';

    const drawSectionTitle = (title, x, y, color = THEME.royal) => {
      doc.fillColor(THEME.text).fontSize(17).font('Helvetica-Bold').text(title, x, y);
      doc.roundedRect(x, y + 24, 55, 4, 2).fill(color);
    };

    const drawCard = (x, y, w, h, bg = THEME.card, border = THEME.border) => {
      doc.roundedRect(x + 2, y + 3, w, h, 12).fill('#CBD5E1');
      doc.roundedRect(x, y, w, h, 12).fillAndStroke(bg, border);
    };

    const drawStarRating = (x, y, score) => {
      const filledStars = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : 1;

      for (let i = 0; i < 5; i += 1) {
        const cx = x + i * 14;
        const cy = y;
        const outer = 5.4;
        const inner = 2.4;

        doc.save();
        doc.moveTo(cx, cy - outer);
        for (let p = 1; p < 10; p += 1) {
          const radius = p % 2 === 0 ? outer : inner;
          const angle = -Math.PI / 2 + (p * Math.PI) / 5;
          doc.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        }
        doc.closePath();
        doc.fillAndStroke(i < filledStars ? THEME.amber : '#E2E8F0', i < filledStars ? THEME.amber : '#CBD5E1');
        doc.restore();
      }
    };

    const getGrowthColor = (metricKey, growth) => {
      if (!growth) return THEME.muted;

      const key = String(metricKey || '').toLowerCase();
      const isCostMetric = ['cpc', 'cpa', 'cpl', 'cpp', 'cpo'].includes(key);

      return isCostMetric
        ? (growth.value <= 0 ? THEME.emerald : THEME.rose)
        : (growth.value >= 0 ? THEME.emerald : THEME.rose);
    };

    const getGrowthBg = (metricKey, growth) => {
      return getGrowthColor(metricKey, growth) === THEME.emerald
        ? THEME.softGreen
        : THEME.softRose;
    };


    const drawKpiCard = (x, y, w, h, item, color, bg) => {
      drawCard(x, y, w, h, bg, '#DDE6F3');
      doc.circle(x + 18, y + 18, 8).fill(color);

      doc.fillColor(THEME.muted).fontSize(7).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 34, y + 12, { width: w - 42, lineBreak: false });
      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(item.value, x + 34, y + 30, { width: w - 42, height: 18, ellipsis: true });

      const bottomText = item.growth ? `${item.growth}${item.growth.includes('%') ? '' : ' vs prev.'}` : item.subtitle || item.note || item.description || '';
      const growthColor =
      item.growth
      ? getGrowthColor(item.key, item.growth)
      : THEME.muted;


      doc.fillColor(growthColor).fontSize(5.8).font('Helvetica-Bold').text(bottomText, x + 34, y + 47, { width: w - 42, height: 13, ellipsis: true });
    };

    const drawAgencyLogo = () => {
      try {
        if (!canUseAgencyBranding) return;

        doc.save();
        doc.roundedRect(50, 32, 46, 46, 8).fill('#FFFFFF');

        if (agencyLogoBuffer) {
          doc.image(agencyLogoBuffer, 54, 36, {
            width: 38,
            height: 38,
            fit: [38, 38],
          });
        } else {
          doc.rect(59, 41, 28, 28).lineWidth(1.5).strokeColor(THEME.royal).stroke();
          doc.circle(73, 55, 6).fill(THEME.violet);
        }
        doc.restore();
      } catch (e) {
        console.log('Logo fallback applied:', e.message);
      }
    };

    const drawFooter = (pageNo) => {
      doc.save();
      let footerBrand = isAgencyPlan ? `${agency?.name || 'Agency Report'} - ${client.name}` : isProPlan ? `Prepared for ${client.name} - ${agency?.name || 'Agency Report'}` : `Prepared for ${client.name} - Generated with Marketing Report Generator`;

      doc.moveTo(50, FOOTER_TOP).lineTo(545, FOOTER_TOP).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text(footerBrand, 50, FOOTER_TOP + 10, { width: 430, height: 10, align: 'left', lineBreak: false, ellipsis: true });

      doc.roundedRect(515, FOOTER_TOP + 5, 26, 18, 5).fill(THEME.royal);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(String(pageNo), 515, FOOTER_TOP + 10, { width: 26, align: 'center', lineBreak: false });
      doc.restore();
    };

    const setPageContext = (title, subtitle = '') => {
      currentPageTitle = title;
      currentPageSubtitle = subtitle;
    };

    const drawPageHeader = (title = currentPageTitle, subtitle = currentPageSubtitle) => {
      setPageContext(title, subtitle);
      doc.rect(0, 0, pageW, pageH).fill(THEME.bg);
      doc.rect(0, 0, pageW, 95).fill(THEME.navy);

      doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(title, 50, 34, { width: 485, height: 26, ellipsis: true });
      if (subtitle) {
        doc.fillColor('#CBD5E1').fontSize(9).font('Helvetica').text(subtitle, 50, 62, { width: 485, height: 14, ellipsis: true });
      }
      doc.y = PAGE_CONTENT_TOP;
    };

    const addReportPage = (title, subtitle = '') => {
      doc.addPage();
      drawPageHeader(title, subtitle);
    };

    const ensurePageSpace = (requiredHeight) => {
      const currentY = Number.isFinite(doc.y) ? doc.y : PAGE_CONTENT_TOP;
      if (currentY + requiredHeight <= CONTENT_BOTTOM) return false;

      drawFooter(pageNo++);
      addReportPage(currentPageTitle, currentPageSubtitle ? `${currentPageSubtitle} continued` : 'Continued');
      return true;
    };

  const drawLineChart = (doc, rows, options, currency = 'INR') => {
    const {
      x,
      y,
      width,
      height = 180,
      title,
      labelKey,
      valueKey,
      color = THEME.royal,
    } = options;

    const values = rows.map((r) => Number(r[valueKey] || 0));
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);

   const chartTop = y + 70;
    const chartBottom = y + height - 35;
    const chartHeight = chartBottom - chartTop;

    const innerPadX = 28;
    const plotX = x + innerPadX;
    const plotWidth = width - innerPadX * 2;
    const stepX = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth;

    doc.fillColor(THEME.text)
      .fontSize(13)
      .font('Helvetica-Bold')
      .text(title, x, y);

    doc.moveTo(plotX, chartBottom)
      .lineTo(plotX + plotWidth, chartBottom)
      .strokeColor(THEME.border)
      .lineWidth(1)
      .stroke();

    doc.moveTo(plotX, chartTop)
      .lineTo(plotX, chartBottom)
      .strokeColor(THEME.border)
      .lineWidth(1)
      .stroke();

    let previousPoint = null;

    rows.forEach((row, i) => {
      const value = Number(row[valueKey] || 0);
      const range = Math.max(maxValue - minValue, 1);

      const px = plotX + i * stepX;
     const py = Math.max(
         chartTop + 18,
         chartBottom - ((value - minValue) / range) * chartHeight
     );
      const valueText =
        valueKey === 'spend' || valueKey === 'revenue'
          ? formatCurrency(value, currency)
          : formatNum(value);

      const valueFont =
        valueText.length > 14 ? 5.8 :
        valueText.length > 11 ? 6.2 :
        6.8;

      if (previousPoint) {
        doc.moveTo(previousPoint.x, previousPoint.y)
          .lineTo(px, py)
          .strokeColor(color)
          .lineWidth(2)
          .stroke();
      }

      doc.circle(px, py, 4).fill(color);

      let labelX = px - 45;
      let labelY = py - 22;
      let labelAlign = 'center';

      if (i === 0) {
       labelX = Math.max(plotX, px - 20);
        labelY = py - 22;
        labelAlign = 'left';
      } else if (i === rows.length - 1) {
        labelX = px - 95;
        labelY = py - 22;
        labelAlign = 'right';
      }

      labelY = Math.max(chartTop + 4, Math.min(chartBottom - 24, labelY));

      doc.fillColor(THEME.text)
        .fontSize(valueFont)
        .font('Helvetica-Bold')
        .text(valueText, labelX, labelY, {
          width: 90,
          height: 12,
          align: labelAlign,
          ellipsis: true,
        });

      doc.fillColor(THEME.muted)
        .fontSize(6.5)
        .font('Helvetica')
        .text(String(row[labelKey] || ''), px - 30, chartBottom + 10, {
          width: 60,
          height: 14,
          align: 'center',
          ellipsis: true,
        });

      previousPoint = { x: px, y: py };
    });
  };

    const drawBarChart = (doc, rows, options, currency = 'INR') => {
      const { x, y, width, title, valueKey, labelKey, color = THEME.violet } = options;
      const chartRows = rows.slice().sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)).slice(0, 6);
      const values = chartRows.map((r) => Number(r[valueKey] || 0));
      const maxValue = Math.max(...values, 1);
      const labelW = 170;
      const valueW = 120;
      const barX = x + labelW + 8;
      const barW = width - labelW - valueW - 20;
      const rowH = 30;

      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(title, x, y - 5);
      chartRows.forEach((row, i) => {
        const value = Number(row[valueKey] || 0);
        const by = y + 25 + i * rowH;
        const bw = value > 0 ? Math.max(2, (value / maxValue) * barW) : 0;

        doc.fillColor(THEME.text).fontSize(7.2).font('Helvetica').text(String(row[labelKey] || 'Campaign'), x, by - 1, { width: labelW, height: 20, ellipsis: true });
        doc.roundedRect(barX, by, barW, 12, 4).fill('#E2E8F0');
        if (bw > 0) doc.roundedRect(barX, by, bw, 12, 4).fill(color);

        const valueText = formatCurrency(value, currency);
        const valueFont = valueText.length > 18 ? 5.8 : valueText.length > 14 ? 6.3 : 7;
        doc.fillColor(THEME.text).font('Helvetica-Bold').fontSize(valueFont).text(valueText, barX + barW + 8, by - 1, { width: valueW, height: 16, ellipsis: true });
      });
    };

    const drawNumberBarChart = (doc, rows, options) => {
      const { x, y, width, title, valueKey, labelKey, color = THEME.emerald, sortByValue = false, maxRows = 6 } = options;
      const chartRows = (sortByValue ? rows.slice().sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)) : rows.slice()).slice(0, maxRows);
      const values = chartRows.map((r) => Number(r[valueKey] || 0));
      const maxValue = Math.max(...values, 1);
      const chartHeight = 170;
      const barGap = 14;
      const barWidth = Math.max(30, (width - barGap * (chartRows.length - 1)) / Math.max(chartRows.length, 1));
      const chartBottom = y + chartHeight;
      const maxBarHeight = 110;

      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(title, x, y - 5);
      chartRows.forEach((row, i) => {
        const value = Number(row[valueKey] || 0);
        const h = value > 0 ? Math.max(2, (value / maxValue) * maxBarHeight) : 0;
        const bx = x + i * (barWidth + barGap);
        const by = chartBottom - h;

        if (h > 0) doc.roundedRect(bx, by, barWidth, h, 5).fill(color);
        const valueText = formatNum(value);
        const valueFont = valueText.length > 9 ? 6.2 : valueText.length > 6 ? 7 : 8;

        doc.fillColor(THEME.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, bx - 4, by - 15, { width: barWidth + 8, height: 10, align: 'center', ellipsis: true });
        doc.fillColor(THEME.muted).fontSize(6.5).font('Helvetica').text(String(row[labelKey] || ''), bx - 6, chartBottom + 8, { width: barWidth + 12, height: 14, align: 'center', ellipsis: true });
      });
    };

    const drawPieChart = (doc, rows, options, currency = 'INR') => {
      const { x, y, radius = 60, title } = options;
      const activeRows = rows.filter((r) => Number(r.spend || 0) > 0).sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));
      const topRows = activeRows.length > 6 ? activeRows.slice(0, 5) : activeRows.slice(0, 6);
      const otherSpend = activeRows.length > 6 ? activeRows.slice(5).reduce((sum, r) => sum + Number(r.spend || 0), 0) : 0;
      const chartRows = otherSpend > 0 ? [...topRows, { platform: 'Other platforms', spend: otherSpend }] : topRows;
      const total = chartRows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
      const colors = [THEME.royal, THEME.violet, THEME.emerald, THEME.amber, THEME.rose, THEME.cyan];
      const titleX = Math.max(55, x - radius - 120);
      const titleY = Math.max(PAGE_CONTENT_TOP, y - radius - 40);

      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(title, titleX, titleY, { width: 480, height: 16, ellipsis: true });
      if (total <= 0) {
        doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text('No spend data available for pie chart.', 55, 175);
        return;
      }

      let startAngle = -90;
      chartRows.forEach((row, i) => {
        const value = Number(row.spend || 0);
        const angle = (value / total) * 360;
        const endAngle = startAngle + angle;

        doc.moveTo(x, y).arc(x, y, radius, startAngle, endAngle).lineTo(x, y).fill(colors[i % colors.length]);
        startAngle = endAngle;
      });

      chartRows.forEach((row, i) => {
        const ly = y - 55 + i * 18;
        const share = total > 0 ? (Number(row.spend || 0) / total) * 100 : 0;
        doc.roundedRect(x + 100, ly, 10, 10, 2).fill(colors[i % colors.length]);
        doc.fillColor(THEME.text).fontSize(7.5).font('Helvetica').text(`${String(row.platform || 'Platform').toUpperCase()} - ${formatNum(share, 1)}%`, x + 118, ly - 1, { width: 190, height: 12, ellipsis: true });
      });
    };

    //rebuild pdf
    // ===============================
    // SIMPLE MARKET-READY PDF REBUILD
    // ===============================

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

    const simpleTakeaway =
      `${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} ${metricLabels.conversionLower} generated from ${formatCurrency(safeSummary.spend, currency)} spend. ` +
      `${safeSummary.hasCpa ? `Average ${metricLabels.cpa.toLowerCase()} was ${formatCurrency(safeSummary.cpa, currency)}. ` : ''}` +
      `${topCampaignSimple ? `Best campaign: ${topCampaignSimple.name || 'Campaign Name N/A'}.` : ''}`;

    const simpleRecommendations =
      reportType === 'sales_campaign'
        ? [
            'Scale campaigns that generate higher purchases and stronger ROAS.',
            'Review checkout flow and landing pages to improve purchase conversion.',
            'Reduce high cost-per-purchase campaigns before increasing budget.',
            'Track revenue consistently so profitability is clear.',
          ]
        : reportType === 'sales_data'
        ? [
            'Focus on products with stronger revenue and profit contribution.',
            'Review low-margin products before increasing promotion spend.',
            'Track refunds and quantity sold consistently.',
            'Use top-performing products for next month planning.',
          ]
        : [
            'Improve landing pages and forms to increase lead quality.',
            'Scale campaigns with lower cost per lead and higher lead volume.',
           'Review and optimize campaigns with higher cost per lead before increasing budget.',
            'Track lead source quality before increasing spend.',
          ];

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

          const needsImprovementCampaign = campaigns.length
            ? [...campaigns]
                .filter((c) => Number(c.spend || 0) > 0)
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

          const bestTrendMonth = displayedTrends.length
            ? [...displayedTrends].sort((a, b) => Number(b.conversions || 0) - Number(a.conversions || 0))[0]
            : null;
          const worstTrendMonth = displayedTrends.length
            ? [...displayedTrends].sort((a, b) => Number(a.conversions || 0) - Number(b.conversions || 0))[0]
            : null;
          const avgCpaFromTrends =
            displayedTrends.length && displayedTrends.reduce((sum, row) => sum + Number(row.conversions || 0), 0) > 0
              ? displayedTrends.reduce((sum, row) => sum + Number(row.spend || 0), 0) /
                displayedTrends.reduce((sum, row) => sum + Number(row.conversions || 0), 0)
              : null;

          const volumeImproved = growth.conversions ? growth.conversions.value >= 0 : safeSummary.hasConversions;
          const costImproved = growth.cpa ? growth.cpa.value <= 0 : campaignHealth !== 'Needs Improvement';
          const engagementHealthy = safeSummary.hasCtr || (growth.clicks && growth.clicks.value >= 0);
          const aiExecutiveSummaryText =
            safeSummary.hasRoas
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

    const drawSimpleCover = () => {
      doc.rect(0, 0, pageW, pageH).fill(THEME.bg);
      doc.rect(0, 0, pageW, 190).fill(THEME.navy);
      doc.rect(0, 150, pageW, 40).fill(THEME.royal);

      drawAgencyLogo();

      doc.fillColor('#FFFFFF')
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(
          (canUseAgencyBranding ? agency?.name || 'Agency Report' : 'Marketing Report Generator').toUpperCase(),
          canUseAgencyBranding ? 108 : 50,
          42,
          { width: 360, ellipsis: true }
        );

      doc.fillColor('#FFFFFF')
        .fontSize(26)
        .font('Helvetica-Bold')
        .text(reportTypeTitle, 50, 85, { width: 460, height: 34, ellipsis: true });

      doc.fillColor('#DBEAFE')
        .fontSize(13)
        .font('Helvetica')
        .text(client.name, 50, 154, { width: 320, ellipsis: true });

      doc.fillColor('#BFDBFE')
        .fontSize(9)
        .text(dateLabel, 50, 176, { width: 320, ellipsis: true });

      doc.roundedRect(410, 154, 115, 24, 12).fill(
        isAgencyPlan ? '#ECFDF5' : isProPlan ? '#EFF6FF' : '#F8FAFC'
      );
      doc.fillColor(isAgencyPlan ? '#047857' : isProPlan ? '#1D4ED8' : '#475569')
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(planLabel.toUpperCase(), 420, 162, { width: 95, align: 'center' });

      drawCard(35, 220, 525, 88, '#FFFFFF', '#BFDBFE');

      doc.fillColor(THEME.text)
        .fontSize(15)
        .font('Helvetica-Bold')
        .text('Executive Summary', 55, 238);

      const summaryItems = [
        ['Marketing Investment', formatCurrency(safeSummary.spend, currency)],
        ['Business Outcome', safeSummary.hasConversions ? `${formatNum(safeSummary.conversions)} ${metricLabels.conversion}` : 'N/A'],
        ['Cost Efficiency', safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A'],
       ['Return on Investment', safeSummary.hasRoas ? `${formatNum(safeSummary.roas, 2)}x` : 'Not Available'],
      ];

      summaryItems.forEach(([label, value], i) => {
        const x = 55 + i * 120;
        const summaryValue = String(value || '');
        const summaryValueFont =
          summaryValue.length > 18 ? 8 :
          summaryValue.length > 13 ? 9 :
          11;

        doc.fillColor(THEME.muted)
          .fontSize(7.2)
          .font('Helvetica-Bold')
          .text(label, x, 266, { width: 108, height: 18, ellipsis: false });

        doc.fillColor(THEME.text)
          .fontSize(summaryValueFont)
          .font('Helvetica-Bold')
          .text(summaryValue, x, 284, { width: 108, height: 16, ellipsis: false });
      });
      const kpis = [
        { key: 'spend',label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), color: THEME.royal, bg: THEME.softBlue,growth: growth.spend },
        { key: 'conversions',label: `Total ${metricLabels.conversion}`, value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A', color: THEME.emerald, bg: THEME.softGreen ,growth: growth.conversions},
        {  key: 'cpa', label: metricLabels.cpaFull, value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', color: THEME.amber, bg: THEME.softAmber,growth: growth.cpa },
        { key: 'clicks', label: 'Clicks', value: safeSummary.hasClicks ? formatNum(safeSummary.clicks) : 'N/A', color: THEME.violet, bg: THEME.softPurple,growth: growth.clicks },
        {  key: 'ctr', label: 'CTR', value: safeSummary.hasCtr ? formatPct(safeSummary.ctr) : 'N/A', color: THEME.cyan, bg: '#ECFEFF' ,growth: growth.ctr},
        {  key: 'cpc', label: 'CPC', value: safeSummary.hasCpc ? formatCurrency(safeSummary.cpc, currency) : 'N/A', color: THEME.rose, bg: THEME.softRose, growth: growth.cpc },
        {  key: 'impressions', label: 'Impressions', value: safeSummary.hasImpressions ? formatNum(safeSummary.impressions) : 'N/A', color: THEME.royal, bg: THEME.softBlue, growth: growth.impressions },
        { key: 'roas',
          label: 'ROAS',
          value: safeSummary.hasRoas
            ? `${formatNum(safeSummary.roas, 2)}x`
            : 'Not Available',
          note: safeSummary.hasRoas
            ? 'Return on Ad Spend'
            : 'Revenue data not uploaded',
          color: THEME.rose,
          bg: THEME.softRose,
          growth: growth.roas
        },
      ];

      kpis.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 35 + col * 175;
        const y = 340 + row * 88;

        drawCard(x, y, 155, 74, item.bg, THEME.border);
        doc.circle(x + 22, y + 26, 7).fill(item.color);
        doc.fillColor(THEME.muted).fontSize(7.5).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 38, y + 18, {
          width: 105,
          ellipsis: true,
        });
        const valueText = String(item.value || '');
        const valueFont =
          valueText.length > 15 ? 9 :
          valueText.length > 12 ? 10 :
          valueText.length > 9 ? 12 :
          15;

    doc.fillColor(THEME.text)
      .fontSize(valueFont)
      .font('Helvetica-Bold')
      .text(valueText, x + 18, y + 44, {
        width: 125,
        height: 26,
        ellipsis: true,
      });

        if (item.growth) {
          doc
           .fillColor(getGrowthColor(item.key, item.growth))
            .fontSize(6.2)
            .font('Helvetica-Bold')
            .text(item.growth.shortText, x + 18, y + 62, {
              width: 125,
              height: 9,
              ellipsis: true,
            });
        }
        if (!item.growth && item.note) {
          doc
            .fillColor(THEME.muted)
            .fontSize(7)
            .font("Helvetica")
            .text(
              item.note,
             x + 18,
             y + 60,
              {
                width: 125,
                ellipsis: true,
              }
            );
        }
      });
     drawCard(35, 604, 525, 60, '#FFFFFF', '#BFDBFE');

      doc.fillColor(THEME.text)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Performance Score', 55, 616);

      const healthColor =
        campaignHealth === 'Excellent'
          ? THEME.emerald
          : campaignHealth === 'Good'
          ? THEME.royal
          : campaignHealth === 'Needs Improvement'
          ? THEME.amber
          : THEME.muted;

      doc.fillColor(healthColor)
        .fontSize(18)
        .font('Helvetica-Bold')
       .text(`${campaignHealthScore || 'N/A'} /100`, 55, 632, { width: 95, height: 22, ellipsis: false });

      drawStarRating(155, 635, campaignHealthScore || 0);

      doc.fillColor(healthColor)
        .fontSize(8)
        .font('Helvetica-Bold')
       .text(campaignHealth, 155, 648, { width: 90, height: 10, ellipsis: true });

      campaignHealthChecks.forEach((check, i) => {
        const checkX = 275 + (i % 2) * 132;
        const checkY = 617 + Math.floor(i / 2) * 20;
        doc.roundedRect(checkX, checkY, 22, 12, 6).fill(check.ok ? THEME.softGreen : THEME.softRose);
        doc.fillColor(check.ok ? THEME.emerald : THEME.rose)
          .fontSize(6.2)
          .font('Helvetica-Bold')
          .text(check.ok ? 'OK' : 'X', checkX + 4, checkY + 3, { width: 14, align: 'center' });
        doc.fillColor(THEME.text)
          .fontSize(6.6)
          .font('Helvetica')
          .text(check.label, checkX + 28, checkY + 2, { width: 108, height: 12, ellipsis: true });
      });

     drawCard(35, 668, 525, 95, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(12).font('Helvetica-Bold').text('Business Summary', 55, 680);
      let takeaway = '';

      if (safeSummary.hasRoas && safeSummary.roas >= 3) {
        takeaway =
          'Campaign performance is strong. Continue scaling the best performing campaigns while maintaining ROAS.';
      } else if (safeSummary.hasRoas) {
        takeaway =
          'Campaign is generating results but needs optimisation before increasing budget.';
      } else {
        takeaway =
          'The campaign generated measurable results. Revenue tracking should be added to understand real business profitability.';
      }



      doc.fillColor(THEME.muted)
         .fontSize(7.2)
         .font('Helvetica')
         .text(
            reportSummaryText,
           55,
           698,
            {
               width: 480,
               height: 60,
               lineGap: 1,
               ellipsis: false
            }
         );

      drawFooter(pageNo++);
    };

    const drawSimpleTablesPage = () => {
      doc.addPage();
      drawPageHeader('Performance Details', `${client.name} | ${dateLabel}`);

      drawCard(35, 120, 525, 210, THEME.card, THEME.border);
      drawSectionTitle('Monthly Summary', 55, 140, THEME.royal);

      const headers = ['Month', 'Spend', 'Clicks', metricLabels.conversion, 'ROAS'];
      const widths = [120, 115, 80, 95, 75];
      let y = 180;

      doc.roundedRect(55, y, 485, 24, 7).fill(THEME.royal);
      let x = 55;
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, x + 8, y + 8, {
          width: widths[i] - 10,
          ellipsis: true,
        });
        x += widths[i];
      });

      y += 28;
      (displayedTrends.length ? displayedTrends : []).slice(-6).forEach((row, idx) => {
        doc.roundedRect(55, y, 485, 24, 5).fill(idx % 2 === 0 ? '#F8FAFC' : '#EEF2FF');

        const vals = [
          row.month,
          formatCurrency(row.spend, currency),
          formatNum(row.clicks),
          formatNum(row.conversions),
          Number(row.roas || 0) > 0 ? `${formatNum(row.roas, 2)}x` : 'N/A',
        ];

        x = 55;
        vals.forEach((v, i) => {
          doc.fillColor(THEME.text).fontSize(8).font('Helvetica').text(v, x + 8, y + 8, {
            width: widths[i] - 10,
            ellipsis: true,
          });
          x += widths[i];
        });

        y += 26;
      });

      if (!displayedTrends.length) {
        doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
          'No monthly trend rows were available for this period.',
          55,
          210,
          { width: 480, align: 'center' }
        );
      }

      drawCard(35, 335, 525, 180, '#F8FAFC', '#BFDBFE');
      drawSectionTitle('Month-over-Month Comparison', 55, 355, THEME.emerald);

      const momHeaders = ['Metric', 'Previous Month', 'Current Month', 'Change'];
      const momWidths = [145, 115, 115, 110];
      let my = 390;
      x = 55;

      doc.roundedRect(55, my, 485, 22, 7).fill(THEME.emerald);
      momHeaders.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(7.3).font('Helvetica-Bold').text(h, x + 8, my + 7, {
          width: momWidths[i] - 10,
          ellipsis: true,
        });
        x += momWidths[i];
      });

      my += 25;
      momComparisonRows.forEach((row, idx) => {
        doc.roundedRect(55, my, 485, 14, 4).fill(idx % 2 === 0 ? '#FFFFFF' : '#ECFDF5');

        const vals = [
          row.label,
          previousSummary ? formatComparisonValue(row.key, row.previous) : 'N/A',
          formatComparisonValue(row.key, row.current),
        ];

        x = 55;
        vals.forEach((v, i) => {
          doc.fillColor(THEME.text).fontSize(6.6).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').text(v, x + 8, my + 4, {
            width: momWidths[i] - 10,
            height: 8,
            ellipsis: true,
          });
          x += momWidths[i];
        });

       const badgeColor = row.change
         ? getGrowthColor(row.key, row.change)
         : THEME.muted;

       const badgeBg = row.change
         ? getGrowthBg(row.key, row.change)
         : '#F1F5F9';
        doc.roundedRect(x + 8, my, 82, 14, 7).fill(badgeBg);
        doc.fillColor(badgeColor).fontSize(6.6).font('Helvetica-Bold').text(
          row.change ? row.change.shortText : 'N/A',
          x + 12,
          my + 4,
          { width: 74, height: 8, align: 'center', ellipsis: true }
        );

        my += 15;
      });

      drawCard(35, 535, 525, 190, THEME.card, THEME.border);
      drawSectionTitle('Top Campaigns', 55, 555, THEME.violet);

      const cHeaders = ['Campaign', 'Spend', '% Spend', metricLabels.conversion, metricLabels.cpa];
      const cWidths = [205, 92, 65, 58, 65];
      let cy = 590;

      doc.roundedRect(55, cy, 485, 24, 7).fill(THEME.violet);
      x = 55;
      cHeaders.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold').text(h, x + 8, cy + 8, {
          width: cWidths[i] - 10,
          ellipsis: true,
        });
        x += cWidths[i];
      });

      cy += 28;
      campaignDisplayRows.slice(0, 4).forEach((row, idx) => {
        doc.roundedRect(55, cy, 485, 23, 5).fill(idx % 2 === 0 ? '#F8FAFC' : '#F5F3FF');

        const spendShare = safeSummary.spend > 0 ? `${formatNum((Number(row.spend || 0) / safeSummary.spend) * 100, 1)}%` : 'N/A';
        const costPerResult = Number(row.conversions || 0) > 0
          ? formatCurrency(Number(row.spend || 0) / Number(row.conversions || 0), currency)
          : 'N/A';

        const vals = [
          row.name && row.name !== 'Unknown Campaign' ? row.name : 'Campaign Name N/A',
          formatCurrency(row.spend, currency),
          spendShare,
          formatNum(row.conversions),
          costPerResult,
        ];

        x = 55;
        vals.forEach((v, i) => {
          doc.fillColor(THEME.text).fontSize(7).font('Helvetica').text(v, x + 8, cy + 7, {
            width: cWidths[i] - 10,
            height: 11,
            ellipsis: true,
          });
          x += cWidths[i];
        });

        cy += 24;
      });

      if (!campaignDisplayRows.length) {
        doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
          'No campaign-level rows were available.',
          55,
          640,
          { width: 480, align: 'center' }
        );
      }

      drawFooter(pageNo++);
    };

    const drawSimpleChartsPage = () => {
      if (isFreePlan) return;

      doc.addPage();
      drawPageHeader('Trends & Platform View', 'Simple visual view of monthly and platform performance');

      if (hasTrendChart) {
        drawCard(35, 120, 525, 220, THEME.card, THEME.border);
        drawLineChart(doc, displayedTrends, {
          x: 55,
          y: 145,
          width: 480,
          height: 170,
          title: 'Monthly Spend Trend',
          labelKey: 'month',
          valueKey: 'spend',
          color: THEME.royal,
        }, currency);
      } else {
        drawEmptyState(35, 120, 525, 190, 'Monthly Spend Trend Not Available', 'At least two months are required.');
      }

      if (displayedTrends.length > 0) {
        drawCard(35, 365, 250, 250, THEME.card, THEME.border);
        drawNumberBarChart(doc, displayedTrends, {
          x: 55,
          y: 390,
          width: 210,
          title: `${metricLabels.conversion} by Month`,
          labelKey: 'month',
          valueKey: 'conversions',
          color: THEME.emerald,
          maxRows: 6,
        });
      }

      drawCard(310, 365, 250, 250, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Platform Summary', 330, 390);

      if (topPlatform) {
        const platformCpa = Number(topPlatform.conversions || 0) > 0
          ? formatCurrency(Number(topPlatform.spend || 0) / Number(topPlatform.conversions || 0), currency)
          : 'N/A';
        const platformContribution = safeSummary.conversions > 0
          ? `${formatNum((Number(topPlatform.conversions || 0) / safeSummary.conversions) * 100, 1)}%`
          : 'N/A';
        const platformSpendShare = safeSummary.spend > 0
          ? `${formatNum((Number(topPlatform.spend || 0) / safeSummary.spend) * 100, 1)}%`
          : 'N/A';
        const topPlatformCampaignCount = campaigns.filter(
          (campaign) => String(campaign.platform || '').toLowerCase() === String(topPlatform.platform || '').toLowerCase()
        ).length;

        const platformItems = [
          ['Top Platform', String(topPlatform.platform || 'N/A').toUpperCase()],
          ['Spend', formatCurrency(topPlatform.spend, currency)],
          ['Share of Spend', platformSpendShare],
          ['Platform Contribution', platformContribution],
          ['Campaign Count', topPlatformCampaignCount ? formatNum(topPlatformCampaignCount) : 'N/A'],
          [metricLabels.conversion, formatNum(topPlatform.conversions)],
          [metricLabels.cpa, platformCpa],
        ];

        platformItems.forEach(([label, value], i) => {
          doc.fillColor(THEME.muted).fontSize(6.8).font('Helvetica-Bold').text(label.toUpperCase(), 330, 422 + i * 25);
          const platformValue = String(value);
          const platformValueFont = platformValue.length > 18 ? 8 : platformValue.length > 12 ? 9 : 10.5;
          doc.fillColor(THEME.text).fontSize(platformValueFont).font('Helvetica-Bold').text(platformValue, 330, 434 + i * 25, {
            width: 200,
            ellipsis: true,
          });
        });
      } else {
        doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
          'No platform data available.',
          330,
          435,
          { width: 200 }
        );
      }

      drawMiniMetricCards(
        [
          {
            label: 'Best Month',
            value: bestTrendMonth ? bestTrendMonth.month : 'N/A',
            color: THEME.emerald,
            bg: THEME.softGreen,
          },
          {
            label: 'Worst Month',
            value: worstTrendMonth ? worstTrendMonth.month : 'N/A',
            color: THEME.rose,
            bg: THEME.softRose,
          },
          {
            label: `Average ${metricLabels.cpaShort}`,
            value: avgCpaFromTrends !== null ? formatCurrency(avgCpaFromTrends, currency) : 'N/A',
            color: THEME.amber,
            bg: THEME.softAmber,
          },
          {
            label: 'Total Campaigns',
            value: formatNum(campaigns.length),
            color: THEME.violet,
            bg: THEME.softPurple,
          },
        ],
        35,
        635
      );

      drawFooter(pageNo++);
    };

    const drawRecommendationsPage = () => {
      if (isFreePlan) return;

      doc.addPage();
     drawPageHeader(
       isAgencyPlan ? 'AI Insights & Recommendations' : 'Recommendations',
       isAgencyPlan ? 'AI-powered client-ready insights' : 'Clear actions for next month'
     );

      doc.rect(30, 118, 535, 125).fill(THEME.bg);
      drawCard(35, 125, 525, 115, isAgencyPlan ? '#F5F3FF' : THEME.softBlue, isAgencyPlan ? '#C4B5FD' : '#BFDBFE');

      doc.fillColor(THEME.text)
        .fontSize(15)
        .font('Helvetica-Bold')
        .text(isAgencyPlan ? 'AI Executive Summary' : 'Executive Summary', 55, 145);

      doc.fillColor(THEME.text)
        .fontSize(9)
        .font('Helvetica')
        .text(aiExecutiveSummaryText, 55, 172, {
          width: 480,
          height: 54,
          lineGap: 3,
          ellipsis: false,
        });

     drawCard(35, 270, 525, 235, THEME.card, THEME.border);
      doc.fillColor(THEME.text)
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(isAgencyPlan ? 'AI Recommended Actions' : 'Next Month Actions', 55, 295);

     prioritizedRecommendations.slice(0, 4).forEach((item, i) => {
       const y = 322 + i * 43;
        doc.roundedRect(55, y - 2, 58, 18, 9).fill([THEME.softBlue, THEME.softGreen, THEME.softRose, THEME.softPurple][i % 4]);
        doc.fillColor([THEME.royal, THEME.emerald, THEME.rose, THEME.violet][i % 4])
          .fontSize(7)
          .font('Helvetica-Bold')
          .text(`Priority ${i + 1}`, 62, y + 4, { width: 44, align: 'center' });
        doc.fillColor(THEME.text).fontSize(8.4).font('Helvetica').text(item, 128, y - 1, {
          width: 390,
          height: 32,
          lineGap: 2,
          ellipsis: false,
        });
      });

drawCard(35, 525, 525, 80, '#FFFFFF', '#BFDBFE');

doc.fillColor(THEME.text)
  .fontSize(14)
  .font('Helvetica-Bold')
  .text('Campaign Highlights', 55, 540);

const bestName = bestCampaignByCost?.name || bestCampaign?.name || 'Not Available';
const weakName = needsImprovementCampaign?.name || 'Not Available';

doc.roundedRect(55, 562, 230, 30, 8).fill(THEME.softGreen);
doc.rect(55, 562, 4, 30).fill(THEME.emerald);
doc.fillColor(THEME.emerald)
  .fontSize(7)
  .font('Helvetica-Bold')
  .text('BEST PERFORMING', 68, 568, { width: 100 });
doc.fillColor(THEME.text)
  .fontSize(8.2)
  .font('Helvetica-Bold')
  .text(bestName, 165, 568, { width: 105, height: 10, ellipsis: true });
doc.fillColor(THEME.muted)
  .fontSize(6.8)
  .font('Helvetica')
  .text(`Best ${metricLabels.quality} and acquisition efficiency.`, 68, 581, {
    width: 202,
    height: 9,
    ellipsis: true,
  });

doc.roundedRect(310, 562, 230, 30, 8).fill(THEME.softRose);
doc.rect(310, 562, 4, 30).fill(THEME.rose);
doc.fillColor(THEME.rose)
  .fontSize(7)
  .font('Helvetica-Bold')
  .text('NEEDS REVIEW', 323, 568, { width: 88 });
doc.fillColor(THEME.text)
  .fontSize(8.2)
  .font('Helvetica-Bold')
  .text(weakName, 415, 568, { width: 108, height: 10, ellipsis: true });
doc.fillColor(THEME.muted)
  .fontSize(6)
  .font('Helvetica')
  .text('This campaign has the weakest efficiency during the selected period and should be reviewed before additional budget is allocated.', 323, 580, {
    width: 202,
    height: 14,
    ellipsis: false,
  });

     drawCard(35, 620, 525, 70, THEME.softGreen, '#A7F3D0');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Priority Focus', 55, 638);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
        safeSummary.hasRoas
          ? `Continue scaling profitable campaigns while monitoring ${metricLabels.cpa.toLowerCase()} and ${metricLabels.quality}. Use ROAS to guide budget allocation across the strongest campaigns.`
          : `Revenue tracking should be enabled to unlock profitability analysis and ROI recommendations. Once mapped, future reports can identify which campaigns deserve more budget.`,
       55,
       662,
        { width: 480, height: 34, lineGap: 3, ellipsis: false }
      );

      drawFooter(pageNo++);
    };

    const drawAgencyFinalPage = () => {
      if (!isAgencyPlan) return;

doc.addPage();

doc.rect(0, 0, pageW, pageH).fill(THEME.bg);
doc.rect(0, 0, pageW, 95).fill(THEME.navy);

doc.fillColor('#FFFFFF')
  .fontSize(22)
  .font('Helvetica-Bold')
  .text('Agency Action Plan', 50, 34, {
    width: 485,
    height: 26,
    ellipsis: true,
  });

doc.fillColor('#CBD5E1')
  .fontSize(9)
  .font('Helvetica')
  .text('Prepared for client review', 50, 62, {
    width: 485,
    height: 14,
    ellipsis: true,
  });
      drawCard(35, 125, 525, 115, '#FFFFFF', '#BFDBFE');

      doc.fillColor(THEME.text)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(agency?.name || 'Agency Report', 55, 145);

      drawAgencyLogo();


      doc.fillColor(THEME.muted)
        .fontSize(9)
        .font('Helvetica')
        .text(`Prepared For : ${client.name}`, 55, 170);

      doc.text(`Report Period : ${dateLabel}`, 55, 188);

      if (agency?.email) {
        doc.text(`Email : ${agency.email}`, 55, 206);
      }

      if (agency?.website) {
        doc.text(`Website : ${agency.website}`, 55, 224);
      }

    drawCard(35, 125, 525, 180, THEME.softBlue, '#BFDBFE');

    doc.fillColor(THEME.text)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('Next Month Strategy', 55, 145);

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
      doc.circle(65, 340 + i * 35, 8).fill(THEME.royal);

      doc.fillColor('#FFFFFF')
        .fontSize(7)
        .font('Helvetica-Bold')
       .text(String(i + 1), 62, 336 + i * 35, {
          width: 6,
          align: 'center',
        });

      doc.fillColor(THEME.text)
        .fontSize(9)
        .font('Helvetica')
       .text(item, 85, 333 + i * 35, {
          width: 430,
          height: 20,
          ellipsis: true,
        });
    });

     drawCard(35, 485, 525, 95, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Client-Friendly Summary', 55, 505);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
        `${client.name} should continue improving ${metricLabels.conversion.toLowerCase()} quality while keeping ${metricLabels.cpa.toLowerCase()} under control.`,
        55,
        532,
        { width: 480, height: 28, lineGap: 4, ellipsis: true }
      );

      doc.roundedRect(35,620,525,28,8).fill('#EEF2FF');

       doc.fillColor(THEME.royal)
       .fontSize(8)
       .font('Helvetica-Bold')
       .text(
       'CONFIDENTIAL • Prepared exclusively for this client.',
       50,
       630
       );
      drawFooter(pageNo++);
    };

  drawSimpleCover();
  drawSimpleTablesPage();
  drawSimpleChartsPage();
  drawRecommendationsPage();
  //drawAgencyFinalPage();

  doc.end();

    writeStream.on('finish', async () => {
      const BASE_URL = "https://marketing-report-generator-p9wj.onrender.com";
      const fileUrl = `${BASE_URL}/data/reports/${fileName}`;

    await db.query(
      `INSERT INTO generated_reports (
         client_id,
         agency_id,
         created_by,
         title,
         date_range_start,
         date_range_end,
         file_path,
         currency
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        clientId,
        req.user.agency_id,
        req.user.id,
        customTitle || title || `Report - ${client.name}`,
        dateStart,
        dateEnd,
        fileUrl,
        currency || 'INR',
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

      res.json({ url: fileUrl, fileName });
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
       WHERE gr.client_id=$1
       ORDER BY gr.created_at DESC LIMIT 20`,
      [req.params.clientId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

module.exports = router;
