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
} from '../utils/api';
import { MetricCard } from '../components/MetricCard';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend ,} from 'recharts';
import { ArrowLeft, TrendingUp, DollarSign, MousePointerClick, Target, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
const PLATFORMS = ['all', 'meta', 'google', 'linkedin', 'twitter', 'tiktok', 'other'];

const fmt = (n, d = 0) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCur = (n) => `INR ${fmt(n, 2)}`;
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
          };
        }

        byMonth[row.month].spend += parseFloat(row.spend || 0);
        byMonth[row.month].clicks += parseFloat(row.clicks || 0);
        byMonth[row.month].conversions += parseFloat(row.conversions || 0);
        byMonth[row.month].impressions += parseFloat(row.impressions || 0);
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
          <div className="page-subtitle">{client?.industry || 'Performance Dashboard'}</div>
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
                <MetricCard label="Total Spend" value={fmtCur(currentMonthMetrics.spend?.current)} icon={DollarSign} color="#2563EB"
                  change={comparison?.comparison?.spend?.change} changeType="neutral" />
                <MetricCard label="Impressions" value={fmt(currentMonthMetrics.impressions?.current)} icon={TrendingUp} color="#7C3AED"
                  change={comparison?.comparison?.impressions?.change} />
                <MetricCard label="Clicks" value={fmt(currentMonthMetrics.clicks?.current)} icon={MousePointerClick} color="#059669"
                  change={comparison?.comparison?.clicks?.change} />
                <MetricCard label="Conversions" value={fmt(currentMonthMetrics.conversions?.current)} icon={Target} color="#D97706"
                  change={comparison?.comparison?.conversions?.change} />
              </div>
              <div className="grid grid-4" style={{ marginBottom: 20 }}>
                <MetricCard
                  label="CTR"
                  value={fmtPct(currentMonthMetrics.ctr?.current)}
                  color="#0891B2"
                  change={comparison?.comparison?.ctr?.change}
                />

             <MetricCard
               label="CPC"
               value={fmtCur(currentMonthMetrics.cpc?.current)}
               color="#7C3AED"
               change={comparison?.comparison?.cpc?.change}
               changeType="negative-good"
             />

                <MetricCard
                  label="CPA"
                  value={fmtCur(currentMonthMetrics.cpa?.current)}
                  color="#DC2626"
                  change={comparison?.comparison?.cpa?.change}
                  changeType="negative-good"
                />

                <MetricCard
                  label="Revenue"
                  value={fmtCur(currentMonthMetrics.revenue?.current)}
                  color="#16A34A"
                  change={comparison?.comparison?.revenue?.change}
                />
              </div>

              <div className="grid grid-4" style={{ marginBottom: 20 }}>
                <MetricCard
                  label="ROAS"
                  value={`${fmt(currentMonthMetrics.roas?.current, 2)}x`}
                  color="#059669"
                  change={comparison?.comparison?.roas?.change}
                />
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
                        {[
                          { key: 'spend', label: 'Spend', fmt: fmtCur },
                          { key: 'impressions', label: 'Impressions', fmt: fmt },
                          { key: 'clicks', label: 'Clicks', fmt: fmt },
                          { key: 'ctr', label: 'CTR', fmt: fmtPct },
                          { key: 'cpc', label: 'CPC', fmt: fmtCur },
                          { key: 'conversions', label: 'Conversions', fmt: fmt },
                          { key: 'cpa', label: 'CPA', fmt: fmtCur },
                          { key: 'roas', label: 'ROAS', fmt: v => `${fmt(v, 2)}x` },
                        ].map(({ key, label, fmt: f }) => {
                          const d = comparison.comparison[key];
                          if (!d) return null;
                          const hasPreviousData = d.hasPreviousData !== false && d.change !== null && Number.isFinite(Number(d.change));
                          const numericChange = hasPreviousData ? Number(d.change) : 0;
                          const isCostMetric = ['cpc', 'cpa', 'cpl'].includes(key);
                          const isNeutral = !hasPreviousData || numericChange === 0 || key === 'spend';
                          const positive = isCostMetric ? numericChange < 0 : numericChange > 0;
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
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<Tooltip_ prefix="$" />} />
                        <Line type="monotone" dataKey="spend" stroke="#2563EB" strokeWidth={2.5} dot={{ fill: '#2563EB', r: 3 }} name="Spend" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-2">
                    <div className="card card-pad">
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Clicks vs Conversions</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={trends}>
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<Tooltip_ />} />
                          <Bar dataKey="clicks" fill="#7C3AED" name="Clicks" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="conversions" fill="#059669" name="Conv." radius={[3, 3, 0, 0]} />
                          <Legend iconSize={10} iconType="circle" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="card card-pad">
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Monthly Data Table</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table>
                          <thead>
                            <tr><th>Month</th><th>Spend</th><th>Clicks</th><th>Conv.</th></tr>
                          </thead>
                          <tbody>
                            {trends.map(row => (
                              <tr key={row.month}>
                                <td style={{ fontWeight: 600, fontSize: 12 }}>{row.month}</td>
                                <td>{fmtCur(row.spend)}</td>
                                <td>{fmt(row.clicks)}</td>
                                <td>{fmt(row.conversions)}</td>
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
                        <th>Campaign</th>
                        <th>Platform</th>
                        <th>Spend</th>
                        <th>Share</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>CPC</th>
                        <th>Conv.</th>
                        <th>CPA</th>
                        <th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 200 }}>
                            <span
                              className="truncate"
                              style={{ display: 'block', fontWeight: 600 }}
                            >
                              {c.campaign_name || 'Unknown'}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`badge badge-${
                                c.platform === 'meta'
                                  ? 'blue'
                                  : c.platform === 'google'
                                  ? 'yellow'
                                  : 'gray'
                              }`}
                            >
                              {c.platform}
                            </span>
                          </td>

                          <td style={{ fontWeight: 600 }}>{fmtCur(c.spend)}</td>

                          <td>
                            {totalCampaignSpend > 0
                              ? (
                                  (parseFloat(c.spend || 0) / totalCampaignSpend) *
                                  100
                                ).toFixed(1)
                              : 0}
                            %
                          </td>

                          <td>{fmt(c.clicks)}</td>
                          <td>{fmtPct(c.ctr)}</td>
                          <td>{fmtCur(c.cpc)}</td>
                          <td>{fmt(c.conversions)}</td>
                          <td>{fmtCur(c.cpa)}</td>
                          <td>
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  parseFloat(c.roas) >= 2
                                    ? 'var(--success)'
                                    : 'var(--text)',
                              }}
                            >
                              {fmt(c.roas, 2)}x
                            </span>
                          </td>
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
                     {topPlatform ? fmtCur(topPlatform.spend) : 'INR 0.00'}
                   </div>
                 </div>


                  <div className="card card-pad">
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                      TOTAL PLATFORM SPEND
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>
                      {fmtCur(totalPlatformSpend)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-2" style={{ gap: 20 }}>
                  <div className="card card-pad">
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                      Budget Allocation by Platform
                    </div>

                    {platformData.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
                        No platform data available
                      </div>
                    ) : platformData.length === 1 ? (
                      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                              fontWeight: 700,
                              marginBottom: 8,
                              textTransform: 'capitalize',
                            }}
                          >
                            {platformData[0].name}
                          </div>

                          <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                            This client currently spends <strong>100%</strong> of the tracked budget on this platform.
                            Add Google, LinkedIn, or other platform data to compare performance.
                          </div>
                        </div>

                        <div className="grid grid-2">
                          <div className="card card-pad">
                            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                              SPEND
                            </div>
                            <div style={{ fontWeight: 800, marginTop: 8 }}>
                              {fmtCur(platforms[0]?.spend)}
                            </div>
                          </div>

                          <div className="card card-pad">
                            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                              CONVERSIONS
                            </div>
                            <div style={{ fontWeight: 800, marginTop: 8 }}>
                              {fmt(platforms[0]?.conversions)}
                            </div>
                          </div>

                          <div className="card card-pad">
                            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                              CLICKS
                            </div>
                            <div style={{ fontWeight: 800, marginTop: 8 }}>
                              {fmt(platforms[0]?.clicks)}
                            </div>
                          </div>

                          <div className="card card-pad">
                            <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700 }}>
                              CPA
                            </div>
                            <div style={{ fontWeight: 800, marginTop: 8 }}>
                              {fmtCur(platforms[0]?.cpa)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={platformData}
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            dataKey="value"
                            nameKey="name"
                          >
                            {platformData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>

                          <Tooltip formatter={v => fmtCur(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div className="card card-pad">
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
                      Platform Breakdown
                    </div>

                    <table>
                      <thead>
                        <tr>
                          <th>Platform</th>
                          <th>Spend</th>
                          <th>Share</th>
                          <th>Clicks</th>
                        <th>Conv.</th>
                        <th>CTR</th>
                        <th>CPA</th>
                          <th>ROAS</th>
                        </tr>
                      </thead>

                      <tbody>
                        {platforms.map((p, i) => {
                          const spend = parseFloat(p.spend || 0);
                          const share = totalPlatformSpend > 0
                            ? (spend / totalPlatformSpend) * 100
                            : 0;

                          return (
                            <tr key={i}>
                              <td>
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
                                    {p.platform}
                                  </span>
                                </div>
                              </td>

                              <td>{fmtCur(p.spend)}</td>
                              <td>{fmt(share, 1)}%</td>
                              <td>{fmt(p.clicks)}</td>
                              <td>{fmt(p.conversions)}</td>
                              <td>{fmtPct(p.ctr)}</td>
                              <td>{fmtCur(p.cpa)}</td>
                              <td style={{ fontWeight: 700 }}>{fmt(p.roas, 2)}x</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
            AI Marketing Insights
          </div>

          <div
            style={{
              fontSize: 13,
              color: 'var(--text3)',
              marginTop: 4,
            }}
          >
            AI-powered campaign analysis and recommendations
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
          {aiLoading ? 'Generating...' : 'Generate Insights'}
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
              Performance Summary
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
              AI Recommendations
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
