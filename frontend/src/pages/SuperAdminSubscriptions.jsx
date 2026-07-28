import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const planPrice = {
  free: 0,
  // TEMPORARY LIVE PAYMENT CHECK: Pro monthly INR 999.
  // Restore to INR 999 after verification.
  pro: 1,
  agency: 2999,
};

export default function SuperAdminSubscriptions() {
  const [data, setData] = useState(null);
  const [updating, setUpdating] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.get('/super-admin/overview');
      setData(res.data);
    } catch {
      toast.error('Failed to load subscriptions');
    }
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

      toast.success('Subscription updated');
      loadData();
    } catch {
      toast.error('Failed to update subscription');
    } finally {
      setUpdating(false);
    }
  };

  if (!data) return <div>Loading...</div>;

  const agencies = data.agencies || [];

  const freeCount = agencies.filter((a) => a.plan_name === 'free').length;
  const proCount = agencies.filter((a) => a.plan_name === 'pro').length;
  const agencyCount = agencies.filter((a) => a.plan_name === 'agency').length;

  const monthlyRevenue = agencies.reduce(
    (sum, a) => sum + (planPrice[a.plan_name] || 0),
    0
  );

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Subscriptions</div>
        <div className="page-subtitle">
          Manage plans, billing status and subscription revenue
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            FREE PLANS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(freeCount)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            PRO PLANS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(proCount)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            AGENCY PLANS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(agencyCount)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            EST. MONTHLY REVENUE
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>₹{fmt(monthlyRevenue)}</div>
        </div>
      </div>

      <div className="card">
        <div
          className="card-pad"
          style={{
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              Subscription Management
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
              Update agency plans and monitor subscription status
            </div>
          </div>

          <button className="btn btn-primary btn-sm" onClick={loadData}>
            Refresh
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agency</th>
                <th>Owner</th>
                <th>Current Plan</th>
                <th>Monthly Value</th>
                <th>Status</th>
                <th>Change Plan</th>
              </tr>
            </thead>

            <tbody>
              {agencies.map((agency) => (
                <tr key={agency.id}>
                  <td>
                    <div style={{ fontWeight: 800 }}>{agency.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      ID: {agency.id}
                    </div>
                  </td>

                  <td>{agency.owner_email || 'Not assigned'}</td>

                  <td>
                    <span
                      style={{
                        padding: '5px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        textTransform: 'capitalize',
                        background:
                          agency.plan_name === 'agency'
                            ? '#F3E8FF'
                            : agency.plan_name === 'pro'
                            ? '#DBEAFE'
                            : '#F1F5F9',
                        color:
                          agency.plan_name === 'agency'
                            ? '#7E22CE'
                            : agency.plan_name === 'pro'
                            ? '#2563EB'
                            : '#475569',
                      }}
                    >
                      {agency.plan_name || 'free'}
                    </span>
                  </td>

                  <td>₹{fmt(planPrice[agency.plan_name] || 0)}</td>

                  <td>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        background:
                          agency.subscription_status === 'active'
                            ? 'var(--success-light)'
                            : 'var(--danger-light)',
                        color:
                          agency.subscription_status === 'active'
                            ? 'var(--success)'
                            : 'var(--danger)',
                      }}
                    >
                      {agency.subscription_status || 'active'}
                    </span>
                  </td>

                  <td>
                    <select
                      className="form-select"
                      style={{ width: 130, fontSize: 12, padding: '6px 8px' }}
                      value={agency.plan_name || 'free'}
                      disabled={updating}
                      onChange={(e) => updatePlan(agency.id, e.target.value)}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="agency">Agency</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
