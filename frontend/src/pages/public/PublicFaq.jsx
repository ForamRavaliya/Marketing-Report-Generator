import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import FaqAccordion, { ALL_FAQS } from '../../components/public/FaqAccordion';

export default function PublicFaq() {
  return (
    <PublicLayout>
      <SEO
        title="FAQ"
        description="Frequently asked questions about Unbrand Agency: supported file types, report-type detection, agency branding, PDF themes, integrations, payments and report history."
        path="/faq"
      />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">FAQ</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>Frequently asked questions</h1>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container" style={{ maxWidth: 780 }}>
          <FaqAccordion items={ALL_FAQS} />
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">Still have questions?</h2>
            <p className="pub-lede">Reach out and we'll help you get started.</p>
            <div className="pub-hero-cta-row" style={{ justifyContent: 'center', marginTop: 28 }}>
              <Link to="/contact" className="pub-btn" style={{ background: '#fff', color: 'var(--primary)' }}>
                Contact Us <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
