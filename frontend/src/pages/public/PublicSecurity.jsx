import React from 'react';
import { ShieldCheck, Lock, KeyRound, Users } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';

const POINTS = [
  {
    icon: Lock,
    title: 'Encrypted connections',
    body: 'Data is transmitted over HTTPS between your browser and Unbrand Agency.',
  },
  {
    icon: KeyRound,
    title: 'Secure authentication',
    body: 'Accounts are protected with hashed passwords and token-based session authentication.',
  },
  {
    icon: Users,
    title: 'Role-based access',
    body: 'Within an agency account, admin, analyst and viewer roles control what each teammate can see and do.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified payment processing',
    body: 'Subscription payments are handled by Razorpay. Payment confirmations are cryptographically verified before any plan is activated, and card details are never stored on Unbrand Agency servers.',
  },
];

export default function PublicSecurity() {
  return (
    <PublicLayout>
      <SEO
        title="Security"
        description="How Unbrand Agency protects your account and data: encrypted connections, secure authentication, role-based access and verified Razorpay payment processing."
        path="/security"
      />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">Security</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>How we protect your data</h1>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container pub-grid-4">
          {POINTS.map((p, i) => (
            <Reveal key={p.title} delay={i * 60} className="pub-card">
              <div className="pub-icon-box"><p.icon size={20} /></div>
              <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 15 }}>{p.title}</h3>
              <p className="pub-body">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container pub-doc">
          <div className="pub-notice">
            Unbrand Agency does not currently hold SOC 2, ISO 27001, PCI-DSS or similar third-party security
            certifications. We describe our practices accurately above rather than claiming
            certifications we have not obtained.
          </div>
          <h2>Payment data</h2>
          <p>
            All subscription payments are processed by Razorpay. Unbrand Agency never receives or stores
            your full card or bank details — that information is handled entirely within Razorpay's
            systems.
          </p>
          <h2>Your data</h2>
          <p>
            Campaign performance data you upload is used to generate your dashboards and reports.
            Access to a client's data is restricted to your agency's own account and team members.
          </p>
          <h2>Questions</h2>
          <p>
            If you have a security question or want to report a concern, please use the{' '}
            <a href="/contact" style={{ color: 'var(--primary)', fontWeight: 700 }}>Contact</a> page.
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
