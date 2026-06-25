const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const https = require('https'); // For downloading remote Cloudinary logo urls safely
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

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

// Helper utility function to download remote Cloudinary/storage images into a Buffer safely
const downloadImageToBuffer = (url) => {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        return resolve(null); // Resolve with null on error to keep report generation production-safe
      }

      const data = [];
      response.on('data', (chunk) => data.push(chunk));
      response.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', (err) => {
      console.error('Cloudinary image download error:', err.message);
      resolve(null); // Graceful recovery placeholder flag
    });
  });
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

    const [summaryResult, trendsResult, platformsResult, campaignsResult, aiInsightResult] = await Promise.all([
      db.query(
        `SELECT
          SUM(COALESCE(spend, 0)) as spend,
          SUM(COALESCE(impressions, 0)) as impressions,
          SUM(COALESCE(clicks, 0)) as clicks,
          SUM(COALESCE(conversions, 0)) as conversions,
          SUM(COALESCE(revenue, 0)) as revenue,
          CASE WHEN COUNT(*) = 1 THEN MAX(COALESCE(reach, 0)) ELSE NULL END as reach,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'spend', false) OR COALESCE(spend, 0) > 0) as has_spend_field,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'reach', false) OR COALESCE(reach, 0) > 0) as has_reach_field,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'impressions', false) OR COALESCE(impressions, 0) > 0) as has_impressions_field,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'clicks', false) OR COALESCE(clicks, 0) > 0) as has_clicks_field,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'conversions', false) OR COALESCE(conversions, 0) > 0) as has_conversions_field,
          BOOL_OR(COALESCE((raw_data->'mapping') ? 'revenue', false) OR COALESCE(revenue, 0) > 0) as has_revenue_field,
          CASE WHEN SUM(COALESCE(impressions, 0)) > 0 THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100 ELSE 0 END as ctr,
          CASE WHEN SUM(COALESCE(clicks, 0)) > 0 THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0)) ELSE 0 END as cpc,
          CASE WHEN SUM(COALESCE(conversions, 0)) > 0 THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0)) ELSE 0 END as cpa,
          CASE WHEN SUM(COALESCE(spend, 0)) > 0 THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0)) ELSE 0 END as roas
         FROM performance_data pd ${aggregateWhereClause}`,
        params
      ),
      db.query(
        `SELECT
           report_month,
           TO_CHAR(report_month, 'Mon YYYY') as month,
           SUM(spend) as spend,
           SUM(clicks) as clicks,
           SUM(conversions) as conversions,
           CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas
         FROM performance_data pd ${aggregateWhereClause}
         GROUP BY report_month
         ORDER BY report_month`,
        params
      ),
      db.query(
        `SELECT platform,
          SUM(spend) as spend,
          SUM(clicks) as clicks,
          SUM(conversions) as conversions
         FROM performance_data pd ${aggregateWhereClause}
         GROUP BY platform
         ORDER BY SUM(spend) DESC`,
        params
      ),
      db.query(
        `SELECT
          COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))) AS campaign_key,
          ${validCampaignNameSql} AS name,
          pd.platform,
          SUM(COALESCE(pd.spend, 0)) AS spend,
          SUM(COALESCE(pd.impressions, 0)) AS impressions,
          SUM(COALESCE(pd.clicks, 0)) AS clicks,
          SUM(COALESCE(pd.conversions, 0)) AS conversions,
          CASE WHEN SUM(COALESCE(pd.impressions, 0)) > 0 THEN SUM(COALESCE(pd.clicks, 0))::float / SUM(COALESCE(pd.impressions, 0)) * 100 ELSE 0 END AS ctr,
          CASE WHEN SUM(COALESCE(pd.clicks, 0)) > 0 THEN SUM(COALESCE(pd.spend, 0)) / SUM(COALESCE(pd.clicks, 0)) ELSE 0 END AS cpc,
          CASE WHEN SUM(COALESCE(conversions, 0)) > 0 THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0)) ELSE 0 END AS cpa
        FROM performance_data pd
        LEFT JOIN campaigns c ON pd.campaign_id = c.id
        ${campaignWhereClause}
        AND ${validCampaignNameSql} IS NOT NULL
        GROUP BY
          COALESCE(pd.campaign_id::text, LOWER(TRIM(pd.external_campaign_name))),
          ${validCampaignNameSql},
          pd.platform
        HAVING SUM(COALESCE(pd.spend, 0)) > 0 OR SUM(COALESCE(pd.clicks, 0)) > 0 OR SUM(COALESCE(pd.conversions, 0)) > 0
        ORDER BY SUM(COALESCE(pd.spend, 0)) DESC`,
        params
      ),
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

    // Complete multi-tenant custom logo parsing block (Supports logo_url, logo_path, and absolute storage locations)
    let agencyLogoBuffer = null;
    if (agency.logo_url) {
      agencyLogoBuffer = await downloadImageToBuffer(agency.logo_url);
    }

    // Backward compatibility validation check if logo_path field is appended later
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

    const summary = summaryResult.rows[0];
    const trends = trendsResult.rows;
    const displayedTrends = trends.slice(-6);
    const platforms = platformsResult.rows;

    const rawCampaigns = campaignsResult.rows || [];
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

    // Defined explicitly to prevent the ReferenceError runtime crash
    const reportTitle = customTitle || title || 'Marketing Performance Report';

    let currentPageTitle = 'Marketing Performance Report';
    let currentPageSubtitle = dateLabel;

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
      ? 'Cost per lead'
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
      const badIncreaseMetrics = ['Cost / Lead', 'CPC'];
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
      const { x, y, width, height = 150, title, labelKey, valueKey, color = THEME.royal } = options;
      const values = rows.map((r) => Number(r[valueKey] || 0));
      const maxValue = Math.max(...values, 1);
      const chartTop = y + 35;
      const chartHeight = height - 55;
      const chartBottom = chartTop + chartHeight;
      const stepX = rows.length > 1 ? width / (rows.length - 1) : width;

      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text(title, x, y);
      doc.moveTo(x, chartBottom).lineTo(x + width, chartBottom).strokeColor(THEME.border).lineWidth(1).stroke();
      doc.moveTo(x, chartTop).lineTo(x, chartBottom).strokeColor(THEME.border).lineWidth(1).stroke();

      let previousPoint = null;
      rows.forEach((row, i) => {
        const value = Number(row[valueKey] || 0);
        const px = x + i * stepX;
        const py = chartBottom - (value / maxValue) * chartHeight;
        const valueText = (valueKey === 'spend' || valueKey === 'revenue') ? formatCurrency(value, currency) : formatNum(value);
        const valueFont = valueText.length > 12 ? 5.6 : valueText.length > 9 ? 6.2 : 6.8;
        const valueY = Math.max(chartTop + 2, py - 15);

        if (previousPoint) {
          doc.moveTo(previousPoint.x, previousPoint.y).lineTo(px, py).strokeColor(color).lineWidth(2).stroke();
        }
        doc.circle(px, py, 4).fill(color);
        
        let labelAlign = 'center';
        let labelX = px - 35;
        if (i === 0) {
          labelAlign = 'left';
          labelX = px + 12;
        } else if (i === rows.length - 1) {
          labelAlign = 'right';
          labelX = px - 82;
        }

        doc.fillColor(THEME.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, labelX, valueY, { width: 70, height: 10, align: labelAlign, ellipsis: true });
        doc.fillColor(THEME.muted).fontSize(6.5).font('Helvetica').text(String(row[labelKey] || ''), px - 24, chartBottom + 8, { width: 48, height: 14, align: 'center', ellipsis: true });
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
        doc.fillColor(THEME.text).fontSize(7.2).font('Helvetica').text(`${String(row.platform || 'Platform').toUpperCase()} - ${formatNum(share, 1)}%`, x + 118, ly - 1, { width: 190, height: 12, ellipsis: true });
      });
    };

    // ===============================
    // PAGE 1 - COVER + DASHBOARD
    // ===============================
    doc.rect(0, 0, pageW, pageH).fill(THEME.bg);
    doc.rect(0, 0, pageW, 220).fill(THEME.navy);
    doc.rect(0, 158, pageW, 52).fill(THEME.royal);

    doc.circle(520, 40, 110).fillOpacity(0.16).fill(THEME.cyan).fillOpacity(1);
    doc.circle(455, 135, 72).fillOpacity(0.18).fill(THEME.violet).fillOpacity(1);
    doc.circle(95, 55, 85).fillOpacity(0.08).fill('#FFFFFF').fillOpacity(1);

    drawAgencyLogo();

    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text((agency?.name || 'Your Agency').toUpperCase(), agencyLogoBuffer || canUseAgencyBranding ? 108 : 50, 42, { width: 360, lineBreak: false, ellipsis: true });
    doc.fillColor('#FFFFFF').fontSize(26).font('Helvetica-Bold').text(reportTitle, 50, 92, { width: 430, height: 58, lineGap: 3, ellipsis: true });
    
    doc.fillColor('#DBEAFE').fontSize(13).font('Helvetica').text(client.name, 50, 162, { width: 330, height: 16, ellipsis: true });
    doc.fillColor('#BFDBFE').fontSize(9).text(dateLabel, 50, 186, { width: 320, height: 12, ellipsis: true });
    doc.fillColor('#DBEAFE').fontSize(8).font('Helvetica-Bold').text(planLabel, 50, 199);

    if (isAgencyPlan) {
      doc.roundedRect(390, 176, 145, 24, 12).fill('#ECFDF5');
      doc.fillColor('#047857').fontSize(7.5).font('Helvetica-Bold').text('WHITE-LABEL CLIENT REPORT', 402, 184, { width: 120, align: 'center', lineBreak: false });
    } else if (isProPlan) {
      doc.roundedRect(420, 176, 105, 24, 12).fill('#EFF6FF');
      doc.fillColor('#1D4ED8').fontSize(7.5).font('Helvetica-Bold').text('PRO REPORT', 438, 184, { width: 70, align: 'center', lineBreak: false });
    }

    let performanceScore = 0;
    const leadVolumeScore = safeSummary.hasConversions ? (safeSummary.conversions > 0 ? 30 : 0) : null;
    const costEfficiencyScore = safeSummary.hasCpa ? (safeSummary.cpa <= 100 ? 25 : safeSummary.cpa <= 500 ? 15 : 8) : null;
    const engagementScore = safeSummary.hasCtr ? (safeSummary.ctr >= 2 ? 20 : safeSummary.ctr >= 1 ? 12 : 5) : null;
    const revenueTrackingScore = safeSummary.hasRoas ? (safeSummary.roas >= 3 ? 25 : safeSummary.roas >= 1 ? 15 : 5) : null;

    const performanceScoreItems = [
      { score: leadVolumeScore, max: 30 },
      { score: costEfficiencyScore, max: 25 },
      { score: engagementScore, max: 20 },
      { score: revenueTrackingScore, max: 25 },
    ].filter((item) => item.score !== null);

    const availableScore = performanceScoreItems.reduce((sum, item) => sum + item.score, 0);
    const availableScoreMax = performanceScoreItems.reduce((sum, item) => sum + item.max, 0);
    performanceScore = availableScoreMax > 0 ? Math.min(100, Math.round((availableScore / availableScoreMax) * 100)) : 0;

    let performanceGrade = 'Needs Improvement';
    if (performanceScore >= 85) performanceGrade = 'A';
    else if (performanceScore >= 70) performanceGrade = 'B';
    else if (performanceScore >= 55) performanceGrade = 'C';

    drawCard(35, 225, 525, 48, '#F8FAFC', '#BFDBFE');
    doc.circle(60, 249, 12).fill(THEME.royal);
    doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text('i', 57, 243, { width: 12, align: 'center', lineBreak: false });
    doc.fillColor(THEME.text).fontSize(9).font('Helvetica-Bold').text(`Key Takeaway: Generated ${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} leads at ${safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A'} CPL from total spend of ${formatCurrency(safeSummary.spend, currency)}.`, 85, 240, { width: 445, height: 28, lineGap: 2, ellipsis: true });

    doc.roundedRect(50, 285, 495, 50, 16).fillAndStroke('#FFFFFF', THEME.border);
    doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text('Executive Snapshot', 70, 298);
    doc.fillColor(THEME.muted).fontSize(8).font('Helvetica').text(`Spend ${formatCurrency(safeSummary.spend, currency)} generated ${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} leads/results${bestCampaign ? `; best campaign: ${bestCampaign.name}` : ''}${bestMonth ? `; best month: ${bestMonth.month}` : ''}. Weakest area: ${weakestMetricName}.`, 70, 316, { width: 440, height: 24, lineGap: 2, ellipsis: true });

    drawSectionTitle('Performance Dashboard', 50, 348, THEME.violet);

    const metrics = [
      { label: 'Performance Score', value: `${performanceScore}/100`, note: 'Overall score', color: THEME.emerald, bg: THEME.softGreen },
      { label: 'Marketing Grade', value: performanceGrade, note: 'Based on available data', color: THEME.royal, bg: THEME.softBlue },
      { label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), description: 'Total advertising budget used', growth: growth.spend, color: THEME.royal, bg: THEME.softBlue },
      { label: 'Reach', value: safeSummary.hasReach && safeSummary.reach > 0 ? formatNum(safeSummary.reach) : 'Not Provided', description: 'Unique people reached', growth: growth.reach, color: THEME.violet, bg: THEME.softPurple },
      { label: 'Impressions', value: safeSummary.hasImpressions ? formatNum(safeSummary.impressions) : 'Not Available', description: 'Total ad impressions delivered', growth: growth.impressions, color: THEME.cyan, bg: '#ECFEFF' },
      { label: 'Leads / Results', value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'Not Available', description: 'Total leads/results generated', growth: growth.conversions, color: THEME.emerald, bg: THEME.softGreen },
      { label: 'Cost / Lead', value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', description: 'Average cost per lead/result', growth: growth.cpa, color: THEME.amber, bg: THEME.softAmber },
      { label: 'Clicks', value: safeSummary.hasClicks ? formatNum(safeSummary.clicks) : 'Not Available', note: safeSummary.hasClicks ? growth.clicks : 'Not in source file', growth: safeSummary.hasClicks ? growth.clicks : null, color: THEME.amber, bg: THEME.softAmber },
      { label: 'CTR', value: safeSummary.hasCtr ? formatPct(safeSummary.ctr) : 'Not Available', note: safeSummary.hasCtr ? growth.ctr : 'Requires clicks data', growth: safeSummary.hasCtr ? growth.ctr : null, color: THEME.violet, bg: THEME.softPurple },
      { label: 'CPC', value: safeSummary.hasCpc ? formatCurrency(safeSummary.cpc, currency) : 'Not Available', note: safeSummary.hasCpc ? growth.cpc : 'Requires spend data', growth: safeSummary.hasCpc ? growth.cpc : null, color: THEME.rose, bg: THEME.softRose },
      { label: 'ROAS', value: safeSummary.hasRoas ? `${formatNum(safeSummary.roas, 2)}x` : 'Not Available', note: safeSummary.hasRoas ? growth.roas : 'Requires revenue data', growth: safeSummary.hasRoas ? growth.roas : null, color: THEME.royal, bg: THEME.softBlue },
    ];

    const cardW = 155;
    const cardH = 56;
    const gapX = 15;
    const gapY = 9;
    const startX = 50;
    const startY = 382;

    metrics.forEach((m, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      drawKpiCard(startX + col * (cardW + gapX), startY + row * (cardH + gapY), cardW, cardH, m, m.color, m.bg);
    });

    const metricAvailability = [
      { label: 'Spend', available: safeSummary.hasSpend },
      { label: 'Reach', available: safeSummary.hasReach },
      { label: 'Impressions', available: safeSummary.hasImpressions },
      { label: 'Clicks', available: safeSummary.hasClicks },
      { label: 'CTR', available: safeSummary.hasCtr },
      { label: 'CPC', available: safeSummary.hasCpc },
      { label: 'Leads', available: safeSummary.hasConversions },
      { label: 'CPA', available: safeSummary.hasCpa },
      { label: 'Revenue', available: safeSummary.hasRevenue },
      { label: 'ROAS', available: safeSummary.hasRoas },
    ];

    const availableMetrics = metricAvailability.filter((m) => m.available).map((m) => m.label);
    const missingMetrics = metricAvailability.filter((m) => !m.available).map((m) => m.label);

    const scoreBreakdown = [
      { label: 'Lead Volume', score: leadVolumeScore, max: 30 },
      { label: 'Cost Efficiency', score: costEfficiencyScore, max: 25 },
      { label: 'Engagement', score: engagementScore, max: 20 },
      { label: 'Revenue Tracking', score: revenueTrackingScore, max: 25 },
    ];

    drawCard(35, 640, 525, 48, '#FFFFFF', '#BFDBFE');
    doc.fillColor(THEME.text).fontSize(10).font('Helvetica-Bold').text('Score Breakdown', 55, 655);

    scoreBreakdown.forEach((item, i) => {
      const x = 160 + i * 92;
      doc.fillColor(THEME.muted).fontSize(6.3).font('Helvetica-Bold').text(item.label.toUpperCase(), x, 652, { width: 75, align: 'center' });
      doc.fillColor(THEME.text).fontSize(8.8).font('Helvetica-Bold').text(item.score === null ? 'N/A' : `${item.score}/${item.max}`, x, 672, { width: 75, align: 'center' });
    });

    drawCard(35, 690, 525, 42, '#F8FAFC', '#BFDBFE');
    doc.fillColor(THEME.royal).fontSize(7.5).font('Helvetica-Bold').text('DATA AVAILABILITY', 55, 702, { width: 120, lineBreak: false });
    doc.fillColor(THEME.emerald).fontSize(6.8).font('Helvetica-Bold').text(`Available: ${availableMetrics.join(', ') || 'None'}`, 180, 700, { width: 345, height: 12, ellipsis: true });
    doc.fillColor(THEME.rose).fontSize(6.8).font('Helvetica-Bold').text(`Missing: ${missingMetrics.join(', ') || 'None'}`, 180, 719, { width: 345, height: 12, ellipsis: true });

    drawFooter(pageNo++);

    // ===============================
    // PAGE 2 - TABLES & DYNAMIC TEXT FLOWS
    // ===============================
    doc.addPage();
    drawPageHeader('Performance Details', `${client.name} | ${dateLabel}`);

    if (displayedTrends.length > 0) {
      drawCard(35, 120, 525, 185, THEME.card, THEME.border);
      drawSectionTitle('Monthly Performance Trends', 55, 140, THEME.royal);

      const headers = ['Month', 'Spend', 'Clicks', 'Conversions', 'ROAS'];
      const colWidths = [115, 120, 80, 110, 70];
      let tY = 178;
      let tX = 55;

      doc.roundedRect(55, tY, 485, 24, 7).fill(THEME.royal);
      headers.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, tX + 8, tY + 8, { width: colWidths[i] - 10 });
        tX += colWidths[i];
      });

      tY += 28;
      displayedTrends.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#F8FAFC' : '#EEF2FF';
        doc.roundedRect(55, tY, 485, 24, 5).fill(bg);

        const vals = [
          row.month,
          formatCurrency(row.spend, currency),
          Number(row.clicks || 0) > 0 ? formatNum(row.clicks) : '0',
          formatNum(row.conversions),
          Number(row.roas || 0) > 0 ? `${formatNum(row.roas, 2)}x` : 'N/A',
        ];

        tX = 55;
        vals.forEach((v, i) => {
          doc.fillColor(THEME.text).fontSize(8).font('Helvetica').text(v, tX + 8, tY + 8, { width: colWidths[i] - 10 });
          tX += colWidths[i];
        });
        tY += 26;
      });
    } else {
      drawEmptyState(35, 120, 525, 185, 'Monthly Trend Data Not Available', 'No monthly performance data was available for the selected period.');
    }

    doc.y = 320;
    ensurePageSpace(115);
    let cardCurrentY = doc.y;

    drawCard(35, cardCurrentY, 525, 95, THEME.softBlue, '#BFDBFE');
    doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Data Availability Notes', 55, cardCurrentY + 20);

    const dataNotes = [
      safeSummary.hasCtr ? 'Click, CTR and CPC metrics are available.' : 'Click, CTR and CPC metrics are unavailable because click data was not included in the source file.',
      safeSummary.hasRoas ? 'Revenue and ROAS metrics are available.' : 'Revenue and ROAS metrics are unavailable because revenue data was not included in the source file.',
      hasTrendChart ? 'Trend analysis is available.' : 'Trend chart requires at least two reporting months.'
    ];
    doc.fillColor(THEME.muted).fontSize(8.5).font('Helvetica').text(dataNotes.join('\n'), 55, cardCurrentY + 45, { width: 480, height: 38, lineGap: 4, ellipsis: true });

    doc.y = cardCurrentY + 110;

    if (campaignDisplayRows.length > 0) {
      const campaignRowHeight = 22;
      const paddingAndHeaderSpacing = 68; 
      const campaignCardHeight = paddingAndHeaderSpacing + (campaignDisplayRows.length * campaignRowHeight) + 30;
      
      ensurePageSpace(campaignCardHeight);

      let dynamicCampaignY = doc.y;
      drawCard(35, dynamicCampaignY, 525, campaignCardHeight, THEME.card, THEME.border);
      drawSectionTitle('Campaign-Level Breakdown', 55, dynamicCampaignY + 20, THEME.violet);

      const cHeaders = ['Campaign', 'Spend', '% of Total', 'Leads', 'CPL'];
      const cWidths = [210, 95, 60, 55, 65];
      let cY = dynamicCampaignY + 60;
      let cX = 55;

      doc.roundedRect(55, cY, 485, 24, 7).fill(THEME.violet);
      cHeaders.forEach((h, i) => {
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(h, cX + 8, cY + 8, { width: cWidths[i] - 10 });
        cX += cWidths[i];
      });

      cY += 28;
      campaignDisplayRows.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? '#F8FAFC' : '#F5F3FF';
        doc.roundedRect(55, cY, 485, 22, 5).fill(bg);

        const spendShare = safeSummary.spend > 0 ? `${formatNum((Number(row.spend || 0) / safeSummary.spend) * 100, 1)}%` : 'N/A';
        const cpl = Number(row.conversions || 0) > 0 ? formatCurrency(Number(row.spend || 0) / Number(row.conversions || 0), currency) : 'N/A';

        const vals = [
          (!row.name || row.name === 'Unknown Campaign') ? 'Campaign Name N/A' : row.name,
          formatCurrency(row.spend, currency),
          spendShare,
          formatNum(row.conversions),
          cpl,
        ];

        cX = 55;
        vals.forEach((v, i) => {
          doc.fillColor(THEME.text).fontSize(7.2).font('Helvetica').text(v, cX + 8, cY + 7, { width: cWidths[i] - 10, height: 11, ellipsis: true });
          cX += cWidths[i];
        });
        cY += 22;
      });
    } else {
      ensurePageSpace(150);
      drawEmptyState(35, doc.y, 525, 135, 'Major Campaign Data Not Available', 'No valid campaign rows found.');
    }

    drawFooter(pageNo++);

    // ===============================
    // PAGE 3 - CHARTS
    // ===============================
    doc.addPage();
    drawPageHeader('Charts & Campaign Analytics', 'Visual analysis of spend and campaign performance');

    if (hasTrendChart) {
      drawCard(35, 120, 525, 220, THEME.card, THEME.border);
      drawLineChart(doc, displayedTrends, { x: 55, y: 145, width: 480, height: 160, title: 'Monthly Spend Trend', labelKey: 'month', valueKey: 'spend', color: THEME.royal }, currency);
    } else {
      drawEmptyState(35, 120, 525, 220, 'Trend Analysis Not Available', 'At least two reporting periods are required.');
    }

    if (campaignDisplayRows.length > 1) {
      drawCard(35, 375, 525, 315, THEME.card, THEME.border);
      drawBarChart(doc, campaignDisplayRows, { x: 55, y: 400, width: 480, title: 'Campaign-Level Spend', valueKey: 'spend', labelKey: 'name', color: THEME.violet }, currency);
    } else if (campaignDisplayRows.length === 1) {
      const campaign = campaignDisplayRows[0];
      drawCard(35, 375, 525, 285, THEME.card, THEME.border);
      drawSectionTitle('Campaign Performance Summary', 55, 400, THEME.violet);

      const campaignMiniCards = [
        { label: 'Campaign', value: (!campaign.name || campaign.name === 'Unknown Campaign') ? 'Name N/A' : campaign.name, color: THEME.royal, bg: THEME.softBlue },
        { label: 'Tracked Spend', value: formatCurrency(campaign.spend, currency), color: THEME.violet, bg: THEME.softPurple },
        { label: 'Tracked Leads', value: formatNum(campaign.conversions), color: THEME.emerald, bg: THEME.softGreen },
        { label: 'CTR', value: campaign.ctr !== null ? formatPct(campaign.ctr) : 'N/A', color: THEME.amber, bg: THEME.softAmber },
      ];

      const miniW = 108;
      const miniGap = 12;
      const miniStartX = 55;
      const miniY = 445;

      campaignMiniCards.forEach((item, i) => {
        const x = miniStartX + i * (miniW + miniGap);
        drawCard(x, miniY, miniW, 72, item.bg, THEME.border);
        doc.fillColor(item.color).fontSize(7.2).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 12, miniY + 14, { width: miniW - 20, lineBreak: false });

        const miniValueText = String(item.value || '');
        const miniValueFont = miniValueText.length > 14 ? 9.5 : miniValueText.length > 10 ? 10.5 : 12;
        doc.fillColor(THEME.text).fontSize(miniValueFont).font('Helvetica-Bold').text(miniValueText, x + 12, miniY + 36, { width: miniW - 20, height: 28, ellipsis: true });
      });

      drawCard(55, 550, 485, 85, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(13).font('Helvetica-Bold').text('Campaign Summary', 75, 570);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(`This section reflects verified operational data mapped from source files to maintain mathematical consistency with dashboard widgets.`, 75, 595, { width: 430, height: 30, lineGap: 4, ellipsis: true });
    }

    drawFooter(pageNo++);

    // ===============================
    // PAGE 4 - LEAD GENERATION
    // ===============================
    doc.addPage();
    drawPageHeader('Lead Generation Analysis', 'Simple view of leads, cost per lead and monthly lead volume');

    drawMiniMetricCards([
      { label: 'Total Leads', value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A', color: THEME.emerald, bg: THEME.softGreen },
      { label: 'Cost / Lead', value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', color: THEME.amber, bg: THEME.softAmber },
      { label: 'Spend', value: formatCurrency(safeSummary.spend, currency), color: THEME.royal, bg: THEME.softBlue },
      { label: 'CTR', value: safeSummary.hasCtr ? formatPct(safeSummary.ctr) : 'N/A', color: THEME.violet, bg: THEME.softPurple },
    ], 35, 125);

    if (displayedTrends.length > 0) {
      drawCard(35, 235, 525, 250, THEME.card, THEME.border);
      drawNumberBarChart(doc, displayedTrends, { x: 55, y: 255, width: 480, title: 'Leads Generated by Month', labelKey: 'month', valueKey: 'conversions', color: THEME.emerald });
    } else {
      drawEmptyState(35, 235, 525, 250, 'Lead Trend Not Available', 'Monthly segment fields missing.');
    }

    drawCard(35, 520, 525, 130, '#F8FAFC', '#BFDBFE');
    doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Lead Efficiency Scorecard', 55, 540);

    const leadScoreItems = [
      { label: 'Lead Volume', value: !safeSummary.hasConversions ? 'N/A' : safeSummary.conversions >= 1000 ? 'Strong' : safeSummary.conversions >= 300 ? 'Good' : 'Needs Work', color: THEME.emerald },
      { label: 'Cost Efficiency', value: !safeSummary.hasCpa ? 'N/A' : safeSummary.cpa <= 100 ? 'Good' : safeSummary.cpa <= 500 ? 'Average' : 'High CPL', color: THEME.amber },
      { label: 'Engagement', value: !safeSummary.hasCtr ? 'N/A' : safeSummary.ctr >= 2 ? 'Strong' : safeSummary.ctr >= 1 ? 'Average' : 'Low', color: THEME.violet },
      { label: 'Tracking', value: safeSummary.hasRoas ? 'Complete' : 'Revenue Missing', color: safeSummary.hasRoas ? THEME.emerald : THEME.rose },
    ];

    leadScoreItems.forEach((item, i) => {
      const x = 55 + i * 118;
      doc.circle(x + 45, 585, 8).fill(item.color);
      doc.fillColor(THEME.muted).fontSize(7).font('Helvetica-Bold').text(item.label.toUpperCase(), x, 605, { width: 95, align: 'center' });
      doc.fillColor(THEME.text).fontSize(10).font('Helvetica-Bold').text(item.value, x, 625, { width: 95, align: 'center' });
    });

    drawFooter(pageNo++);

    // ===============================
    // PAGE 5 - FUNNEL (PROPORTIONAL SCALING)
    // ===============================
    doc.addPage();
    drawPageHeader('Lead Funnel Overview', 'Simple view of how audience activity converted into leads');

    const activeFunnelValues = funnelItems.filter(item => item.available).map(item => item.numericValue);
    const funnelMaxValue = activeFunnelValues.length > 0 ? Math.max(...activeFunnelValues, 1) : 1;

    funnelItems.forEach((item, i) => {
      const y = 135 + i * 115;
      const rawWidth = item.available ? (Number(item.numericValue || 0) / funnelMaxValue) * 460 : 350;
      const width = Math.max(260, Math.min(460, rawWidth)); 
      const x = 50 + (460 - width) / 2;

      drawCard(x, y, width, 75, item.bg, THEME.border);
      doc.circle(x + 25, y + 37, 15).fill(item.color);
      doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text(String(i + 1), x + 20, y + 31, { width: 10, align: 'center' });

      doc.fillColor(THEME.text).fontSize(15).font('Helvetica-Bold').text(item.label, x + 55, y + 18, { width: Math.max(100, width - 180), height: 18, ellipsis: true });
      doc.fillColor(item.color).fontSize(20).font('Helvetica-Bold').text(item.value, x + 55, y + 40, { width: Math.max(100, width - 180), height: 24, ellipsis: true });
      doc.fillColor(THEME.muted).fontSize(8).font('Helvetica').text(item.note, x + width - 135, y + 32, { width: 110, height: 18, align: 'right', ellipsis: true });

      if (i < funnelItems.length - 1) {
        const rates = [
          `Avg Frequency: ${safeSummary.hasReach && safeSummary.hasImpressions && safeSummary.impressions >= safeSummary.reach ? `${formatNum(avgFrequency, 2)}x` : 'N/A'}`,
          `Click Rate: ${safeSummary.hasCtr ? formatPct(clickRate) : 'N/A'}`,
          `Lead Rate: ${safeSummary.hasClicks && safeSummary.hasConversions && safeSummary.conversions <= safeSummary.clicks ? formatPct(leadRate) : 'N/A'}`,
        ];

        doc.fillColor('#94A3B8').fontSize(14).font('Helvetica-Bold').text('v', 285, y + 82, { width: 20, align: 'center' });
        doc.fillColor(THEME.text).fontSize(8).font('Helvetica-Bold').text(rates[i], 315, y + 86, { width: 150, height: 10, lineBreak: false, ellipsis: true });
      }
    });

    drawCard(35, 610, 525, 90, '#F8FAFC', '#BFDBFE');
    doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Funnel Meaning', 55, 630);
    doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(`This funnel demonstrates structural drop-off thresholds. A consistent baseline helps optimize landing-page configurations and strategic budget pacing models.`, 55, 645, { width: 480, height: 44, lineGap: 4, ellipsis: true });

    drawFooter(pageNo++);

    // ===============================
    // PAGE 6 - PLATFORMS
    // ===============================
    doc.addPage();
    drawPageHeader('Platform Analytics', 'Platform-wise spend distribution and leads performance');

    if (activePlatforms.length > 1) {
      drawCard(35, 120, 525, 240, THEME.card, THEME.border);
      drawPieChart(doc, activePlatforms, { x: 175, y: 245, radius: 65, title: 'Platform Spend Distribution' }, currency);

      if (topPlatform) {
        const topPlatformCpl = Number(topPlatform.conversions || 0) > 0 ? formatCurrency(Number(topPlatform.spend || 0) / Number(topPlatform.conversions || 0), currency) : 'N/A';
        drawCard(35, 375, 525, 55, THEME.softBlue, '#BFDBFE');
        doc.fillColor(THEME.royal).fontSize(8).font('Helvetica-Bold').text('BEST PERFORMING PLATFORM', 55, 390);
        doc.fillColor(THEME.text).fontSize(12).font('Helvetica-Bold').text(`${String(topPlatform.platform || 'Platform').toUpperCase()} generated ${formatNum(topPlatform.conversions)} leads at ${topPlatformCpl} cost/lead.`, 55, 407, { width: 485, height: 14, ellipsis: true });
      }

      drawCard(35, 445, 525, 210, THEME.softGreen, '#A7F3D0');
      drawNumberBarChart(doc, activePlatforms, { x: 55, y: 460, width: 480, title: 'Leads by Platform', labelKey: 'platform', valueKey: 'conversions', color: THEME.emerald, sortByValue: true });
    } else if (activePlatforms.length === 1) {
      const onlyPlatform = activePlatforms[0];
      drawEmptyState(35, 125, 525, 145, 'Single Platform Performance', `${String(onlyPlatform.platform || 'Platform').toUpperCase()} is the only tracked data source here. Comparison tools auto-suppress safely.`);

      drawMiniMetricCards([
        { label: 'Platform', value: String(onlyPlatform.platform || 'Meta').toUpperCase(), color: THEME.royal, bg: THEME.softBlue },
        { label: 'Spend', value: formatCurrency(onlyPlatform.spend, currency), color: THEME.violet, bg: THEME.softPurple },
        { label: 'Leads', value: formatNum(onlyPlatform.conversions), color: THEME.emerald, bg: THEME.softGreen },
        { label: 'Cost/Lead', value: Number(onlyPlatform.conversions || 0) > 0 ? formatCurrency(Number(onlyPlatform.spend || 0) / Number(onlyPlatform.conversions || 0), currency) : 'N/A', color: THEME.rose, bg: THEME.softRose },
      ], 55, 305);

      drawCard(35, 395, 525, 80, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Platform Share Summary', 55, 415);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(`${String(onlyPlatform.platform || 'Platform').toUpperCase()} aggregates 100% share within this configuration model with ${formatCurrency(onlyPlatform.spend, currency)} total tracked media investments.`, 55, 440, { width: 480, height: 30, lineGap: 4, ellipsis: true });
    }

    drawFooter(pageNo++);

    // ===============================
    // PAGE 7 - INSIGHTS & BOX FLOWS
    // ===============================
    doc.addPage();
    drawPageHeader('Insights & Recommendations', 'Business-oriented observations and next actions');

    const insightCards = [
      { title: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), desc: 'Total advertising budget used.', bg: THEME.softBlue, color: THEME.royal },
      { title: 'Lead Volume', value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A', desc: 'Total leads generated.', bg: THEME.softGreen, color: THEME.emerald },
      { title: 'Cost per Lead', value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', desc: 'Average cost per lead asset.', bg: THEME.softAmber, color: THEME.amber },
      { title: 'Data Quality', value: `${completenessScore}%`, desc: `${availableFields}/${metricAvailability.length} tracked metrics available.`, bg: THEME.softPurple, color: THEME.violet },
    ];

    insightCards.forEach((card, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 35 + col * 270;
      const y = 125 + row * 115;

      drawCard(x, y, 250, 95, card.bg, THEME.border);
      doc.circle(x + 20, y + 22, 6).fill(card.color);
      doc.fillColor(THEME.muted).fontSize(8).font('Helvetica-Bold').text(card.title.toUpperCase(), x + 35, y + 17, { width: 190 });
      doc.fillColor(THEME.text).fontSize(16).font('Helvetica-Bold').text(card.value, x + 18, y + 42, { width: 210 });
      doc.fillColor(THEME.muted).fontSize(7.5).font('Helvetica').text(card.desc, x + 18, y + 67, { width: 210, height: 18, lineGap: 2, ellipsis: true });
    });

    drawCard(35, 360, 525, 120, THEME.card, THEME.border);
    doc.fillColor(THEME.text).fontSize(16).font('Helvetica-Bold').text('Executive Marketing Summary', 55, 380);
    doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(reportSummaryText, 55, 410, { width: 485, height: 62, lineGap: 4, ellipsis: true });

    doc.y = 495;
    const whatsWorking = [
      `${safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A'} leads/results generated.`,
      `Average cost per lead is ${safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A'}.`,
      safeSummary.hasCtr ? `CTR is ${formatPct(safeSummary.ctr)} from ${formatNum(safeSummary.clicks)} clicks.` : 'Lead metric available, inline engagement records bounded.',
    ];

    const needsAttention = [
      !safeSummary.hasRoas ? 'Revenue and ROAS are missing, so profit quality cannot be measured.' : `ROAS is ${formatNum(safeSummary.roas, 2)}x.`,
      !safeSummary.hasCpc ? 'Clicks, CTR and CPC should be included in future exports.' : `CPC is ${formatCurrency(safeSummary.cpc, currency)}.`,
    ];

    const drawInsightBox = (x, title, items, color, bg) => {
      ensurePageSpace(120);
      let boxY = doc.y;

      drawCard(x, boxY, 525, 105, bg, THEME.border);
      doc.circle(x + 22, boxY + 25, 8).fill(color);
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text(title, x + 40, boxY + 17);

      items.slice(0, 3).forEach((item, i) => {
        doc.fillColor(color).fontSize(9).font('Helvetica-Bold').text('-', x + 22, boxY + 48 + i * 22);
        doc.fillColor(THEME.text).fontSize(8.5).font('Helvetica').text(item, x + 40, boxY + 48 + i * 22, { width: 465, height: 18, lineGap: 2, ellipsis: true });
      });
      doc.y = boxY + 115;
    };

    drawInsightBox(35, "What's Working", whatsWorking, THEME.emerald, THEME.softGreen);
    drawInsightBox(35, 'Needs Attention', needsAttention, THEME.amber, THEME.softAmber);

    drawFooter(pageNo++);

    if (canUseExecutivePages) {
      doc.addPage();
      drawPageHeader('Next Month Action Plan', 'Clear next steps to improve campaign performance');

      const actionItems = [
        { title: 'Improve Tracking', desc: safeSummary.hasRoas ? 'Continue tracking revenue quality for each network deployment.' : 'Add value parameters in next sync upload to calculate baseline profitability structures.', color: THEME.royal, bg: THEME.softBlue },
        { title: 'Optimize Campaign Budget', desc: hasCampaignChart ? 'Shift programmatic budget parameters towards elements yielding sub-threshold acquisition costs.' : 'Structure localized targeting strategies next session.', color: THEME.violet, bg: THEME.softPurple },
        { title: 'Improve Lead Quality', desc: 'Audit entry sources, conversion flow velocity, and landing parameters.', color: THEME.emerald, bg: THEME.softGreen },
        { title: 'Test Creatives', desc: safeSummary.hasCtr ? 'Deploy dynamic matching test scripts across high impressions blocks.' : 'Include micro-copy visual checks next generation.', color: THEME.amber, bg: THEME.softAmber },
      ];

      actionItems.forEach((item, i) => {
        const y = 125 + i * 115;
        drawCard(35, y, 525, 95, item.bg, THEME.border);
        doc.circle(65, y + 35, 16).fill(item.color);
        doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold').text(String(i + 1), 59, y + 28, { width: 12, align: 'center' });
        doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text(item.title, 95, y + 22);
        doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(item.desc, 95, y + 48, { width: 420, height: 30, lineGap: 4, ellipsis: true });
      });

      drawCard(35, 600, 525, 55, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(12).font('Helvetica-Bold').text('Priority Focus', 55, 615);
      doc.fillColor(THEME.muted).fontSize(8.5).font('Helvetica').text(!safeSummary.hasRoas ? 'First priority targets pixel deployment tracking additions to ensure true profitability validation rules.' : 'Optimize scaling constraints safely.', 150, 615, { width: 380, ellipsis: true });

      drawFooter(pageNo++);

      // Final Executive Summary Page
      doc.addPage();
      drawPageHeader('Executive Summary', 'Final business summary for quick decision making');

      const executiveCards = [
        { label: 'Total Spend', value: formatCurrency(safeSummary.spend, currency), color: THEME.royal, bg: THEME.softBlue },
        { label: 'Total Leads', value: safeSummary.hasConversions ? formatNum(safeSummary.conversions) : 'N/A', color: THEME.emerald, bg: THEME.softGreen },
        { label: 'Average CPL', value: safeSummary.hasCpa ? formatCurrency(safeSummary.cpa, currency) : 'N/A', color: THEME.amber, bg: THEME.softAmber },
        { label: 'Best Platform', value: topPlatform ? String(topPlatform.platform).toUpperCase() : 'N/A', color: THEME.violet, bg: THEME.softPurple },
        { label: 'CTR', value: safeSummary.hasCtr ? formatPct(safeSummary.ctr) : 'N/A', color: THEME.cyan, bg: '#ECFEFF' },
        { label: 'ROAS', value: safeSummary.hasRoas ? `${formatNum(safeSummary.roas, 2)}x` : 'N/A', color: THEME.rose, bg: THEME.softRose },
      ];

      executiveCards.forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 35 + col * 270;
        const y = 125 + row * 105;

        drawCard(x, y, 250, 82, item.bg, THEME.border);
        doc.circle(x + 24, y + 28, 8).fill(item.color);
        doc.fillColor(THEME.muted).fontSize(8).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 42, y + 20);
        doc.fillColor(THEME.text).fontSize(17).font('Helvetica-Bold').text(item.value, x + 42, y + 43, { width: 190, ellipsis: true });
      });

      drawCard(35, 465, 525, 90, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Final Takeaway', 55, 485);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(`Media deployment models produced ${formatNum(safeSummary.conversions)} conversion nodes. Missing structural tracking metrics can be added to standard properties next upload cycles to refine algorithmic attribution parameters.`, 55, 510, { width: 480, height: 36, lineGap: 4, ellipsis: true });

      drawCard(35, 585, 525, 95, THEME.softGreen, '#A7F3D0');
      doc.fillColor(THEME.text).fontSize(14).font('Helvetica-Bold').text('Next Month Priority', 55, 605);
      doc.fillColor(THEME.muted).fontSize(9).font('Helvetica').text(`Coordinate tracking infrastructure across target frameworks to surface exact conversion attributes.`, 55, 630, { width: 480, height: 34, lineGap: 4, ellipsis: true });

      drawCard(35, 690, 525, 42, '#F8FAFC', '#BFDBFE');
      doc.fillColor(THEME.text).fontSize(12).font('Helvetica-Bold').text('Executive Verdict', 55, 703);
      doc.fillColor(THEME.muted).fontSize(8.5).font('Helvetica').text('Campaign operations viable. Add telemetry tracking layers prior to scale modifications.', 190, 703, { width: 345, height: 20, lineGap: 2, ellipsis: true });

      drawFooter(pageNo++);
    }

    doc.end();

    writeStream.on('finish', async () => {
      const BASE_URL = "https://marketing-report-generator-p9wj.onrender.com";
      const fileUrl = `${BASE_URL}/data/reports/${fileName}`;

      await db.query(
        `INSERT INTO generated_reports (client_id, agency_id, created_by, title, date_range_start, date_range_end, file_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [clientId, req.user.agency_id, req.user.id, customTitle || title || `Report - ${client.name}`, dateStart, dateEnd, fileUrl]
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