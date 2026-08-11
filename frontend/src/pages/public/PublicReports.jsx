import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Palette } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';
import PdfReportMockup from '../../components/public/mockups/PdfReportMockup';
import ThemeSwatches from '../../components/public/mockups/ThemeSwatches';
import ReportTypeMetrics from '../../components/public/mockups/ReportTypeMetrics';

const STRUCTURE = [
  { title: 'Executive Summary', body: 'A plain-language overview of the period\'s performance and the top highlight.' },
  { title: 'Key Performance Indicators', body: 'The core metrics for the report type, shown as clear KPI cards.' },
  { title: 'Trends & Monthly Analysis', body: 'Month-over-month comparison and historical trend charts.', plan: true },
  { title: 'Campaign Performance', body: 'A full table of every campaign in the period, with cost and result metrics.' },
  { title: 'Platform Performance', body: 'Performance broken down by advertising platform.', plan: true },
  { title: 'Insights & Recommendations', body: 'Automated, rule-based observations and next-step recommendations.', plan: true },
];

export default function PublicReports() {
  return (
    <PublicLayout>
      <SEO
        title="Reports"
        description="See how Unbrand Agency builds Lead Generation, Sales Campaign and Sales Data reports — dynamic metrics, professional PDF structure, 5 themes and agency branding."
        path="/reporting"
      />

      <section className="pub-hero" style={{ paddingBottom: 20 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">Reports</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>
            Reports that speak the client's language
          </h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            Unbrand Agency automatically detects whether a client's data represents lead generation or sales
            activity, and adapts every metric and label to match.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container">
          <div className="pub-section-head left">
            <h2 className="pub-h2">Three report types, detected automatically</h2>
            <p className="pub-body" style={{ marginTop: 8, maxWidth: 640 }}>
              There is no manual toggle to get wrong — the report type is inferred from the imported
              campaign data itself.
            </p>
          </div>
          <ReportTypeMetrics />
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container pub-grid-2">
          <div>
            <span className="pub-eyebrow">PDF Structure</span>
            <h2 className="pub-h2" style={{ marginBottom: 18 }}>A complete, multi-page report</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STRUCTURE.map((s) => (
                <div key={s.title} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{s.body}</div>
                  </div>
                  {s.plan && <span className="pub-badge pub-badge-plan" style={{ flexShrink: 0 }}>Pro &amp; Agency</span>}
                </div>
              ))}
            </div>
          </div>
          <Reveal delay={100} style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <PdfReportMockup variant="lead" />
            <PdfReportMockup variant="sales" />
          </Reveal>
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">Themes</span>
            <h2 className="pub-h2">5 professional report themes</h2>
            <p className="pub-lede" style={{ margin: '14px auto 0' }}>
              Every plan can choose any theme. Pro and Agency plans can additionally apply their own
              agency logo and brand colors.
            </p>
          </div>
          <ThemeSwatches />
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container pub-grid-2">
          <Reveal className="pub-card">
            <Palette size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
            <h3 className="pub-h3" style={{ marginBottom: 8 }}>Agency Branding</h3>
            <p className="pub-body">
              On Pro and Agency plans, your agency's logo and brand colors are applied automatically to
              every report you generate.
            </p>
          </Reveal>
          <Reveal delay={80} className="pub-card">
            <History size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
            <h3 className="pub-h3" style={{ marginBottom: 8 }}>Report History</h3>
            <p className="pub-body">
              Every report you generate is saved to that client's history and can be downloaded again
              at any time — no need to regenerate it.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">Generate your first report</h2>
            <p className="pub-lede">Upload a campaign file and see the report structure on your own data.</p>
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
