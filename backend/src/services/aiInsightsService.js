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
  if (Math.abs(num(change.value)) === 0) return null;

  return `${metric} ${signedDirection(change.value)} by ${pct(change.value)}. ${reasonBuilder(change.value)}`;
};

const changeObject = (current, previous) => calculatePercentChange(current, previous);

const avg = (rows, key) => {
  const values = rows.map((row) => num(row[key])).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const share = (part, total) => (num(total) > 0 ? (num(part) / num(total)) * 100 : 0);
const aboveBelow = (value, baseline, lowerIsBetter = false) => {
  if (num(value) <= 0 || num(baseline) <= 0) return null;
  const diff = ((num(value) - num(baseline)) / num(baseline)) * 100;
  const direction = diff >= 0 ? 'above' : 'below';
  const quality =
    lowerIsBetter
      ? diff <= 0 ? 'better' : 'weaker'
      : diff >= 0 ? 'better' : 'weaker';

  return {
    diff,
    direction,
    quality,
    text: `${pct(diff)} ${direction} account average`,
  };
};

const conversionRateOf = (row = {}) => (num(row.clicks) > 0 ? (num(row.conversions) / num(row.clicks)) * 100 : 0);
const aovOf = (row = {}) => (num(row.conversions) > 0 ? num(row.revenue) / num(row.conversions) : 0);

const sortBy = (rows, selector, direction = 'desc') =>
  [...rows].sort((a, b) => {
    const av = selector(a);
    const bv = selector(b);
    if (av === bv) return String(a.name || a.platform || '').localeCompare(String(b.name || b.platform || ''));
    return direction === 'asc' ? av - bv : bv - av;
  });

const firstPositive = (rows, selector, direction = 'desc') =>
  sortBy(rows.filter((row) => selector(row) > 0), selector, direction)[0] || null;

const recommendation = (type, impact, text) => ({
  type,
  impact,
  text,
});

const numberedRecommendations = (items = []) =>
  items
    .filter((item) => item?.text)
    .sort((a, b) => num(b.impact) - num(a.impact) || String(a.type).localeCompare(String(b.type)))
    .map((item, index) => `Priority ${index + 1}: ${item.text}`);

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

  if (num(summary.revenue) > 0 && num(summary.conversions) > 0) {
    insights.push(`Average order value was ${money(aovOf(summary))} based on imported revenue and purchases.`);
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
  const cleanCampaigns = campaigns.filter((campaign) => campaign?.name);

  if (!cleanCampaigns.length) {
    return {
      highlights: [],
      bestCampaign: null,
      worstCampaign: null,
      intelligence: {},
      averages: {},
    };
  }

  const labels = reportLabels(summary);
  const averages = {
    cpa: avg(cleanCampaigns, 'cpa'),
    roas: avg(cleanCampaigns, 'roas'),
    ctr: avg(cleanCampaigns, 'ctr'),
    conversionRate: avg(cleanCampaigns.map((campaign) => ({ ...campaign, conversionRate: conversionRateOf(campaign) })), 'conversionRate'),
  };

  const intelligence = {
    highestSpend: firstPositive(cleanCampaigns, (campaign) => num(campaign.spend)),
    highestCtr: firstPositive(cleanCampaigns, (campaign) => num(campaign.ctr)),
    lowestCtr: firstPositive(cleanCampaigns, (campaign) => num(campaign.ctr), 'asc'),
    highestConversionRate: firstPositive(cleanCampaigns, conversionRateOf),
    lowestConversionRate: firstPositive(cleanCampaigns, conversionRateOf, 'asc'),
    lowestCost: firstPositive(cleanCampaigns, (campaign) => num(campaign.cpa), 'asc'),
    highestCost: firstPositive(cleanCampaigns, (campaign) => num(campaign.cpa)),
    highestRevenue: firstPositive(cleanCampaigns, (campaign) => num(campaign.revenue)),
    highestRoas: firstPositive(cleanCampaigns, (campaign) => num(campaign.roas)),
    lowestRoas: firstPositive(cleanCampaigns, (campaign) => num(campaign.roas), 'asc'),
    highestClicks: firstPositive(cleanCampaigns, (campaign) => num(campaign.clicks)),
    highestImpressions: firstPositive(cleanCampaigns, (campaign) => num(campaign.impressions)),
    highestConversions: firstPositive(cleanCampaigns, (campaign) => num(campaign.conversions)),
  };

  const bestCampaign =
    labels.reportName === 'sales'
      ? intelligence.highestRoas || intelligence.highestRevenue || intelligence.lowestCost || intelligence.highestConversions
      : intelligence.lowestCost || intelligence.highestConversions || intelligence.highestCtr;

  const selectedWorstCampaign =
    labels.reportName === 'sales'
      ? intelligence.lowestRoas || intelligence.highestCost || intelligence.lowestConversionRate
      : intelligence.highestCost || intelligence.lowestConversionRate || intelligence.lowestCtr;
  const worstCampaign =
    cleanCampaigns.length > 1 && selectedWorstCampaign?.name !== bestCampaign?.name
      ? selectedWorstCampaign
      : null;

  const costComparison = intelligence.lowestCost ? aboveBelow(intelligence.lowestCost.cpa, averages.cpa, true) : null;
  const ctrComparison = intelligence.highestCtr ? aboveBelow(intelligence.highestCtr.ctr, averages.ctr) : null;
  const weakCostComparison = intelligence.highestCost ? aboveBelow(intelligence.highestCost.cpa, averages.cpa, true) : null;
  const roasComparison = intelligence.highestRoas ? aboveBelow(intelligence.highestRoas.roas, averages.roas) : null;

  const highlights = unique([
    intelligence.highestSpend
      ? `"${intelligence.highestSpend.name}" had the highest spend at ${money(intelligence.highestSpend.spend)} (${pct(share(intelligence.highestSpend.spend, summary.spend))} of report spend).`
      : null,
    intelligence.highestConversions
      ? `"${intelligence.highestConversions.name}" generated the most ${labels.outcome.toLowerCase()} (${num(intelligence.highestConversions.conversions).toLocaleString('en-IN')}).`
      : null,
    intelligence.lowestCost && costComparison
      ? `"${intelligence.lowestCost.name}" had the lowest ${labels.cost} at ${money(intelligence.lowestCost.cpa)}, ${costComparison.text}.`
      : null,
    intelligence.highestCost && weakCostComparison
      ? `"${intelligence.highestCost.name}" had the highest ${labels.cost} at ${money(intelligence.highestCost.cpa)}, ${weakCostComparison.text}.`
      : null,
    intelligence.highestCtr && ctrComparison
      ? `"${intelligence.highestCtr.name}" had the strongest CTR at ${num(intelligence.highestCtr.ctr).toFixed(2)}%, ${ctrComparison.text}.`
      : null,
    intelligence.highestRoas && roasComparison
      ? `"${intelligence.highestRoas.name}" had the strongest ROAS at ${rate(intelligence.highestRoas.roas)}, ${roasComparison.text}.`
      : null,
    intelligence.highestRevenue
      ? `"${intelligence.highestRevenue.name}" generated the highest revenue at ${money(intelligence.highestRevenue.revenue)}.`
      : null,
  ]);

  return {
    highlights,
    bestCampaign: bestCampaign || null,
    worstCampaign,
    highestSpend: intelligence.highestSpend,
    highestCtr: intelligence.highestCtr,
    highestRoas: intelligence.highestRoas,
    lowestCpa: intelligence.lowestCost,
    intelligence,
    averages,
  };
}

function generatePlatformInsights({ platforms, summary }) {
  if (!platforms.length) return [];

  const labels = reportLabels(summary);
  const highestSpend = [...platforms].sort((a, b) => num(b.spend) - num(a.spend))[0];
  const highestOutcome = [...platforms].sort((a, b) => num(b.conversions) - num(a.conversions))[0];
  const highestRoas = [...platforms].sort((a, b) => num(b.roas) - num(a.roas))[0];
  const lowestCpa = firstPositive(platforms, (platform) => num(platform.cpa), 'asc');
  const highestRevenue = firstPositive(platforms, (platform) => num(platform.revenue));

  return unique([
    highestSpend ? `${String(highestSpend.platform || 'Platform').toUpperCase()} had the highest spend at ${money(highestSpend.spend)} (${pct(share(highestSpend.spend, summary.spend))} share).` : null,
    highestOutcome ? `${String(highestOutcome.platform || 'Platform').toUpperCase()} generated the most ${labels.outcome.toLowerCase()} (${num(highestOutcome.conversions).toLocaleString('en-IN')}).` : null,
    lowestCpa ? `${String(lowestCpa.platform || 'Platform').toUpperCase()} had the lowest ${labels.cost} at ${money(lowestCpa.cpa)}.` : null,
    highestRevenue ? `${String(highestRevenue.platform || 'Platform').toUpperCase()} generated the highest revenue at ${money(highestRevenue.revenue)}.` : null,
    highestRoas && num(highestRoas.roas) > 0 ? `${String(highestRoas.platform || 'Platform').toUpperCase()} had the highest ROAS at ${rate(highestRoas.roas)}.` : null,
    platforms.length === 1 ? 'Only one platform is imported, so platform comparison is unavailable.' : null,
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
        insights.push(`Shift incremental budget toward "${campaign.name}" because its ${labels.cost} is ${pct(((avgCpa - num(campaign.cpa)) / avgCpa) * 100)} below campaign average while producing ${num(campaign.conversions).toLocaleString('en-IN')} ${labels.outcome.toLowerCase()}.`);
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
  const intelligence = campaignIntelligence.intelligence || {};
  const averages = campaignIntelligence.averages || {};
  const { current, previous } = currentPrevious(trends);

  if (num(summary.revenue) <= 0) {
    recommendations.push(
      recommendation(
        'track_revenue',
        num(summary.spend),
        'Map revenue columns in future uploads so ROAS, profitability, and budget recommendations can be calculated.'
      )
    );
  }

  if (intelligence.lowestCost && num(intelligence.lowestCost.conversions) > 0 && num(averages.cpa) > 0) {
    const costAdvantage = ((num(averages.cpa) - num(intelligence.lowestCost.cpa)) / num(averages.cpa)) * 100;
    if (costAdvantage > 0) {
      recommendations.push(
        recommendation(
          'scale_best_campaign',
          num(intelligence.lowestCost.conversions) * Math.max(1, costAdvantage),
          `Scale "${intelligence.lowestCost.name}" because its ${labels.cost} is ${pct(costAdvantage)} below account average and it produced ${num(intelligence.lowestCost.conversions).toLocaleString('en-IN')} ${labels.outcome.toLowerCase()}.`
        )
      );
    }
  }

  if (intelligence.highestCost && num(averages.cpa) > 0 && num(intelligence.highestCost.cpa) > num(averages.cpa)) {
    const costGap = ((num(intelligence.highestCost.cpa) - num(averages.cpa)) / num(averages.cpa)) * 100;
    recommendations.push(
      recommendation(
        'review_poor_campaign',
        num(intelligence.highestCost.spend) * Math.max(1, costGap),
        `Review "${intelligence.highestCost.name}" before adding budget because its ${labels.cost} is ${pct(costGap)} above account average.`
      )
    );
  }

  if (intelligence.lowestCtr && num(averages.ctr) > 0 && num(intelligence.lowestCtr.ctr) < num(averages.ctr)) {
    const ctrGap = ((num(averages.ctr) - num(intelligence.lowestCtr.ctr)) / num(averages.ctr)) * 100;
    recommendations.push(
      recommendation(
        'improve_creatives',
        num(intelligence.lowestCtr.impressions) * Math.max(1, ctrGap / 100),
        `Improve creatives or targeting for "${intelligence.lowestCtr.name}" because CTR is ${pct(ctrGap)} below account average after ${num(intelligence.lowestCtr.impressions).toLocaleString('en-IN')} impressions.`
      )
    );
  }

  if (labels.reportName === 'sales' && intelligence.highestRoas && num(averages.roas) > 0 && num(intelligence.highestRoas.roas) > num(averages.roas)) {
    const roasLift = ((num(intelligence.highestRoas.roas) - num(averages.roas)) / num(averages.roas)) * 100;
    recommendations.push(
      recommendation(
        'increase_budget',
        num(intelligence.highestRoas.revenue) * Math.max(1, roasLift / 100),
        `Increase budget carefully on "${intelligence.highestRoas.name}" because ROAS is ${pct(roasLift)} above account average.`
      )
    );
  }

  if (current && previous) {
    const ctrChange = changeObject(current.ctr, previous.ctr);
    const clickChange = changeObject(current.clicks, previous.clicks);
    const conversionChange = changeObject(current.conversions, previous.conversions);
    const spendChange = changeObject(current.spend, previous.spend);

    if (ctrChange.hasPreviousData && ctrChange.value < 0 && clickChange.hasPreviousData && clickChange.value <= 0) {
      recommendations.push(
        recommendation(
          'improve_ctr',
          Math.abs(ctrChange.value) * num(current.impressions),
          `Improve CTR because it declined by ${pct(ctrChange.value)} and click volume did not offset the decline.`
        )
      );
    }

    if (conversionChange.hasPreviousData && spendChange.hasPreviousData && conversionChange.value < spendChange.value) {
      recommendations.push(
        recommendation(
          'improve_conversion_rate',
          Math.abs(spendChange.value - conversionChange.value) * num(current.spend),
          `Improve landing page or conversion quality because spend moved ${pct(spendChange.value)} while ${labels.outcome.toLowerCase()} moved ${pct(conversionChange.value)}.`
        )
      );
    }
  }

  if (platforms.length > 1) {
    const bestPlatform = [...platforms].sort((a, b) => num(b.conversions) - num(a.conversions) || num(a.cpa) - num(b.cpa))[0];
    const weakPlatform = [...platforms].filter((platform) => num(platform.cpa) > 0).sort((a, b) => num(b.cpa) - num(a.cpa))[0];

    if (bestPlatform?.platform && weakPlatform?.platform && bestPlatform.platform !== weakPlatform.platform) {
      recommendations.push(
        recommendation(
          'budget_allocation',
          Math.abs(num(weakPlatform.cpa) - num(bestPlatform.cpa)) * num(weakPlatform.conversions || 1),
          `Rebalance platform budget toward ${String(bestPlatform.platform).toUpperCase()} and review ${String(weakPlatform.platform).toUpperCase()} because platform ${labels.cost} differs materially.`
        )
      );
    }
  } else if (platforms.length === 1) {
    recommendations.push(
      recommendation(
        'platform_coverage',
        1,
        'Only one platform is imported, so cross-platform budget allocation insights are limited.'
      )
    );
  }

  if (!recommendations.length) {
    const topCampaign = campaignIntelligence.bestCampaign;
    if (topCampaign?.name) {
      recommendations.push(
        recommendation(
          'maintain_best_campaign',
          num(topCampaign.conversions) + num(topCampaign.revenue),
          `Maintain monitoring on "${topCampaign.name}" because it is currently the strongest campaign in the imported data.`
        )
      );
    }
  }

  return unique(numberedRecommendations(recommendations)).slice(0, 10);
}

function generateExecutiveSummary({ summary, trends, campaigns = [], platforms = [] }) {
  const labels = reportLabels(summary);
  const parts = [];
  const { current, previous } = currentPrevious(trends);

  if (current && previous) {
    const spendChange = changeObject(current.spend, previous.spend);
    const outcomeChange = changeObject(current.conversions, previous.conversions);
    const cpaChange = changeObject(current.cpa, previous.cpa);
    const ctrChange = changeObject(current.ctr, previous.ctr);
    const impressionChange = changeObject(current.impressions, previous.impressions);
    const clickChange = changeObject(current.clicks, previous.clicks);

    if (spendChange.hasPreviousData && outcomeChange.hasPreviousData) {
      parts.push(
        `Marketing investment ${signedDirection(spendChange.value)} by ${pct(spendChange.value)} while ${labels.outcome.toLowerCase()} ${signedDirection(outcomeChange.value)} by ${pct(outcomeChange.value)}.`
      );
    }

    if (cpaChange.hasPreviousData && Math.abs(num(cpaChange.value)) > 0) {
      parts.push(
        `${labels.cost} ${signedDirection(cpaChange.value)} by ${pct(cpaChange.value)}, indicating ${cpaChange.value < 0 ? 'stronger' : 'weaker'} acquisition efficiency.`
      );
    }

    if (ctrChange.hasPreviousData && impressionChange.hasPreviousData) {
      parts.push(
        `CTR ${signedDirection(ctrChange.value)} by ${pct(ctrChange.value)} while impressions ${signedDirection(impressionChange.value)} by ${pct(impressionChange.value)}.`
      );
    }

    if (clickChange.hasPreviousData) {
      parts.push(`Click volume ${signedDirection(clickChange.value)} by ${pct(clickChange.value)}.`);
    }
  } else {
    parts.push(
      `The imported data generated ${num(summary.conversions).toLocaleString('en-IN')} ${labels.outcome.toLowerCase()} from ${money(summary.spend)} spend.`
    );
    parts.push('Month-over-month comparison is unavailable because no previous month exists in the imported data.');
  }

  const bestMonth = trends.length ? sortBy(trends, (row) => num(row.conversions))[0] : null;
  const weakestMonth = trends.length ? sortBy(trends, (row) => num(row.conversions), 'asc')[0] : null;

  if (bestMonth?.month && weakestMonth?.month && bestMonth.month !== weakestMonth.month) {
    parts.push(`${bestMonth.month} was the strongest month and ${weakestMonth.month} was the weakest month by ${labels.outcome.toLowerCase()}.`);
  }

  const campaignIntelligence = generateCampaignInsights({ campaigns, summary });
  if (campaignIntelligence.bestCampaign?.name) {
    parts.push(`The strongest campaign signal came from "${campaignIntelligence.bestCampaign.name}".`);
  }

  if (platforms.length > 1) {
    const topPlatform = sortBy(platforms, (platform) => num(platform.spend))[0];
    if (topPlatform?.platform) {
      parts.push(`${String(topPlatform.platform).toUpperCase()} contributed ${pct(share(topPlatform.spend, summary.spend))} of tracked spend.`);
    }
  }

  if (num(summary.revenue) > 0) {
    parts.push(`Revenue was ${money(summary.revenue)} with ROAS of ${rate(summary.roas)}.`);
  } else {
    parts.push('Revenue is missing, so ROAS and profitability analysis are unavailable.');
  }

  return unique(parts).join(' ');
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
  const executiveSummary = generateExecutiveSummary({ summary, trends, campaigns, platforms });
  const confidence = generateConfidence({ summary, trends, campaigns, platforms });
  const qualityNotes = unique([
    trends.length < 2 ? 'No previous month data is available.' : null,
    !summary.has_revenue_field || num(summary.revenue) <= 0 ? 'Revenue is missing, so ROAS is unavailable.' : null,
    !summary.has_conversions_field || num(summary.conversions) <= 0 ? `${reportLabels(summary).outcome} data is missing or zero.` : null,
    !summary.has_clicks_field || num(summary.clicks) <= 0 ? 'Click data is missing or zero, so CPC and CTR confidence is limited.' : null,
    !summary.has_impressions_field || num(summary.impressions) <= 0 ? 'Impression data is missing or zero, so CTR confidence is limited.' : null,
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
      campaignIntelligence: campaign.intelligence,
      accountAverages: campaign.averages,
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
