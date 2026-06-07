const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
const CURRENCY_SYMBOLS = {
  INR: 'INR',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  SGD: 'S$',
};

const CURRENCY_RATES = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0095,
  AED: 0.044,
  SGD: 0.016,
};
const formatNum = (n, decimals = 0) => {
  if (n === null || n === undefined) return '0';

  return parseFloat(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};
const formatCurrency = (n, currency = 'INR') => {
  const symbol = CURRENCY_SYMBOLS[currency] || 'INR';
  const rate = CURRENCY_RATES[currency] || 1;
  const convertedValue = parseFloat(n || 0) * rate;

  return `${symbol} ${convertedValue.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};


const formatPct = (n) => `${formatNum(n, 2)}%`;

//Bar Chart
const drawBarChart = (doc, data, options, currency = 'INR') => {
  const { x, y, width, title, labelKey, valueKey, color } = options;

  doc.fillColor('#1E293B')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(title, x, y);

  const startY = y + 45;
  const max = Math.max(...data.map(d => Number(d[valueKey] || 0)), 1);

  const labelW = 180;
  const valueW = 90;
  const chartW = width - labelW - valueW - 20;

  const barHeight = 24;
  const gap = 12;

  data.slice(0, 6).forEach((d, i) => {
    const label = String(d[labelKey] || 'Unknown').substring(0, 30);
    const value = Number(d[valueKey] || 0);

    const rowY = startY + i * (barHeight + gap);

    const barWidth = Math.max((value / max) * chartW, 18);

    doc.fillColor('#475569')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(label, x, rowY + 7, {
        width: labelW - 15,
      });

    // Background track
    doc.roundedRect(
      x + labelW,
      rowY,
      chartW,
      barHeight,
      8
    ).fill('#E9D5FF');

    // Main bar
    doc.roundedRect(
      x + labelW,
      rowY,
      barWidth,
      barHeight,
      8
    ).fill(color);

    // Gloss effect
    doc.roundedRect(
      x + labelW,
      rowY,
      barWidth * 0.45,
      barHeight,
      8
    )
    .fillOpacity(0.15)
    .fill('#FFFFFF')
    .fillOpacity(1);

    doc.fillColor('#0F172A')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(
      valueKey === 'conversions'
        ? `${formatNum(value)} leads`
        : valueKey === 'efficiency'
          ? `${formatNum(value * 100, 2)} leads / 100 spend`
          : formatCurrency(value, currency),
        x + labelW + chartW + 12,
        rowY + 7,
        {
          width: valueW,
          lineBreak: false,
        }
      );
  });
};
// Number Bar chart
const drawNumberBarChart = (doc, data, options) => {
  const { x, y, width, title, labelKey, valueKey, color } = options;

  doc.fillColor('#1E293B')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(title, x, y);

  const startY = y + 35;
  const max = Math.max(...data.map(d => Number(d[valueKey] || 0)), 1);

  const labelW = 150;
  const valueW = 90;
  const chartW = width - labelW - valueW - 25;

  const barHeight = 18;
  const gap = 14;

  data.slice(0, 6).forEach((d, i) => {
    const label = String(d[labelKey] || 'Unknown').toUpperCase().substring(0, 22);
    const value = Number(d[valueKey] || 0);
    const barWidth = Math.max((value / max) * chartW, 4);
    const rowY = startY + i * (barHeight + gap);

    doc.fillColor('#64748B')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(label, x, rowY + 4, { width: labelW - 10 });

    doc.roundedRect(x + labelW, rowY, barWidth, barHeight, 3).fill(color);

    doc.fillColor('#1E293B')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(formatNum(value), x + labelW + chartW + 10, rowY + 4, {
        width: valueW,
        align: 'left',
        lineBreak: false,
      });
  });
};
//Line chart
const drawLineChart = (doc, data, options, currency = 'INR') => {
  const { x, y, width, height, title, labelKey, valueKey, color } = options;

  doc.fillColor('#1E293B')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(title, x, y);

  if (!data || data.length === 0) return;

  const chartX = x + 40;
  const chartY = y + 45;
  const chartW = width - 60;
  const chartH = height - 70;

  const values = data.map(d => Number(d[valueKey] || 0));
  const max = Math.max(...values, 1);

  doc.strokeColor('#E2E8F0').lineWidth(1);

  for (let i = 0; i <= 4; i++) {
    const gy = chartY + (chartH / 4) * i;
    doc.moveTo(chartX, gy).lineTo(chartX + chartW, gy).stroke();
  }

  const points = data.map((d, i) => {
    const px = chartX + (i / Math.max(data.length - 1, 1)) * chartW;
    const py = chartY + chartH - (Number(d[valueKey] || 0) / max) * chartH;
    return { x: px, y: py, label: d[labelKey], value: Number(d[valueKey] || 0) };
  });

  doc.strokeColor(color).lineWidth(4);

  points.forEach((p, i) => {
    if (i === 0) {
      doc.moveTo(p.x, p.y);
    } else {
      doc.lineTo(p.x, p.y);
    }
  });

  doc.stroke();

  points.forEach((p) => {
    doc.circle(p.x, p.y, 5).fill(color);

    doc.circle(p.x, p.y, 9)
      .strokeColor('#BFDBFE')
      .lineWidth(2)
      .stroke();

    doc.fillColor('#64748B')
      .fontSize(7)
      .text(String(p.label || ''), p.x - 20, chartY + chartH + 8, {
        width: 45,
        align: 'center',
      });
  });

const highestPoint = points.reduce((a, b) => (a.value > b.value ? a : b), points[0]);
const lowestPoint = points.reduce((a, b) => (a.value < b.value ? a : b), points[0]);
const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;

doc.fillColor('#1E293B')
  .fontSize(8.5)
  .font('Helvetica-Bold')
  .text(
    `Highest: ${highestPoint.label} (${formatCurrency(highestPoint.value, currency)})   Lowest: ${lowestPoint.label} (${formatCurrency(lowestPoint.value, currency)})   Avg: ${formatCurrency(avgValue, currency)}`,
    x,
    y + height - 10,
    { width: width - 20 }
  );

};

//Pie chart
const drawPieChart = (doc, data, options, currency = 'INR') => {
  const { x, y, radius, title } = options;

  if (!data || data.length === 0) return;

  doc.fillColor('#1E293B')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(title, x - 80, y - radius - 55);

  const total= Math.max(
               data.reduce((sum,d)=>sum+Number(d.spend||0),0),
               1
             );

  const colors = [
    '#3B82F6',
    '#8B5CF6',
    '#06B6D4',
    '#10B981',
    '#F59E0B',
    '#F43F5E',
  ];

  let startAngle = 0;

  data.slice(0, 5).forEach((d, i) => {
    const value = Number(d.spend || 0);
    const sliceAngle = (value / total) * Math.PI * 2;

    doc.moveTo(x, y)
      .fillColor(colors[i % colors.length])
      .arc(x, y, radius, startAngle, startAngle + sliceAngle)
      .lineTo(x, y)
      .fill();

    startAngle += sliceAngle;
  });

  let legendY = y - radius;

  data.slice(0, 5).forEach((d, i) => {
    const value = Number(d.spend || 0);
    const percent = ((value / total) * 100).toFixed(1);

    doc.rect(x + radius + 40, legendY, 12, 12)
      .fill(colors[i % colors.length]);

    doc.fillColor('#1E293B')
      .fontSize(9)
      .font('Helvetica')
      .text(
        `${String(d.platform || 'Unknown').toUpperCase()} (${percent}%)`,
        x + radius + 60,
        legendY - 1
      );

    legendY += 24;
  });
};


// Generate PDF report
router.post('/generate', async (req, res) => {
  try {

  let pageNo = 1;
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

    if (!clientId) return res.status(400).json({ error: 'clientId required' });
// Subscription plan check
const subscriptionResult = await db.query(
  `SELECT plan_name
   FROM subscriptions
   WHERE agency_id = $1
   ORDER BY created_at DESC
   LIMIT 1`,
  [req.user.agency_id]
);

const planName =
 (subscriptionResult.rows[0]?.plan_name || 'free')
   .toLowerCase();;
const canUseAgencyBranding = planName !== 'free';

// Total generated reports
const reportsCountResult = await db.query(
  `SELECT COUNT(*)::int AS total
   FROM generated_reports
   WHERE agency_id = $1`,
  [req.user.agency_id]
);

const totalReports =
 Number(reportsCountResult.rows[0]?.total || 0);

const reportLimits = {
  free: 5,
  pro: 50,
  agency: Infinity,
};

if (totalReports >= reportLimits[planName]) {
  return res.status(403).json({
    error:
      planName === 'free'
        ? 'Free plan allows only 5 reports. Upgrade to Pro.'
        : 'Pro plan allows only 50 reports. Upgrade to Agency.',
    plan: planName,
    limit: reportLimits[planName],
  });
}

    // Fetch all data
    const [clientResult, agencyResult] = await Promise.all([
      db.query('SELECT * FROM clients WHERE id=$1', [clientId]),
      db.query('SELECT * FROM agencies WHERE id=$1', [req.user.agency_id]),
    ]);

    const client = clientResult.rows[0];
    const agency = agencyResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Fetch metrics
   let whereClause = `
     WHERE pd.client_id = $1
     AND pd.external_campaign_name = 'aggregate'
   `;

   const params = [clientId];
   let idx = 2;

   if (dateStart) {
     whereClause += ` AND pd.report_month >= $${idx++}`;
     params.push(new Date(dateStart));
   }

   if (dateEnd) {
     whereClause += ` AND pd.report_month <= $${idx++}`;
     params.push(new Date(dateEnd));
   }

   if (platform && platform !== 'all') {
     whereClause += ` AND pd.platform = $${idx++}`;
     params.push(platform);
   }

   const aggregateWhereClause = whereClause;

  const campaignWhereClause = whereClause.replace(
    "AND pd.external_campaign_name = 'aggregate'",
    "AND pd.external_campaign_name <> 'aggregate'"
  );

    const [summaryResult, trendsResult, platformsResult, campaignsResult, aiInsightResult] = await Promise.all([
     db.query(
       `SELECT
         SUM(COALESCE(spend, 0)) as spend,
         SUM(COALESCE(impressions, 0)) as impressions,
         SUM(COALESCE(clicks, 0)) as clicks,
         SUM(COALESCE(conversions, 0)) as conversions,
         SUM(COALESCE(revenue, 0)) as revenue,
         SUM(COALESCE(reach, 0)) as reach,
         CASE WHEN SUM(COALESCE(impressions, 0)) > 0
           THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100
           ELSE 0 END as ctr,
         CASE WHEN SUM(COALESCE(clicks, 0)) > 0
           THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0))
           ELSE 0 END as cpc,
         CASE WHEN SUM(COALESCE(conversions, 0)) > 0
           THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0))
           ELSE 0 END as cpa,
         CASE WHEN SUM(COALESCE(spend, 0)) > 0
           THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
           ELSE 0 END as roas
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
          CASE
            WHEN SUM(spend) > 0
            THEN SUM(revenue) / SUM(spend)
            ELSE 0
          END as roas
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
          COALESCE(c.name, pd.external_campaign_name, 'Unknown Campaign') as name,
          pd.platform,
          SUM(pd.spend) as spend,
          SUM(pd.clicks) as clicks,
          SUM(pd.conversions) as conversions,
          CASE
            WHEN SUM(pd.spend) > 0
            THEN SUM(pd.conversions)::float / SUM(pd.spend)
            ELSE 0
          END as efficiency
        FROM performance_data pd
        LEFT JOIN campaigns c ON pd.campaign_id = c.id
        ${campaignWhereClause}
        GROUP BY COALESCE(c.name, pd.external_campaign_name, 'Unknown Campaign'), pd.platform
        ORDER BY efficiency DESC
        LIMIT 10`,
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

    const summary = summaryResult.rows[0];

    const trends = trendsResult.rows;
    const platforms = platformsResult.rows;
    const campaigns = campaignsResult.rows;
    const hasTrendChart = trends.length > 1;
    const hasCampaignChart = campaigns.length > 0;
    // const aiInsight = aiInsightResult.rows[0] || null;

    const monthResult = await db.query(
      `SELECT DISTINCT report_month
       FROM performance_data
       WHERE client_id = $1
       AND external_campaign_name = 'aggregate'
       ORDER BY report_month DESC
       LIMIT 2`,
      [clientId]
    );

    let previousSummary = null;

    if (monthResult.rows.length >= 2) {
      const previousAvailableMonth = monthResult.rows[1].report_month;

      const previousResult = await db.query(
        `SELECT
           SUM(COALESCE(spend, 0)) as spend,
           SUM(COALESCE(reach, 0)) as reach,
           SUM(COALESCE(impressions, 0)) as impressions,
           SUM(COALESCE(clicks, 0)) as clicks,
           SUM(COALESCE(conversions, 0)) as conversions,
           SUM(COALESCE(revenue, 0)) as revenue,
           CASE WHEN SUM(COALESCE(impressions, 0)) > 0
             THEN SUM(COALESCE(clicks, 0))::float / SUM(COALESCE(impressions, 0)) * 100
             ELSE 0 END as ctr,
           CASE WHEN SUM(COALESCE(clicks, 0)) > 0
             THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(clicks, 0))
             ELSE 0 END as cpc,
           CASE WHEN SUM(COALESCE(conversions, 0)) > 0
             THEN SUM(COALESCE(spend, 0)) / SUM(COALESCE(conversions, 0))
             ELSE 0 END as cpa,
           CASE WHEN SUM(COALESCE(spend, 0)) > 0
             THEN SUM(COALESCE(revenue, 0)) / SUM(COALESCE(spend, 0))
             ELSE 0 END as roas
         FROM performance_data
         WHERE client_id = $1
         AND external_campaign_name = 'aggregate'
         AND DATE_TRUNC('month', report_month) = DATE_TRUNC('month', $2::date)`,
        [clientId, previousAvailableMonth]
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



   /* // Helper: hex to rgb
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    };  */

    // Cover page
// ===============================
// PREMIUM REPORT DESIGN START
// ===============================

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

const safeSummary = {
  spend: Number(summary?.spend ?? 0),
  reach: Number(summary?.reach ?? 0),
  impressions: Number(summary?.impressions ?? 0),
  clicks: Number(summary?.clicks ?? 0),
  conversions: Number(summary?.conversions ?? 0),
  ctr: Number(summary?.ctr ?? 0),
  cpc: Number(summary?.cpc ?? 0),
  cpa: Number(summary?.cpa ?? 0),
  roas: Number(summary?.roas ?? 0),
  revenue: Number(summary?.revenue ?? 0),

  hasClicks: Number(summary?.clicks ?? 0) > 0,
  hasRevenue: Number(summary?.revenue ?? 0) > 0,
  hasImpressions: Number(summary?.impressions ?? 0) > 0,
};

const calcChange = (current, previous, reverse = false) => {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);

  if (!prev || prev === 0) return null;

  const change = ((curr - prev) / Math.abs(prev)) * 100;
  return reverse ? -change : change;
};

const formatGrowth = (change) => {
  if (change === null || change === undefined || Number.isNaN(change)) {
    return null;
  }

  const sign = change > 0 ? '+' : '';
  return `${sign}${formatNum(change, 1)}%`;
};

const growth = {
  spend: formatGrowth(calcChange(safeSummary.spend, previousSummary?.spend)),
  reach: formatGrowth(calcChange(safeSummary.reach, previousSummary?.reach)),
  impressions: formatGrowth(calcChange(safeSummary.impressions, previousSummary?.impressions)),
  clicks: formatGrowth(calcChange(safeSummary.clicks, previousSummary?.clicks)),
  conversions: formatGrowth(calcChange(safeSummary.conversions, previousSummary?.conversions)),
  ctr: formatGrowth(calcChange(safeSummary.ctr, previousSummary?.ctr)),
  cpc: formatGrowth(calcChange(safeSummary.cpc, previousSummary?.cpc, true)),
  cpa: formatGrowth(calcChange(safeSummary.cpa, previousSummary?.cpa, true)),
  roas: formatGrowth(calcChange(safeSummary.roas, previousSummary?.roas)),
};





const drawEmptyState = (x, y, w, h, title, message) => {
  drawCard(x, y, w, h, THEME.card, THEME.border);

  doc.fillColor(THEME.text)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(title, x + 25, y + 35, { width: w - 50, align: 'center' });

  doc.fillColor(THEME.muted)
    .fontSize(9)
    .font('Helvetica')
    .text(message, x + 35, y + 62, {
      width: w - 70,
      align: 'center',
      lineGap: 3,
    });
};
const drawMiniMetricCards = (items, startX, startY) => {
  items.forEach((item, i) => {
    const x = startX + i * 112;
    const y = startY;

    drawCard(x, y, 105, 72, item.bg, THEME.border);

    doc.fillColor(item.color)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(item.label.toUpperCase(), x + 12, y + 14, { width: 95 });

    doc.fillColor(THEME.text)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(item.value, x + 12, y + 36, { width: 82 });
  });
};



const reportSummaryText =
  `During the selected reporting period, ${client.name} generated ${formatNum(safeSummary.conversions)} leads/results with total ad spend of ${formatCurrency(safeSummary.spend, currency)}. ` +
  `The average cost per lead/result was ${formatCurrency(safeSummary.cpa, currency)}. ` +
  `${safeSummary.reach > 0 ? `The campaigns reached ${formatNum(safeSummary.reach)} people and delivered ${formatNum(safeSummary.impressions)} impressions. ` : ''}` +
  `${safeSummary.hasClicks ? `Click data was available, with ${formatNum(safeSummary.clicks)} clicks and CTR of ${formatPct(safeSummary.ctr)}. ` : 'Click and CTR data were not present in the uploaded report, so engagement performance cannot be evaluated from this export. '}` +
  `${safeSummary.hasRevenue ? `Revenue was ${formatCurrency(safeSummary.revenue, currency)} with ROAS of ${formatNum(safeSummary.roas, 2)}x.` : 'Revenue and ROAS were not included in the uploaded report, so return on ad spend cannot be evaluated from this export.'}`;

const reportTitle = customTitle || title || 'Marketing Performance Report';

const dateLabel =
  dateStart && dateEnd
    ? `${new Date(dateStart).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })} - ${new Date(dateEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`
    : `Generated ${new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}`;

const drawSectionTitle = (title, x, y, color = THEME.royal) => {
  doc.fillColor(THEME.text)
    .fontSize(17)
    .font('Helvetica-Bold')
    .text(title, x, y);

  doc.roundedRect(x, y + 24, 55, 4, 2).fill(color);
};
const drawCard = (x, y, w, h, bg = THEME.card, border = THEME.border) => {
  doc.roundedRect(x + 2, y + 3, w, h, 12).fill('#CBD5E1');
  doc.roundedRect(x, y, w, h, 12).fillAndStroke(bg, border);
};




 const drawKpiCard = (x, y, w, h, item, color, bg) => {
   drawCard(x, y, w, h, bg, '#DDE6F3');

   doc.circle(x + 18, y + 18, 8).fill(color);

   doc.fillColor(THEME.muted)
     .fontSize(7)
     .font('Helvetica-Bold')
     .text(item.label.toUpperCase(), x + 34, y + 12, {
       width: w - 42,
       lineBreak: false,
     });

   doc.fillColor(THEME.text)
     .fontSize(13)
     .font('Helvetica-Bold')
     .text(item.value, x + 34, y + 30, {
       width: w - 42,
       height: 18,
       ellipsis: true,
     });

   const bottomText =
     item.subtitle ||
     item.note ||
     item.description ||
     item.growth ||
     '';

   doc.fillColor(item.subtitle ? color : THEME.muted)
     .fontSize(6.3)
     .font('Helvetica-Bold')
     .text(bottomText, x + 34, y + 49, {
       width: w - 42,
       lineBreak: false,
       ellipsis: true,
     });
 };

 const drawAgencyLogo = () => {
   try {
     if (!canUseAgencyBranding || !agency?.logo_url) return;

     const logoPath = path.join(
       __dirname,
       '../../',
       agency.logo_url.replace('/data/', 'data/')
     );

     if (fs.existsSync(logoPath)) {
       doc.image(logoPath, 50, 38, {
         width: 42,
         height: 42,
         fit: [42, 42],
       });
     }
   } catch (e) {
     console.log('Logo render skipped:', e.message);
   }
 };
 const drawFooter = (pageNo) => {
   doc.save();

   doc.fillColor('#94A3B8')
     .fontSize(8)
     .font('Helvetica')
     .text(
       `Prepared for ${client.name} • Generated with Marketing Report Generator`,
       50,
       790,
       {
         width: 500,
         align: 'center',
         lineBreak: false,
       }
     );

   doc.roundedRect(515, 785, 26, 18, 5).fill(THEME.royal);

   doc.fillColor('#FFFFFF')
     .fontSize(8)
     .font('Helvetica-Bold')
     .text(String(pageNo), 515, 790, {
       width: 26,
       align: 'center',
       lineBreak: false,
     });

   doc.restore();
 };
// ===============================
// PAGE 1 - COVER + DASHBOARD
// ===============================

doc.rect(0, 0, pageW, pageH).fill(THEME.bg);

// Header background
doc.rect(0, 0, pageW, 220).fill(THEME.navy);
doc.rect(0, 158, pageW, 52).fill(THEME.royal);

doc.circle(520, 40, 110)
  .fillOpacity(0.16)
  .fill(THEME.cyan)
  .fillOpacity(1);

doc.circle(455, 135, 72)
  .fillOpacity(0.18)
  .fill(THEME.violet)
  .fillOpacity(1);

doc.circle(95, 55, 85)
  .fillOpacity(0.08)
  .fill('#FFFFFF')
  .fillOpacity(1);

// Agency name
drawAgencyLogo();

doc.fillColor('#FFFFFF')
  .fontSize(9)
  .font('Helvetica-Bold')
  .text((agency?.name || 'Your Agency').toUpperCase(), agency?.logo_url ? 105 : 50, 42);

// Title
doc.fillColor('#FFFFFF')
  .fontSize(28)
  .font('Helvetica-Bold')
  .text(reportTitle, 50, 72, {
    width: 430,
    lineGap: 3,
  });

doc.fillColor('#DBEAFE')
  .fontSize(13)
  .font('Helvetica')
  .text(client.name, 50, 143);

doc.fillColor('#BFDBFE')
  .fontSize(9)
  .text(dateLabel, 50, 172);

// ===============================
// PERFORMANCE SCORE + GRADE
// ===============================

let performanceScore = 0;

if (safeSummary.conversions > 0) performanceScore += 30;

if (safeSummary.cpa > 0 && safeSummary.cpa <= 100) performanceScore += 25;
else if (safeSummary.cpa > 0 && safeSummary.cpa <= 500) performanceScore += 15;
else if (safeSummary.cpa > 0) performanceScore += 8;

if (safeSummary.hasClicks && safeSummary.ctr >= 2) performanceScore += 20;
else if (safeSummary.hasClicks && safeSummary.ctr >= 1) performanceScore += 12;
else if (safeSummary.hasClicks) performanceScore += 5;

if (safeSummary.hasRevenue && safeSummary.roas >= 3) performanceScore += 25;
else if (safeSummary.hasRevenue && safeSummary.roas >= 1) performanceScore += 15;
else if (safeSummary.hasRevenue) performanceScore += 5;

performanceScore = Math.min(100, performanceScore);

let performanceGrade = 'Needs Improvement';
let scoreLabel = 'Needs Improvement';

if (performanceScore >= 85) {
  performanceGrade = 'A';
  scoreLabel = 'Excellent';
} else if (performanceScore >= 70) {
  performanceGrade = 'B';
  scoreLabel = 'Good';
} else if (performanceScore >= 55) {
  performanceGrade = 'C';
  scoreLabel = 'Fair';
}

// ===============================
// KEY TAKEAWAY BANNER
// ===============================

drawCard(35, 225, 525, 48, '#F8FAFC', '#BFDBFE');

doc.circle(60, 249, 12).fill(THEME.royal);

doc.fillColor('#FFFFFF')
  .fontSize(11)
  .font('Helvetica-Bold')
  .text('i', 57, 243, {
    width: 12,
    align: 'center',
    lineBreak: false,
  });

doc.fillColor(THEME.text)
  .fontSize(9)
  .font('Helvetica-Bold')
  .text(
    `Key Takeaway: Generated ${formatNum(safeSummary.conversions)} leads at ${formatCurrency(safeSummary.cpa, currency)} CPL from total spend of ${formatCurrency(safeSummary.spend, currency)}.`,
    85,
    240,
    {
      width: 445,
      lineGap: 2,
    }
  );

// ===============================
// EXECUTIVE SNAPSHOT
// ===============================

doc.roundedRect(50, 285, 495, 50, 16).fillAndStroke('#FFFFFF', THEME.border);

doc.fillColor(THEME.text)
  .fontSize(13)
  .font('Helvetica-Bold')
  .text('Executive Snapshot', 70, 298);

doc.fillColor(THEME.muted)
  .fontSize(8)
  .font('Helvetica')
  .text(
    `This report summarizes ${client.name}'s marketing performance, campaign spend, audience reach, engagement, conversions and recommended actions.`,
    70,
    316,
    {
      width: 440,
      lineGap: 2,
    }
  );

// ===============================
// KPI CARDS
// ===============================

drawSectionTitle('Performance Dashboard', 50, 348, THEME.violet);

const metrics = [
  {
    label: 'Performance Score',
    value: `${performanceScore}/100`,
    subtitle: scoreLabel,
    color: THEME.emerald,
    bg: THEME.softGreen,
  },
  {
    label: 'Marketing Grade',
    value: performanceGrade,
    subtitle: scoreLabel,
    color: THEME.royal,
    bg: THEME.softBlue,
  },
  {
    label: 'Total Spend',
    value: formatCurrency(safeSummary.spend, currency),
    description: 'Total advertising budget used',
    growth: growth.spend,
    color: THEME.royal,
    bg: THEME.softBlue,
  },
  {
    label: 'Reach',
    value: safeSummary.reach > 0 ? formatNum(safeSummary.reach) : 'Not Provided',
    description: 'Unique people reached',
    growth: growth.reach,
    color: THEME.violet,
    bg: THEME.softPurple,
  },
  {
    label: 'Impressions',
    value: safeSummary.hasImpressions ? formatNum(safeSummary.impressions) : 'Not Available',
    description: 'Total ad impressions delivered',
    growth: growth.impressions,
    color: THEME.cyan,
    bg: '#ECFEFF',
  },
  {
    label: 'Leads / Results',
    value: formatNum(safeSummary.conversions),
    description: 'Total leads/results generated',
    growth: growth.conversions,
    color: THEME.emerald,
    bg: THEME.softGreen,
  },
  {
    label: 'Cost / Lead',
    value: formatCurrency(safeSummary.cpa, currency),
    description: 'Average cost per lead/result',
    growth: growth.cpa,
    color: THEME.amber,
    bg: THEME.softAmber,
  },
  {
    label: 'Clicks',
    value: safeSummary.hasClicks ? formatNum(safeSummary.clicks) : 'Not Available',
    note: safeSummary.hasClicks ? growth.clicks : 'Not in source file',
    growth: safeSummary.hasClicks ? growth.clicks : null,
    color: THEME.amber,
    bg: THEME.softAmber,
  },
  {
    label: 'CTR',
    value: safeSummary.hasClicks ? formatPct(safeSummary.ctr) : 'Not Available',
    note: safeSummary.hasClicks ? growth.ctr : 'Requires clicks data',
    growth: safeSummary.hasClicks ? growth.ctr : null,
    color: THEME.violet,
    bg: THEME.softPurple,
  },
  {
    label: 'CPC',
    value: safeSummary.hasClicks ? formatCurrency(safeSummary.cpc, currency) : 'Not Available',
    note: safeSummary.hasClicks ? growth.cpc : 'Requires clicks data',
    growth: safeSummary.hasClicks ? growth.cpc : null,
    color: THEME.rose,
    bg: THEME.softRose,
  },
  {
    label: 'ROAS',
    value: safeSummary.hasRevenue ? `${formatNum(safeSummary.roas, 2)}x` : 'Not Available',
    note: safeSummary.hasRevenue ? growth.roas : 'Requires revenue data',
    growth: safeSummary.hasRevenue ? growth.roas : null,
    color: THEME.royal,
    bg: THEME.softBlue,
  },
];

const cardW = 155;
const cardH = 56;
const gapX = 15;
const gapY = 9;
const startX = 50;
const startY = 385;


metrics.forEach((m, i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = startX + col * (cardW + gapX);
  const y = startY + row * (cardH + gapY);

  drawKpiCard(x, y, cardW, cardH, m, m.color, m.bg);
});

// ===============================
// DATA AVAILABILITY SUMMARY
// ===============================

const availableMetrics = [];
const missingMetrics = [];

if (safeSummary.spend > 0) availableMetrics.push('Spend');
if (safeSummary.reach > 0) availableMetrics.push('Reach');
if (safeSummary.hasImpressions) availableMetrics.push('Impressions');
if (safeSummary.conversions > 0) availableMetrics.push('Leads');

if (!safeSummary.hasClicks) {
  missingMetrics.push('Clicks');
  missingMetrics.push('CTR');
  missingMetrics.push('CPC');
}

if (!safeSummary.hasRevenue) {
  missingMetrics.push('Revenue');
  missingMetrics.push('ROAS');
}

drawCard(35, 655, 525, 45, '#F8FAFC', '#BFDBFE');

doc.fillColor(THEME.royal)
  .fontSize(8)
  .font('Helvetica-Bold')
  .text('DATA AVAILABILITY', 55, 668, {
    width: 120,
    lineBreak: false,
  });

doc.fillColor(THEME.emerald)
  .fontSize(7.5)
  .font('Helvetica-Bold')
  .text(`Available: ${availableMetrics.join(', ') || 'None'}`, 180, 668, {
    width: 170,
    lineBreak: false,
  });

doc.fillColor(THEME.rose)
  .fontSize(7.5)
  .font('Helvetica-Bold')
  .text(`Missing: ${missingMetrics.join(', ') || 'None'}`, 360, 668, {
    width: 180,
    lineBreak: false,
  });
drawFooter(pageNo++);
// ===============================
// PAGE 2 - TABLES
// ===============================

doc.addPage();
doc.rect(0, 0, pageW, pageH).fill(THEME.bg);

doc.rect(0, 0, pageW, 95).fill(THEME.navy);

doc.fillColor('#FFFFFF')
  .fontSize(22)
  .font('Helvetica-Bold')
  .text('Performance Details', 50, 34);

doc.fillColor('#CBD5E1')
  .fontSize(9)
  .font('Helvetica')
  .text(`${client.name} | ${dateLabel}`, 50, 62);

if (trends.length > 0) {
  drawCard(35, 120, 525, 185, THEME.card, THEME.border);
  drawSectionTitle('Monthly Performance Trends', 55, 140, THEME.royal);

  const headers = ['Month', 'Spend', 'Clicks', 'Conversions', 'ROAS'];
  const colWidths = [115, 120, 80, 110, 70];
  let tY = 178;
  let tX = 55;

  doc.roundedRect(55, tY, 485, 24, 7).fill(THEME.royal);

  headers.forEach((h, i) => {
    doc.fillColor('#FFFFFF')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(h, tX + 8, tY + 8, { width: colWidths[i] - 10 });
    tX += colWidths[i];
  });

  tY += 28;

  trends.slice(0, 6).forEach((row, idx) => {
    const bg = idx % 2 === 0 ? '#F8FAFC' : '#EEF2FF';
    doc.roundedRect(55, tY, 485, 24, 5).fill(bg);

   const vals = [
     row.month,
     formatCurrency(row.spend, currency),
     Number(row.clicks || 0) > 0 ? formatNum(row.clicks) : 'N/A',
     formatNum(row.conversions),
     Number(row.roas || 0) > 0 ? `${formatNum(row.roas, 2)}x` : 'N/A',
   ];

    tX = 55;
    vals.forEach((v, i) => {
      doc.fillColor(THEME.text)
        .fontSize(8)
        .font('Helvetica')
        .text(v, tX + 8, tY + 8, { width: colWidths[i] - 10 });
      tX += colWidths[i];
    });

    tY += 26;
  });

} else {
  drawEmptyState(
    35,
    120,
    525,
    185,
    'Monthly Trend Data Not Available',
    'No monthly performance data was available for the selected period.'
  );
}


drawCard(35, 430, 525, 95, THEME.softBlue, '#BFDBFE');

doc.fillColor(THEME.text)
  .fontSize(14)
  .font('Helvetica-Bold')
  .text('Data Availability Notes', 55, 450);

const dataNotes = [
  safeSummary.hasClicks
    ? 'Click, CTR and CPC metrics are available.'
    : 'Click, CTR and CPC metrics are unavailable because click data was not included in the source file.',
  safeSummary.hasRevenue
    ? 'Revenue and ROAS metrics are available.'
    : 'Revenue and ROAS metrics are unavailable because revenue data was not included in the source file.',
  hasTrendChart
    ? 'Trend analysis is available.'
    : 'Trend chart requires at least two reporting months.'
];

doc.fillColor(THEME.muted)
  .fontSize(8.5)
  .font('Helvetica')
  .text(dataNotes.join('\n'), 55, 475, {
    width: 480,
    lineGap: 4,
  });

// Top campaign mini strip
if (campaigns.length > 0) {
drawCard(35, 545, 525, 135, THEME.card, THEME.border);
drawSectionTitle('Top Campaigns Breakdown', 55, 565, THEME.violet);

  const cHeaders = ['Campaign', 'Platform', 'Spend', 'Clicks', 'Conv.'];
  const cWidths = [200, 75, 95, 60, 55];

  let cY = 605;
  let cX = 55;

  doc.roundedRect(55, cY, 485, 24, 7).fill(THEME.violet);

  cHeaders.forEach((h, i) => {
    doc.fillColor('#FFFFFF')
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(h, cX + 8, cY + 8, { width: cWidths[i] - 10 });
    cX += cWidths[i];
  });

  cY += 28;

  campaigns.slice(0, 3).forEach((row, idx) => {
    const bg = idx % 2 === 0 ? '#F8FAFC' : '#F5F3FF';
    doc.roundedRect(55, cY, 485, 22, 5).fill(bg);

    const vals = [
      (row.name || 'Unknown').substring(0, 30),
      (row.platform || 'Other').toUpperCase(),
      formatCurrency(row.spend, currency),
      Number(row.clicks || 0) > 0
       ? formatNum(row.clicks)
       : 'N/A',
      formatNum(row.conversions),
    ];

    cX = 55;
    vals.forEach((v, i) => {
      doc.fillColor(THEME.text)
        .fontSize(7.2)
        .font('Helvetica')
        .text(v, cX + 8, cY + 7, { width: cWidths[i] - 10 });
      cX += cWidths[i];
    });

    cY += 22;
  });
}
else {
drawEmptyState(
  35,
  545,
  525,
  135,
  'Campaign-Level Export Not Included',
  'This upload contains aggregate data only. To unlock campaign ranking, campaign spend comparison and campaign-wise lead analysis, export the report with individual campaign rows.'
);
}


drawFooter(pageNo++);
// ===============================
// PAGE 3 - CHARTS
// ===============================



  doc.addPage();

  doc.rect(0, 0, pageW, pageH).fill(THEME.bg);
  doc.rect(0, 0, pageW, 95).fill(THEME.navy);

  doc.fillColor('#FFFFFF')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('Charts & Campaign Analytics', 50, 34);

  doc.fillColor('#CBD5E1')
    .fontSize(9)
    .font('Helvetica')
    .text('Visual analysis of spend and campaign performance', 50, 62);

  if (hasTrendChart) {
    drawCard(35, 120, 525, 220, THEME.card, THEME.border);

    drawLineChart(
      doc,
      trends,
      {
        x: 55,
        y: 145,
        width: 480,
        height: 160,
        title: 'Monthly Spend Trend',
        labelKey: 'month',
        valueKey: 'spend',
        color: THEME.royal,
      },
      currency
    );
  }
  else {
    drawEmptyState(
      35,
      120,
      525,
      220,
      'Trend Analysis Not Available',
      'At least two reporting periods are required to generate a monthly trend chart.'
    );
  }

  if (hasCampaignChart) {
    drawCard(35, hasTrendChart ? 375 : 120, 525, 315, THEME.card, THEME.border);

    drawBarChart(
      doc,
      campaigns,
      {
        x: 55,
        y: hasTrendChart ? 400 : 145,
        width: 480,
       title: 'Campaign Efficiency Ranking',
       valueKey: 'efficiency',
       labelKey: 'name',

        color: THEME.violet,
      },
      currency
    );
  }
  else {
    drawEmptyState(
      35,
      375,
      525,
      315,
      'Campaign Chart Not Available',
      'Campaign-level data was not available in this upload. Export campaign-level rows to unlock campaign comparison charts.'
    );
  }

drawFooter(pageNo++);

// ===============================
// PAGE 4 - PLATFORM ANALYTICS
// ===============================

doc.addPage();
doc.rect(0, 0, pageW, pageH).fill(THEME.bg);

doc.rect(0, 0, pageW, 95).fill(THEME.navy);

doc.fillColor('#FFFFFF')
  .fontSize(22)
  .font('Helvetica-Bold')
  .text('Platform Analytics', 50, 34);

doc.fillColor('#CBD5E1')
  .fontSize(9)
  .font('Helvetica')
  .text('Platform-wise spend distribution and leads performance', 50, 62);

const activePlatforms = platforms.filter(
  (p) => Number(p.spend || 0) > 0
);
const topPlatform =
  activePlatforms.length > 0
    ? activePlatforms.reduce((best, current) =>
        Number(current.conversions || 0) > Number(best.conversions || 0)
          ? current
          : best
      )
    : null;

if (activePlatforms.length > 1) {
  drawCard(35, 120, 525, 240, THEME.card, THEME.border);

  drawPieChart(
    doc,
    activePlatforms,
    {
      x: 175,
      y: 245,
      radius: 65,
      title: 'Platform Spend Distribution',
    },
    currency
  );

if (topPlatform) {
  const topPlatformCpl =
    Number(topPlatform.conversions || 0) > 0
      ? Number(topPlatform.spend || 0) / Number(topPlatform.conversions || 0)
      : 0;

  drawCard(35, 375, 525, 55, THEME.softBlue, '#BFDBFE');

  doc.fillColor(THEME.royal)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('BEST PERFORMING PLATFORM', 55, 390);

  doc.fillColor(THEME.text)
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(
      `${String(topPlatform.platform || 'Platform').toUpperCase()} generated ${formatNum(topPlatform.conversions)} leads at ${formatCurrency(topPlatformCpl, currency)} cost/lead.`,
      55,
      407,
      { width: 485 }
    );
}

 drawCard(35, 445, 525, 210, THEME.softGreen, '#A7F3D0');

  drawNumberBarChart(
    doc,
    activePlatforms,
    {
      x: 55,
      y: 460,
      width: 480,
      title: 'Platform-wise Leads',
      labelKey: 'platform',
      valueKey: 'conversions',
      color: THEME.emerald,
    }
  );
} else if (activePlatforms.length === 1) {
   const onlyPlatform = activePlatforms[0];

   drawEmptyState(
     35,
     125,
     525,
     145,
     'Single Platform Performance',
     `${String(onlyPlatform.platform || 'Platform').toUpperCase()} is the only tracked platform in this report. Since there is no second platform to compare, this page focuses on spend, leads and cost efficiency.`
   );

   drawMiniMetricCards(
     [
       {
         label: 'Platform',
         value: String(onlyPlatform.platform || 'Meta').toUpperCase(),
         color: THEME.royal,
         bg: THEME.softBlue,
       },
       {
         label: 'Spend',
         value: formatCurrency(onlyPlatform.spend, currency),
         color: THEME.violet,
         bg: THEME.softPurple,
       },
       {
         label: 'Leads',
         value: formatNum(onlyPlatform.conversions),
         color: THEME.emerald,
         bg: THEME.softGreen,
       },
       {
         label: 'Share',
         value: '100%',
         color: THEME.amber,
         bg: THEME.softAmber,
       },
       {
         label: 'Cost/Lead',
         value: formatCurrency(
           Number(onlyPlatform.spend || 0) /
             Math.max(Number(onlyPlatform.conversions || 0), 1),
           currency
         ),
         color: THEME.rose,
         bg: THEME.softRose,
       },
     ],
     35,
     305
   );

   drawCard(35, 420, 525, 230, THEME.softGreen, '#A7F3D0');

   drawNumberBarChart(
     doc,
     activePlatforms,
     {
       x: 55,
       y: 440,
       width: 480,
       title: 'Platform-wise Leads',
       labelKey: 'platform',
       valueKey: 'conversions',
       color: THEME.emerald,
     }
   );
 }else {
  drawEmptyState(
    35,
    150,
    525,
    220,
    'No Platform Data Available',
    'The uploaded report does not contain platform-level spend or result data.'
  );
}

drawFooter(pageNo++);

// ===============================
// PAGE 5 - INSIGHTS
// ===============================

doc.addPage();

doc.rect(0, 0, pageW, pageH).fill(THEME.bg);

doc.rect(0, 0, pageW, 95).fill(THEME.navy);

doc.fillColor('#FFFFFF')
  .fontSize(22)
  .font('Helvetica-Bold')
  .text('Insights & Recommendations', 50, 34);

doc.fillColor('#CBD5E1')
  .fontSize(9)
  .font('Helvetica')
  .text('Business-oriented observations and next actions', 50, 62);

  let availableFields = 0;

  if (safeSummary.spend > 0) availableFields++;
  if (safeSummary.reach > 0) availableFields++;
  if (safeSummary.impressions > 0) availableFields++;
  if (safeSummary.clicks > 0) availableFields++;
  if (safeSummary.conversions > 0) availableFields++;
  if (safeSummary.revenue > 0) availableFields++;

  const completenessScore =
    Math.round((availableFields / 6) * 100);

// Insight stat cards
const insightCards = [
  {
    title: 'Total Spend',
    value: formatCurrency(safeSummary.spend, currency),
    desc: 'Total advertising budget used in the selected period.',
    bg: THEME.softBlue,
    color: THEME.royal,
  },
  {
    title: 'Lead Volume',
    value: formatNum(safeSummary.conversions),
    desc: 'Total leads/results generated from active campaigns.',
    bg: THEME.softGreen,
    color: THEME.emerald,
  },
  {
    title: 'Cost per Lead',
    value: formatCurrency(safeSummary.cpa, currency),
    desc: 'Average cost required to generate one lead/result.',
    bg: THEME.softAmber,
    color: THEME.amber,
  },
  {
    title: 'Data Quality',
    value: `${completenessScore}%`,
    desc: 'Completeness of uploaded report metrics.',
    bg: THEME.softPurple,
    color: THEME.violet,
  },
];

insightCards.forEach((card, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);

  const x = 35 + col * 270;
  const y = 125 + row * 115;

  drawCard(x, y, 250, 95, card.bg, THEME.border);

  doc.circle(x + 20, y + 22, 6).fill(card.color);

  doc.fillColor(THEME.muted)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text(card.title.toUpperCase(), x + 35, y + 17, { width: 190 });

  doc.fillColor(THEME.text)
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(card.value, x + 18, y + 42, { width: 210 });

  doc.fillColor(THEME.muted)
    .fontSize(7.5)
    .font('Helvetica')
    .text(card.desc, x + 18, y + 67, {
      width: 210,
      lineGap: 2,
    });
});

// AI Summary
drawCard(35, 360, 525, 120, THEME.card, THEME.border);

doc.fillColor(THEME.text)
  .fontSize(16)
  .font('Helvetica-Bold')
  .text('Executive Marketing Summary', 55, 380);

doc.fillColor(THEME.muted)
  .fontSize(9)
  .font('Helvetica')
  .text(
    reportSummaryText,
    55,
    410,
    {
      width: 485,
      lineGap: 4,
    }
  );

// Observations
drawCard(35, 505, 250, 230, THEME.card, THEME.border);

doc.fillColor(THEME.text)
  .fontSize(15)
  .font('Helvetica-Bold')
 .text('Key Observations', 55, 525);

const spendTrend =
  growth?.spend
    ? `Advertising spend changed by ${growth.spend} versus the previous reporting period.`
    : 'Previous spend comparison was unavailable.';

const leadTrend =
  growth?.conversions
    ? `Lead volume changed by ${growth.conversions} compared with the previous reporting period.`
    : 'Previous lead comparison was unavailable.';

const observations = [
  `Campaigns generated ${formatNum(safeSummary.conversions)} leads/results with total spend of ${formatCurrency(safeSummary.spend, currency)}.`,
  safeSummary.reach > 0 || safeSummary.impressions > 0
    ? `Reach was ${safeSummary.reach > 0 ? formatNum(safeSummary.reach) : 'not provided'} and impressions were ${safeSummary.hasImpressions ? formatNum(safeSummary.impressions) : 'not provided'}.`
    : 'Reach and impression data were not available in the uploaded report.',
  spendTrend,
  leadTrend,
  safeSummary.hasClicks
    ? `CTR is ${formatPct(safeSummary.ctr)}, based on ${formatNum(safeSummary.clicks)} clicks.`
    : 'Click and CTR data were not available, so engagement rate cannot be evaluated from this upload.',
];



observations.forEach((text, i) => {
  const y = 558 + i * 32;

  doc.circle(60, y + 5, 7).fill(THEME.royal);

  doc.fillColor('#FFFFFF')
    .fontSize(7)
    .font('Helvetica-Bold')
    .text(String(i + 1), 57, y + 1);

  doc.fillColor(THEME.text)
    .fontSize(8.5)
    .font('Helvetica')
    .text(text, 78, y, {
      width: 180,
      lineGap: 3,
    });
});

// Recommendations
drawCard(310, 505, 250, 230, THEME.card, THEME.border);

doc.fillColor(THEME.text)
  .fontSize(15)
  .font('Helvetica-Bold')
  .text('Recommended Actions', 330, 525);

let recommendations = [];

if (safeSummary.cpa > 0) {
  recommendations.push(
    `The current cost per lead is ${formatCurrency(safeSummary.cpa, currency)}. Continue monitoring lead quality before increasing budget.`
  );
}

if (safeSummary.hasRevenue && safeSummary.roas >= 1) {
  recommendations.push(
    `ROAS is ${formatNum(safeSummary.roas, 2)}x, meaning tracked revenue is slightly higher than ad spend. Improve conversion quality before scaling aggressively.`
  );
}

if (!safeSummary.hasClicks) {
  recommendations.push(
    'Add click metrics in future exports to evaluate CTR, CPC and engagement quality.'
  );
}

if (!safeSummary.hasRevenue) {
  recommendations.push(
    'Add revenue, purchase value or ROAS columns to measure return on ad spend accurately.'
  );
}

if (activePlatforms.length === 1) {
  recommendations.push(
    `${String(activePlatforms[0].platform || 'Platform').toUpperCase()} generated all tracked results in this report. Test another platform only after current CPL and lead quality are stable.`
  );
}

if (!hasCampaignChart) {
  recommendations.push(
    'Use campaign-level export data in the next upload to identify top and low-performing campaigns.'
  );
}

while (recommendations.length < 5) {
  recommendations.push(
    'Continue monitoring campaign performance and optimize based on lead quality.'
  );
}

recommendations = [...new Set(recommendations)].slice(0, 5);

recommendations.slice(0, 5).forEach((text, i) => {
  const y = 558 + i * 32;

  doc.circle(335, y + 5, 5).fill(THEME.emerald);

  doc.fillColor(THEME.text)
    .fontSize(8.2)
    .font('Helvetica')
    .text(text, 350, y, {
      width: 180,
      lineGap: 3,
    });
});
drawFooter(pageNo++);
// ===============================
// PREMIUM REPORT DESIGN END
// ===============================



    doc.end();

    writeStream.on('finish', async () => {
      const BASE_URL = "https://marketing-report-generator-p9wj.onrender.com";
      const fileUrl = `${BASE_URL}/data/reports/${fileName}`;
      // Save report record
      await db.query(
        `INSERT INTO generated_reports (client_id, agency_id, created_by, title, date_range_start, date_range_end, file_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [clientId, req.user.agency_id, req.user.id,
         customTitle || title || `Report - ${client.name}`,
         dateStart || new Date(), dateEnd || new Date(), fileUrl]
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
      `SELECT * FROM generated_reports
       WHERE id = $1 AND agency_id = $2`,
      [reportId, req.user.agency_id]
    );

    const report = reportResult.rows[0];

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await db.query(
      `DELETE FROM generated_reports
       WHERE id = $1 AND agency_id = $2`,
      [reportId, req.user.agency_id]
    );

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
