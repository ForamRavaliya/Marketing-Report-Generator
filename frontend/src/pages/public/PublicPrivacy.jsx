import React from 'react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';

export default function PublicPrivacy() {
  return (
    <PublicLayout>
      <SEO title="Privacy Policy" description="Unbrand Agency Privacy Policy." path="/privacy" />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <h1 className="pub-h1" style={{ fontSize: 'clamp(28px,4vw,40px)' }}>Privacy Policy</h1>
          <p className="pub-body" style={{ marginTop: 10 }}>Last updated: this is a draft and has not yet been dated for publication.</p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 10 }}>
        <div className="pub-container pub-doc">
          <div className="pub-notice">
            This is a baseline draft describing Unbrand Agency's actual data handling as implemented today.
            It has not been reviewed by a lawyer and must not be treated as final or legally binding
            until it receives owner/legal review before public launch.
          </div>

          <h2>1. Information we collect</h2>
          <p>When you create an account, we collect your name, email address, password (stored as a hash, never in plain text), and agency information you provide.</p>
          <p>When you use the product, we store the campaign performance data you upload (via CSV or Excel), the clients you create, and the reports you generate.</p>
          <p>When you subscribe to a paid plan, payment is processed by Razorpay. We receive and store confirmation of your subscription and payment status, but not your full card or bank details.</p>

          <h2>2. How we use information</h2>
          <ul>
            <li>To provide the dashboard, analytics and report-generation functionality you use.</li>
            <li>To authenticate your account and enforce role-based access within your agency.</li>
            <li>To process subscription payments and manage plan status.</li>
            <li>To communicate with you about your account, such as responding to a support request.</li>
          </ul>

          <h2>3. Data sharing</h2>
          <p>
            We do not sell your data. Data is shared only with the service providers necessary to run
            the product — for example, our database host and Razorpay for payment processing.
          </p>

          <h2>4. Data retention</h2>
          <p>
            Account and client data is retained for as long as your account is active. If you would
            like your data deleted, contact us using the details on the Contact page.
          </p>

          <h2>5. Your choices</h2>
          <p>
            You can update your account information from within the product. To request deletion of
            your account or data, contact us directly.
          </p>

          <h2>6. Changes to this policy</h2>
          <p>
            We may update this policy as the product changes. Material changes will be reflected on
            this page.
          </p>

          <h2>7. Contact</h2>
          <p>Questions about this policy can be sent via the Contact page.</p>
        </div>
      </section>
    </PublicLayout>
  );
}
