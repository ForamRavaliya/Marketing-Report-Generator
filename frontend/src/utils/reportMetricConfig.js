export const REPORT_TYPES = {
  SALES_CAMPAIGN: 'sales_campaign',
  LEAD_GENERATION: 'lead_generation',
  SALES_DATA: 'sales_data',
  NEEDS_REVIEW: 'needs_review',
};

export const getReportMetricConfig = (reportType = REPORT_TYPES.NEEDS_REVIEW) => {
  switch (reportType) {
    case REPORT_TYPES.SALES_CAMPAIGN:
      return {
        title: 'Sales Campaign Report',
        primaryMetricLabel: 'Purchases',
        costMetricLabel: 'Cost Per Purchase',
        revenueLabel: 'Revenue',
        roasLabel: 'ROAS',
        overviewCards: ['spend', 'impressions', 'clicks', 'conversions', 'ctr', 'cpc', 'cpa', 'revenue', 'roas'],
        labels: {
          spend: 'Total Spend',
          impressions: 'Impressions',
          clicks: 'Clicks',
          conversions: 'Purchases',
          ctr: 'CTR',
          cpc: 'CPC',
          cpa: 'Cost Per Purchase',
          revenue: 'Revenue',
          roas: 'ROAS',
        },
      };

    case REPORT_TYPES.LEAD_GENERATION:
      return {
        title: 'Lead Generation Report',
        primaryMetricLabel: 'Leads',
        costMetricLabel: 'Cost Per Lead',
        revenueLabel: 'Revenue',
        roasLabel: 'ROAS',
        overviewCards: ['spend', 'conversions', 'cpa', 'ctr', 'cpc', 'clicks', 'impressions'],
        labels: {
          spend: 'Total Spend',
          conversions: 'Leads',
          cpa: 'Cost Per Lead',
          ctr: 'CTR',
          cpc: 'CPC',
          clicks: 'Clicks',
          impressions: 'Impressions',
          revenue: 'Revenue',
          roas: 'ROAS',
        },
      };

    case REPORT_TYPES.SALES_DATA:
      return {
        title: 'Sales Data Report',
        primaryMetricLabel: 'Orders',
        costMetricLabel: 'Average Order Value',
        revenueLabel: 'Revenue',
        roasLabel: 'Margin',
        overviewCards: ['revenue', 'orders', 'profit', 'aov', 'margin', 'quantity', 'refunds'],
        labels: {
          revenue: 'Revenue',
          orders: 'Orders',
          profit: 'Profit',
          aov: 'Average Order Value',
          margin: 'Margin',
          quantity: 'Quantity Sold',
          refunds: 'Refunds',
          conversions: 'Orders',
          cpa: 'Average Order Value',
        },
      };

    default:
      return {
        title: 'Performance Report',
        primaryMetricLabel: 'Results',
        costMetricLabel: 'Cost Per Result',
        revenueLabel: 'Revenue',
        roasLabel: 'ROAS',
        overviewCards: ['spend', 'impressions', 'clicks', 'conversions', 'ctr', 'cpc', 'cpa', 'revenue', 'roas'],
        labels: {
          spend: 'Total Spend',
          impressions: 'Impressions',
          clicks: 'Clicks',
          conversions: 'Results',
          ctr: 'CTR',
          cpc: 'CPC',
          cpa: 'Cost Per Result',
          revenue: 'Revenue',
          roas: 'ROAS',
        },
      };
  }
};

export const getMetricFormatter = (key, helpers) => {
  const { fmt, fmtCur, fmtPct } = helpers;

  if (['spend', 'revenue', 'cpc', 'cpa', 'aov', 'profit', 'refunds'].includes(key)) {
    return fmtCur;
  }

  if (['ctr', 'margin'].includes(key)) {
    return fmtPct;
  }

  if (key === 'roas') {
    return (value) => `${fmt(value, 2)}x`;
  }

  return fmt;
};

export const isCostMetric = (key) =>
  ['cpa', 'cpc', 'aov', 'refunds'].includes(key);

export const isPositiveChange = (key, change) => {
  const numericChange = Number(change || 0);

  if (numericChange === 0) return null;

  if (isCostMetric(key)) {
    return numericChange < 0;
  }

  return numericChange > 0;
};