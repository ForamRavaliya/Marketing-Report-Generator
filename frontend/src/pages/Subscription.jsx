import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getSubscription, updateSubscriptionPlan } from '../utils/api';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 'INR 0',
    features: ['Basic reports', 'Manual data entry', 'Limited clients'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'INR 499/mo',
    features: ['Unlimited reports', 'PDF export', 'Ad sync', 'Sync history'],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 'INR 999/mo',
    features: ['Multiple clients', 'Auto sync', 'Advanced analytics', 'Priority support'],
  },
];

export default function Subscription() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSubscription = async () => {
    try {
      const data = await getSubscription();
      setSubscription(data);
    } catch {
      toast.error('Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const handleUpgrade = async (planName) => {
    try {
      const updated = await updateSubscriptionPlan(planName);
      setSubscription(updated);
      toast.success(`Plan updated to ${planName}`);
    } catch {
      toast.error('Failed to update plan');
    }
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 26 }}>
        <div className="page-title">Subscription</div>
        <div className="page-subtitle">
          Manage your current plan and upgrade features.
        </div>
      </div>

      {loading ? (
        <div className="card card-pad">Loading subscription...</div>
      ) : (
        <div className="grid grid-3" style={{ gap: 20 }}>
          {plans.map((plan) => {
            const active = subscription?.plan_name === plan.id;

            return (
              <div
                key={plan.id}
                className="card card-pad"
                style={{
                  border: active ? '2px solid #2563EB' : '1px solid var(--border)',
                  position: 'relative',
                }}
              >
                {active && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      background: '#DBEAFE',
                      color: '#2563EB',
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    CURRENT
                  </div>
                )}

                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                  {plan.name}
                </div>

                <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 18 }}>
                  {plan.price}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {plan.features.map((feature) => (
                    <div key={feature} style={{ color: 'var(--text2)', fontSize: 14 }}>
                      ✅ {feature}
                    </div>
                  ))}
                </div>

                <button
                  className={active ? 'btn btn-secondary' : 'btn btn-primary'}
                  style={{ width: '100%' }}
                  disabled={active}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {active ? 'Current Plan' : `Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}