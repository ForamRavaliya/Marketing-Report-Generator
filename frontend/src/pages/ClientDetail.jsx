import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getSummary, getTrends, getComparison, getCampaigns, getPlatforms } from '../utils/api';
import { MetricCard } from '../components/MetricCard';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ArrowLeft, TrendingUp, DollarSign, MousePointerClick, Target, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
const PLATFORMS = ['all', 'meta', 'google', 'linkedin', 'twitter', 'tiktok', 'other'];

const fmt = (n, d = 0) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtCur = (n) => `$${fmt(n, 2)}`;
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
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(() => {
    setLoading(true);
    const params = { platform: platform !== 'all' ? platform : undefined };
    Promise.all([
      getClient(id),
      getSummary(id, params),
      getTrends(id, { ...params, months: 6 }),
      getComparison(id, params),
      getCampaigns(id, params),
      getPlatforms(id, params),
    ]).then(([c, s, t, cmp, camp, plat]) => {
      setClient(c); setSummary(s);
      // Aggregate trends by month
      const byMonth = {};
      t.forEach(row => {
        if (!byMonth[row.month]) byMonth[row.month] = { month: row.month, spend: 0, clicks: 0, conversions: 0, impressions: 0 };
        byMonth[row.month].spend += parseFloat(row.spend || 0);
        byMonth[row.month].clicks += parseFloat(row.clicks || 0);
        byMonth[row.month].conversions += parseFloat(row.conversions || 0);
        byMonth[row.month].impressions += parseFloat(row.impressions || 0);
      });
      setTrends(Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)));
      setComparison(cmp); setCampaigns(camp); setPlatforms(plat);
    }).catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, [id, platform]);

  useEffect(() => { load(); }, [load]);

  const platformData = platforms.map(p => ({ name: p.platform, value: parseFloat(p.spend || 0) }));

  if (!client && !loading) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <p>Client not found</p>
      <button className="btn btn-primary" onClick={() => navigate('/clients')}>Back to Clients</button>
    </div>
  );

  const TABS = ['overview', 'trends', 'campaigns', 'platforms'];

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
                <MetricCard label="Total Spend" value={fmtCur(summary?.total_spend)} icon={DollarSign} color="#2563EB"
                  change={comparison?.comparison?.spend?.change} />
                <MetricCard label="Impressions" value={fmt(summary?.total_impressions)} icon={TrendingUp} color="#7C3AED"
                  change={comparison?.comparison?.impressions?.change} />
                <MetricCard label="Clicks" value={fmt(summary?.total_clicks)} icon={MousePointerClick} color="#059669"
                  change={comparison?.comparison?.clicks?.change} />
                <MetricCard label="Conversions" value={fmt(summary?.total_conversions)} icon={Target} color="#D97706"
                  change={comparison?.comparison?.conversions?.change} />
              </div>
              <div className="grid grid-4" style={{ marginBottom: 20 }}>
                <MetricCard label="CTR" value={fmtPct(summary?.avg_ctr)} color="#0891B2"
                  change={comparison?.comparison?.ctr?.change} />
                <MetricCard label="CPC" value={fmtCur(summary?.avg_cpc)} color="#7C3AED"
                  change={comparison?.comparison?.cpc?.change} />
                <MetricCard label="CPA" value={fmtCur(summary?.avg_cpa)} color="#DC2626"
                  change={comparison?.comparison?.cpa?.change} />
                <MetricCard label="ROAS" value={`${fmt(summary?.avg_roas, 2)}x`} color="#059669"
                  change={comparison?.comparison?.roas?.change} />
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
                          const up = d.change > 0;
                          const isGoodUp = !['cpc', 'cpa', 'spend'].includes(key);
                          const positive = (up && isGoodUp) || (!up && !isGoodUp);
                          return (
                            <tr key={key}>
                              <td style={{ fontWeight: 600 }}>{label}</td>
                              <td style={{ color: 'var(--text2)' }}>{f(d.previous)}</td>
                              <td style={{ fontWeight: 600 }}>{f(d.current)}</td>
                              <td>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                  background: d.change === 0 ? 'var(--bg3)' : positive ? 'var(--success-light)' : 'var(--danger-light)',
                                  color: d.change === 0 ? 'var(--text3)' : positive ? 'var(--success)' : 'var(--danger)',
                                }}>
                                  {d.change > 0 ? '+' : ''}{fmt(d.change, 1)}%
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
                        <th>Campaign</th><th>Platform</th><th>Spend</th>
                        <th>Clicks</th><th>CTR</th><th>CPC</th><th>Conv.</th><th>CPA</th><th>ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 200 }}><span className="truncate" style={{ display: 'block', fontWeight: 600 }}>{c.campaign_name || 'Unknown'}</span></td>
                          <td><span className={`badge badge-${c.platform === 'meta' ? 'blue' : c.platform === 'google' ? 'yellow' : 'gray'}`}>{c.platform}</span></td>
                          <td style={{ fontWeight: 600 }}>{fmtCur(c.spend)}</td>
                          <td>{fmt(c.clicks)}</td>
                          <td>{fmtPct(c.ctr)}</td>
                          <td>{fmtCur(c.cpc)}</td>
                          <td>{fmt(c.conversions)}</td>
                          <td>{fmtCur(c.cpa)}</td>
                          <td><span style={{ fontWeight: 700, color: parseFloat(c.roas) >= 2 ? 'var(--success)' : 'var(--text)' }}>{fmt(c.roas, 2)}x</span></td>
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
            <div className="grid grid-2" style={{ gap: 20 }}>
              <div className="card card-pad">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Budget Allocation by Platform</div>
                {platformData.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text3)' }}>No platform data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={platformData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {platformData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => fmtCur(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="card card-pad">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Platform Breakdown</div>
                <table>
                  <thead><tr><th>Platform</th><th>Spend</th><th>Clicks</th><th>Conv.</th><th>ROAS</th></tr></thead>
                  <tbody>
                    {platforms.map((p, i) => (
                      <tr key={i}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{p.platform}</span>
                        </div></td>
                        <td>{fmtCur(p.spend)}</td>
                        <td>{fmt(p.clicks)}</td>
                        <td>{fmt(p.conversions)}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(p.roas, 2)}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
