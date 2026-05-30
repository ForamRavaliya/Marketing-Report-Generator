import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function SuperAdminAgencies() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState(null);

  const loadAgencies = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-admin/overview');

      const normalizedAgencies = (res.data.agencies || []).map((a) => ({
        ...a,
        is_active:
          a.is_active === false ||
          a.is_active === 'false' ||
          a.is_active === 'f'
            ? false
            : true,
      }));

      setAgencies(normalizedAgencies);
    } catch {
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
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setUpdating(false);
    }
  };

  const updateAgencyStatus = async (agency) => {
    const isSuspending = agency.is_active !== false;

    const ok = window.confirm(
      isSuspending
        ? `Suspend ${agency.name}? This agency will not be able to access the system.`
        : `Activate ${agency.name}? This agency will regain access.`
    );

    if (!ok) return;

    try {
      setUpdating(true);

      await api.put(`/super-admin/agencies/${agency.id}/status`, {
        isActive: !isSuspending,
      });

      toast.success(isSuspending ? 'Agency suspended' : 'Agency activated');
      setSelectedAgency(null);
      loadAgencies();
    } catch {
      toast.error('Failed to update agency status');
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
            {fmt(
              agencies.reduce(
                (sum, a) => sum + Number(a.clients_count || 0),
                0
              )
            )}
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL REPORTS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>
            {fmt(
              agencies.reduce(
                (sum, a) => sum + Number(a.reports_count || 0),
                0
              )
            )}
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
                  <th>Actions</th>
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
                            agency.is_active === false
                              ? 'var(--danger-light)'
                              : agency.subscription_status === 'active'
                              ? 'var(--success-light)'
                              : 'var(--danger-light)',
                          color:
                            agency.is_active === false
                              ? 'var(--danger)'
                              : agency.subscription_status === 'active'
                              ? 'var(--success)'
                              : 'var(--danger)',
                        }}
                      >
                        {agency.is_active === false
                          ? 'suspended'
                          : agency.subscription_status || 'active'}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => setSelectedAgency(agency)}
                        >
                          View
                        </button>

                        <button
                          className="btn btn-sm"
                          disabled={updating}
                          style={{
                            background:
                              agency.is_active === false ? '#DCFCE7' : '#FEF3C7',
                            color:
                              agency.is_active === false ? '#15803D' : '#92400E',
                          }}
                          onClick={() => updateAgencyStatus(agency)}
                        >
                          {agency.is_active === false ? 'Activate' : 'Suspend'}
                        </button>

                        <button
                          className="btn btn-sm"
                          disabled
                          style={{
                            background: '#E2E8F0',
                            color: '#64748B',
                            cursor: 'not-allowed',
                          }}
                        >
                          🚫 Disable
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedAgency && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            className="card"
            style={{
              width: '700px',
              maxWidth: '95%',
              borderRadius: 20,
              overflow: 'hidden',
            }}
          >
            <div
              className="card-pad"
              style={{
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0 }}>{selectedAgency.name}</h3>

              <button
                className="btn btn-sm"
                onClick={() => setSelectedAgency(null)}
              >
                Close
              </button>
            </div>

            <div
              className="card-pad"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 18,
              }}
            >
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    borderRadius: 18,
                    background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    fontWeight: 900,
                  }}
                >
                  {selectedAgency.name?.charAt(0)}
                </div>

                <div>
                  <h2 style={{ margin: 0 }}>{selectedAgency.name}</h2>
                  <div style={{ color: 'var(--text3)' }}>
                    Agency ID #{selectedAgency.id}
                  </div>
                </div>
              </div>

              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,1fr)',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div className="card card-pad">
                  <div style={{ color: 'var(--text3)' }}>Clients</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {selectedAgency.clients_count}
                  </div>
                </div>

                <div className="card card-pad">
                  <div style={{ color: 'var(--text3)' }}>Reports</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {selectedAgency.reports_count}
                  </div>
                </div>

                <div className="card card-pad">
                  <div style={{ color: 'var(--text3)' }}>Plan</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {selectedAgency.plan_name || 'free'}
                  </div>
                </div>
              </div>

              <div>
                <strong>Agency ID</strong>
                <div>{selectedAgency.id}</div>
              </div>

              <div>
                <strong>Owner Email</strong>
                <div>{selectedAgency.owner_email || 'N/A'}</div>
              </div>

              <div>
                <strong>Contact Email</strong>
                <div>{selectedAgency.contact_email || 'N/A'}</div>
              </div>

              <div>
                <strong>Website</strong>
                <div>{selectedAgency.website || 'N/A'}</div>
              </div>

              <div>
                <strong>Plan</strong>
                <div>{selectedAgency.plan_name || 'Free'}</div>
              </div>

              <div>
                <strong>Status</strong>
                <div>
                  {selectedAgency.is_active === false
                    ? 'Suspended'
                    : selectedAgency.subscription_status || 'Active'}
                </div>
              </div>

              <div>
                <strong>Clients</strong>
                <div>{selectedAgency.clients_count}</div>
              </div>

              <div>
                <strong>Reports</strong>
                <div>{selectedAgency.reports_count}</div>
              </div>

              <div>
                <strong>Phone</strong>
                <div>{selectedAgency.phone || 'N/A'}</div>
              </div>

              <div>
                <strong>Address</strong>
                <div>{selectedAgency.address || 'N/A'}</div>
              </div>

              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  marginTop: 20,
                }}
              >
                <button
                  className="btn btn-sm"
                  onClick={() => updateAgencyStatus(selectedAgency)}
                >
                  {selectedAgency.is_active === false
                    ? 'Activate Agency'
                    : 'Suspend Agency'}
                </button>

                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedAgency(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}