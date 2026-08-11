import React from 'react';
import { LayoutDashboard, Users, Upload, FileText, TrendingUp } from 'lucide-react';

// Accurate stylized representation of the real authenticated dashboard
// (KPI cards + trend chart + campaign rows) built in plain HTML/CSS -- no
// screenshot exists in the repo to reuse, and no functionality is invented
// here beyond what routes/performance.js + pages/Dashboard.jsx already do.
export default function DashboardMockup() {
  const bars = [38, 52, 46, 64, 58, 72, 66, 80];

  return (
    <div className="pub-mock-window" style={{ maxWidth: 640 }}>
      <div className="pub-mock-titlebar">
        <span className="pub-mock-dot" />
        <span className="pub-mock-dot" />
        <span className="pub-mock-dot" />
        <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>
          Dashboard — Sample Client (illustrative data)
        </span>
      </div>

      <div style={{ display: 'flex' }}>
        <div style={{
          width: 54, background: 'var(--sidebar-bg)', padding: '18px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        }}>
          {[LayoutDashboard, Users, Upload, FileText, TrendingUp].map((Icon, i) => (
            <div key={i} style={{
              width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: i === 0 ? '#fff' : 'rgba(255,255,255,.4)',
              background: i === 0 ? 'var(--primary)' : 'transparent',
            }}>
              <Icon size={15} />
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: 20, background: 'var(--bg)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total Spend', value: '₹1,24,500', color: 'var(--primary)' },
              { label: 'Total Leads', value: '312', color: 'var(--success)' },
              { label: 'Cost / Lead', value: '₹399', color: 'var(--purple)' },
            ].map((kpi) => (
              <div key={kpi.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>{kpi.label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: kpi.color, marginTop: 4 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>SPEND TREND</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: 'var(--accent-gradient)', borderRadius: 3 }} />
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>TOP CAMPAIGNS</div>
            {['Spring Promo — Search', 'Lookalike Audience', 'Retargeting — Warm'].map((name, i) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>
                <span style={{ color: 'var(--text3)' }}>META</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
