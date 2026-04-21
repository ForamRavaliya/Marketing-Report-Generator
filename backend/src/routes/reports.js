const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const formatNum = (n, decimals = 0) => {
  if (n === null || n === undefined) return '0';
  return parseFloat(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatCurrency = (n) => `$${formatNum(n, 2)}`;
const formatPct = (n) => `${formatNum(n, 2)}%`;

// Generate PDF report
router.post('/generate', async (req, res) => {
  try {
    const {
      clientId, title, dateStart, dateEnd, platform,
      includeComparison = true,
      customTitle, agencyBranding = true,
    } = req.body;

    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    // Fetch all data
    const [clientResult, agencyResult] = await Promise.all([
      db.query('SELECT * FROM clients WHERE id=$1', [clientId]),
      db.query('SELECT * FROM agencies WHERE id=$1', [req.user.agency_id]),
    ]);

    const client = clientResult.rows[0];
    const agency = agencyResult.rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Fetch metrics
    let whereClause = 'WHERE pd.client_id = $1';
    const params = [clientId];
    let idx = 2;

    if (dateStart) { whereClause += ` AND pd.report_month >= $${idx++}`; params.push(new Date(dateStart)); }
    if (dateEnd) { whereClause += ` AND pd.report_month <= $${idx++}`; params.push(new Date(dateEnd)); }
    if (platform && platform !== 'all') { whereClause += ` AND pd.platform = $${idx++}`; params.push(platform); }

    const [summaryResult, trendsResult, platformsResult, campaignsResult] = await Promise.all([
      db.query(
        `SELECT SUM(spend) as spend, SUM(impressions) as impressions, SUM(clicks) as clicks,
          SUM(conversions) as conversions, SUM(revenue) as revenue,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as cpc,
          CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END as cpa,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas
         FROM performance_data pd ${whereClause}`,
        params
      ),
      db.query(
        `SELECT TO_CHAR(report_month, 'Mon YYYY') as month, SUM(spend) as spend, 
          SUM(clicks) as clicks, SUM(conversions) as conversions,
          CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas
         FROM performance_data pd ${whereClause} GROUP BY report_month ORDER BY report_month`,
        params
      ),
      db.query(
        `SELECT platform, SUM(spend) as spend, SUM(clicks) as clicks, SUM(conversions) as conversions
         FROM performance_data pd ${whereClause} GROUP BY platform ORDER BY SUM(spend) DESC`,
        params
      ),
      db.query(
        `SELECT c.name, pd.platform, SUM(pd.spend) as spend, SUM(pd.clicks) as clicks, SUM(pd.conversions) as conversions
         FROM performance_data pd JOIN campaigns c ON pd.campaign_id = c.id
         ${whereClause} AND pd.campaign_id IS NOT NULL
         GROUP BY c.name, pd.platform ORDER BY SUM(pd.spend) DESC LIMIT 10`,
        params
      ),
    ]);

    const summary = summaryResult.rows[0];
    const trends = trendsResult.rows;
    const platforms = platformsResult.rows;
    const campaigns = campaignsResult.rows;

    // Create PDF
    const outputDir = path.join(__dirname, '../../data/reports');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const fileName = `report-${clientId}-${Date.now()}.pdf`;
    const filePath = path.join(outputDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const PRIMARY = agency?.primary_color || '#2563EB';
    const SECONDARY = agency?.secondary_color || '#7C3AED';
    const DARK = '#1E293B';
    const GRAY = '#64748B';
    const LIGHT = '#F1F5F9';
    const WHITE = '#FFFFFF';

    // Helper: hex to rgb
    const hexToRgb = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    };

    // Cover page
    doc.rect(0, 0, doc.page.width, 200).fill(PRIMARY);

    if (agencyBranding && agency?.logo_url) {
      const logoPath = path.join(__dirname, '../..', agency.logo_url);
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 20, { height: 40 });
      }
    }

    doc.fillColor(WHITE).fontSize(28).font('Helvetica-Bold')
      .text(customTitle || title || `Performance Report`, 50, 80, { width: 500 });

    doc.fontSize(16).font('Helvetica')
      .text(client.name, 50, 120);

    const dateLabel = dateStart && dateEnd
      ? `${new Date(dateStart).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — ${new Date(dateEnd).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      : `Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    doc.fontSize(12).text(dateLabel, 50, 148);

    // Prepared by
    doc.rect(0, 200, doc.page.width, 30).fill(SECONDARY);
    doc.fillColor(WHITE).fontSize(10)
      .text(`Prepared by ${agency?.name || 'Your Agency'}`, 50, 208);

    doc.moveDown(3);

    // Summary section
    doc.fillColor(DARK).fontSize(18).font('Helvetica-Bold').text('Performance Summary', 50, 260);
    doc.moveTo(50, 282).lineTo(545, 282).stroke(PRIMARY);
    doc.moveDown(0.5);

    const metrics = [
      { label: 'Total Spend', value: formatCurrency(summary?.spend || 0) },
      { label: 'Impressions', value: formatNum(summary?.impressions || 0) },
      { label: 'Clicks', value: formatNum(summary?.clicks || 0) },
      { label: 'CTR', value: formatPct(summary?.ctr || 0) },
      { label: 'CPC', value: formatCurrency(summary?.cpc || 0) },
      { label: 'Conversions', value: formatNum(summary?.conversions || 0) },
      { label: 'CPA', value: formatCurrency(summary?.cpa || 0) },
      { label: 'ROAS', value: `${formatNum(summary?.roas || 0, 2)}x` },
    ];

    const cols = 4;
    const cardW = 116;
    const cardH = 65;
    const startX = 50;
    const startY = 295;
    const gap = 10;

    metrics.forEach((m, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      doc.rect(x, y, cardW, cardH).fill(LIGHT);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(m.label.toUpperCase(), x + 8, y + 10, { width: cardW - 16 });
      doc.fillColor(DARK).fontSize(16).font('Helvetica-Bold').text(m.value, x + 8, y + 28, { width: cardW - 16 });
    });

    // Monthly trends table
    if (trends.length > 0) {
      doc.addPage();
      doc.fillColor(DARK).fontSize(18).font('Helvetica-Bold').text('Monthly Performance Trends', 50, 50);
      doc.moveTo(50, 72).lineTo(545, 72).stroke(PRIMARY);

      const headers = ['Month', 'Spend', 'Clicks', 'Conversions', 'ROAS'];
      const colWidths = [120, 100, 100, 100, 75];
      let tY = 85;

      // Header row
      doc.rect(50, tY, 495, 22).fill(PRIMARY);
      let tX = 50;
      headers.forEach((h, i) => {
        doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
          .text(h, tX + 5, tY + 6, { width: colWidths[i] - 10 });
        tX += colWidths[i];
      });
      tY += 22;

      trends.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? WHITE : LIGHT;
        doc.rect(50, tY, 495, 20).fill(bg);
        const vals = [
          row.month,
          formatCurrency(row.spend),
          formatNum(row.clicks),
          formatNum(row.conversions),
          `${formatNum(row.roas, 2)}x`,
        ];
        tX = 50;
        vals.forEach((v, i) => {
          doc.fillColor(DARK).fontSize(9).font('Helvetica')
            .text(v, tX + 5, tY + 5, { width: colWidths[i] - 10 });
          tX += colWidths[i];
        });
        tY += 20;

        if (tY > 750) { doc.addPage(); tY = 50; }
      });
    }

    // Campaign breakdown
    if (campaigns.length > 0) {
      if (doc.y > 600) doc.addPage();
      const campY = doc.y + 30 > 650 ? 50 : doc.y + 30;
      if (campY === 50) doc.addPage();

      doc.fillColor(DARK).fontSize(18).font('Helvetica-Bold').text('Top Campaigns', 50, campY);
      doc.moveTo(50, campY + 22).lineTo(545, campY + 22).stroke(PRIMARY);

      const cHeaders = ['Campaign', 'Platform', 'Spend', 'Clicks', 'Conv.'];
      const cWidths = [180, 80, 90, 80, 65];
      let cY = campY + 35;

      doc.rect(50, cY, 495, 22).fill(PRIMARY);
      let cX = 50;
      cHeaders.forEach((h, i) => {
        doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold')
          .text(h, cX + 5, cY + 6, { width: cWidths[i] - 10 });
        cX += cWidths[i];
      });
      cY += 22;

      campaigns.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? WHITE : LIGHT;
        doc.rect(50, cY, 495, 20).fill(bg);
        const vals = [
          (row.name || 'Unknown').substring(0, 28),
          (row.platform || 'Other').toUpperCase(),
          formatCurrency(row.spend),
          formatNum(row.clicks),
          formatNum(row.conversions),
        ];
        cX = 50;
        vals.forEach((v, i) => {
          doc.fillColor(DARK).fontSize(8).font('Helvetica')
            .text(v, cX + 5, cY + 5, { width: cWidths[i] - 10 });
          cX += cWidths[i];
        });
        cY += 20;
      });
    }

    // Footer on all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i + 1);
      doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill(LIGHT);
      doc.fillColor(GRAY).fontSize(8)
        .text(`${agency?.name || 'Agency'} | Confidential | Page ${i + 1} of ${pages.count}`,
          50, doc.page.height - 25, { align: 'center', width: doc.page.width - 100 });
    }

    doc.end();

    writeStream.on('finish', async () => {
      const fileUrl = `/data/reports/${fileName}`;

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
