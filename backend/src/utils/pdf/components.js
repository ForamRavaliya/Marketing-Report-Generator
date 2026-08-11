// Reusable visual primitives (cards, KPI cards, badges, logo, star rating,
// empty states). Every function takes `doc` + `theme` explicitly and reads
// only the values passed in -- no closures over report data, so these can
// be reused for any report type/plan.

const { TYPE, SPACING } = require('./theme');

// Soft real drop-shadow using pdfkit's fillOpacity instead of a flat offset
// gray rectangle -- reads as a genuine elevation cue instead of a hard block.
const drawCard = (doc, theme, x, y, w, h, { bg = theme.card, border = theme.border, radius = SPACING.cardRadius } = {}) => {
  doc.save();
  doc.fillOpacity(theme.cardShadowOpacity ?? 0.10);
  doc.roundedRect(x + 1.5, y + 2.5, w, h, radius).fill('#0F172A');
  doc.restore();

  doc.roundedRect(x, y, w, h, radius).fillAndStroke(bg, border);
};

const drawSectionTitle = (doc, theme, title, x, y, { color = theme.royal, subtitle = null } = {}) => {
  doc.fillColor(theme.text).fontSize(TYPE.sectionHeading).font('Helvetica-Bold').text(title, x, y);
  doc.roundedRect(x, y + 22, 46, 4, 2).fill(color);
  if (subtitle) {
    doc.fillColor(theme.muted).fontSize(TYPE.bodySmall).font('Helvetica').text(subtitle, x, y + 30, { width: 480 });
  }
};

const drawEmptyState = (doc, theme, x, y, w, h, title, message) => {
  drawCard(doc, theme, x, y, w, h);
  doc.fillColor(theme.text).fontSize(13).font('Helvetica-Bold').text(title, x + 25, y + Math.max(30, h / 2 - 24), {
    width: w - 50,
    height: 18,
    align: 'center',
    ellipsis: true,
  });
  doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(message, x + 35, y + Math.max(56, h / 2), {
    width: w - 70,
    height: Math.max(20, h - 76),
    align: 'center',
    lineGap: 3,
    ellipsis: true,
  });
};

const drawStarRating = (doc, theme, x, y, score) => {
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
    doc.fillAndStroke(i < filledStars ? theme.amber : '#E2E8F0', i < filledStars ? theme.amber : theme.borderStrong);
    doc.restore();
  }
};

// Small rounded pill (used for plan badges, priority labels, status badges).
const drawBadge = (doc, theme, text, x, y, { width = 90, bg = theme.softBlue, color = theme.royal, fontSize = 7.5 } = {}) => {
  doc.roundedRect(x, y, width, 18, 9).fill(bg);
  doc.fillColor(color).fontSize(fontSize).font('Helvetica-Bold').text(text, x, y + 5, { width, align: 'center' });
};

const drawAgencyLogo = (doc, theme, { x = 50, y = 32, size = 46, logoBuffer, canUseBranding }) => {
  if (!canUseBranding) return;

  try {
    doc.save();
    doc.roundedRect(x, y, size, size, 8).fill('#FFFFFF');

    if (logoBuffer) {
      const inset = 4;
      doc.image(logoBuffer, x + inset, y + inset, {
        fit: [size - inset * 2, size - inset * 2],
        align: 'center',
        valign: 'center',
      });
    } else {
      const cx = x + size / 2;
      const cy = y + size / 2;
      doc.rect(cx - 14, cy - 14, 28, 28).lineWidth(1.5).strokeColor(theme.royal).stroke();
      doc.circle(cx, cy + 6, 6).fill(theme.violet);
    }
    doc.restore();
  } catch (e) {
    console.log('Logo fallback applied:', e.message);
  }
};

// Renders a single KPI card at a fixed box (x, y, w, h). Value font shrinks
// for long strings so nothing clips.
const drawKpiCard = (doc, theme, x, y, w, h, item) => {
  drawCard(doc, theme, x, y, w, h, { bg: item.bg, border: '#DDE6F3' });
  doc.circle(x + 18, y + 18, 8).fill(item.color);

  doc.fillColor(theme.muted).fontSize(TYPE.cardLabel).font('Helvetica-Bold').text(item.label.toUpperCase(), x + 34, y + 12, {
    width: w - 42,
    lineBreak: false,
  });

  const valueText = String(item.value || '');
  const valueFont = valueText.length > 15 ? TYPE.kpiValueSm : valueText.length > 11 ? TYPE.kpiValueMd : TYPE.kpiValueLg;

  doc.fillColor(theme.text).fontSize(valueFont).font('Helvetica-Bold').text(valueText, x + 18, y + 34, {
    width: w - 30,
    height: h - 44,
    ellipsis: true,
  });

  const bottomText = item.growth ? item.growth.shortText : item.note || '';
  if (bottomText) {
    doc.fillColor(item.growth ? theme.royal : theme.muted).fontSize(6.4).font('Helvetica-Bold').text(bottomText, x + 18, y + h - 16, {
      width: w - 30,
      height: 12,
      ellipsis: true,
    });
  }
};

// Dynamic responsive KPI grid supporting 3/4/5/6+ cards without stretching
// or leaving broken gaps: always lays out in rows of up to `maxPerRow`
// (default 3) and centers the last, possibly-shorter row.
const drawKpiGrid = (doc, theme, items, x, y, totalWidth, { maxPerRow = 3, cardHeight = 76, gap = 15 } = {}) => {
  if (!items.length) return y;

  const cardWidth = (totalWidth - gap * (maxPerRow - 1)) / maxPerRow;
  const rows = [];
  for (let i = 0; i < items.length; i += maxPerRow) rows.push(items.slice(i, i + maxPerRow));

  let cursorY = y;
  rows.forEach((row) => {
    const rowWidth = row.length * cardWidth + (row.length - 1) * gap;
    const rowStartX = x + (totalWidth - rowWidth) / 2;

    row.forEach((item, i) => {
      drawKpiCard(doc, theme, rowStartX + i * (cardWidth + gap), cursorY, cardWidth, cardHeight, item);
    });
    cursorY += cardHeight + gap;
  });

  return cursorY - gap;
};

module.exports = {
  drawCard,
  drawSectionTitle,
  drawEmptyState,
  drawStarRating,
  drawBadge,
  drawAgencyLogo,
  drawKpiCard,
  drawKpiGrid,
};
