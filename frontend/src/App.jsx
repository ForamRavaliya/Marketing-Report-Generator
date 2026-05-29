import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminAgencies from './pages/SuperAdminAgencies';
import SuperAdminSubscriptions from './pages/SuperAdminSubscriptions';
import SuperAdminPayments from './pages/SuperAdminPayments';
import SuperAdminSettings from './pages/SuperAdminSettings';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spin" style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%' }} />
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
const HomeRedirect = () => {
  const { user } = useAuth();

  return (
    <Navigate
      to={user?.role === 'super_admin'
        ? '/super-admin'
        : '/dashboard'}
      replace
    />
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, borderRadius: 10 },
            success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
            error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
           <Route
             index
             element={
               <RoleRoute allowedRoles={['admin', 'super_admin']}>
                 <HomeRedirect />
               </RoleRoute>
             }
           />
           <Route
             path="dashboard"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Dashboard />
               </RoleRoute>
             }
           />

           <Route
             path="clients"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Clients />
               </RoleRoute>
             }
           />

           <Route
             path="clients/:id"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <ClientDetail />
               </RoleRoute>
             }
           />

           <Route
             path="upload"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <UploadData />
               </RoleRoute>
             }
           />

           <Route
             path="reports"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Reports />
               </RoleRoute>
             }
           />

           <Route
             path="subscription"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Subscription />
               </RoleRoute>
             }
           />

           <Route
             path="billing"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Billing />
               </RoleRoute>
             }
           />

           <Route
             path="settings"
             element={
               <RoleRoute allowedRoles={['admin']}>
                 <Settings />
               </RoleRoute>
             }
           />

           <Route
             path="super-admin"
             element={
               <RoleRoute allowedRoles={['super_admin']}>
                 <SuperAdminDashboard />
               </RoleRoute>
             }
           />

          </Route>

          <Route
            path="super-admin/agencies"
            element={
              <RoleRoute allowedRoles={['super_admin']}>
                <SuperAdminAgencies />
              </RoleRoute>
            }
          />

          <Route
            path="super-admin/subscriptions"
            element={
              <RoleRoute allowedRoles={['super_admin']}>
                <SuperAdminSubscriptions />
              </RoleRoute>
            }
          />

          <Route
            path="super-admin/payments"
            element={
              <RoleRoute allowedRoles={['super_admin']}>
                <SuperAdminPayments />
              </RoleRoute>
            }
          />

          <Route
            path="super-admin/settings"
            element={
              <RoleRoute allowedRoles={['super_admin']}>
                <SuperAdminSettings />
              </RoleRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
