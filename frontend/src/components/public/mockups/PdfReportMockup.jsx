import React from 'react';

// Stylized representation of a generated PDF report's cover + executive
// summary, matching the real structure produced by routes/reports.js +
// utils/pdf/* (cover page, KPI cards, campaign table). Illustrative data
// only -- not a real client's report.
export default function PdfReportMockup({ variant = 'lead' }) {
  const isLead = variant === 'lead';
  const accent = isLead ? '#2563EB' : '#059669';

  const kpis = isLead
    ? [
        { label: 'Total Leads', value: '312' },
        { label: 'Cost / Lead', value: '₹399' },
        { label: 'Impressions', value: '2,84,600' },
      ]
    : [
        { label: 'Total Purchases', value: '1,204' },
        { label: 'Revenue', value: '₹18,42,000' },
        { label: 'ROAS', value: '4.1x' },
      ];

  return (
    <div className="pub-mock-window" style={{ maxWidth: 380 }}>
      <div style={{ padding: '26px 24px', background: `linear-gradient(135deg, ${accent}, ${accent}CC)`, color: '#fff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .85, letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {isLead ? 'Lead Generation Report' : 'Sales Campaign Report'}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>Sample Client</div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 4 }}>Jan 1 – Jan 31, 2026</div>
      </div>

      <div style={{ padding: 20, background: 'var(--bg2)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>KEY PERFORMANCE INDICATORS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {kpis.map((kpi) => (
            <div key={kpi.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>{kpi.label}</span>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 800 }}>{kpi.value}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>
          PERFORMANCE SCORE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `4px solid ${accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: accent }}>
            81
          </div>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Good — stable acquisition cost</span>
        </div>
      </div>
    </div>
  );
}
