import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';
import usePublicPricing from '../../hooks/usePublicPricing';
import { PLAN_FEATURES, PLAN_ORDER } from '../../components/public/planFeatures';
import { ALL_FAQS } from '../../components/public/FaqAccordion';
import FaqAccordion from '../../components/public/FaqAccordion';

const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const PRICING_FAQS = ALL_FAQS.filter((item) =>
  ['Can I create reports for multiple clients?', 'Can I add my agency branding?', 'How are payments processed?'].includes(item.q)
);

export default function PublicPricing() {
  const { plans } = usePublicPricing();
  const [yearly, setYearly] = useState(false);
  const cycle = yearly ? 'yearly' : 'monthly';

  return (
    <PublicLayout>
      <SEO
        title="Pricing"
        description="Unbrand Agency pricing: Free, Pro and Agency plans for performance marketing reporting software. Simple monthly and yearly billing via Razorpay."
        path="/pricing"
      />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">Pricing</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>
            Plans that scale with your agency
          </h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            Start free. Upgrade when you need more clients or the full report structure.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container">
          <div className="pub-toggle-row">
            <span style={{ fontSize: 14, fontWeight: 700, color: yearly ? 'var(--text3)' : 'var(--text)' }}>Monthly</span>
            <button
              type="button"
              className={`pub-toggle${yearly ? ' on' : ''}`}
              onClick={() => setYearly((v) => !v)}
              aria-label="Toggle yearly billing"
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: yearly ? 'var(--text)' : 'var(--text3)' }}>
              Yearly <span style={{ color: 'var(--success)', fontWeight: 800 }}>(2 months free)</span>
            </span>
          </div>

          <div className="pub-pricing-grid">
            {PLAN_ORDER.map((key, i) => {
              const plan = PLAN_FEATURES[key];
              const price = plans[key]?.[cycle] ?? 0;
              return (
                <Reveal key={key} delay={i * 80} className={`pub-price-card${plan.highlight ? ' featured' : ''}`}>
                  {plan.highlight && (
                    <span className="pub-badge pub-badge-plan" style={{ position: 'absolute', top: -12, left: 24 }}>
                      Most Popular
                    </span>
                  )}
                  <h3 className="pub-h3">{plan.name}</h3>
                  <p className="pub-body" style={{ fontSize: 13 }}>{plan.tagline}</p>
                  <div className="pub-price-amount">
                    {price === 0 ? 'Free' : fmtInr(price)}
                    {price > 0 && <span> / {yearly ? 'year' : 'month'}</span>}
                  </div>
                  <ul className="pub-price-list">
                    <li><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{plan.clients}</li>
                    <li><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{plan.reports}</li>
                    {plan.features.map((f) => (
                      <li key={f}><Check size={15} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} />{f}</li>
                    ))}
                    {plan.notIncluded.map((f) => (
                      <li key={f} style={{ color: 'var(--text3)' }}>
                        <X size={15} color="var(--text3)" style={{ flexShrink: 0, marginTop: 2 }} />{f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/register"
                    className={`pub-btn pub-btn-block ${plan.highlight ? 'pub-btn-primary' : 'pub-btn-secondary'}`}
                  >
                    Get Started
                  </Link>
                </Reveal>
              );
            })}
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text3)', marginTop: 30 }}>
            All prices in INR. Payments are processed securely via Razorpay. You can change or cancel
            your plan at any time.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container" style={{ maxWidth: 900 }}>
          <div className="pub-section-head">
            <h2 className="pub-h2">Compare plans</h2>
          </div>
          <div className="pub-table-wrap">
            <table className="pub-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Pro</th>
                  <th>Agency</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Clients</td><td>Up to 2</td><td>Up to 15</td><td>Unlimited</td></tr>
                <tr><td>PDF reports / month</td><td>5</td><td>Unlimited</td><td>Unlimited</td></tr>
                <tr><td>CSV / Excel import</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td>Dashboard &amp; trends</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td>Executive summary &amp; KPIs in PDF</td><td>✓</td><td>✓</td><td>✓</td></tr>
                <tr><td>Trends &amp; platform performance pages</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Automated insights &amp; recommendations</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Agency branding on reports</td><td>—</td><td>✓</td><td>✓</td></tr>
                <tr><td>Report themes</td><td>5</td><td>5</td><td>5</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-container" style={{ maxWidth: 760 }}>
          <div className="pub-section-head">
            <span className="pub-eyebrow">Pricing FAQ</span>
            <h2 className="pub-h2">Questions about plans</h2>
          </div>
          <FaqAccordion items={PRICING_FAQS} />
        </div>
      </section>
    </PublicLayout>
  );
}
