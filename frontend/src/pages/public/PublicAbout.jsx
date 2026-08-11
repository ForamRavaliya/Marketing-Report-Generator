import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Target, Clock, FileCheck } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';

export default function PublicAbout() {
  return (
    <PublicLayout>
      <SEO
        title="About"
        description="Why Unbrand Agency exists: making performance marketing reporting faster, clearer and more professional for agencies and marketers."
        path="/about"
      />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">About Unbrand Agency</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>
            Reporting shouldn't be the hardest part of the job
          </h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            Unbrand Agency exists to make performance marketing reporting faster, clearer and more
            professional — for agencies and marketers who would rather spend their time on strategy
            than spreadsheets.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container pub-grid-3">
          <Reveal className="pub-card">
            <Clock size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
            <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Less time on manual work</h3>
            <p className="pub-body">
              Every agency reruns the same calculations and spreadsheet formatting each month. Unbrand Agency
              automates the parts that don't need a human — importing, classifying and calculating —
              so time goes into analysis instead of data entry.
            </p>
          </Reveal>
          <Reveal delay={80} className="pub-card">
            <Target size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
            <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Consistent, accurate reports</h3>
            <p className="pub-body">
              Report quality shouldn't depend on which account manager built it. Unbrand Agency applies the
              same metric definitions and report structure every time, for every client.
            </p>
          </Reveal>
          <Reveal delay={160} className="pub-card">
            <FileCheck size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
            <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Reports clients actually understand</h3>
            <p className="pub-body">
              Raw numbers don't explain themselves. Unbrand Agency pairs metrics with plain-language context
              so it's clear what happened and why, not just what the totals were.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container" style={{ maxWidth: 720 }}>
          <h2 className="pub-h2" style={{ marginBottom: 18 }}>What we're focused on right now</h2>
          <p className="pub-body" style={{ marginBottom: 14 }}>
            Unbrand Agency is focused on doing the core reporting workflow well: importing campaign data
            accurately, presenting it clearly, and turning it into a report that's ready to send.
            Direct platform integrations and other automation are being built out over time, and are
            clearly marked as Coming Soon wherever they appear in the product.
          </p>
          <p className="pub-body">
            We'd rather be upfront about what's available today than overstate the product — the
            <Link to="/features" style={{ color: 'var(--primary)', fontWeight: 700 }}> Features page</Link> lists
            exactly what's live now versus what's on the roadmap.
          </p>
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">Try Unbrand Agency for yourself</h2>
            <p className="pub-lede">Create a free account — no credit card required.</p>
            <div className="pub-hero-cta-row" style={{ justifyContent: 'center', marginTop: 28 }}>
              <Link to="/register" className="pub-btn" style={{ background: '#fff', color: 'var(--primary)' }}>
                Get Started <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
