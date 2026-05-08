import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardOverview } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Users, TrendingUp, BarChart3, ArrowRight } from 'lucide-react';

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtCur = (n) =>
  `INR ${parseFloat(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardOverview()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fade-in">
      {/* Header */}
      <div
        style={{
          marginBottom: 28,
          padding: '28px 32px',
          borderRadius: 22,
          background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -40,
            top: -40,
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            right: 80,
            bottom: -50,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
            {greeting}, {user?.fullName?.split(' ')[0]} 👋
          </div>

          <div
            style={{
              fontSize: 15,
              opacity: 0.9,
              maxWidth: 600,
              lineHeight: 1.6,
            }}
          >
            Monitor campaign performance, generate professional reports and track marketing growth across all your clients from one dashboard.
          </div>

          <div
            style={{
              display: 'flex',
              gap: 14,
              marginTop: 22,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(6px)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              📊 Real-time Performance Tracking
            </div>

            <div
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(6px)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              📄 Professional PDF Reports
            </div>

            <div
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(6px)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              🚀 Multi-platform Analytics
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: 'Total Clients', value: loading ? '—' : fmt(data?.totalClients), icon: Users, color: '#2563EB', sub: 'Active clients' },
          { label: 'Reports Generated', value: loading ? '—' : fmt(data?.recentActivity?.length || 0), icon: BarChart3, color: '#7C3AED', sub: 'Recent activity' },
          { label: 'Platforms Tracked', value: '6', icon: TrendingUp, color: '#059669', sub: 'Meta, Google & more' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card card-pad" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)' }}>{label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={14} color={color} />
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>
          </div>
        ))}
      </div>
     {/* KPI Metrics */}
     <div
       className="card card-pad"
       style={{
         marginBottom: 24,
         background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08))',
         border: '1px solid rgba(99,102,241,0.15)',
         overflow: 'hidden',
         position: 'relative',
       }}
     >
       <div
         style={{
           position: 'absolute',
           right: -30,
           top: -30,
           width: 140,
           height: 140,
           borderRadius: '50%',
           background: 'rgba(99,102,241,0.08)',
         }}
       />

       <div
         style={{
           display: 'flex',
           justifyContent: 'space-between',
           alignItems: 'center',
           flexWrap: 'wrap',
           gap: 18,
           position: 'relative',
           zIndex: 2,
         }}
       >
         <div>
           <div
             style={{
               fontSize: 12,
               fontWeight: 700,
               textTransform: 'uppercase',
               color: 'var(--text3)',
               marginBottom: 6,
             }}
           >
             PERFORMANCE OVERVIEW
           </div>

           <div
             style={{
               fontSize: 28,
               fontWeight: 800,
               color: 'var(--text)',
               marginBottom: 6,
             }}
           >
             {loading ? '—' : fmtCur(data?.totalSpend || 0)}
           </div>

           <div
             style={{
               fontSize: 13,
               color: 'var(--text2)',
               maxWidth: 500,
               lineHeight: 1.6,
             }}
           >
             Total advertising spend tracked across all connected clients and marketing platforms.
           </div>
         </div>

         <div
           style={{
             display: 'flex',
             gap: 16,
             flexWrap: 'wrap',
           }}
         >
           {[
             {
               label: 'Total Leads',
               value: fmt(data?.totalConversions || 0),
               color: '#10B981',
             },
             {
               label: 'Total Clicks',
               value: fmt(data?.totalClicks || 0),
               color: '#2563EB',
             },
             {
               label: 'Impressions',
               value: fmt(data?.totalImpressions || 0),
               color: '#7C3AED',
             },
           ].map((item) => (
             <div
               key={item.label}
               style={{
                 minWidth: 120,
                 padding: '14px 18px',
                 borderRadius: 16,
                 background: 'rgba(255,255,255,0.7)',
                 border: '1px solid var(--border)',
                 backdropFilter: 'blur(8px)',
               }}
             >
               <div
                 style={{
                   fontSize: 11,
                   fontWeight: 700,
                   textTransform: 'uppercase',
                   color: 'var(--text3)',
                   marginBottom: 6,
                 }}
               >
                 {item.label}
               </div>

               <div
                 style={{
                   fontSize: 22,
                   fontWeight: 800,
                   color: item.color,
                 }}
               >
                 {loading ? '—' : item.value}
               </div>
             </div>
           ))}
         </div>
       </div>
     </div>
     <div
       style={{
         display: 'grid',
         gridTemplateColumns: 'repeat(5, 1fr)',
         gap: 16,
         marginBottom: 24
       }}
     >
       {[
          { label: 'CTR', value: `${parseFloat(data?.ctr || 0).toFixed(2)}%` },
          { label: 'CPC', value: `INR ${parseFloat(data?.cpc || 0).toFixed(2)}` },
          { label: 'CPL', value: `INR ${parseFloat(data?.cpl || 0).toFixed(2)}` },
          { label: 'Conversion Rate', value: `${parseFloat(data?.conversionRate || 0).toFixed(2)}%` },
          { label: 'ROAS', value: `${parseFloat(data?.roas || 0).toFixed(2)}x` },
        ].map(({ label, value }) => (
         <div key={label} className="card card-pad" style={{ textAlign: 'center' }}>
           <div style={{
             fontSize: 10,
             fontWeight: 700,
             textTransform: 'uppercase',
             color: 'var(--text3)',
             marginBottom: 4
           }}>
             👉 {label}
           </div>

           <div style={{
             fontSize: 18,
             fontWeight: 800,
             color: 'var(--text)'
           }}>
             {loading ? '—' : value}
           </div>
         </div>
       ))}
     </div>
      <div className="grid grid-2" style={{ gap: 20 }}>
        {/* Top Clients */}
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Top Clients by Spend</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')} style={{ gap: 4 }}>
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ padding: '8px 0' }}>
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton" style={{ height: 14, width: 120 }} />
                  <div className="skeleton" style={{ height: 14, width: 70 }} />
                </div>
              ))
            ) : !data?.topClients?.length ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No clients yet. <button className="btn btn-ghost btn-sm" onClick={() => navigate('/clients')} style={{ color: 'var(--primary)' }}>Add your first client →</button>
              </div>
            ) : data.topClients.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', transition: 'background .1s' }}
                onClick={() => navigate(`/clients/${c.id}`)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: ['#EFF6FF', '#F5F3FF', '#ECFDF5', '#FFF7ED', '#FEF2F2'][i % 5], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626'][i % 5], marginRight: 12, flexShrink: 0 }}>
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>ROAS: {parseFloat(c.roas || 0).toFixed(2)}x</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtCur(c.total_spend)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card card-pad">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Upload Report Data', sub: 'Import CSV, Excel, PDF or image', to: '/upload', color: '#2563EB', icon: '📤' },
              { label: 'Add New Client', sub: 'Onboard a new client account', to: '/clients', color: '#7C3AED', icon: '👤' },
              { label: 'Generate PDF Report', sub: 'Create a client-ready report', to: '/reports', color: '#059669', icon: '📄' },
            ].map(({ label, sub, to, color, icon }) => (
              <button key={to} onClick={() => navigate(to)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: 10,
                cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = `${color}50`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>
                </div>
                <ArrowRight size={14} style={{ marginLeft: 'auto', color: 'var(--text3)' }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
