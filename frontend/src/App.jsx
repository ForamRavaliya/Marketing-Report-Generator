import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BrandThemeProvider } from './context/BrandThemeContext';
import './index.css';

import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import UploadData from './pages/UploadData';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminAgencies from './pages/SuperAdminAgencies';
import SuperAdminSubscriptions from './pages/SuperAdminSubscriptions';
import SuperAdminPayments from './pages/SuperAdminPayments';
import SuperAdminSettings from './pages/SuperAdminSettings';

import PublicHome from './pages/public/PublicHome';
import PublicFeatures from './pages/public/PublicFeatures';
import PublicHowItWorks from './pages/public/PublicHowItWorks';
import PublicReports from './pages/public/PublicReports';
import PublicPricing from './pages/public/PublicPricing';
import PublicAbout from './pages/public/PublicAbout';
import PublicContact from './pages/public/PublicContact';
import PublicFaq from './pages/public/PublicFaq';
import PublicPrivacy from './pages/public/PublicPrivacy';
import PublicTerms from './pages/public/PublicTerms';
import PublicSecurity from './pages/public/PublicSecurity';
import PublicNotFound from './pages/public/PublicNotFound';

const ENABLE_PLATFORM_SYNC = process.env.REACT_APP_ENABLE_PLATFORM_SYNC === 'true';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return children;

  return (
    <Navigate
      to={user.role === 'super_admin' ? '/super-admin' : '/dashboard'}
      replace
    />
  );
};

const RoleRoute = ({ allowedRoles, children }) => {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  if (!allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to={user.role === 'super_admin' ? '/super-admin' : '/dashboard'}
        replace
      />
    );
  }

  return children;
};
function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <BrandThemeProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13,
              borderRadius: 10,
              background: 'var(--bg-elevated)',
              color: 'var(--text)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border)',
            },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
            error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
          }}
        />
        <Routes>
          {/* Public marketing site -- open to everyone, no auth required. */}
          <Route path="/" element={<PublicHome />} />
          <Route path="/features" element={<PublicFeatures />} />
          <Route path="/how-it-works" element={<PublicHowItWorks />} />
          <Route path="/reporting" element={<PublicReports />} />
          <Route path="/pricing" element={<PublicPricing />} />
          <Route path="/about" element={<PublicAbout />} />
          <Route path="/contact" element={<PublicContact />} />
          <Route path="/faq" element={<PublicFaq />} />
          <Route path="/security" element={<PublicSecurity />} />
          <Route path="/privacy" element={<PublicPrivacy />} />
          <Route path="/terms" element={<PublicTerms />} />

          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

          {/* Authenticated application shell -- pathless layout route so
              every child below keeps its existing absolute URL (e.g.
              "/dashboard") while "/" is free for the public homepage above. */}
          <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
           <Route
             path="/super-admin/agencies"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminAgencies />
               </RoleRoute>
             }
           />

           <Route
             path="/super-admin/subscriptions"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminSubscriptions />
               </RoleRoute>
             }
           />

           <Route
             path="/super-admin/payments"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminPayments />
               </RoleRoute>
             }
           />

           <Route
             path="/super-admin/settings"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminSettings />
               </RoleRoute>
             }
           />
           <Route
             path="/dashboard"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Dashboard />
               </RoleRoute>
             }
           />

           <Route
             path="/clients"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Clients />
               </RoleRoute>
             }
           />

           <Route
             path="/clients/:id"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <ClientDetail />
               </RoleRoute>
             }
           />

           <Route
             path="/upload"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <UploadData />
               </RoleRoute>
             }
           />

           <Route
             path="/reports"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Reports />
               </RoleRoute>
             }
           />

           <Route
             path="/subscription"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Subscription />
               </RoleRoute>
             }
           />

           <Route
             path="/billing"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Billing />
               </RoleRoute>
             }
           />

           <Route
             path="/integrations"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 {ENABLE_PLATFORM_SYNC ? <Integrations /> : <Navigate to="/dashboard" replace />}
               </RoleRoute>
             }
           />

           <Route
             path="/settings"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Settings />
               </RoleRoute>
             }
           />

           <Route
             path="/super-admin"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminDashboard />
               </RoleRoute>
             }
           />

          </Route>

          <Route path="*" element={<PublicNotFound />} />
        </Routes>
      </BrowserRouter>
      </BrandThemeProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
