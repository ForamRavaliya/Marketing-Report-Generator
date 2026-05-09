import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getSubscription,
  updateSubscriptionPlan,
  createPaymentOrder,
  verifyPayment,
} from '../utils/api';

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

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function Subscription() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState(null);

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
      setProcessingPlan(planName);

      if (planName === 'free') {
        const updated = await updateSubscriptionPlan('free');
        setSubscription(updated);
        toast.success('Plan changed to Free');
        return;
      }

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        toast.error('Payment gateway failed to load');
        return;
      }

      const orderData = await createPaymentOrder({
        planName,
        billingCycle: 'monthly',
      });

      const options = {
        key: orderData.key,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: 'Marketing Report Generator',
        description: `${planName.toUpperCase()} Plan Subscription`,
        order_id: orderData.order.id,

        handler: async function (response) {
          try {
            await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planName,
              billingCycle: 'monthly',
            });

            await loadSubscription();
            toast.success(`Successfully upgraded to ${planName}`);
          } catch {
            toast.error('Payment verification failed');
          }
        },

        theme: {
          color: '#2563EB',
        },
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on('payment.failed', function () {
        toast.error('Payment failed or cancelled');
      });

      razorpay.open();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to start payment');
    } finally {
      setProcessingPlan(null);
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
            const processing = processingPlan === plan.id;

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
                  disabled={active || processing}
                  onClick={() => handleUpgrade(plan.id)}
                >
                  {active
                    ? 'Current Plan'
                    : processing
                    ? 'Processing...'
                    : plan.id === 'free'
                    ? 'Switch to Free'
                    : `Pay & Choose ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}