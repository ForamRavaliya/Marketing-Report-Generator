export const getMetricLabels = (reportType) => {
  const type = String(reportType || '').toLowerCase();

  if (type === 'sales_campaign') {
    return {
      conversion: 'Purchases',
      cpa: 'Cost Per Purchase',
      cpaShort: 'CPP',
      funnel: 'Purchase Funnel',
      analysis: 'Sales Performance',
      volume: 'Purchase Volume',
    };
  }

  if (type === 'sales_data') {
    return {
      conversion: 'Orders',
      cpa: 'Cost Per Order',
      cpaShort: 'CPO',
      funnel: 'Order Funnel',
      analysis: 'Sales Analysis',
      volume: 'Order Volume',
    };
  }

  return {
    conversion: 'Leads',
    cpa: 'Cost Per Lead',
    cpaShort: 'CPL',
    funnel: 'Lead Funnel',
    analysis: 'Lead Generation',
    volume: 'Lead Volume',
  };
};