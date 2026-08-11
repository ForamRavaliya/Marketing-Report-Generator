import React from 'react';
import { Link } from 'react-router-dom';
import {
  UploadCloud, LayoutDashboard, Users2, BarChart4, Layers, Sparkles,
  FileText, Palette, ArrowRight, Table2, TrendingUp, Target, Plug,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';
import DashboardMockup from '../../components/public/mockups/DashboardMockup';
import PdfReportMockup from '../../components/public/mockups/PdfReportMockup';
import ThemeSwatches from '../../components/public/mockups/ThemeSwatches';
import ReportTypeMetrics from '../../components/public/mockups/ReportTypeMetrics';
import PricingPreview from '../../components/public/PricingPreview';
import FaqAccordion, { HOME_FAQS } from '../../components/public/FaqAccordion';

const TRUST_STRIP = [
  'CSV + Excel Import',
  'Automatic Report Classification',
  '5 Professional PDF Themes',
  'Campaign & Platform Analytics',
];

const PROBLEMS = [
  { title: 'Manual spreadsheets', body: 'Hours spent copying campaign exports into spreadsheets before a report can even start.' },
  { title: 'Repetitive reporting', body: 'The same KPI calculations, charts and summaries rebuilt by hand every single month.' },
  { title: 'Inconsistent client reports', body: 'Every account manager formats reports differently, so client-facing quality varies.' },
  { title: 'Time spent calculating metrics', body: 'CPL, CPA, ROAS and CTR recalculated manually instead of being derived automatically.' },
  { title: 'Difficulty explaining performance', body: 'Raw numbers without context make it hard to tell clients what actually happened and why.' },
];

const FEATURES = [
  { icon: UploadCloud, title: 'Smart Data Import', body: 'Upload CSV or Excel exports from your ad platforms. Guided column mapping confirms every field before anything is imported.' },
  { icon: LayoutDashboard, title: 'Performance Dashboard', body: 'A live dashboard per client with KPI cards, month-over-month comparison and trend charts.' },
  { icon: Target, title: 'Lead & Sales Reporting', body: 'The platform automatically classifies each report as Lead Generation, Sales Campaign or Sales Data, and adapts the terminology and metrics shown.' },
  { icon: BarChart4, title: 'Campaign Analytics', body: 'Full campaign-level breakdowns — spend, results and cost efficiency for every campaign in the period.' },
  { icon: Layers, title: 'Platform Analytics', body: 'See performance split out by platform, so you know where budget is working hardest.' },
  { icon: Sparkles, title: 'Automated Insights', body: 'Rule-based analysis of your imported metrics surfaces plain-language observations and recommendations automatically.' },
  { icon: FileText, title: 'Professional PDF Reports', body: 'Generate multi-page, client-ready PDF reports — executive summary, KPIs, campaign tables, trends and recommendations.' },
  { icon: Palette, title: 'Agency Branding', body: 'Pro and Agency plans can apply their own brand colors and logo to every generated report.' },
];

const STEPS = [
  { title: 'Create Client', body: 'Add a client profile to your agency workspace in seconds.' },
  { title: 'Upload CSV or Excel', body: 'Import a campaign export and confirm the column mapping.' },
  { title: 'Review Performance', body: 'Check the dashboard — KPIs, trends, campaigns and platforms.' },
  { title: 'Generate & Share Report', body: 'Produce a branded PDF report and download it for your client.' },
];

const COMING_SOON = [
  { name: 'Meta Ads', desc: 'Facebook & Instagram campaign sync' },
  { name: 'Google Ads', desc: 'Search, Display & YouTube sync' },
  { name: 'LinkedIn Ads', desc: 'B2B campaign sync' },
  { name: 'Shopify', desc: 'Store revenue and order sync' },
];

export default function PublicHome() {
  return (
    <PublicLayout>
      <SEO
        title="Turn Marketing Data Into Client-Ready Reports"
        description="Unbrand Agency helps agencies and marketers import CSV/Excel campaign data, analyze performance and generate professional, branded PDF reports."
        path="/"
      />

      {/* HERO */}
      <section className="pub-hero">
        <div className="pub-container pub-grid-2">
          <div>
            <span className="pub-eyebrow">Performance Marketing Reporting Software</span>
            <h1 className="pub-h1">
              Turn Marketing Data Into <span className="pub-accent-text">Client-Ready Reports</span>
            </h1>
            <p className="pub-lede" style={{ marginTop: 20 }}>
              Agencies and marketers upload CSV or Excel campaign data, review performance on a live
              dashboard, and generate professional, branded PDF reports — without rebuilding the same
              spreadsheet every month.
            </p>
            <div className="pub-hero-cta-row">
              <Link to="/register" className="pub-btn pub-btn-primary pub-btn-lg">
                Get Started <ArrowRight size={16} />
              </Link>
              <Link to="/how-it-works" className="pub-btn pub-btn-secondary pub-btn-lg">
                See How It Works
              </Link>
            </div>
            <p className="pub-hero-note">No credit card required for the Free plan.</p>
          </div>

          <Reveal delay={100}>
            <DashboardMockup />
          </Reveal>
        </div>
      </section>

      {/* TRUST / VALUE STRIP */}
      <section className="pub-section-sm">
        <div className="pub-container">
          <div className="pub-grid-4">
            {TRUST_STRIP.map((item) => (
              <div key={item} style={{ textAlign: 'center', padding: '18px 12px', borderTop: '2px solid var(--primary)', background: 'var(--bg2)', borderRadius: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">The Problem</span>
            <h2 className="pub-h2">Reporting shouldn't take longer than running the campaigns</h2>
          </div>
          <div className="pub-grid-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 60} className="pub-card">
                <h3 className="pub-h3" style={{ marginBottom: 8 }}>{p.title}</h3>
                <p className="pub-body">{p.body}</p>
              </Reveal>
            ))}
            <Reveal delay={PROBLEMS.length * 60} className="pub-card" style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)' }}>
              <h3 className="pub-h3" style={{ marginBottom: 8, color: 'var(--primary-dark)' }}>Unbrand Agency solves this</h3>
              <p className="pub-body" style={{ color: 'var(--primary-dark)' }}>
                Import your data once. Metrics, classification and report generation are automated from there.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">Features</span>
            <h2 className="pub-h2">Everything needed to go from raw data to a finished report</h2>
          </div>
          <div className="pub-grid-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 4) * 60} className="pub-card">
                <div className="pub-icon-box"><f.icon size={20} /></div>
                <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>{f.title}</h3>
                <p className="pub-body">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">How It Works</span>
            <h2 className="pub-h2">From upload to client-ready PDF in four steps</h2>
          </div>
          <div className="pub-steps">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 80}>
                <div className="pub-step-num">{i + 1}</div>
                <h3 className="pub-h3" style={{ marginBottom: 6, fontSize: 16 }}>{s.title}</h3>
                <p className="pub-body">{s.body}</p>
              </Reveal>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 44 }}>
            <Link to="/how-it-works" className="pub-btn pub-btn-secondary">
              See the full walkthrough <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* REPORT EXPERIENCE */}
      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">Report Experience</span>
            <h2 className="pub-h2">Metrics and terminology that adapt to the report type</h2>
            <p className="pub-lede" style={{ margin: '14px auto 0' }}>
              Unbrand Agency automatically detects whether a client's data represents lead generation or sales
              activity, and shows the right metrics and language for each — never a mismatched mix.
            </p>
          </div>
          <ReportTypeMetrics />
        </div>
      </section>

      {/* PDF REPORTS */}
      <section className="pub-section">
        <div className="pub-container pub-grid-2">
          <div>
            <span className="pub-eyebrow">PDF Reports</span>
            <h2 className="pub-h2" style={{ marginBottom: 18 }}>Reports built for sending straight to a client</h2>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Executive summary with plain-language highlights',
                'Key performance indicator cards',
                'Campaign-by-campaign performance tables',
                'Platform-level analysis',
                'Month-over-month trends',
                'Automated recommendations',
              ].map((line) => (
                <li key={line} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Table2 size={16} color="var(--primary)" style={{ marginTop: 3, flexShrink: 0 }} />
                  <span className="pub-body">{line}</span>
                </li>
              ))}
            </ul>
            <p className="pub-body" style={{ marginTop: 18 }}>
              Every report can be generated in any of <strong>5 visual themes</strong>, and Pro and Agency
              plans can apply their own agency branding.
            </p>
          </div>
          <Reveal delay={100} style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <PdfReportMockup variant="lead" />
          </Reveal>
        </div>

        <div className="pub-container" style={{ marginTop: 56 }}>
          <h3 className="pub-h3" style={{ textAlign: 'center', marginBottom: 24 }}>5 Professional Report Themes</h3>
          <ThemeSwatches />
        </div>
      </section>

      {/* INSIGHTS */}
      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container pub-grid-2">
          <Reveal>
            <div className="pub-card" style={{ maxWidth: 460 }}>
              <div className="pub-icon-box"><Sparkles size={20} /></div>
              <h3 className="pub-h3" style={{ marginBottom: 10 }}>Automated Performance Insights</h3>
              <p className="pub-body">
                "Spend increased 12% while leads grew 18% — cost per lead improved month-over-month."
              </p>
            </div>
          </Reveal>
          <div>
            <span className="pub-eyebrow">Insights</span>
            <h2 className="pub-h2" style={{ marginBottom: 16 }}>Smart recommendations, not a black box</h2>
            <p className="pub-body">
              Unbrand Agency analyzes the campaign metrics already available in your imported data — spend,
              results, cost efficiency, revenue where applicable — and surfaces plain-language observations
              and recommendations automatically. This is rule-based performance analysis built directly
              from your data, not a generic AI writing assistant.
            </p>
          </div>
        </div>
      </section>

      {/* AGENCY WORKFLOW */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">Agency Workflow</span>
            <h2 className="pub-h2">Built for agencies managing multiple clients</h2>
          </div>
          <div className="pub-grid-3">
            <Reveal className="pub-card">
              <Users2 size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
              <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Client Management</h3>
              <p className="pub-body">Keep every client's data, uploads and report history organized in one workspace.</p>
            </Reveal>
            <Reveal delay={60} className="pub-card">
              <LayoutDashboard size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
              <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Team Access</h3>
              <p className="pub-body">Role-based access lets admins, analysts and viewers work with the right level of control.</p>
            </Reveal>
            <Reveal delay={120} className="pub-card">
              <FileText size={22} color="var(--primary)" style={{ marginBottom: 14 }} />
              <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>Report History &amp; Branding</h3>
              <p className="pub-body">Every generated report is saved for later download, with your agency's branding on eligible plans.</p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* COMING SOON */}
      <section className="pub-section-sm" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-badge pub-badge-soon"><Plug size={12} /> Coming Soon</span>
            <h2 className="pub-h2">Platform integrations</h2>
            <p className="pub-lede" style={{ margin: '14px auto 0' }}>
              Direct auto-sync from ad platforms is on the roadmap. Today, CSV and Excel import is the
              supported way to bring your campaign data in.
            </p>
          </div>
          <div className="pub-grid-4">
            {COMING_SOON.map((p) => (
              <div key={p.name} className="pub-card" style={{ textAlign: 'center', opacity: .75 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{p.desc}</div>
                <span className="pub-badge pub-badge-soon" style={{ marginTop: 12 }}>Coming Soon</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <span className="pub-eyebrow">Pricing</span>
            <h2 className="pub-h2">Simple plans that grow with your agency</h2>
          </div>
          <PricingPreview />
          <div style={{ textAlign: 'center', marginTop: 30 }}>
            <Link to="/pricing" className="pub-btn pub-btn-secondary">
              See full plan comparison <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container" style={{ maxWidth: 760 }}>
          <div className="pub-section-head">
            <span className="pub-eyebrow">FAQ</span>
            <h2 className="pub-h2">Common questions</h2>
          </div>
          <FaqAccordion items={HOME_FAQS} />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">Stop rebuilding the same report every month</h2>
            <p className="pub-lede">Create your agency account and generate your first report today.</p>
            <div className="pub-hero-cta-row" style={{ justifyContent: 'center', marginTop: 28 }}>
              <Link to="/register" className="pub-btn" style={{ background: '#fff', color: 'var(--primary)' }}>
                Get Started <ArrowRight size={16} />
              </Link>
              <Link to="/pricing" className="pub-btn" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)' }}>
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
