import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function SuperAdminAgencies() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const loadAgencies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-admin/overview');
      setAgencies(res.data.agencies || []);
    } catch (err) {
      toast.error('Failed to load agencies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgencies();
  }, []);

  const updatePlan = async (agencyId, planName) => {
    try {
      setUpdating(true);

      await api.put(`/super-admin/agencies/${agencyId}/plan`, {
        planName,
        status: 'active',
      });

      toast.success('Plan updated');
      loadAgencies();
    } catch (err) {
      toast.error('Failed to update plan');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Agencies</div>
        <div className="page-subtitle">
          Manage all agencies, plans, clients and reports from one place
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 22 }}>
        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL AGENCIES
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>
            {fmt(agencies.length)}
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL CLIENTS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>
            {fmt(agencies.reduce((sum, a) => sum + Number(a.clients_count || 0), 0))}
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL REPORTS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>
            {fmt(agencies.reduce((sum, a) => sum + Number(a.reports_count || 0), 0))}
          </div>
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
              Agency Management
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
              View agency owners, subscription plans and activity
            </div>
          </div>

          <button className="btn btn-primary btn-sm" onClick={loadAgencies}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card-pad">Loading agencies...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Owner</th>
                  <th>Contact</th>
                  <th>Plan</th>
                  <th>Clients</th>
                  <th>Reports</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {agencies.map((agency) => (
                  <tr key={agency.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                          }}
                        >
                          {agency.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>

                        <div>
                          <div style={{ fontWeight: 800 }}>{agency.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            ID: {agency.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>{agency.owner_email || 'Not assigned'}</td>

                    <td>
                      <div style={{ fontSize: 12 }}>
                        {agency.contact_email || agency.website || '—'}
                      </div>
                    </td>

                    <td>
                      <select
                        className="form-select"
                        style={{ width: 120, fontSize: 12, padding: '6px 8px' }}
                        value={agency.plan_name || 'free'}
                        disabled={updating}
                        onChange={(e) => updatePlan(agency.id, e.target.value)}
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                        <option value="agency">Agency</option>
                      </select>
                    </td>

                    <td>{agency.clients_count}</td>
                    <td>{agency.reports_count}</td>

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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}