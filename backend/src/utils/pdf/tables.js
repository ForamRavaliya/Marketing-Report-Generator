// Table drawing helpers: monthly summary table, month-over-month comparison
// table, and the paginated campaign table. Formatting (currency/number/pct)
// is always supplied by the caller via each column's `value()` function --
// this file only lays out rows/columns, it never computes metric values.

const { drawCard, drawSectionTitle } = require('./components');
const { pickReadableTextColor } = require('./theme');

const fitWidths = (columns, totalWidth, weightKey = 'width') => {
  const baseTotal = columns.reduce((sum, column) => sum + Number(column[weightKey] || 0), 0) || totalWidth;
  let used = 0;
  return columns.map((column, index) => {
    const width = index === columns.length - 1
      ? totalWidth - used
      : Math.round((Number(column[weightKey] || 0) / baseTotal) * totalWidth);
    used += width;
    return width;
  });
};

// Simple header+striped-rows table used for the Monthly Summary table.
const drawSimpleTable = (doc, theme, { x, y, width, headerColor, columns, rows, emptyMessage }) => {
  const widths = fitWidths(columns, width);
  let cursorY = y;

  doc.roundedRect(x, cursorY, width, 24, 7).fill(headerColor);
  let cursorX = x;
  columns.forEach((column, i) => {
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(column.label, cursorX + 8, cursorY + 8, {
      width: widths[i] - 10,
      ellipsis: true,
    });
    cursorX += widths[i];
  });

  cursorY += 28;

  if (!rows.length) {
    doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text(emptyMessage, x, cursorY + 20, { width, align: 'center' });
    return cursorY + 60;
  }

  const [stripeA, stripeB] = theme.tableStripe || ['#F8FAFC', '#EEF2FF'];
  rows.forEach((row, idx) => {
    doc.roundedRect(x, cursorY, width, 24, 5).fill(idx % 2 === 0 ? stripeA : stripeB);
    cursorX = x;
    columns.forEach((column, i) => {
      doc.fillColor(theme.text).fontSize(8).font('Helvetica').text(column.value(row), cursorX + 8, cursorY + 8, {
        width: widths[i] - 10,
        ellipsis: true,
      });
      cursorX += widths[i];
    });
    cursorY += 26;
  });

  return cursorY;
};

// Month-over-Month comparison table -- same shape as drawSimpleTable but
// the "Change" column renders a colored pill instead of plain text.
const drawComparisonTable = (doc, theme, { x, y, width, headerColor, rows, getBadgeColor, getBadgeBg }) => {
  const columns = [
    { label: 'Metric', weight: 145 },
    { label: 'Previous Month', weight: 115 },
    { label: 'Current Month', weight: 115 },
    { label: 'Change', weight: 110 },
  ];
  const widths = fitWidths(columns, width, 'weight');
  let cursorY = y;

  doc.roundedRect(x, cursorY, width, 22, 7).fill(headerColor);
  let cursorX = x;
  columns.forEach((column, i) => {
    doc.fillColor('#FFFFFF').fontSize(7.3).font('Helvetica-Bold').text(column.label, cursorX + 8, cursorY + 7, {
      width: widths[i] - 10,
      ellipsis: true,
    });
    cursorX += widths[i];
  });

  cursorY += 25;

  const [compStripeA, compStripeB] = theme.comparisonStripe || ['#FFFFFF', '#ECFDF5'];
  rows.forEach((row, idx) => {
    doc.roundedRect(x, cursorY, width, 14, 4).fill(idx % 2 === 0 ? compStripeA : compStripeB);

    const vals = [row.label, row.previousText, row.currentText];
    cursorX = x;
    vals.forEach((v, i) => {
      doc.fillColor(theme.text).fontSize(6.6).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').text(v, cursorX + 8, cursorY + 4, {
        width: widths[i] - 10,
        height: 8,
        ellipsis: true,
      });
      cursorX += widths[i];
    });

    const badgeColor = row.change ? getBadgeColor(row.key, row.change) : theme.muted;
    const badgeBg = row.change ? getBadgeBg(row.key, row.change) : '#F1F5F9';
    doc.roundedRect(cursorX + 8, cursorY + 2, 82, 10, 5).fill(badgeBg);
    doc.fillColor(badgeColor).fontSize(6.2).font('Helvetica-Bold').text(row.change ? row.change.shortText : 'N/A', cursorX + 12, cursorY + 4, {
      width: 74,
      height: 7,
      align: 'center',
      ellipsis: true,
    });

    cursorY += 15;
  });

  return cursorY;
};

// Header row for the campaign table -- reused on every continuation page.
const drawCampaignTableHeader = (doc, theme, columns, widths, tableX, tableY, tableWidth, headerH) => {
  const headerAccent = theme.tableHeaderAccent || theme.violet;
  const headerText = pickReadableTextColor(headerAccent);
  doc.roundedRect(tableX, tableY, tableWidth, headerH, 7).fill(headerAccent);
  let x = tableX;
  columns.forEach((column, i) => {
    const cellPadX = 6;
    const header = column.shortLabel && doc.widthOfString(column.label) > widths[i] - (cellPadX * 2)
      ? column.shortLabel
      : column.label;
    doc.fillColor(headerText).fontSize(6.3).font('Helvetica-Bold').text(header, x + cellPadX, tableY + headerH / 2 - 4, {
      width: widths[i] - (cellPadX * 2),
      height: 11,
      align: column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : 'left',
      ellipsis: true,
    });
    x += widths[i];
  });
};

// Paginates and draws the campaign table across as many pages as needed.
// HEADER_BODY_GAP is applied to both the first row's rectangle and its text
// -- not just extra header padding -- so the visible gap between the
// violet header and the first data row is real, measured PDF space.
const HEADER_BODY_GAP = 12;

const drawCampaignTablePages = (doc, pageFlow, theme, { columns, rows, pageTitle, subtitleFirst, subtitleContinued, clientName, dateLabel }) => {
  const tableX = 35;
  const tableW = 525;
  const widths = fitWidths(columns, tableW, 'weight');
  const cardX = 25;
  const cardY = 120;
  const cardW = 545;
  const cardBottomPadding = 16;
  const headerY = 145;
  const headerH = 26;
  const headerBottomY = headerY + headerH;
  const firstRowTopY = headerBottomY + HEADER_BODY_GAP;
  const bottomY = 725;
  const cellPadX = 6;
  const nameColumnIndex = columns.findIndex((column) => column.key === 'name');

  if (process.env.PDF_DEBUG_LAYOUT === 'true') {
    // eslint-disable-next-line no-console
    console.log('[campaign table] headerBottomY=%d firstRowTopY=%d gap=%d', headerBottomY, firstRowTopY, firstRowTopY - headerBottomY);
  }

  const getRowHeight = (row) => {
    const nameValue = String(columns[nameColumnIndex]?.value(row) || '');
    const nameWidth = Math.max(40, widths[nameColumnIndex] - (cellPadX * 2));
    doc.font('Helvetica-Bold').fontSize(7.2);
    const nameHeight = doc.heightOfString(nameValue, { width: nameWidth, lineGap: 1 });
    return Math.min(bottomY - firstRowTopY, Math.max(31, Math.ceil(nameHeight) + 16));
  };

  if (!rows.length) {
    pageFlow.newPage(pageTitle, `${subtitleFirst}`);
    drawCard(doc, theme, cardX, cardY, cardW, 145);
    drawSectionTitle(doc, theme, 'Campaign Table', 45, 130, { color: theme.violet });
    doc.fillColor(theme.muted).fontSize(9).font('Helvetica').text('No campaign-level rows were available.', 55, 210, {
      width: 480,
      align: 'center',
    });
    return;
  }

  const pages = [];
  let pageRows = [];
  let pageY = firstRowTopY;
  rows.forEach((row) => {
    const rowH = getRowHeight(row);
    if (pageRows.length && pageY + rowH > bottomY) {
      pages.push(pageRows);
      pageRows = [];
      pageY = firstRowTopY;
    }
    pageRows.push({ row, rowH });
    pageY += rowH;
  });
  if (pageRows.length) pages.push(pageRows);

  let rowIndex = 0;
  pages.forEach((rowsForPage, pageIndex) => {
    const rowsHeight = rowsForPage.reduce((sum, item) => sum + item.rowH, 0);
    const cardH = Math.min(bottomY - cardY + 8, Math.max(108, firstRowTopY + rowsHeight - cardY + cardBottomPadding));

    pageFlow.newPage(pageTitle, pageIndex === 0 ? subtitleFirst : subtitleContinued);
    drawCard(doc, theme, cardX, cardY, cardW, cardH);
    drawSectionTitle(doc, theme, pageIndex === 0 ? 'Campaign Table' : 'Campaign Table (continued)', 45, 130, { color: theme.violet });
    drawCampaignTableHeader(doc, theme, columns, widths, tableX, headerY, tableW, headerH);

    const [campaignStripeA, campaignStripeB] = theme.campaignStripe || ['#F8FAFC', '#F5F3FF'];
    let y = firstRowTopY;
    rowsForPage.forEach(({ row, rowH }) => {
      const rowFillH = Math.max(24, rowH - 3);
      doc.roundedRect(tableX, y, tableW, rowFillH, 4).fill(rowIndex % 2 === 0 ? campaignStripeA : campaignStripeB);

      let x = tableX;
      columns.forEach((column, i) => {
        const value = column.value(row);
        const isName = column.key === 'name';
        const valueText = String(value);
        const fontSize = isName ? 7.2 : valueText.length > 14 ? 5.2 : valueText.length > 11 ? 5.6 : 6.1;
        const textWidth = widths[i] - (cellPadX * 2);
        const textHeight = isName
          ? rowH - 12
          : Math.min(rowH - 10, doc.font('Helvetica').fontSize(fontSize).heightOfString(valueText, { width: textWidth }));

        doc.fillColor(theme.text).fontSize(fontSize).font(isName ? 'Helvetica-Bold' : 'Helvetica').text(
          valueText,
          x + cellPadX,
          isName ? y + 7 : y + Math.max(6, (rowH - textHeight) / 2),
          {
            width: textWidth,
            height: isName ? rowH - 12 : textHeight,
            align: column.align || 'left',
            lineGap: isName ? 1 : 0,
            ellipsis: false,
          }
        );
        x += widths[i];
      });

      y += rowH;
      rowIndex += 1;
    });
  });
};

module.exports = {
  fitWidths,
  drawSimpleTable,
  drawComparisonTable,
  drawCampaignTableHeader,
  drawCampaignTablePages,
  HEADER_BODY_GAP,
};
