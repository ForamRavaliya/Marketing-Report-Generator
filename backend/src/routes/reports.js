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

  const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const previousEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));

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

    let previousSummary = null;
    const previousRange = getPreviousDateRange(dateStart, dateEnd);

    if (includeComparison && previousRange) {
      let previousWhereClause = `
        WHERE client_id = $1
        AND external_campaign_name = 'aggregate'
        AND COALESCE(date_range_start, report_month) >= $2::date
        AND COALESCE(date_range_end, report_month) <= $3::date
      `;
      const previousParams = [clientId, previousRange.start, previousRange.end];

      if (platform && platform !== 'all') {
        previousWhereClause += ` AND platform = $4`;
        previousParams.push(platform);
      }

      const previousResult = await db.query(
        `SELECT
           SUM(COALESCE(spend, 0)) as spend,
           CASE WHEN COUNT(*) = 1 THEN MAX(COALESCE(reach, 0)) ELSE NULL END as reach,
           SUM(COALESCE(impressions, 0)) as impressions,
           SUM(COALESCE(clicks, 0)) as clicks,
           SUM(COALESCE(conversions, 0)) as conversions,
           SUM(COALESCE(revenue, 0)) as revenue,
           CASE WHEN SUM(COALESCE(impressions, 0)) > 0 THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100 ELSE 0 END as ctr,
           CASE WHEN SUM(COALESCE(clicks, 0)) > 0 THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0)) ELSE 0 END as cpc,
           CASE WHEN SUM(COALESCE(conversions, 0)) > 0 THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0)) ELSE 0 END as cpa,
           CASE WHEN SUM(COALESCE(spend, 0)) > 0 THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0)) ELSE 0 END as roas
         FROM performance_data
         ${previousWhereClause}`,
        previousParams
      );
      previousSummary = previousResult.rows[0];
    }

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

    const formatGrowth = (change) => {
      if (change === null || change === undefined || Number.isNaN(change)) return null;
      if (change >= 300) return 'Significant increase';
      if (change <= -300) return 'Significant decrease';
      const sign = change > 0 ? '+' : '';
      return `${sign}${formatNum(change, 1)}% vs prev.`;
    };

    const growth = {
      spend: formatGrowth(calcChange(safeSummary.spend, previousSummary?.spend)),
      reach: formatGrowth(calcChange(safeSummary.reach, previousSummary?.reach)),
      impressions: formatGrowth(calcChange(safeSummary.impressions, previousSummary?.impressions)),
      clicks: formatGrowth(calcChange(safeSummary.clicks, previousSummary?.clicks)),
      conversions: formatGrowth(calcChange(safeSummary.conversions, previousSummary?.conversions)),
      ctr: formatGrowth(calcChange(safeSummary.ctr, previousSummary?.ctr)),
      cpc: formatGrowth(calcChange(safeSummary.cpc, previousSummary?.cpc)),
      cpa: formatGrowth(calcChange(safeSummary.cpa, previousSummary?.cpa)),
      roas: formatGrowth(calcChange(safeSummary.roas, previousSummary?.roas)),
    };

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
        const valueFont = valueText.length > 14 ? 10 : valueText.length > 10 ? 11 : 14;

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

    const drawKpiCard = (x, y, w, h, item, color, bg) => {
      drawCard(x, y, w, h, bg, '#DDE6F3');
      doc.circle(x + 18, y + 18, 8).fill(color);

      doc.fillColor(THEME.muted).fontSize(7).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 34, y + 12, { width: w - 42, lineBreak: false });
      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(item.value, x + 34, y + 30, { width: w - 42, height: 18, ellipsis: true });

      const bottomText = item.growth ? `${item.growth}${item.growth.includes('%') ? '' : ' vs prev.'}` : item.subtitle || item.note || item.description || '';
      const badIncreaseMetrics = [metricLabels.cpa, 'CPC'];
      const isBadIncrease = badIncreaseMetrics.includes(item.label) && item.growth && item.growth.startsWith('+');
      const growthColor = item.growth ? (isBadIncrease ? THEME.rose : THEME.emerald) : item.subtitle ? color : THEME.muted;

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
      let footerBrand = isAgencyPlan ? `${agency?.name || 'Agency Report'} • ${client.name}` : isProPlan ? `Prepared for ${client.name} • ${agency?.name || 'Agency Report'}` : `Prepared for ${client.name} • Generated with Marketing Report Generator`;

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
            'Pause or reduce budget for campaigns with weak lead performance.',
            'Track lead source quality before increasing spend.',
          ];

          let campaignHealth = 'Needs Review';
          let campaignHealthNote = 'Improve tracking and campaign quality before scaling.';

          if (safeSummary.hasRoas && safeSummary.roas >= 3 && safeSummary.hasCpa) {
            campaignHealth = 'Strong';
            campaignHealthNote = 'ROAS and cost performance look healthy.';
          } else if (safeSummary.hasConversions && safeSummary.hasCpa) {
            campaignHealth = 'Good';
            campaignHealthNote = `${metricLabels.conversion} are being generated at a measurable ${metricLabels.cpa.toLowerCase()}.`;
          } else if (safeSummary.hasConversions) {
            campaignHealth = 'Average';
            campaignHealthNote = `${metricLabels.conversion} are available, but cost efficiency needs more tracking.`;
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
        ['Spend', formatCurrency(safeSummary.spend, currency)],
        [metricLabels.conversion, safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'],
        [metricLabels.cpaShort, safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A'],
       ['ROAS', safeSummary.hasRoas ? `${formatNum(safeSummary.roas, 2)}x` : 'Not Available'],
      ];

      summaryItems.forEach(([label, value], i) => {
        const x = 55 + i * 120;

        doc.fillColor(THEME.muted)
          .fontSize(7)
          .font('Helvetica-Bold')
          .text(label.toUpperCase(), x, 266, { width: 105, ellipsis: true });

        doc.fillColor(THEME.text)
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(value, x, 284, { width: 105, ellipsis: true });
      });
      const kpis = [
        { label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), color: THEME.royal, bg: THEME.softBlue },
        { label: `Total ${metricLabels.conversion}`, value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A', color: THEME.emerald, bg: THEME.softGreen },
        { label: metricLabels.cpaFull, value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', color: THEME.amber, bg: THEME.softAmber },
        { label: 'Clicks', value: safeSummary.hasClicks ? formatNum(safeSummary.clicks) : 'N/A', color: THEME.violet, bg: THEME.softPurple },
        { label: 'CTR', value: safeSummary.hasCtr ? formatPct(safeSummary.ctr) : 'N/A', color: THEME.cyan, bg: '#ECFEFF' },
        {
          label: 'ROAS',
          value: safeSummary.hasRoas
            ? `${formatNum(safeSummary.roas, 2)}x`
            : 'Not Available',
          note: safeSummary.hasRoas
            ? 'Return on Ad Spend'
            : 'Revenue data not uploaded',
          color: THEME.rose,
          bg: THEME.softRose,
        },
      ];

      kpis.forEach((item, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 35 + col * 175;
       const y = 340 + row * 105;

        drawCard(x, y, 155, 82, item.bg, THEME.border);
        doc.circle(x + 22, y + 26, 7).fill(item.color);
        doc.fillColor(THEME.muted).fontSize(7.5).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 38, y + 18, {
          width: 100,
          ellipsis: true,
        });
        doc.fillColor(THEME.text).fontSize(15).font('Helvetica-Bold').text(item.value, x + 18, y + 46, {
          width: 120,
          height: 20,
          ellipsis: true,
        });
        if (item.note) {
          doc
            .fillColor(THEME.muted)
            .fontSize(7)
            .font("Helvetica")
            .text(
              item.note,
              x + 18,
              y + 64,
              {
                width: 120,
                ellipsis: true,
              }
            );
        }
      });
      drawCard(35, 470, 525, 70, '#FFFFFF', '#BFDBFE');

      doc.fillColor(THEME.text)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Campaign Health', 55, 490);

      const healthColor =
        campaignHealth === 'Strong'
          ? THEME.emerald
          : campaignHealth === 'Good'
          ? THEME.royal
          : THEME.amber;

      doc.fillColor(healthColor)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(campaignHealth, 55, 512);

      doc.fillColor(THEME.muted)
        .fontSize(8.5)
        .font('Helvetica')
        .text(
          campaignHealthNote,
          170,
          514,
          {
            width: 340,
            ellipsis: true,
          }
        );

      drawCard(35, 555, 525, 80, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Simple Business Takeaway', 55, 575);
      let takeaway = '';

      if (safeSummary.hasRoas && safeSummary.roas >= 3) {
        takeaway =
          'Campaign performance is strong. Continue scaling the best performing campaigns while maintaining ROAS.';
      } else if (safeSummary.hasRoas) {
        takeaway =
          'Campaign is generating results but needs optimisation before increasing budget.';
      } else {
        takeaway =
          'Revenue tracking is unavailable. Add revenue data to measure profitability.';
      }

      doc.fillColor(THEME.muted)
         .fontSize(9)
         .font('Helvetica')
         .text(
            takeaway,
            55,
            600,
            {
               width: 480,
               height: 32,
               lineGap: 4,
               ellipsis: true
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

      drawCard(35, 365, 525, 300, THEME.card, THEME.border);
      drawSectionTitle('Top Campaigns', 55, 385, THEME.violet);

      const cHeaders = ['Campaign', 'Spend', '% Spend', metricLabels.conversion, metricLabels.cpa];
      const cWidths = [205, 92, 65, 58, 65];
      let cy = 425;

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
      campaignDisplayRows.slice(0, 7).forEach((row, idx) => {
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
          500,
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

        const platformItems = [
          ['Top Platform', String(topPlatform.platform || 'N/A').toUpperCase()],
          ['Spend', formatCurrency(topPlatform.spend, currency)],
          [metricLabels.conversion, formatNum(topPlatform.conversions)],
          [metricLabels.cpa, platformCpa],
        ];

        platformItems.forEach(([label, value], i) => {
          doc.fillColor(THEME.muted).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), 330, 425 + i * 38);
          doc.fillColor(THEME.text).fontSize(12).font('Helvetica-Bold').text(String(value), 330, 441 + i * 38, {
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

      drawFooter(pageNo++);
    };

    const drawRecommendationsPage = () => {
      if (isFreePlan) return;

      doc.addPage();
      drawPageHeader('Recommendations', 'Clear actions for next month');

      drawCard(35, 125, 525, 100, THEME.softBlue, '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(15).font('Helvetica-Bold').text('What This Report Says', 55, 145);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(simpleTakeaway, 55, 173, {
        width: 480,
        height: 36,
        lineGap: 4,
        ellipsis: true,
      });

      drawCard(35, 255, 525, 250, THEME.card, THEME.border);
      doc.fillColor(THEME.text).fontSize(16).font('Helvetica-Bold').text('Next Month Actions', 55, 280);

      simpleRecommendations.forEach((item, i) => {
        const y = 325 + i * 42;
        doc.circle(65, y + 5, 10).fill([THEME.royal, THEME.violet, THEME.emerald, THEME.amber][i % 4]);
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(String(i + 1), 61, y, { width: 8, align: 'center' });
        doc.fillColor(THEME.text).fontSize(10).font('Helvetica').text(item, 88, y - 2, {
          width: 430,
          height: 24,
          lineGap: 2,
          ellipsis: true,
        });
      });

drawCard(35, 515, 525, 70, '#FFFFFF', '#BFDBFE');

doc.fillColor(THEME.text)
  .fontSize(14)
  .font('Helvetica-Bold')
  .text('Campaign Focus', 55, 532);

const bestName = bestCampaignByCost?.name || bestCampaign?.name || 'Not Available';
const weakName = needsImprovementCampaign?.name || 'Not Available';

doc.fillColor(THEME.emerald)
  .fontSize(8)
  .font('Helvetica-Bold')
  .text('BEST', 55, 558);

doc.fillColor(THEME.text)
  .fontSize(8)
  .font('Helvetica')
  .text(bestName, 90, 558, { width: 190, ellipsis: true });

doc.fillColor(THEME.rose)
  .fontSize(8)
  .font('Helvetica-Bold')
  .text('REVIEW', 300, 558);

doc.fillColor(THEME.text)
  .fontSize(8)
  .font('Helvetica')
  .text(weakName, 355, 558, { width: 165, ellipsis: true });

     drawCard(35, 610, 525, 75, THEME.softGreen, '#A7F3D0');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Priority Focus', 55, 628);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
        safeSummary.hasRoas
          ? `Scale carefully while monitoring ${metricLabels.cpa.toLowerCase()}, ${metricLabels.conversion.toLowerCase()} quality and ROAS.`
          : `Add revenue tracking so future reports can show profit and ROAS clearly.`,
        55,
        652,
        { width: 480, height: 30, lineGap: 4, ellipsis: true }
      );

      drawFooter(pageNo++);
    };

    const drawAgencyFinalPage = () => {
      if (!isAgencyPlan) return;

      doc.addPage();
      drawPageHeader('Agency Action Plan', 'Prepared for client review');

      drawCard(35, 125, 525, 165, '#FFFFFF', '#BFDBFE');

      drawAgencyLogo();

      doc.fillColor(THEME.text)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(agency?.name || 'Agency Report', 110, 145);

      doc.fillColor(THEME.muted)
        .fontSize(9)
        .font('Helvetica')
        .text(`Prepared For : ${client.name}`, 110, 170);

      doc.text(`Report Period : ${dateLabel}`, 110, 188);

      if (agency?.email) {
        doc.text(`Email : ${agency.email}`, 110, 206);
      }

      if (agency?.website) {
        doc.text(`Website : ${agency.website}`, 110, 224);
      }

      drawCard(35, 325, 525, 180, THEME.softBlue, '#BFDBFE');
     doc.fillColor(THEME.text)
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('Next Month Strategy', 55, 350);

     agencyActions.forEach((item, i) => {
       doc.circle(65, 395 + i * 35, 8).fill(THEME.royal);

       doc.fillColor('#FFFFFF')
         .fontSize(7)
         .font('Helvetica-Bold')
         .text(String(i + 1), 62, 391 + i * 35, {
           width: 6,
           align: 'center',
         });

       doc.fillColor(THEME.text)
         .fontSize(9)
         .font('Helvetica')
         .text(item, 85, 388 + i * 35, {
           width: 430,
           height: 20,
           ellipsis: true,
         });
     });

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
        doc.circle(65, 350 + i * 35, 8).fill(THEME.royal);
        doc.fillColor('#FFFFFF').fontSize(7).font('Helvetica-Bold').text(String(i + 1), 62, 391 + i * 35, { width: 6, align: 'center' });
        doc.fillColor(THEME.text).fontSize(9).font('Helvetica').text(item, 85, 388 + i * 35, {
          width: 430,
          height: 20,
          ellipsis: true,
        });
      });

      drawCard(35, 585, 525, 95, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Client-Friendly Summary', 55, 605);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(
        `${client.name} should continue improving ${metricLabels.conversion.toLowerCase()} quality while keeping ${metricLabels.cpa.toLowerCase()} under control.`,
        55,
        632,
        { width: 480, height: 28, lineGap: 4, ellipsis: true }
      );

       doc.roundedRect(35,700,525,28,8).fill('#EEF2FF');

       doc.fillColor(THEME.royal)
       .fontSize(8)
       .font('Helvetica-Bold')
       .text(
       'CONFIDENTIAL • Prepared exclusively for this client.',
       50,
       710
       );
      drawFooter(pageNo++);
    };

    drawSimpleCover();
    drawSimpleTablesPage();
    drawSimpleChartsPage();
    drawRecommendationsPage();
    drawAgencyFinalPage();

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