// Chart drawing helpers. These never format currency/numbers themselves --
// callers pass a `formatValue` function using the report's existing
// formatCurrency/formatNum utilities, so number/currency formatting logic
// stays single-sourced in reports.js and is never duplicated or re-derived
// here.

const identityFormat = (v) => String(v ?? '');

const drawLineChart = (doc, theme, rows, options) => {
  const {
    x,
    y,
    width,
    height = 180,
    title,
    labelKey,
    valueKey,
    color = theme.royal,
    formatValue = identityFormat,
  } = options;

  doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(title, x, y);

  const values = rows.map((r) => Number(r[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);

  const chartTop = y + 34;
  const chartBottom = y + height - 35;
  const chartHeight = chartBottom - chartTop;

  const innerPadX = 30;
  const plotX = x + innerPadX;
  const plotWidth = width - innerPadX * 2;
  const stepX = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth;

  doc.moveTo(plotX, chartBottom).lineTo(plotX + plotWidth, chartBottom).strokeColor(theme.border).lineWidth(1).stroke();
  doc.moveTo(plotX, chartTop).lineTo(plotX, chartBottom).strokeColor(theme.border).lineWidth(1).stroke();

  let previousPoint = null;

  rows.forEach((row, i) => {
    const value = Number(row[valueKey] || 0);
    const range = Math.max(maxValue - minValue, 1);

    const px = plotX + i * stepX;
    const py = Math.max(chartTop + 18, chartBottom - ((value - minValue) / range) * chartHeight);
    const valueText = formatValue(value);
    const valueFont = valueText.length > 14 ? 6 : valueText.length > 11 ? 6.4 : 7;

    if (previousPoint) {
      doc.moveTo(previousPoint.x, previousPoint.y).lineTo(px, py).strokeColor(color).lineWidth(2.2).stroke();
    }
    doc.circle(px, py, 4).fill(color);

    let labelX = px - 45;
    let labelAlign = 'center';
    if (i === 0) {
      labelX = Math.max(plotX, px - 20);
      labelAlign = 'left';
    } else if (i === rows.length - 1) {
      labelX = px - 95;
      labelAlign = 'right';
    }
    const labelY = Math.max(chartTop + 4, Math.min(chartBottom - 24, py - 22));

    doc.fillColor(theme.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, labelX, labelY, {
      width: 90,
      height: 12,
      align: labelAlign,
      ellipsis: true,
    });

    doc.fillColor(theme.muted).fontSize(6.8).font('Helvetica').text(String(row[labelKey] || ''), px - 30, chartBottom + 10, {
      width: 60,
      height: 14,
      align: 'center',
      ellipsis: true,
    });

    previousPoint = { x: px, y: py };
  });
};

const drawBarChart = (doc, theme, rows, options) => {
  const { x, y, width, title, valueKey, labelKey, color = theme.violet, formatValue = identityFormat } = options;
  const chartRows = rows.slice().sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)).slice(0, 6);
  const values = chartRows.map((r) => Number(r[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const labelW = 170;
  const valueW = 120;
  const barX = x + labelW + 8;
  const barW = width - labelW - valueW - 20;
  const rowH = 30;

  doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(title, x, y - 5);
  chartRows.forEach((row, i) => {
    const value = Number(row[valueKey] || 0);
    const by = y + 25 + i * rowH;
    const bw = value > 0 ? Math.max(2, (value / maxValue) * barW) : 0;

    doc.fillColor(theme.text).fontSize(7.2).font('Helvetica').text(String(row[labelKey] || 'Campaign'), x, by - 1, {
      width: labelW,
      height: 20,
      ellipsis: true,
    });
    doc.roundedRect(barX, by, barW, 12, 4).fill(theme.border);
    if (bw > 0) doc.roundedRect(barX, by, bw, 12, 4).fill(color);

    const valueText = formatValue(value);
    const valueFont = valueText.length > 18 ? 5.8 : valueText.length > 14 ? 6.3 : 7;
    doc.fillColor(theme.text).font('Helvetica-Bold').fontSize(valueFont).text(valueText, barX + barW + 8, by - 1, {
      width: valueW,
      height: 16,
      ellipsis: true,
    });
  });
};

const drawNumberBarChart = (doc, theme, rows, options) => {
  const {
    x, y, width, title, valueKey, labelKey,
    color = theme.emerald, sortByValue = false, maxRows = 6,
    formatValue = identityFormat,
  } = options;
  const chartRows = (sortByValue ? rows.slice().sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)) : rows.slice()).slice(0, maxRows);
  const values = chartRows.map((r) => Number(r[valueKey] || 0));
  const maxValue = Math.max(...values, 1);
  const chartHeight = 170;
  const barGap = 14;
  const barWidth = Math.max(30, (width - barGap * (chartRows.length - 1)) / Math.max(chartRows.length, 1));
  const chartBottom = y + chartHeight;
  const maxBarHeight = 110;

  doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(title, x, y - 5);
  chartRows.forEach((row, i) => {
    const value = Number(row[valueKey] || 0);
    const h = value > 0 ? Math.max(2, (value / maxValue) * maxBarHeight) : 0;
    const bx = x + i * (barWidth + barGap);
    const by = chartBottom - h;

    if (h > 0) doc.roundedRect(bx, by, barWidth, h, 5).fill(color);
    const valueText = formatValue(value);
    const valueFont = valueText.length > 9 ? 6.2 : valueText.length > 6 ? 7 : 8;

    doc.fillColor(theme.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, bx - 4, by - 15, {
      width: barWidth + 8,
      height: 10,
      align: 'center',
      ellipsis: true,
    });
    doc.fillColor(theme.muted).fontSize(6.5).font('Helvetica').text(String(row[labelKey] || ''), bx - 6, chartBottom + 8, {
      width: barWidth + 12,
      height: 14,
      align: 'center',
      ellipsis: true,
    });
  });
};

const drawPieChart = (doc, theme, rows, options) => {
  const { x, y, radius = 60, title, titleX, titleY } = options;
  const activeRows = rows.filter((r) => Number(r.spend || 0) > 0).sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0));
  const topRows = activeRows.length > 6 ? activeRows.slice(0, 5) : activeRows.slice(0, 6);
  const otherSpend = activeRows.length > 6 ? activeRows.slice(5).reduce((sum, r) => sum + Number(r.spend || 0), 0) : 0;
  const chartRows = otherSpend > 0 ? [...topRows, { platform: 'Other platforms', spend: otherSpend }] : topRows;
  const total = chartRows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
  const colors = theme.chartPalette || [theme.royal, theme.violet, theme.emerald, theme.amber, theme.rose, theme.cyan];

  doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(title, titleX ?? Math.max(55, x - radius - 120), titleY ?? y - radius - 40, {
    width: 480,
    height: 16,
    ellipsis: true,
  });

  if (total <= 0) {
    doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text('No spend data available for this chart.', x - radius, y);
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
    doc.fillColor(theme.text).fontSize(7.5).font('Helvetica').text(
      `${String(row.platform || 'Platform').toUpperCase()} - ${share.toFixed(1)}%`,
      x + 118,
      ly - 1,
      { width: 190, height: 12, ellipsis: true }
    );
  });
};

module.exports = { drawLineChart, drawBarChart, drawNumberBarChart, drawPieChart };
