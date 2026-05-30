import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);

  const loadData = () => {
    api
      .get('/super-admin/overview')
      .then((res) => setData(res.data))
      .catch(() => toast.error('Failed to load super admin dashboard'));
  };

  useEffect(() => {
    loadData();
  }, []);

  const updatePlan = async (agencyId, planName) => {
    try {
      setUpdating(true);

      await api.put(`/super-admin/agencies/${agencyId}/plan`, {
        planName,
        status: 'active',
      });

      toast.success('Agency plan updated');
      loadData();
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setUpdating(false);
    }
  };

  if (!data) return <div>Loading...</div>;

  const { totals, agencies = [], planStats = [], recentPayments = [] } = data;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Platform Dashboard</div>
        <div className="page-subtitle">
          Manage agencies, subscriptions, revenue and platform activity
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 700 }}>AGENCIES</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(totals.agencies)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 700 }}>CLIENTS</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(totals.clients)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 700 }}>REPORTS</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(totals.reports)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 700 }}>MONTHLY REVENUE</div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>₹{fmt(totals.monthlyRevenue)}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 20, marginBottom: 20 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
            Plan Distribution
          </div>

          {planStats.length === 0 ? (
            <div style={{ color: 'var(--text3)' }}>No subscription data</div>
          ) : (
            planStats.map((plan) => (
              <div
                key={plan.plan_name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{plan.plan_name}</span>
                <strong>{plan.total}</strong>
              </div>
            ))
          )}
        </div>

        <div className="card card-pad">
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
            Platform Summary
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 14, background: 'var(--bg3)', borderRadius: 12 }}>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Users</div>
              <div style={{ fontWeight: 900, fontSize: 24 }}>{fmt(totals.users)}</div>
            </div>

            <div style={{ padding: 14, background: 'var(--bg3)', borderRadius: 12 }}>
              <div style={{ color: 'var(--text3)', fontSize: 12 }}>Active Plans</div>
              <div style={{ fontWeight: 900, fontSize: 24 }}>
                {fmt(totals.activeSubscriptions)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>


      <div className="card card-pad">
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14 }}>
          Recent Payments
        </div>

        {recentPayments.length === 0 ? (
          <div style={{ color: 'var(--text3)' }}>No payment records yet</div>
        ) : (
          recentPayments.map((payment) => (
            <div
              key={payment.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {payment.agency_name || 'Unknown Agency'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {new Date(payment.created_at).toLocaleString()}
                </div>
              </div>

              <div style={{ fontWeight: 800 }}>
                {payment.currency || 'INR'} {fmt(payment.amount)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}