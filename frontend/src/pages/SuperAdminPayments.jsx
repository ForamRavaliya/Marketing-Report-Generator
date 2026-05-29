import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function SuperAdminPayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const res = await api.get('/super-admin/overview');
      setPayments(res.data.recentPayments || []);
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const totalRevenue = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  const successfulPayments = payments.filter(
    (p) => p.status === 'paid' || p.status === 'success'
  ).length;

  const failedPayments = payments.filter(
    (p) => p.status === 'failed'
  ).length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Payments</div>
        <div className="page-subtitle">
          Track platform payments, revenue and transaction history
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL PAYMENTS
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(payments.length)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            SUCCESSFUL
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(successfulPayments)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            FAILED
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>{fmt(failedPayments)}</div>
        </div>

        <div className="card card-pad">
          <div style={{ color: 'var(--text3)', fontSize: 12, fontWeight: 800 }}>
            TOTAL REVENUE
          </div>
          <div style={{ fontSize: 30, fontWeight: 900 }}>₹{fmt(totalRevenue)}</div>
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
              Payment History
            </div>
            <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 4 }}>
              Latest transactions across all agencies
            </div>
          </div>

          <button className="btn btn-primary btn-sm" onClick={loadPayments}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card-pad">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div
            className="card-pad"
            style={{
              textAlign: 'center',
              color: 'var(--text3)',
              padding: 50,
            }}
          >
            No payment records yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div style={{ fontWeight: 800 }}>
                        {payment.agency_name || 'Unknown Agency'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        Payment ID: {payment.id}
                      </div>
                    </td>

                    <td style={{ fontWeight: 800 }}>
                      ₹{fmt(payment.amount)}
                    </td>

                    <td>{payment.currency || 'INR'}</td>

                    <td>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background:
                            payment.status === 'paid' || payment.status === 'success'
                              ? 'var(--success-light)'
                              : payment.status === 'failed'
                              ? 'var(--danger-light)'
                              : '#F1F5F9',
                          color:
                            payment.status === 'paid' || payment.status === 'success'
                              ? 'var(--success)'
                              : payment.status === 'failed'
                              ? 'var(--danger)'
                              : '#475569',
                        }}
                      >
                        {payment.status || 'pending'}
                      </span>
                    </td>

                    <td>
                      {payment.created_at
                        ? new Date(payment.created_at).toLocaleString()
                        : '—'}
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