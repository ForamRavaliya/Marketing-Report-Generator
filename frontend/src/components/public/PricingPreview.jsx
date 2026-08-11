import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import usePublicPricing from '../../hooks/usePublicPricing';
import { PLAN_FEATURES, PLAN_ORDER } from './planFeatures';

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Compact 3-card summary for the homepage. The full comparison lives on
// /pricing (PublicPricing.jsx), which uses the same usePublicPricing hook.
export default function PricingPreview() {
  const { plans } = usePublicPricing();

  return (
    <div className="pub-pricing-grid">
      {PLAN_ORDER.map((key) => {
        const plan = PLAN_FEATURES[key];
        const price = plans[key]?.monthly ?? 0;
        return (
          <div key={key} className={`pub-price-card${plan.highlight ? ' featured' : ''}`}>
            {plan.highlight && (
              <span className="pub-badge pub-badge-plan" style={{ position: 'absolute', top: -12, left: 24 }}>
                Most Popular
              </span>
            )}
            <h3 className="pub-h3">{plan.name}</h3>
            <p className="pub-body" style={{ fontSize: 13 }}>{plan.tagline}</p>
            <div className="pub-price-amount">
              {price === 0 ? 'Free' : fmtInr(price)}
              {price > 0 && <span> / month</span>}
            </div>
            <ul className="pub-price-list">
              <li><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{plan.clients}</li>
              <li><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{plan.reports}</li>
              {plan.features.slice(0, 2).map((f) => (
                <li key={f}><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{f}</li>
              ))}
            </ul>
            <Link
              to="/register"
              className={`pub-btn pub-btn-block ${plan.highlight ? 'pub-btn-primary' : 'pub-btn-secondary'}`}
            >
              Get Started
            </Link>
          </div>
        );
      })}
    </div>
  );
}
