import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileBarChart2, Download, ExternalLink, Clock } from 'lucide-react';
import { getClients, generateReport, getReportHistory, getSummary } from '../utils/api';
const PLATFORMS = ['all', 'meta', 'google', 'linkedin', 'twitter', 'tiktok'];
const BACKEND_URL = 'https://marketing-report-generator-p9wj.onrender.com';

const getPdfUrl = (pathOrUrl) => {
  if (!pathOrUrl) return '#';
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return `${BACKEND_URL}${pathOrUrl}`;
};

export default function Reports() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    clientId: '',
    dateStart: '',
    dateEnd: '',
    platform: 'all',
    customTitle: '',
    includeComparison: true,
  });
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    getClients().then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.clientId) {
      getReportHistory(form.clientId).then(setHistory).catch(() => {});
    } else {
      setHistory([]);
    }
  }, [form.clientId]);
useEffect(() => {
  if (form.clientId) {
    getSummary(form.clientId)
      .then(setSummary)
      .catch(() => setSummary(null));
  } else {
    setSummary(null);
  }
}, [form.clientId]);

  const set = (k) => (e) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const handleGenerate = async () => {
    if (!form.clientId) {
      toast.error('Please select a client');
      return;
    }

    setGenerating(true);
    setGeneratedUrl(null);

    try {
      const result = await generateReport({
        clientId: form.clientId,
        dateStart: form.dateStart || undefined,
        dateEnd: form.dateEnd || undefined,
        platform: form.platform !== 'all' ? form.platform : undefined,
        customTitle: form.customTitle || undefined,
        includeComparison: form.includeComparison,
        agencyBranding: true,
      });

      const url = getPdfUrl(result.url);
      setGeneratedUrl(url);

      toast.success('Report generated!');

      if (form.clientId) {
        getReportHistory(form.clientId).then(setHistory);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const client = clients.find((c) => String(c.id) === String(form.clientId));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Generate Reports</div>
        <div className="page-subtitle">Create beautiful PDF reports for your clients</div>
      </div>

      <div className="grid grid-2" style={{ gap: 20, alignItems: 'start' }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 20 }}>
            Report Configuration
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Client *</label>
              <select className="form-select" value={form.clientId} onChange={set('clientId')}>
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Custom Report Title</label>
              <input
                className="form-input"
                placeholder={client ? `Performance Report — ${client.name}` : 'Performance Report'}
                value={form.customTitle}
                onChange={set('customTitle')}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Platform Filter</label>
              <select className="form-select" value={form.platform} onChange={set('platform')}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'all' ? 'All Platforms' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">Date From</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.dateStart}
                  onChange={set('dateStart')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date To</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.dateEnd}
                  onChange={set('dateEnd')}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="incl-comp"
                checked={form.includeComparison}
                onChange={set('includeComparison')}
                style={{ cursor: 'pointer' }}
              />
              <label
                htmlFor="incl-comp"
                style={{ fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}
              >
                Include month-over-month comparison
              </label>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={handleGenerate}
              disabled={generating || !form.clientId}
              style={{ justifyContent: 'center', marginTop: 4 }}
            >
              {generating ? (
                <>
                  <span
                    className="spin"
                    style={{
                      width: 15,
                      height: 15,
                      border: '2px solid rgba(255,255,255,.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      display: 'inline-block',
                    }}
                  />{' '}
                  Generating...
                </>
              ) : (
                <>
                  <FileBarChart2 size={15} /> Generate PDF Report
                </>
              )}
            </button>

            {generatedUrl && (
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--success-light)',
                  border: '1px solid #A7F3D0',
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--success)',
                    marginBottom: 8,
                  }}
                >
                  ✓ Report Generated!
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={generatedUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <Download size={12} /> Download PDF
                  </a>

                  <a
                    href={generatedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    <ExternalLink size={12} /> Preview
                  </a>
                </div>
              </div>
            )}
        {summary && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>
              Live Performance Snapshot
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { label: 'Spend', value: `Rs. ${Number(summary.spend || 0).toLocaleString('en-IN')}` },
                { label: 'Reach', value: Number(summary.reach || 0).toLocaleString('en-IN') },
                { label: 'Impressions', value: Number(summary.impressions || 0).toLocaleString('en-IN') },
                { label: 'Leads', value: Number(summary.conversions || 0).toLocaleString('en-IN') },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg,#F8FAFC,#EEF2FF)',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
         <div
           className="card card-pad"
           style={{
             background: 'linear-gradient(135deg,#EEF2FF,#F8FAFC)',
             border: '1px solid #C7D2FE',
             boxShadow: '0 18px 35px rgba(15, 23, 42, 0.08)',
           }}
         >

           <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
             <div
               style={{
                 width: 38,
                 height: 38,
                 borderRadius: 12,
                 background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
               }}
             >
               <FileBarChart2 size={18} color="#fff" />
             </div>
             <div>
               <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                 Premium PDF Report
               </div>
               <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                 Visual, clean and mentor-ready format
               </div>
             </div>
           </div>

           {[
             { title: 'Executive Summary', desc: 'Spend, reach, impressions, leads and cost per lead' },
             { title: 'Visual Charts', desc: 'Top campaign spend bar chart inside PDF' },
             { title: 'Campaign Table', desc: 'Campaign-wise performance breakdown' },
             { title: 'Insights', desc: 'Auto-written observations and recommendations' },
             { title: 'Branding', desc: 'Agency name, colors and professional cover page' },
           ].map((item, i) => (
             <div
               key={i}
               style={{
                 display: 'flex',
                 gap: 10,
                 padding: '10px 0',
                 borderTop: i === 0 ? 'none' : '1px solid rgba(99,102,241,.15)',
               }}
             >
               <div
                 style={{
                   width: 22,
                   height: 22,
                   borderRadius: '50%',
                   background: '#DCFCE7',
                   color: '#15803D',
                   fontSize: 12,
                   fontWeight: 800,
                   display: 'flex',
                   alignItems: 'center',
                   justifyContent: 'center',
                   flexShrink: 0,
                 }}
               >
                 ✓
               </div>
               <div>
                 <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                   {item.title}
                 </div>
                 <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                   {item.desc}
                 </div>
               </div>
             </div>
           ))}
         </div>
          <div className="card">
            <div
              className="card-pad"
              style={{
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Clock size={14} style={{ color: 'var(--text3)' }} />
              <div style={{ fontWeight: 700, fontSize: 14 }}>Report History</div>
            </div>

            {!form.clientId ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                Select a client to see history
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No reports generated yet
              </div>
            ) : (
              history.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: 'var(--primary-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FileBarChart2 size={14} color="var(--primary)" />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>

                  {r.file_path && (
                    <a
                      href={getPdfUrl(r.file_path)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--primary)' }}
                    >
                      <Download size={12} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}