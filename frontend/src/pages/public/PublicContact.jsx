import React from 'react';
import { Mail } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';

const SUPPORT_EMAIL = 'support@unbrandagency.com';

export default function PublicContact() {
  return (
    <PublicLayout>
      <SEO
        title="Contact"
        description="Get in touch with the Unbrand Agency team."
        path="/contact"
      />

      <section className="pub-hero">
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">Contact</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>Get in touch</h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            Have a question about Unbrand Agency, a plan, or something you saw on this site? Email us
            directly and we'll get back to you.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container" style={{ maxWidth: 520 }}>
          <div className="pub-card" style={{ textAlign: 'center' }}>
            <div className="pub-icon-box" style={{ margin: '0 auto 18px' }}>
              <Mail size={22} />
            </div>
            <h3 className="pub-h3" style={{ marginBottom: 8 }}>Email support</h3>
            <p className="pub-body" style={{ marginBottom: 22 }}>
              This opens your email app with our address filled in — nothing is submitted through this
              page itself.
            </p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="pub-btn pub-btn-primary pub-btn-block">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
