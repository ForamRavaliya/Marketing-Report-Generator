import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getSuperAdminPricing, updateSuperAdminPricing } from '../utils/api';

const isValidPriceInput = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
};

function PlanPricingCard() {
  const [plans, setPlans] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  const loadPlans = () => {
    setLoading(true);
    setLoadError(null);
    getSuperAdminPricing()
      .then((data) => {
        const rows = data?.plans || [];
        setPlans(rows);
        setEdits(
          Object.fromEntries(
            rows.map((p) => [p.plan_key, { monthlyPrice: p.monthly_price, yearlyPrice: p.yearly_price }])
          )
        );
      })
      .catch((err) => {
        setLoadError(err.response?.data?.error || 'Failed to load plan pricing');
      })
      .finally(() => setLoading(false));
  };

  useEffect(loadPlans, []);

  const handleEdit = (planKey, field, value) => {
    setEdits((prev) => ({ ...prev, [planKey]: { ...prev[planKey], [field]: value } }));
  };

  const handleSave = async (planKey) => {
    const edit = edits[planKey] || {};

    if (!isValidPriceInput(edit.monthlyPrice) || !isValidPriceInput(edit.yearlyPrice)) {
      toast.error('Prices must be whole numbers of 0 or more');
      return;
    }

    try {
      setSavingKey(planKey);
      const updated = await updateSuperAdminPricing(planKey, {
        monthlyPrice: Number(edit.monthlyPrice),
        yearlyPrice: Number(edit.yearlyPrice),
      });
      setPlans((prev) => prev.map((p) => (p.plan_key === planKey ? updated : p)));
      toast.success(`${updated.display_name} pricing saved`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save plan pricing');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="card card-pad" style={{ marginTop: 22 }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>Plan Pricing</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
        Changes apply immediately to new checkouts and the public pricing page. Existing paid
        orders keep the price they were created with.
      </div>

      {loading ? (
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading plan pricing...</div>
      ) : loadError ? (
        <div style={{ color: 'var(--danger)', fontSize: 13 }}>
          {loadError}{' '}
          <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={loadPlans}>
            Retry
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {plans.map((plan) => {
            const edit = edits[plan.plan_key] || {};
            const saving = savingKey === plan.plan_key;
            return (
              <div
                key={plan.plan_key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 1fr 1fr auto',
                  gap: 12,
                  alignItems: 'end',
                  padding: '12px 14px',
                  background: 'var(--bg3)',
                  borderRadius: 12,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>{plan.display_name}</div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Monthly (INR)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    value={edit.monthlyPrice ?? ''}
                    onChange={(e) => handleEdit(plan.plan_key, 'monthlyPrice', e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Yearly (INR)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="1"
                    value={edit.yearlyPrice ?? ''}
                    onChange={(e) => handleEdit(plan.plan_key, 'yearlyPrice', e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => handleSave(plan.plan_key)}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SuperAdminSettings() {
  const [form, setForm] = useState({
    platformName: 'Unbrand Agency',
    supportEmail: 'support@unbrandagency.com',
    companyName: 'Augmetic Infinite LLP',
    defaultCurrency: 'INR',
    freeReportLimit: 5,
    proReportLimit: 50,
    agencyReportLimit: 'Unlimited',
  });

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    toast('Platform settings persistence is not implemented yet — changes here are not saved.', { icon: 'ℹ️' });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Platform Settings</div>
        <div className="page-subtitle">
          Manage platform branding, defaults and plan limits
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: 22 }}>
        <div className="card card-pad">
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 18 }}>
            Platform Branding
          </div>

          <div className="form-group">
            <label className="form-label">Platform Name</label>
            <input
              className="form-input"
              value={form.platformName}
              onChange={(e) => handleChange('platformName', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Company Name</label>
            <input
              className="form-input"
              value={form.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Support Email</label>
            <input
              className="form-input"
              value={form.supportEmail}
              onChange={(e) => handleChange('supportEmail', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Default Currency</label>
            <select
              className="form-select"
              value={form.defaultCurrency}
              onChange={(e) => handleChange('defaultCurrency', e.target.value)}
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 18 }}>
            Plan Limits
          </div>

          <div className="form-group">
            <label className="form-label">Free Plan Report Limit</label>
            <input
              className="form-input"
              type="number"
              value={form.freeReportLimit}
              onChange={(e) => handleChange('freeReportLimit', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Pro Plan Report Limit</label>
            <input
              className="form-input"
              type="number"
              value={form.proReportLimit}
              onChange={(e) => handleChange('proReportLimit', e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Agency Plan Report Limit</label>
            <input
              className="form-input"
              value={form.agencyReportLimit}
              onChange={(e) => handleChange('agencyReportLimit', e.target.value)}
            />
          </div>
<div
  style={{
    marginTop: 16,
    padding: 14,
    background: 'var(--bg3)',
    borderRadius: 12,
    fontSize: 13,
    color: 'var(--text2)',
    lineHeight: 1.6,
  }}
>
  Configure report limits based on subscription plans. These limits help control
  usage for Free, Pro and Agency customers.
</div>

        </div>
      </div>

      <PlanPricingCard />

      <div className="card card-pad" style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
          Preview
        </div>

        <div
          style={{
            padding: 22,
            borderRadius: 18,
            background: 'linear-gradient(135deg,var(--primary),var(--purple))',
            color: 'var(--on-accent)',
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.8 }}>Platform Preview</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>
            {form.platformName}
          </div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            Managed by {form.companyName}
          </div>
          <div style={{ fontSize: 12, marginTop: 12, opacity: 0.8 }}>
            Support: {form.supportEmail}
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary btn-lg"
        onClick={handleSave}
        style={{ marginTop: 22 }}
      >
        Save Platform Settings
      </button>
    </div>
  );
}