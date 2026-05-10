import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Receipt } from 'lucide-react';
import {
  getBillingHistory,
  generateReceipt,
} from '../utils/api';

export default function Billing() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBillingHistory()
      .then(setPayments)
      .catch(() => toast.error('Failed to load billing history'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 26 }}>
        <div className="page-title">Billing History</div>
        <div className="page-subtitle">
          View your subscription payments and billing records.
        </div>
      </div>

      <div className="card">
        <div
          className="card-pad"
          style={{
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CreditCard size={16} />
          <div style={{ fontWeight: 800, fontSize: 15 }}>Payments</div>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>Loading payments...</div>
        ) : payments.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            <Receipt size={36} style={{ marginBottom: 10 }} />
            <div>No billing records yet.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Cycle</th>
                  <th>Provider</th>
                  <th>Payment ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Paid At</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                      <td style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                        {p.plan_name}
                      </td>

                      <td style={{ textTransform: 'capitalize' }}>
                        {p.billing_cycle || 'monthly'}
                      </td>

                      <td style={{ textTransform: 'capitalize' }}>
                        {p.provider}
                      </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {p.provider_payment_id || '-'}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {p.currency} {Number(p.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background:
                            p.status === 'success'
                              ? 'var(--success-light)'
                              : 'var(--bg3)',
                          color:
                            p.status === 'success'
                              ? 'var(--success)'
                              : 'var(--text2)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {p.paid_at
                        ? new Date(p.paid_at).toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 10px',
                          fontSize: 11,
                        }}
                        onClick={async () => {
                          try {
                            const res = await generateReceipt(p.id);
                            window.open(res.url, '_blank');
                          } catch {
                            toast.error('Failed to generate receipt');
                          }
                        }}
                      >
                        Download
                      </button>
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