const {
  getSummaryMetrics,
  getMonthlyTrends,
  getCampaignMetrics,
  getPlatformMetrics,
  calculatePercentChange,
  safeNumber,
} = require('../utils/metrics');

const num = (value) => safeNumber(value, 0);

const pct = (value, decimals = 1) => `${Math.abs(num(value)).toFixed(decimals)}%`;
const money = (value) => `INR ${num(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const rate = (value) => `${num(value).toFixed(2)}x`;
const signedDirection = (value) => (num(value) >= 0 ? 'increased' : 'decreased');

const unique = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item) return false;
    const key = String(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const reportLabels = (summary = {}) => {
  const isSales =
    summary.report_type === 'sales_campaign' ||
    summary.report_type === 'sales_data' ||
    (num(summary.revenue) > 0 && num(summary.conversions) > 0);

  return isSales
    ? {
        reportName: 'sales',
        outcome: 'Purchases',
        outcomeLower: 'purchases',
        cost: 'CPP',
        costFull: 'cost per purchase',
      }
    : {
        reportName: 'lead generation',
        outcome: 'Leads',
        outcomeLower: 'leads',
        cost: 'CPL',
        costFull: 'cost per lead',
      };
};

const currentPrevious = (trends = []) => ({
  current: trends.length ? trends[trends.length - 1] : null,
  previous: trends.length > 1 ? trends[trends.length - 2] : null,
});

const explainChange = (metric, current, previous, reasonBuilder) => {
  const change = calculatePercentChange(current, previous);
  if (!change.hasPreviousData || change.value === null) return null;

  return `${metric} ${signedDirection(change.value)} by ${pct(change.value)}. ${reasonBuilder(change.value)}`;
};

const changeObject = (current, previous) => calculatePercentChange(current, previous);

const avg = (rows, key) => {
  const values = rows.map((row) => num(row[key])).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

function generateOverviewInsights({ summary, trends }) {
  const labels = reportLabels(summary);
  const { current, previous } = currentPrevious(trends);
  const insights = [];

  insights.push(
    `${labels.outcome} totaled ${num(summary.conversions).toLocaleString('en-IN')} from ${money(summary.spend)} spend.`
  );

  if (num(summary.revenue) > 0) {
    insights.push(`Revenue totaled ${money(summary.revenue)} and ROAS was ${rate(summary.roas)}.`);
  } else {
    insights.push('Revenue is not available in the imported data, so ROAS is unavailable.');
  }

  if (current && previous) {
    const spendChange = changeObject(current.spend, previous.spend);
    const outcomeChange = changeObject(current.conversions, previous.conversions);

    if (spendChange.hasPreviousData && outcomeChange.hasPreviousData) {
      insights.push(
        `Compared with the previous month, spend ${signedDirection(spendChange.value)} by ${pct(spendChange.value)} while ${labels.outcome.toLowerCase()} ${signedDirection(outcomeChange.value)} by ${pct(outcomeChange.value)}.`
      );
    }
  } else {
    insights.push('No previous month data is available for comparison.');
  }

  return unique(insights);
}

function generateLeadInsights({ summary, trends }) {
  const { current, previous } = currentPrevious(trends);
  if (!current || !previous) return [];

  const spendChange = changeObject(current.spend, previous.spend);
  const leadChange = changeObject(current.conversions, previous.conversions);
  const cplChange = changeObject(current.cpa, previous.cpa);
  const ctrChange = changeObject(current.ctr, previous.ctr);
  const clickChange = changeObject(current.clicks, previous.clicks);
  const impressionChange = changeObject(current.impressions, previous.impressions);

  return unique([
    explainChange('CPL', current.cpa, previous.cpa, () =>
      leadChange.hasPreviousData && spendChange.hasPreviousData
        ? `Leads ${signedDirection(leadChange.value)} by ${pct(leadChange.value)} while spend ${signedDirection(spendChange.value)} by ${pct(spendChange.value)}.`
        : 'This is calculated from imported spend and lead totals.'
    ),
    explainChange('CTR', current.ctr, previous.ctr, () =>
      impressionChange.hasPreviousData && clickChange.hasPreviousData
        ? `Impressions ${signedDirection(impressionChange.value)} by ${pct(impressionChange.value)} while clicks ${signedDirection(clickChange.value)} by ${pct(clickChange.value)}.`
        : 'This is calculated from imported clicks and impressions.'
    ),
    cplChange.hasPreviousData && cplChange.value < 0 && leadChange.hasPreviousData && leadChange.value > 0
      ? 'Lead efficiency improved because lead growth exceeded acquisition cost movement.'
      : null,
  ]);
}

function generateSalesInsights({ summary, trends }) {
  const { current, previous } = currentPrevious(trends);
  const insights = [];

  if (num(summary.revenue) > 0 && num(summary.spend) > 0) {
    const revenueOverSpend = ((num(summary.revenue) - num(summary.spend)) / num(summary.spend)) * 100;
    insights.push(`Revenue exceeded ad spend by ${pct(revenueOverSpend)} with ROAS of ${rate(summary.roas)}.`);
  }

  if (!current || !previous) return insights;

  const spendChange = changeObject(current.spend, previous.spend);
  const revenueChange = changeObject(current.revenue, previous.revenue);
  const purchaseChange = changeObject(current.conversions, previous.conversions);

  insights.push(
    explainChange('ROAS', current.roas, previous.roas, () =>
      revenueChange.hasPreviousData && spendChange.hasPreviousData
        ? `Revenue ${signedDirection(revenueChange.value)} by ${pct(revenueChange.value)} while spend ${signedDirection(spendChange.value)} by ${pct(spendChange.value)}.`
        : 'This is calculated from imported revenue and spend.'
    )
  );

  insights.push(
    explainChange('CPP', current.cpa, previous.cpa, () =>
      purchaseChange.hasPreviousData && spendChange.hasPreviousData
        ? `Purchases ${signedDirection(purchaseChange.value)} by ${pct(purchaseChange.value)} while spend ${signedDirection(spendChange.value)} by ${pct(spendChange.value)}.`
        : 'This is calculated from imported spend and purchase totals.'
    )
  );

  return unique(insights);
}

function generateCampaignInsights({ campaigns, summary }) {
  if (!campaigns.length) {
    return {
      highlights: [],
      bestCampaign: null,
      worstCampaign: null,
    };
  }

  const labels = reportLabels(summary);
  const avgCpa = avg(campaigns, 'cpa');
  const avgRoas = avg(campaigns, 'roas');
  const avgCtr = avg(campaigns, 'ctr');

  const highestSpend = [...campaigns].sort((a, b) => num(b.spend) - num(a.spend))[0];
  const highestCtr = [...campaigns].sort((a, b) => num(b.ctr) - num(a.ctr))[0];
  const highestRoas = [...campaigns].sort((a, b) => num(b.roas) - num(a.roas))[0];
  const lowestCpa = [...campaigns].filter((c) => num(c.cpa) > 0).sort((a, b) => num(a.cpa) - num(b.cpa))[0];
  const highestConversions = [...campaigns].sort((a, b) => num(b.conversions) - num(a.conversions))[0];
  const worstCampaign = [...campaigns]
    .filter((campaign) => num(campaign.spend) > 0 || num(campaign.conversions) > 0)
    .sort((a, b) => num(b.cpa) - num(a.cpa) || num(a.conversions) - num(b.conversions))[0];

  const highlights = unique([
    highestSpend ? `"${highestSpend.name}" had the highest spend at ${money(highestSpend.spend)}.` : null,
    highestConversions ? `"${highestConversions.name}" generated the most ${labels.outcome.toLowerCase()} (${num(highestConversions.conversions).toLocaleString('en-IN')}).` : null,
    lowestCpa && avgCpa > 0
      ? `"${lowestCpa.name}" had ${labels.cost} ${pct(((avgCpa - num(lowestCpa.cpa)) / avgCpa) * 100)} lower than the campaign average.`
      : null,
    highestRoas && avgRoas > 0 && num(highestRoas.roas) > 0
      ? `"${highestRoas.name}" had the strongest ROAS at ${rate(highestRoas.roas)}.`
      : null,
    highestCtr && avgCtr > 0
      ? `"${highestCtr.name}" had the highest CTR at ${num(highestCtr.ctr).toFixed(2)}%.`
      : null,
    worstCampaign && num(worstCampaign.cpa) > 0
      ? `"${worstCampaign.name}" had the weakest efficiency with ${labels.cost} of ${money(worstCampaign.cpa)}.`
      : null,
  ]);

  return {
    highlights,
    bestCampaign: highestConversions || lowestCpa || highestRoas || null,
    worstCampaign: worstCampaign || null,
    highestSpend,
    highestCtr,
    highestRoas,
    lowestCpa,
  };
}

function generatePlatformInsights({ platforms, summary }) {
  if (!platforms.length) return [];

  const labels = reportLabels(summary);
  const highestSpend = [...platforms].sort((a, b) => num(b.spend) - num(a.spend))[0];
  const highestOutcome = [...platforms].sort((a, b) => num(b.conversions) - num(a.conversions))[0];
  const highestRoas = [...platforms].sort((a, b) => num(b.roas) - num(a.roas))[0];

  return unique([
    highestSpend ? `${String(highestSpend.platform || 'Platform').toUpperCase()} had the highest spend at ${money(highestSpend.spend)}.` : null,
    highestOutcome ? `${String(highestOutcome.platform || 'Platform').toUpperCase()} generated the most ${labels.outcome.toLowerCase()} (${num(highestOutcome.conversions).toLocaleString('en-IN')}).` : null,
    highestRoas && num(highestRoas.roas) > 0 ? `${String(highestRoas.platform || 'Platform').toUpperCase()} had the highest ROAS at ${rate(highestRoas.roas)}.` : null,
  ]);
}

function generateTrendInsights({ trends, summary }) {
  if (!trends.length) return ['No monthly trend rows are available.'];
  if (trends.length === 1) return ['Only one month is available, so trend direction and seasonality cannot be evaluated.'];

  const labels = reportLabels(summary);
  const bestMonth = [...trends].sort((a, b) => num(b.conversions) - num(a.conversions))[0];
  const worstMonth = [...trends].sort((a, b) => num(a.conversions) - num(b.conversions))[0];
  const { current, previous } = currentPrevious(trends);

  return unique([
    bestMonth ? `${bestMonth.month} was the strongest month by ${labels.outcome.toLowerCase()} with ${num(bestMonth.conversions).toLocaleString('en-IN')}.` : null,
    worstMonth ? `${worstMonth.month} was the weakest month by ${labels.outcome.toLowerCase()} with ${num(worstMonth.conversions).toLocaleString('en-IN')}.` : null,
    explainChange(`${labels.outcome}`, current?.conversions, previous?.conversions, () => 'This compares the latest imported month with the previous imported month.'),
  ]);
}

function generateBudgetInsights({ campaigns, summary }) {
  if (!campaigns.length) return [];
  const labels = reportLabels(summary);
  const avgCpa = avg(campaigns, 'cpa');
  const avgRoas = avg(campaigns, 'roas');

  return unique(
    campaigns.flatMap((campaign) => {
      const insights = [];
      if (avgCpa > 0 && num(campaign.cpa) > 0 && num(campaign.cpa) < avgCpa && num(campaign.conversions) > 0) {
        insights.push(`Consider shifting budget toward "${campaign.name}" because its ${labels.cost} is ${pct(((avgCpa - num(campaign.cpa)) / avgCpa) * 100)} below the campaign average.`);
      }
      if (avgRoas > 0 && num(campaign.roas) > 0 && num(campaign.roas) < avgRoas) {
        insights.push(`Review spend on "${campaign.name}" because ROAS is ${pct(((avgRoas - num(campaign.roas)) / avgRoas) * 100)} below the campaign average.`);
      }
      return insights;
    })
  ).slice(0, 5);
}

function generateRecommendations({ summary, trends, campaigns, platforms }) {
  const labels = reportLabels(summary);
  const recommendations = [];
  const campaignIntelligence = generateCampaignInsights({ campaigns, summary });

  if (labels.reportName === 'sales') {
    recommendations.push(...generateSalesInsights({ summary, trends }));
  } else {
    recommendations.push(...generateLeadInsights({ summary, trends }));
  }

  recommendations.push(...generateBudgetInsights({ campaigns, summary }));

  if (num(summary.revenue) <= 0) {
    recommendations.push('Map revenue columns in future uploads so ROAS and profitability insights can be calculated.');
  }

  if (platforms.length <= 1) {
    recommendations.push('Add another platform data source if cross-platform budget comparison is required.');
  }

  if (campaigns.length > 0 && campaigns.length < 3) {
    recommendations.push(`Only ${campaigns.length} campaign row${campaigns.length === 1 ? '' : 's'} were imported, so campaign testing breadth is limited.`);
  }

  if (campaignIntelligence.worstCampaign && num(campaignIntelligence.worstCampaign.cpa) > 0) {
    recommendations.push(`Review "${campaignIntelligence.worstCampaign.name}" before allocating more budget because its ${labels.cost} is the highest among imported campaigns.`);
  }

  return unique(recommendations).slice(0, 10);
}

function generateExecutiveSummary({ summary, trends }) {
  const labels = reportLabels(summary);
  const base = `This report generated ${num(summary.conversions).toLocaleString('en-IN')} ${labels.outcome.toLowerCase()} from ${money(summary.spend)} spend.`;
  const revenueText =
    num(summary.revenue) > 0
      ? ` Revenue was ${money(summary.revenue)} with ROAS of ${rate(summary.roas)}.`
      : ' Revenue is unavailable, so ROAS cannot be calculated.';

  const { current, previous } = currentPrevious(trends);
  if (!current || !previous) return `${base}${revenueText} No previous month data is available for comparison.`;

  const spendChange = changeObject(current.spend, previous.spend);
  const outcomeChange = changeObject(current.conversions, previous.conversions);
  const cpaChange = changeObject(current.cpa, previous.cpa);

  const comparison =
    spendChange.hasPreviousData && outcomeChange.hasPreviousData
      ? ` Compared with the previous month, spend ${signedDirection(spendChange.value)} ${pct(spendChange.value)} and ${labels.outcome.toLowerCase()} ${signedDirection(outcomeChange.value)} ${pct(outcomeChange.value)}.`
      : '';
  const efficiency =
    cpaChange.hasPreviousData
      ? ` ${labels.cost} ${signedDirection(cpaChange.value)} ${pct(cpaChange.value)}, showing ${cpaChange.value < 0 ? 'improved' : 'weaker'} acquisition efficiency.`
      : '';

  return `${base}${revenueText}${comparison}${efficiency}`;
}

function generateConfidence({ summary, trends, campaigns, platforms }) {
  const reasons = [];
  let score = 100;

  if (trends.length < 2) {
    score -= 20;
    reasons.push('Only one month is available.');
  }
  if (campaigns.length < 3) {
    score -= 15;
    reasons.push('Campaign count is low.');
  }
  if (platforms.length < 2) {
    score -= 10;
    reasons.push('No platform comparison is available.');
  }
  if (num(summary.revenue) <= 0) {
    score -= 15;
    reasons.push('Revenue is missing.');
  }
  if (num(summary.spend) <= 0 || num(summary.conversions) <= 0) {
    score -= 20;
    reasons.push('Core spend or outcome metrics are incomplete.');
  }

  return {
    score: Math.max(35, Math.min(100, score)),
    reason: reasons.length ? reasons.join(' ') : 'Metrics include spend, outcomes, campaigns, platforms, and trend history.',
  };
}

async function generateAiInsights(db, { clientId }) {
  const [summary, trends, campaigns, platforms] = await Promise.all([
    getSummaryMetrics(db, { clientId }),
    getMonthlyTrends(db, { clientId }),
    getCampaignMetrics(db, { clientId }),
    getPlatformMetrics(db, { clientId }),
  ]);

  const overview = generateOverviewInsights({ summary, trends });
  const labels = reportLabels(summary);
  const performanceDrivers =
    labels.reportName === 'sales'
      ? generateSalesInsights({ summary, trends })
      : generateLeadInsights({ summary, trends });
  const campaign = generateCampaignInsights({ campaigns, summary });
  const platform = generatePlatformInsights({ platforms, summary });
  const trend = generateTrendInsights({ trends, summary });
  const budget = generateBudgetInsights({ campaigns, summary });
  const recommendations = generateRecommendations({ summary, trends, campaigns, platforms });
  const executiveSummary = generateExecutiveSummary({ summary, trends });
  const confidence = generateConfidence({ summary, trends, campaigns, platforms });
  const qualityNotes = unique([
    trends.length < 2 ? 'No previous month data is available.' : null,
    num(summary.revenue) <= 0 ? 'Revenue is missing, so ROAS is unavailable.' : null,
    campaigns.length < 3 ? 'Low campaign count limits campaign-level confidence.' : null,
    platforms.length < 2 ? 'Single-platform data limits platform comparison.' : null,
  ]);

  return {
    summary,
    trends,
    campaigns,
    platforms,
    executiveSummary,
    recommendations,
    sections: {
      overview,
      performanceDrivers: unique(performanceDrivers),
      topOpportunities: unique([...budget, ...campaign.highlights]).slice(0, 6),
      risks: unique([
        campaign.worstCampaign ? `"${campaign.worstCampaign.name}" is the weakest campaign by efficiency.` : null,
        num(summary.revenue) <= 0 ? 'Revenue tracking is missing.' : null,
      ]),
      campaignHighlights: campaign.highlights,
      monthlyTrendHighlights: trend,
      platformHighlights: platform,
      dataQualityNotes: qualityNotes,
      aiConfidence: confidence,
    },
  };
}

module.exports = {
  generateOverviewInsights,
  generateLeadInsights,
  generateSalesInsights,
  generateCampaignInsights,
  generatePlatformInsights,
  generateTrendInsights,
  generateBudgetInsights,
  generateRecommendations,
  generateExecutiveSummary,
  generateAiInsights,
};
