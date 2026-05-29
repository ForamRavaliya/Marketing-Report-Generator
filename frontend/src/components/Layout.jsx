import React, { useState , useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { getSubscription, getAgency } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
   LayoutDashboard, Users, Upload, FileBarChart2,
    Settings, LogOut, Menu, BarChart3, ChevronRight, CreditCard, Receipt
} from 'lucide-react';


const adminNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/upload', icon: Upload, label: 'Upload Data' },
  { to: '/reports', icon: FileBarChart2, label: 'Reports' },
  { to: '/subscription', icon: CreditCard, label: 'Subscription' },
  { to: '/billing', icon: Receipt, label: 'Billing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];
const superAdminNavItems = [
  {
    to: '/super-admin',
    icon: LayoutDashboard,
    label: 'Platform Dashboard',
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [agency, setAgency] = useState(null);

  const handleLogout = () => { logout(); navigate('/login'); };

useEffect(() => {
  getSubscription()
    .then(setSubscription)
    .catch(() => {});

  getAgency()
    .then(setAgency)
    .catch(() => {});
}, []);

  const Sidebar = ({ mobile = false }) => (
    <aside style={{
      width: mobile ? '100%' : 240,
      background: '#0F172A',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
         {agency?.logo_url ? (
           <img
             src={`https://marketing-report-generator-p9wj.onrender.com${agency.logo_url}`}
             alt="logo"
             style={{
               height: 32,
               width: 32,
               objectFit: 'contain',
               borderRadius: 8,
               background: '#fff',
               padding: 2
             }}
           />
         ) : (
            <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={16} color="#fff" />
            </div>
          )}
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>
              {agency?.name || 'AdInsight'}
            </div>

            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 10 }}>
              Powered by AdInsight
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
       {(
         user?.role === 'super_admin'
           ? superAdminNavItems
           : adminNavItems
       ).map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to}
            onClick={() => mobile && setSidebarOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              color: isActive ? '#fff' : 'rgba(255,255,255,.55)',
              background: isActive ? 'rgba(255,255,255,.1)' : 'transparent',
              fontWeight: isActive ? 600 : 400, fontSize: 13,
              transition: 'all .15s',
              textDecoration: 'none',
            })}>
            {({ isActive }) => (
              <>
                <Icon size={16} />
                <span style={{ flex: 1 }}>{label}</span>
                {isActive && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, marginBottom: 4 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {user?.fullName?.charAt(0)?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.fullName}
            </div>
            <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.role}
            </div>
            <div
              style={{
                marginTop: 6,
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 999,
                background:
                  subscription?.plan_name === 'agency'
                    ? 'rgba(168,85,247,.18)'
                    : subscription?.plan_name === 'pro'
                    ? 'rgba(37,99,235,.18)'
                    : 'rgba(255,255,255,.08)',
                color:
                  subscription?.plan_name === 'agency'
                    ? '#C084FC'
                    : subscription?.plan_name === 'pro'
                    ? '#60A5FA'
                    : 'rgba(255,255,255,.65)',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {subscription?.plan_name || 'free'} plan
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, background: 'transparent',
          color: 'rgba(255,255,255,.4)', fontSize: 13, cursor: 'pointer',
          border: 'none', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,.07)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)'; e.currentTarget.style.background = 'transparent'; }}>
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop sidebar */}
      <div style={{ display: 'flex' }} className="desktop-sidebar">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }}
            onClick={() => setSidebarOpen(false)} />
          <div style={{ position: 'relative', width: 240, zIndex: 51 }}>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Mobile topbar */}
        <div style={{
          display: 'none', padding: '12px 16px',
          background: '#0F172A', alignItems: 'center', justifyContent: 'space-between',
        }} className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <Menu size={20} />
          </button>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>AdInsight</div>
          <div style={{ width: 20 }} />
        </div>

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-topbar { display: flex !important; }
          main { padding: 20px 16px !important; }
        }
      `}</style>
    </div>
  );
}
