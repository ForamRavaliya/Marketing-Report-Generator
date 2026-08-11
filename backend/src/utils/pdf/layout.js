// Page-level pagination/header/footer helpers. Factory-based: createPageFlow()
// binds a pdfkit `doc` plus this report's theme/footer text once, then hands
// back plain functions the report builder calls -- no report business data
// (metrics, campaigns, etc.) ever passes through this file.

const { LAYOUT } = require('./theme');

const createPageFlow = (doc, { theme, footerLeftText }) => {
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  let pageNo = 0;
  let currentTitle = '';
  let currentSubtitle = '';

  const drawFooter = () => {
    doc.save();
    doc.moveTo(35, LAYOUT.footerTop).lineTo(pageW - 35, LAYOUT.footerTop).strokeColor(theme.border).lineWidth(1).stroke();
    doc.fillColor(theme.subtle).fontSize(8).font('Helvetica').text(footerLeftText, 35, LAYOUT.footerTop + 10, {
      width: pageW - 130,
      height: 10,
      align: 'left',
      lineBreak: false,
      ellipsis: true,
    });
    doc.roundedRect(pageW - 61, LAYOUT.footerTop + 5, 26, 18, 5).fill(theme.royal);
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text(String(pageNo), pageW - 61, LAYOUT.footerTop + 10, {
      width: 26,
      align: 'center',
      lineBreak: false,
    });
    doc.restore();
  };

  const drawPageHeader = (title, subtitle = '') => {
    currentTitle = title;
    currentSubtitle = subtitle;

    const bandHeight = theme.headerBandHeight ?? 88;
    const bandColor = theme.headerBandColor || theme.navy;
    const titleColor = theme.headerTextColor || '#FFFFFF';
    const subtitleColor = theme.headerSubtitleColor || '#CBD5E1';

    doc.rect(0, 0, pageW, pageH).fill(theme.bg);

    if (bandHeight > 0) {
      if (Array.isArray(theme.headerBandGradient) && theme.headerBandGradient.length === 2) {
        const grad = doc.linearGradient(0, 0, pageW, bandHeight);
        grad.stop(0, theme.headerBandGradient[0]).stop(1, theme.headerBandGradient[1]);
        doc.rect(0, 0, pageW, bandHeight).fill(grad);
      } else {
        doc.rect(0, 0, pageW, bandHeight).fill(bandColor);
      }
    } else {
      // Minimal variant: no filled band -- a plain page with a thin rule
      // under the title instead of a colored header, per its "reduced
      // decorative elements" design intent.
      doc.moveTo(0, 78).lineTo(pageW, 78).strokeColor(theme.border).lineWidth(1).stroke();
    }

    doc.fillColor(titleColor).fontSize(21).font('Helvetica-Bold').text(title, 50, 30, { width: pageW - 100, height: 26, ellipsis: true });
    if (subtitle) {
      doc.fillColor(subtitleColor).fontSize(9.5).font('Helvetica').text(subtitle, 50, 58, { width: pageW - 100, height: 14, ellipsis: true });
    }
    doc.y = LAYOUT.pageContentTop;
  };

  // Starts a fresh page. pdfkit auto-creates page 1 when the PDFDocument is
  // constructed, so the very first call reuses that page instead of calling
  // doc.addPage() (which would otherwise leave a blank leading page).
  const newPage = (title, subtitle = '') => {
    if (pageNo > 0) {
      drawFooter();
      doc.addPage();
    }
    pageNo += 1;
    drawPageHeader(title, subtitle);
  };

  // Claims the auto-created first page for a fully custom cover composition
  // (no standard navy header band) without drawing anything itself. Callers
  // must set currentTitle/currentSubtitle via setContext() if later
  // continuation pages should reference the cover's title.
  const beginCoverPage = () => {
    pageNo = 1;
  };

  const setContext = (title, subtitle = '') => {
    currentTitle = title;
    currentSubtitle = subtitle;
  };

  // Ensures `requiredHeight` of vertical space remains before CONTENT_BOTTOM;
  // if not, closes the current page and opens a "continued" page with the
  // same title. Returns true if a page break happened.
  const ensureSpace = (requiredHeight) => {
    const currentY = Number.isFinite(doc.y) ? doc.y : LAYOUT.pageContentTop;
    if (currentY + requiredHeight <= LAYOUT.contentBottom) return false;

    newPage(currentTitle, currentSubtitle ? `${currentSubtitle} (continued)` : 'Continued');
    return true;
  };

  const finishDocument = () => {
    if (pageNo > 0) drawFooter();
  };

  return {
    get pageW() { return pageW; },
    get pageH() { return pageH; },
    get pageNo() { return pageNo; },
    newPage,
    beginCoverPage,
    setContext,
    ensureSpace,
    drawPageHeader,
    drawFooter,
    finishDocument,
  };
};

module.exports = { createPageFlow };
