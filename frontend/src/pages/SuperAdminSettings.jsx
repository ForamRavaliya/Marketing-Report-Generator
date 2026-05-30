import React, { useState } from 'react';
import toast from 'react-hot-toast';

export default function SuperAdminSettings() {
  const [form, setForm] = useState({
    platformName: 'AdInsight',
    supportEmail: 'support@adinsight.com',
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
    toast.success('Platform settings saved locally for now');
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

      <div className="card card-pad" style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 12 }}>
          Preview
        </div>

        <div
          style={{
            padding: 22,
            borderRadius: 18,
            background: 'linear-gradient(135deg,#2563EB,#7C3AED)',
            color: '#fff',
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