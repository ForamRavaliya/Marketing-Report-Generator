import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getClient,
  getTrends,
  getComparison,
  getCampaigns,
  getPlatforms,
  getSubscription,
  generateAIInsights,
  getAIInsights,
  getReportHistory,
} from '../utils/api';
import { MetricCard } from '../components/MetricCard';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ArrowLeft, TrendingUp, DollarSign, MousePointerClick, Target, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getReportMetricConfig,
  getMetricFormatter,
  isPositiveChange,
} from '../utils/reportMetricConfig';


const COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
const PLATFORMS = ['all', 'meta', 'google', 'linkedin', 'twitter', 'tiktok', 'other'];

const fmt = (n, d = 0) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  SGD: 'S$',
};

const fmtCur = (n, currency = 'INR') =>
  `${CURRENCY_SYMBOLS[currency] || currency} ${fmt(n, 2)}`;
const fmtPct = (n) => `${fmt(n, 2)}%`;


const Tooltip_ = ({ active, payload, label, prefix = '', suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 13, fontWeight: 600, color: p.color }}>
          {p.name}: {prefix}{fmt(p.value, 2)}{suffix}
        </div>
      ))}
    </div>
  );
};

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);

  const [trends, setTrends] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [reportCurrency, setReportCurrency] = useState('INR');
  const [activeTab, setActiveTab] = useState('overview');
//const [adAccounts, setAdAccounts] = useState([]);
//const [syncLogs, setSyncLogs] = useState([]);
const [subscription, setSubscription] = useState(null);
const [aiInsight, setAiInsight] = useState(null);
const [aiLoading, setAiLoading] = useState(false);

/* const [adForm, setAdForm] = useState({
  platform: 'meta',
  adAccountId: '',
  accessToken: '',
}); */
  const load = useCallback(async () => {
    setLoading(true);

    const params = {
      platform: platform !== 'all' ? platform : undefined,
    };

    try {
      const clientData = await getClient(id);
      setClient(clientData);



     const trendsData = await getTrends(id, { ...params, months: 6 });
     const byMonth = {};

     trendsData.forEach(row => {
       if (!byMonth[row.month]) {
         byMonth[row.month] = {
           month: row.month,
           spend: 0,
           clicks: 0,
           conversions: 0,
           impressions: 0,
           revenue: 0,
           roas: 0,
           orders: 0,
           quantity: 0,
           profit: 0,
           report_type: row.report_type,
         };
       }

       byMonth[row.month].spend += parseFloat(row.spend || 0);
       byMonth[row.month].clicks += parseFloat(row.clicks || 0);
       byMonth[row.month].conversions += parseFloat(row.conversions || 0);
       byMonth[row.month].impressions += parseFloat(row.impressions || 0);
       byMonth[row.month].revenue += parseFloat(row.revenue || 0);
       byMonth[row.month].orders += parseFloat(row.orders || 0);
       byMonth[row.month].quantity += parseFloat(row.quantity || 0);
       byMonth[row.month].profit += parseFloat(row.profit || 0);
       byMonth[row.month].roas =
         byMonth[row.month].spend > 0
           ? byMonth[row.month].revenue / byMonth[row.month].spend
           : 0;
     });

      setTrends(
        Object.values(byMonth).sort((a, b) =>
          a.month.localeCompare(b.month)
        )
      );

      const comparisonData = await getComparison(id, params);
      setComparison(comparisonData);

      const campaignData = await getCampaigns(id, params);
      setCampaigns(campaignData);

      const platformData = await getPlatforms(id, params);
      setPlatforms(platformData);

      const reportHistory = await getReportHistory(id);
      const latestCurrency = reportHistory?.[0]?.currency || 'INR';
      setReportCurrency(latestCurrency);

      getSubscription()
        .then(setSubscription)
        .catch(() => setSubscription(null));

      getAIInsights(id)
        .then(setAiInsight)
        .catch(() => setAiInsight(null));

     /* getAdAccounts(id)
        .then(setAdAccounts)
        .catch(() => {});

      getSyncLogs(id)
        .then(setSyncLogs)
        .catch(() => {}); */
    } catch (error) {
      console.error('Client detail load error:', error.response?.data || error.message);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [id, platform]);

  useEffect(() => { load(); }, [load]);

  const platformData = platforms.map(p => ({ name: p.platform, value: parseFloat(p.spend || 0) }));

const totalPlatformSpend = platforms.reduce(
  (sum, p) => sum + parseFloat(p.spend || 0),
  0
);

const topPlatform = platforms.length
  ? [...platforms].sort(
      (a, b) => parseFloat(b.spend || 0) - parseFloat(a.spend || 0)
    )[0]
  : null;
const totalCampaignSpend = campaigns.reduce(
  (sum, c) => sum + parseFloat(c.spend || 0),
  0
);

const currentMonthMetrics = comparison?.comparison || {};

const detectedReportType =
  comparison?.reportType ||
  comparison?.report_type ||
  campaigns?.[0]?.report_type ||
  platforms?.[0]?.report_type ||
  trends?.[0]?.report_type ||
  'needs_review';

const normalizeFrontendReportType = (type) => {
  if (type === 'sales_campaign' || type === 'lead_generation' || type === 'sales_data') {
    return type;
  }

  // backward compatibility for old uploaded rows
  if (type === 'ads') {
    const revenue = Number(currentMonthMetrics?.revenue?.current || 0);
    return revenue > 0 ? 'sales_campaign' : 'lead_generation';
  }

  return 'needs_review';
};

const normalizedReportType = (() => {
  const normalized = normalizeFrontendReportType(detectedReportType);

  const revenue =
    Number(currentMonthMetrics?.revenue?.current || 0) ||
    trends.reduce((sum, r) => sum + Number(r.revenue || 0), 0) ||
    campaigns.reduce((sum, c) => sum + Number(c.revenue || 0), 0) ||
    platforms.reduce((sum, p) => sum + Number(p.revenue || 0), 0);

  const conversions =
    Number(currentMonthMetrics?.conversions?.current || 0) ||
    trends.reduce((sum, r) => sum + Number(r.conversions || 0), 0) ||
    campaigns.reduce((sum, c) => sum + Number(c.conversions || 0), 0) ||
    platforms.reduce((sum, p) => sum + Number(p.conversions || 0), 0);

  if (revenue > 0 && conversions > 0) return 'sales_campaign';

  if (normalized !== 'needs_review') return normalized;

  return 'lead_generation';
})();
const metricConfig = getReportMetricConfig(normalizedReportType);
console.log('TYPE:', normalizedReportType, metricConfig);
const fmtReportCur = (value) => fmtCur(value, reportCurrency);
const currencySymbol =
  CURRENCY_SYMBOLS[reportCurrency] || reportCurrency;

const formatMetric = (key, value) =>
  getMetricFormatter(key, { fmt, fmtCur: fmtReportCur, fmtPct })(value);

const getCurrentValue = (key) =>
  currentMonthMetrics?.[key]?.current ?? 0;

  const getCampaignColumns = () => {
    if (normalizedReportType === 'sales_campaign') {
      return [
        { key: 'name', label: 'Campaign', format: (c) => c.name || c.campaign_name || 'Unknown' },
        { key: 'spend', label: 'Spend', format: (c) => fmtReportCur(c.spend) },
        { key: 'conversions', label: metricConfig.primaryMetricLabel, format: (c) => fmt(c.conversions) },
        { key: 'cpa',label: metricConfig.costMetricLabel, format: (c) =>fmtReportCur(c.cpa) },
        { key: 'revenue', label: 'Revenue', format: (c) => fmtReportCur(c.revenue) },
        { key: 'roas', label: 'Return', format: (c) => `${fmt(c.roas, 2)}x` },
      ];
    }

    if (normalizedReportType === 'lead_generation') {
      return [
        { key: 'name', label: 'Campaign', format: (c) => c.name || c.campaign_name || 'Unknown' },
        { key: 'spend', label: 'Spend', format: (c) => fmtReportCur(c.spend) },
        { key: 'conversions',label: metricConfig.primaryMetricLabel, format: (c) => fmt(c.conversions) },
        { key: 'cpa', label: metricConfig.costMetricLabel, format: (c) => fmtReportCur(c.cpa) },
        { key: 'ctr', label: 'Click Rate', format: (c) => fmtPct(c.ctr) },
        { key: 'cpc', label: 'Cost / Click', format: (c) => fmtReportCur(c.cpc) },
      ];
    }

    if (normalizedReportType === 'sales_data') {
      return [
        { key: 'name', label: 'Product', format: (c) => c.name || c.campaign_name || 'Unknown' },
        { key: 'orders', label: 'Orders', format: (c) => fmt(c.orders) },
        { key: 'quantity', label: 'Qty Sold', format: (c) => fmt(c.quantity) },
        { key: 'revenue', label: 'Revenue', format: (c) => fmtReportCur(c.revenue) },
        { key: 'profit', label: 'Profit', format: (c) => fmtReportCur(c.profit) },
        { key: 'margin', label: 'Margin', format: (c) => fmtPct(c.margin) },
      ];
    }

    return [
      { key: 'name', label: 'Campaign', format: (c) => c.name || c.campaign_name || 'Unknown' },
      { key: 'spend', label: 'Spend', format: (c) => fmtReportCur(c.spend) },
      { key: 'clicks', label: 'Clicks', format: (c) => fmt(c.clicks) },
      { key: 'conversions', label: 'Results', format: (c) => fmt(c.conversions) },
      { key: 'cpa', label: 'Cost / Result', format: (c) => fmtReportCur(c.cpa) },
    ];
  };

  const campaignColumns = getCampaignColumns();
  const getPlatformColumns = () => {
    if (normalizedReportType === 'sales_campaign') {
      return [
        { key: 'platform', label: 'Platform', format: (p) => p.platform || 'N/A' },
        { key: 'spend', label: 'Spend', format: (p) => fmtReportCur(p.spend) },
        { key: 'conversions', label: metricConfig.primaryMetricLabel, format: (p) => fmt(p.conversions) },
        { key: 'cpa',label: metricConfig.costMetricLabel, format: (p) => fmtReportCur(p.cpa) },
        { key: 'revenue', label: 'Revenue', format: (p) => fmtReportCur(p.revenue) },
        { key: 'roas', label: 'ROAS', format: (p) => `${fmt(p.roas, 2)}x` },
      ];
    }

    if (normalizedReportType === 'lead_generation') {
      return [
        { key: 'platform', label: 'Platform', format: (p) => p.platform || 'N/A' },
        { key: 'spend', label: 'Spend', format: (p) => fmtReportCur(p.spend) },
        { key: 'conversions',label: metricConfig.primaryMetricLabel, format: (p) => fmt(p.conversions) },
        { key: 'cpa', label: metricConfig.costMetricLabel, format: (p) => fmtReportCur(p.cpa) },
        { key: 'ctr', label: 'CTR', format: (p) => fmtPct(p.ctr) },
        { key: 'cpc', label: 'CPC', format: (p) => fmtReportCur(p.cpc) },
      ];
    }

    if (normalizedReportType === 'sales_data') {
      return [
        { key: 'platform', label: 'Channel', format: (p) => p.platform || 'N/A' },
        { key: 'orders', label: 'Orders', format: (p) => fmt(p.orders) },
        { key: 'quantity', label: 'Qty Sold', format: (p) => fmt(p.quantity) },
        { key: 'revenue', label: 'Revenue', format: (p) => fmtReportCur(p.revenue) },
        { key: 'profit', label: 'Profit', format: (p) => fmtReportCur(p.profit) },
      ];
    }

    return [
      { key: 'platform', label: 'Platform', format: (p) => p.platform || 'N/A' },
      { key: 'spend', label: 'Spend', format: (p) => fmtReportCur(p.spend) },
      { key: 'clicks', label: 'Clicks', format: (p) => fmt(p.clicks) },
      { key: 'conversions', label: 'Conversions', format: (p) => fmt(p.conversions) },
      { key: 'cpa', label: 'CPA', format: (p) => fmtReportCur(p.cpa) },
    ];
  };

const topCampaign = campaigns.length
  ? [...campaigns].sort((a, b) => {
      if (normalizedReportType === 'sales_data') {
        return Number(b.profit || 0) - Number(a.profit || 0);
      }

      if (normalizedReportType === 'lead_generation') {
        return Number(b.conversions || 0) - Number(a.conversions || 0);
      }

      return Number(b.roas || 0) - Number(a.roas || 0);
    })[0]
  : null;

const lowCampaign = campaigns.length
  ? [...campaigns].sort((a, b) => {
      if (normalizedReportType === 'sales_data') {
        return Number(a.profit || 0) - Number(b.profit || 0);
      }

      return Number(b.cpa || 0) - Number(a.cpa || 0);
    })[0]
  : null;

  const platformColumns = getPlatformColumns();
  const getTrendConfig = () => {
    switch (normalizedReportType) {
      case 'sales_campaign':
        return {
          title: 'Revenue vs Purchases',
          firstKey: 'revenue',
          firstLabel: 'Revenue',
          secondKey: 'conversions',
          secondLabel: 'Purchases',
          tableSecond: 'Revenue',
          tableThird: 'Purchases',
        };

      case 'lead_generation':
        return {
          title: 'Clicks vs Leads',
          firstKey: 'clicks',
          firstLabel: 'Clicks',
          secondKey: 'conversions',
          secondLabel: 'Leads',
          tableSecond: 'Clicks',
          tableThird: 'Leads',
        };

      case 'sales_data':
        return {
          title: 'Revenue vs Orders',
          firstKey: 'revenue',
          firstLabel: 'Revenue',
          secondKey: 'orders',
          secondLabel: 'Orders',
          tableSecond: 'Revenue',
          tableThird: 'Orders',
        };

      default:
        return {
          title: 'Clicks vs Conversions',
          firstKey: 'clicks',
          firstLabel: 'Clicks',
          secondKey: 'conversions',
          secondLabel: 'Conversions',
          tableSecond: 'Clicks',
          tableThird: 'Conversions',
        };
    }
  };

  const trendConfig = getTrendConfig();

  const getAiConfig = () => {
    if (normalizedReportType === 'sales_campaign') {
      return {
        title: 'Sales Campaign Insights',
        subtitle: 'AI analysis focused on revenue, purchases, ROAS, and cost per purchase',
        summaryTitle: 'Sales Performance Summary',
        recommendationTitle: 'Sales Campaign Recommendations',
      };
    }

    if (normalizedReportType === 'lead_generation') {
      return {
        title: 'Lead Generation Insights',
        subtitle: 'AI analysis focused on leads, cost per lead, CTR, and inquiry quality',
        summaryTitle: 'Lead Performance Summary',
        recommendationTitle: 'Lead Generation Recommendations',
      };
    }

    if (normalizedReportType === 'sales_data') {
      return {
        title: 'Sales Data Insights',
        subtitle: 'AI analysis focused on revenue, orders, profit, margin, and AOV',
        summaryTitle: 'Sales Data Summary',
        recommendationTitle: 'Sales Growth Recommendations',
      };
    }

    return {
      title: 'AI Marketing Insights',
      subtitle: 'AI-powered campaign analysis and recommendations',
      summaryTitle: 'Performance Summary',
      recommendationTitle: 'AI Recommendations',
    };
  };

  const aiConfig = getAiConfig();

  if (!client && !loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p>Client not found</p>
      <button className="btn btn-primary" onClick={() => navigate('/clients')}>Back to Clients</button>
    </div>
  );


  const TABS = [
    'overview',
    'trends',
    'campaigns',
    'platforms',
    //'integrations',
    'ai insights',
  ];
// Hanlers
/*
const handleAddAdAccount = async () => {
  try {
    if (!adForm.adAccountId.trim()) {
      return toast.error('Ad account ID required');
    }

    const created = await createAdAccount({
      clientId: id,
      platform: adForm.platform,
      adAccountId: adForm.adAccountId,
      accessToken: adForm.accessToken,
    });

    setAdAccounts(prev => [created, ...prev]);

    setAdForm({
      platform: 'meta',
      adAccountId: '',
      accessToken: '',
    });

    toast.success('Ad account connected');
  } catch {
    toast.error('Failed to connect account');
  }
}; */
/*
const handleSyncAdAccount = async (accountId) => {
  try {
    const res = await syncAdAccount(accountId);

    toast.success(
      `${res.rowsSynced} campaign(s) synced (${res.mode})`
    );

    const updated = await getAdAccounts(id);
    setAdAccounts(updated);
    const logs = await getSyncLogs(id);
    setSyncLogs(logs);

    load();
  } catch {
    toast.error('Failed to sync ad account');
  }
};
const handleDeleteAdAccount = async (accountId) => {
  try {
    await deleteAdAccount(accountId);

    setAdAccounts(prev => prev.filter(a => a.id !== accountId));

    toast.success('Ad account removed');
  } catch {
    toast.error('Failed to remove account');
  }
};
const handleUpdateFrequency = async (accountId, syncFrequency) => {
  try {
    await updateAdAccountFrequency(accountId, syncFrequency);

    setAdAccounts(prev =>
      prev.map(acc =>
        acc.id === accountId
          ? { ...acc, sync_frequency: syncFrequency }
          : acc
      )
    );

    toast.success('Sync frequency updated');
  } catch {
    toast.error('Failed to update sync frequency');
  }
};*/
  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')}><ArrowLeft size={15} /></button>
        <div style={{ flex: 1 }}>
          <div className="page-title">{client?.name || '...'}</div>
         <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
           {metricConfig.title}
         </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-select" style={{ width: 'auto', fontSize: 13 }} value={platform} onChange={e => setPlatform(e.target.value)}>
            {PLATFORMS.map(p => <option key={p} value={p}>{p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg3)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === tab ? 'var(--bg2)' : 'transparent',
            color: activeTab === tab ? 'var(--text)' : 'var(--text2)',
            boxShadow: activeTab === tab ? 'var(--shadow)' : 'none',
            transition: 'all .15s', textTransform: 'capitalize',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="card card-pad"><div className="skeleton" style={{ height: 80 }} /></div>)}
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
             {/* KPI Cards */}
             <div className="grid grid-4" style={{ marginBottom: 20 }}>
               {metricConfig.overviewCards.map((key) => (
                 <MetricCard
                   key={key}
                   label={metricConfig.labels[key] || key}
                   value={formatMetric(key, getCurrentValue(key))}
                   icon={
                     key === 'spend'
                       ? DollarSign
                       : key === 'clicks'
                       ? MousePointerClick
                       : key === 'conversions' || key === 'orders'
                       ? Target
                       : TrendingUp
                   }
                   color={
                     key === 'spend'
                       ? '#2563EB'
                       : key === 'revenue' || key === 'roas' || key === 'profit'
                       ? '#16A34A'
                       : key === 'cpa' || key === 'refunds'
                       ? '#DC2626'
                       : '#7C3AED'
                   }
                   change={comparison?.comparison?.[key]?.change}
                  changeType={['cpc', 'cpa', 'refunds'].includes(key) ? 'negative-good' : 'positive-good'}
                 />
               ))}
             </div>


              {/* MoM Comparison */}
              {comparison && (
                <div className="card card-pad">
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Month-over-Month Comparison</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Previous Month</th>
                          <th>Current Month</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metricConfig.overviewCards.map((key) => ({
                           key,
                           label: metricConfig.labels[key] || key,
                           fmt: (value) => formatMetric(key, value),
                         })).map(({ key, label, fmt: f }) => {
                          const d = comparison.comparison[key];
                          if (!d) return null;
                          const hasPreviousData = d.hasPreviousData !== false && d.change !== null && Number.isFinite(Number(d.change));
                          const numericChange = hasPreviousData ? Number(d.change) : 0;
                         const isNeutral = !hasPreviousData || numericChange === 0 || key === 'spend';
                         const positive = isNeutral ? null : isPositiveChange(key, numericChange);

                          const changeLabel = !hasPreviousData
                            ? 'No previous data'
                            : Math.abs(numericChange) > 300
                            ? numericChange > 0
                              ? 'High increase'
                              : 'High decrease'
                            : `${numericChange > 0 ? '+' : ''}${fmt(numericChange, 1)}%`;
                          return (
                            <tr key={key}>
                              <td style={{ fontWeight: 600 }}>{label}</td>
                              <td style={{ color: 'var(--text2)' }}>{f(d.previous)}</td>
                              <td style={{ fontWeight: 600 }}>{f(d.current)}</td>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  background: isNeutral ? 'var(--bg3)' : positive ? 'var(--success-light)' : 'var(--danger-light)',
                                  color: isNeutral ? 'var(--text3)' : positive ? 'var(--success)' : 'var(--danger)',
                                }}>
                                  {changeLabel}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

           {/* Campaign Summary */}
                {campaigns.length > 0 && (
                  <div className="card card-pad" style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                      Campaign Summary
                    </div>

                    <div className="grid grid-4" style={{ gap: 12 }}>
                      <MetricCard
                        label="Campaigns"
                        value={campaigns.length}
                        icon={Target}
                        color="#2563EB"
                      />

                      <MetricCard
                        label="Total Spend"
                        value={fmtReportCur(totalCampaignSpend)}
                        icon={DollarSign}
                        color="#16A34A"
                      />

                      <MetricCard
                        label={metricConfig.primaryMetricLabel}
                        value={fmt(
                          campaigns.reduce(
                            (sum, c) => sum + Number(c.conversions || c.orders || 0),
                            0
                          )
                        )}
                        icon={Target}
                        color="#7C3AED"
                      />

                      <MetricCard
                        label={metricConfig.roasLabel}
                        value={
                          normalizedReportType === 'sales_data'
                            ? fmtPct(
                                campaigns.reduce((sum, c) => sum + Number(c.margin || 0), 0) /
                                  Math.max(campaigns.length, 1)
                              )
                            : `${fmt(
                                campaigns.reduce((sum, c) => sum + Number(c.roas || 0), 0) /
                                  Math.max(campaigns.length, 1),
                                2
                              )}x`
                        }
                        icon={TrendingUp}
                        color="#F59E0B"
                      />
                    </div>
                  </div>
                )}

            </div>
          )}



          {/* Trends Tab */}
          {activeTab === 'trends' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {trends.length === 0 ? (
                <div className="card card-pad" style={{ textAlign: 'center', padding: 48, color: 'var(--text3)' }}>
                  No trend data available. Upload reports to see monthly trends.
                </div>
              ) : (
                <>
                  <div className="card card-pad">
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Monthly Spend Trend</div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trends}>
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                       <YAxis
                         tickFormatter={(v) =>
                           `${currencySymbol}${Math.round(v / 1000)}k`
                         }
                       />

                       <Tooltip
                         content={<Tooltip_ prefix={`${currencySymbol} `} />}
                       />
                        <Line type="monotone" dataKey="spend" stroke="#2563EB" strokeWidth={2.5} dot={{ fill: '#2563EB', r: 3 }} name="Spend" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-2">
                    <div className="card card-pad">
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>{trendConfig.title}</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={trends}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<Tooltip_ />} />
                         <Bar
                           dataKey={trendConfig.firstKey}
                           fill="#7C3AED"
                           name={trendConfig.firstLabel}
                           radius={[3, 3, 0, 0]}
                         />
                        <Bar
                          dataKey={trendConfig.secondKey}
                          fill="#059669"
                          name={trendConfig.secondLabel}
                          radius={[3, 3, 0, 0]}
                        />
                          <Legend iconSize={10} iconType="circle" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="card card-pad">
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Monthly Data Table</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table>
                          <thead>
                            <tr><th>Month</th><th>Spend</th>
                                              <th>{trendConfig.tableSecond}</th>
                                              <th>{trendConfig.tableThird}</th></tr>
                          </thead>
                          <tbody>
                            {trends.map(row => (
                              <tr key={row.month}>
                                <td style={{ fontWeight: 600, fontSize: 12 }}>{row.month}</td>
                                <td>{fmtReportCur(row.spend)}</td>
                                <td>
                                  {trendConfig.firstKey === 'revenue'
                                    ? fmtReportCur(row.revenue)
                                    : fmt(row[trendConfig.firstKey])}
                                </td>

                                <td>
                                  {trendConfig.secondKey === 'revenue'
                                    ? fmtReportCur(row.revenue)
                                    : fmt(row[trendConfig.secondKey])}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}


          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="card">
           <div className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>


                <div style={{ fontWeight: 700, fontSize: 14 }}>Campaign Performance</div>

              </div>

               {campaigns.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text3)' }}>
                  No campaign data. Upload reports with campaign names to see breakdown.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {campaignColumns.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {campaigns.map((c, i) => (
                        <tr key={i}>
                          {campaignColumns.map((col) => (
                            <td key={col.key} style={col.key === 'name' ? { maxWidth: 260 } : undefined}>
                              {col.key === 'name' ? (
                                <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>
                                  {col.format(c)}
                                </span>
                              ) : (
                                <span style={{ fontWeight: ['spend', 'revenue', 'profit', 'roas'].includes(col.key) ? 700 : 500 }}>
                                  {col.format(c)}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

            {/* Platforms Tab */}
            {activeTab === 'platforms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                <div className="grid grid-3" style={{ gap: 16 }}>
                  <div className="card card-pad">
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                      ACTIVE PLATFORMS
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>
                      {platforms.length}
                    </div>
                  </div>

                 <div className="card card-pad">
                   <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                     TOP SPEND PLATFORM
                   </div>

                   <div
                     style={{
                       fontSize: 22,
                       fontWeight: 800,
                       marginTop: 8,
                       textTransform: 'capitalize',
                     }}
                   >
                     {topPlatform?.platform || 'N/A'}
                   </div>

                   <div
                     style={{
                       marginTop: 8,
                       fontSize: 13,
                       color: 'var(--text3)',
                     }}
                   >
                     {topPlatform ? fmtReportCur(topPlatform.spend) : 'INR 0.00'}
                   </div>
                 </div>


                  <div className="card card-pad">
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                      TOTAL PLATFORM SPEND
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>
                      {fmtReportCur(totalPlatformSpend)}
                    </div>
                  </div>
                </div>

               <div className="card card-pad">
                 <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                   Platform Summary
                 </div>

                 {platforms.length === 0 ? (
                   <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
                     No platform data available
                   </div>
                 ) : (
                   <div
                     style={{
                       display: 'grid',
                       gridTemplateColumns: '1.2fr 2fr',
                       gap: 20,
                       alignItems: 'stretch',
                     }}
                   >
                     <div
                       style={{
                         padding: 20,
                         borderRadius: 12,
                         background: '#EFF6FF',
                         border: '1px solid #BFDBFE',
                       }}
                     >
                       <div
                         style={{
                           fontSize: 18,
                           fontWeight: 800,
                           textTransform: 'capitalize',
                           marginBottom: 8,
                         }}
                       >
                         {topPlatform?.platform || platforms[0]?.platform || 'N/A'}
                       </div>

                       <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                         {platforms.length === 1
                           ? normalizedReportType === 'sales_campaign'
                             ? 'This report contains sales campaign data from one platform.'
                             : normalizedReportType === 'lead_generation'
                             ? 'This report contains lead generation data from one platform.'
                             : normalizedReportType === 'sales_data'
                             ? 'This report contains sales data from one channel.'
                             : 'This report contains tracked performance from one platform.'
                           : 'This report contains data from multiple platforms.'}
                       </div>
                     </div>

                     <div className="grid grid-4" style={{ gap: 12 }}>
                       {platformColumns
                         .filter((col) => col.key !== 'platform')
                         .slice(0, 4)
                         .map((col) => (
                           <div
                             key={col.key}
                             style={{
                               padding: 16,
                               borderRadius: 12,
                               border: '1px solid var(--border)',
                               background: 'var(--bg2)',
                             }}
                           >
                             <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700 }}>
                               {col.label.toUpperCase()}
                             </div>

                             <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>
                               {col.format(topPlatform || platforms[0] || {})}
                             </div>
                           </div>
                         ))}
                     </div>
                   </div>
                 )}
               </div>

                <div className="card card-pad">
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                    Platform Breakdown
                  </div>

                  <table>
                    <thead>
                      <tr>
                        {platformColumns.map((col) => (
                          <th key={col.key}>{col.label}</th>
                        ))}
                        <th>Share</th>
                      </tr>
                    </thead>

                    <tbody>
                      {platforms.map((p, i) => {
                        const spend = parseFloat(p.spend || 0);
                        const share =
                          totalPlatformSpend > 0 ? (spend / totalPlatformSpend) * 100 : 0;

                        return (
                          <tr key={i}>
                            {platformColumns.map((col) => (
                              <td key={col.key}>
                                {col.key === 'platform' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: COLORS[i % COLORS.length],
                                      }}
                                    />
                                    <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                                      {col.format(p)}
                                    </span>
                                  </div>
                                ) : (
                                  <span
                                    style={{
                                      fontWeight: ['spend', 'revenue', 'profit', 'roas'].includes(col.key)
                                        ? 700
                                        : 500,
                                    }}
                                  >
                                    {col.format(p)}
                                  </span>
                                )}
                              </td>
                            ))}
                            <td>{fmt(share, 1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </div>

            )}

             {/* AI Insights Tab */}
{activeTab === 'ai insights' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

    <div className="card card-pad">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {aiConfig.title}
          </div>

          <div
            style={{
              fontSize: 13,
              color: 'var(--text3)',
              marginTop: 4,
            }}
          >
            {aiConfig.subtitle}
          </div>
        </div>

        <button
          className="btn btn-primary"
          disabled={aiLoading}
          onClick={async () => {
            try {
              setAiLoading(true);

              const result = await generateAIInsights(id);

              setAiInsight(result);

              toast.success('AI insights generated');
            } catch {
              toast.error('Failed to generate AI insights');
            } finally {
              setAiLoading(false);
            }
          }}
        >
          {aiLoading ? 'Generating...' : `Generate ${aiConfig.title}`}
        </button>
      </div>

      {!aiInsight ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--text3)',
          }}
        >
          No AI insights generated yet.
        </div>
      ) : (
        <>
          <div
            style={{
              padding: 18,
              borderRadius: 14,
              background: 'linear-gradient(135deg,#EEF2FF,#F8FAFC)',
              border: '1px solid #C7D2FE',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                marginBottom: 10,
              }}
            >
              {aiConfig.summaryTitle}
            </div>

            <div
              style={{
                fontSize: 14,
                color: 'var(--text2)',
                lineHeight: 1.7,
              }}
            >
              {aiInsight.summary}
            </div>
          </div>

<div
  style={{
    fontSize: 11,
    color: 'var(--text3)',
    marginBottom: 16,
  }}
>
  Generated on:{' '}
  {aiInsight.created_at
    ? new Date(aiInsight.created_at).toLocaleString()
    : 'Recently'}
</div>

          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                marginBottom: 14,
              }}
            >
             {aiConfig.recommendationTitle}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {(Array.isArray(aiInsight.recommendations)
                ? aiInsight.recommendations
                : JSON.parse(aiInsight.recommendations || '[]')
              ).map((rec, index) => (
                <div
                  key={index}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    background: 'var(--bg2)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: '#DBEAFE',
                        color: '#2563EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--text2)',
                        lineHeight: 1.7,
                      }}
                    >
                      {rec}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  </div>
)}

{/* Integrations Tab */}
{/*
{activeTab === 'integrations' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
*/}
    {/* Header */}
    {/*
    <div
      className="card card-pad"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          Platform Integrations
        </div>

        <div
          style={{
            fontSize: 13,
            color: 'var(--text3)',
            marginTop: 4,
          }}
        >
          Connect and sync advertising platforms with live campaign data
        </div>
      </div>

      <div
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          background: '#DCFCE7',
          color: '#15803D',
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        ● Live Data Ready
      </div>
    </div>
*/}
    {/* Platform Cards */}
      {/*
    <div className="grid grid-3" style={{ gap: 20 }}>

      {[
        {
          key: 'meta',
          name: 'Meta Ads',
          color: '#1877F2',
          desc: 'Facebook & Instagram campaigns',
        },
        {
          key: 'google',
          name: 'Google Ads',
          color: '#34A853',
          desc: 'Search, Display & YouTube ads',
        },
        {
          key: 'linkedin',
          name: 'LinkedIn Ads',
          color: '#0A66C2',
          desc: 'B2B and professional audience campaigns',
        },
      ].map((platform) => {
        const connected = adAccounts.find(
          a => a.platform === platform.key
        );




        return (
          <div
            key={platform.key}
            className="card card-pad"
            style={{
              border: connected
                ? `1px solid ${platform.color}30`
                : '1px solid var(--border)',
              background: connected
                ? `${platform.color}08`
                : 'var(--bg2)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: `${platform.color}20`,
                    color: platform.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 900,
                    marginBottom: 14,
                  }}
                >
                  {platform.name.charAt(0)}
                </div>

                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {platform.name}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text3)',
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {platform.desc}
                </div>
              </div>

              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  background: connected
                    ? '#DCFCE7'
                    : 'var(--bg3)',
                  color: connected
                    ? '#15803D'
                    : 'var(--text3)',
                }}
              >
                {connected ? 'Connected' : 'Available'}
              </div>
            </div>

            {connected ? (
              <>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--text3)' }}>
                      Account
                    </span>

                    <span style={{ fontWeight: 700 }}>
                      {connected.ad_account_id}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ color: 'var(--text3)' }}>
                      Last Sync
                    </span>

                    <span style={{ fontWeight: 700 }}>
                      {connected.last_synced_at
                        ? new Date(
                            connected.last_synced_at
                          ).toLocaleString()
                        : 'Not synced'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() =>
                      handleSyncAdAccount(connected.id)
                    }
                  >
                    Sync Now
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ color: '#DC2626' }}
                    onClick={() =>
                      handleDeleteAdAccount(connected.id)
                    }
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setAdForm({
                    ...adForm,
                    platform: platform.key,
                    adAccountId: `act_${Date.now()}`,
                  });

                  handleAddAdAccount();
                }}
                style={{
                  width: '100%',
                  background: platform.color,
                  borderColor: platform.color,
                }}
              >
                Connect {platform.name}
              </button>
            )}
          </div>
        );
      })}
    </div>
*/}
    {/* Sync Logs */}
    {/*
    <div className="card card-pad">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            Recent Sync Activity
          </div>

          <div
            style={{
              fontSize: 13,
              color: 'var(--text3)',
              marginTop: 4,
            }}
          >
            Latest platform synchronization logs
          </div>
        </div>

        <div
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            background: '#DBEAFE',
            color: '#2563EB',
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          LIVE LOGS
        </div>
      </div>

      {syncLogs.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--text3)',
          }}
        >
          No sync activity yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {syncLogs.map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: 14,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {log.platform?.toUpperCase()} sync {log.status}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text3)',
                    marginTop: 4,
                  }}
                >
                  {log.rows_synced} campaign(s) synced
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text3)',
                }}
              >
                {new Date(log.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}
*/}
            </>
          )}
        </div>
      );
    }
