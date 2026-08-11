import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getSubscription,
    updateSubscriptionPlan,
    createPaymentOrder,
    verifyPayment,
    cancelDowngrade,
} from '../utils/api';
import usePublicPricing from '../hooks/usePublicPricing';

// Kept in sync by hand with components/public/planFeatures.js -- both are
// derived from the same backend enforcement (routes/clients.js client
// limits, routes/reports.js free-plan report cap and PDF page gating,
// canUseAgencyBranding). Do not add a feature here that isn't actually
// gated in the backend.
const plans = [
  {
    id: 'free',
    name: 'Free',
    features: [
      'Up to 2 clients',
      'CSV & Excel upload',
      '5 PDF reports / month',
      'Dashboard, trends & campaign analytics',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    features: [
      'Up to 15 clients',
      'Unlimited PDF reports',
      'Full PDF report structure (trends, platform performance, recommendations)',
      'Agency branding on reports',
      'Report history',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    features: [
      'Everything in Pro',
      'No client limit',
    ],
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
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const { plans: livePricing, loaded: pricingLoaded } = usePublicPricing();

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
      toast.success(
         updated.downgrade_scheduled
           ? 'Downgrade scheduled after current billing period'
           : 'Plan changed to Free'
       );
        return;
      }

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        toast.error('Payment gateway failed to load');
        return;
      }

      const orderData = await createPaymentOrder({
        planName,
        billingCycle,
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
             billingCycle,
            });

           await loadSubscription();

           setPaymentSuccess({
             planName,
             paymentId: response.razorpay_payment_id,
             orderId: response.razorpay_order_id,
           });

           toast.success(`Successfully upgraded to ${planName}`);
          } catch {
            toast.error('Payment verification failed');
          }
        },

        theme: {
          color: 'var(--primary)',
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

const handleCancelDowngrade = async () => {
  try {
    setProcessingPlan('cancel-downgrade');

    const updated = await cancelDowngrade();

    setSubscription(updated);
    await loadSubscription();

    toast.success('Downgrade cancelled.');
  } catch (error) {
    toast.error(error.response?.data?.error || 'Failed to cancel downgrade');
  } finally {
    setProcessingPlan(null);
  }
};

// Prices come from GET /api/public/pricing (subscription_plans, Super Admin
// editable) via usePublicPricing -- the same live source the public site
// and checkout resolve from. No plan price is hardcoded here.
const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const getPlanPrice = (planId) => {
  if (planId === 'free') return '₹0';

  const amount = livePricing[planId]?.[billingCycle];
  if (amount == null) return pricingLoaded ? '' : 'Loading...';

  return `${fmtInr(amount)}/${billingCycle === 'yearly' ? 'year' : 'month'}`;
};

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 26 }}>
        <div className="page-title">Subscription</div>
        <div className="page-subtitle">
          Manage your current plan and upgrade features.
        </div>
        {subscription && (
          <div
            className="card card-pad"
            style={{
              marginTop: 18,
              background: 'var(--primary-light)',
              border: '1px solid var(--primary)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>
              Current Subscription
            </div>

            <div style={{ fontSize: 20, fontWeight: 900, textTransform: 'capitalize' }}>
              {subscription.plan_name} Plan
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text2)' }}>
              Status: <strong>{subscription.status}</strong>
            </div>

            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text2)' }}>
              Next billing date:{' '}
              <strong>
                {subscription.expires_at
                  ? new Date(subscription.expires_at).toLocaleDateString()
                  : 'Not applicable'}
              </strong>
            </div>
            {subscription?.downgrade_scheduled && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--warning-light)',
                  border: '1px solid var(--warning)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warning)' }}>
                  Downgrade scheduled
                </div>

                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>
                 Your plan will change to {subscription.next_plan_name?.toUpperCase()} on{' '}
                 {subscription.expires_at
                   ? new Date(subscription.expires_at).toLocaleDateString()
                   : 'billing end'}.
                 Until then, your current plan remains active.
                </div>

                <button
                  className="btn btn-primary"
                  style={{ marginTop: 10 }}
                  onClick={handleCancelDowngrade}
                 disabled={processingPlan !== null}
                >
                {processingPlan === 'cancel-downgrade'
                  ? 'Processing...'
                  : `Keep ${subscription.plan_name?.toUpperCase()} Active`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

{paymentSuccess && (
  <div
    className="card card-pad"
    style={{
      marginBottom: 22,
      border: '1px solid var(--success)',
      background: 'var(--success-light)',
    }}
  >
    <div
      style={{
        fontWeight: 900,
        fontSize: 18,
        color: 'var(--success)',
        marginBottom: 6,
      }}
    >
      Payment Successful
    </div>

    <div
      style={{
        color: 'var(--text2)',
        fontSize: 13,
        marginBottom: 12,
      }}
    >
      Your {paymentSuccess.planName.toUpperCase()} plan has been activated.
    </div>

    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
      Payment ID: {paymentSuccess.paymentId}
    </div>

    <div
      style={{
        fontSize: 12,
        color: 'var(--text3)',
        marginTop: 4,
      }}
    >
      Order ID: {paymentSuccess.orderId}
    </div>
  </div>
)}
<div
  style={{
    display: 'flex',
    gap: 8,
    marginBottom: 22,
    background: 'var(--bg3)',
    padding: 5,
    borderRadius: 12,
    width: 'fit-content',
  }}
>
  {['monthly', 'yearly'].map((cycle) => (
    <button
      key={cycle}
      type="button"
      onClick={() => setBillingCycle(cycle)}
      style={{
        padding: '8px 18px',
        borderRadius: 9,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 800,
        textTransform: 'capitalize',
        background: billingCycle === cycle ? 'var(--bg2)' : 'transparent',
        color: billingCycle === cycle ? 'var(--text)' : 'var(--text2)',
        boxShadow: billingCycle === cycle ? 'var(--shadow)' : 'none',
      }}
    >
      <>
        {cycle}

        {cycle === 'yearly' && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 10,
              background: 'var(--success-light)',
              color: 'var(--success)',
              padding: '2px 6px',
              borderRadius: 999,
              fontWeight: 800,
            }}
          >
            SAVE 17%
          </span>
        )}
      </>
    </button>
  ))}
</div>

      {loading ? (
        <div className="card card-pad">Loading subscription...</div>
      ) : (
        <div className="grid grid-3" style={{ gap: 20 }}>
          {plans.map((plan) => {
            const active = subscription?.plan_name === plan.id;
            const processing = processingPlan === plan.id;

            const downgradeToThisPlan =
              subscription?.downgrade_scheduled &&
              subscription?.next_plan_name === plan.id;

            return (
              <div
                key={plan.id}
                className="card card-pad"
                style={{
                  border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                  position: 'relative',
                }}
              >
                {active && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      right: 14,
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
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
                 {getPlanPrice(plan.id)}
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
                disabled={active || processingPlan !== null || downgradeToThisPlan}
                  onClick={() => handleUpgrade(plan.id)}
                >
               {downgradeToThisPlan
                 ? `Will switch on ${
                     subscription?.expires_at
                       ? new Date(subscription.expires_at).toLocaleDateString()
                       : 'billing end'
                   }`
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
