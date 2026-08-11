import React from 'react';
import { Link } from 'react-router-dom';
import {
  UploadCloud, Table2, Target, LayoutDashboard, TrendingUp, BarChart4, Layers,
  Sparkles, FileText, Palette, History, Users2, ShieldCheck, CreditCard, Receipt, ArrowRight,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';

const GROUPS = [
  {
    key: 'import',
    title: 'Data Import',
    intro: 'Bring campaign data in reliably, with a review step before anything is saved.',
    items: [
      { icon: UploadCloud, title: 'CSV Upload', status: 'live', body: 'Import campaign exports from CSV files up to 50MB.' },
      { icon: UploadCloud, title: 'Excel Upload', status: 'live', body: 'Import .xls and .xlsx workbook exports directly.' },
      { icon: Table2, title: 'Guided Column Mapping', status: 'live', body: 'Review and confirm how each column maps to spend, results, revenue and more before import.' },
      { icon: Target, title: 'Automatic Report-Type Detection', status: 'live', body: 'Each import is classified as Lead Generation, Sales Campaign or Sales Data automatically.' },
      { icon: FileText, title: 'PDF / Image (OCR) Upload', status: 'soon', body: 'Uploading screenshots or PDF exports directly is on the roadmap.' },
      { icon: FileText, title: 'Manual Entry', status: 'soon', body: 'Typing metrics in by hand instead of uploading a file is on the roadmap.' },
    ],
  },
  {
    key: 'analytics',
    title: 'Analytics',
    intro: 'Understand performance before you ever open a report.',
    items: [
      { icon: LayoutDashboard, title: 'Dashboard Overview', status: 'live', body: 'A live per-client dashboard summarizing current performance.' },
      { icon: TrendingUp, title: 'Month-over-Month Comparison', status: 'live', body: 'Automatic comparison against the previous period for every key metric.' },
      { icon: TrendingUp, title: 'Trend Analytics', status: 'live', body: 'Historical trend charts across the full imported date range.' },
      { icon: BarChart4, title: 'Campaign Analytics', status: 'live', body: 'Full campaign-level breakdown of spend and results.' },
      { icon: Layers, title: 'Platform Analytics', status: 'live', body: 'Performance broken down by advertising platform.' },
      { icon: Sparkles, title: 'Automated Insights', status: 'live', body: 'Rule-based analysis of your metrics, surfaced as plain-language observations and recommendations.' },
    ],
  },
  {
    key: 'reporting',
    title: 'Reporting',
    intro: 'Turn the same analysis into something you can hand to a client.',
    items: [
      { icon: FileText, title: 'Professional PDF Reports', status: 'live', body: 'Multi-page PDF reports with executive summary, KPIs, campaign tables and trends.' },
      { icon: Palette, title: '5 Report Themes', status: 'live', body: 'Professional Blue, Purple Gradient, Emerald, Dark and Minimal Black & White.' },
      { icon: Palette, title: 'Agency Branding', status: 'plan', body: 'Apply your logo and brand colors to reports on Pro and Agency plans.' },
      { icon: History, title: 'Report History & Download', status: 'live', body: 'Every generated report is saved and can be downloaded again later.' },
    ],
  },
  {
    key: 'agency',
    title: 'Agency Management',
    intro: 'Run the platform the way your agency actually works.',
    items: [
      { icon: Users2, title: 'Client Management', status: 'live', body: 'Organize every client\'s data, uploads and reports in one place.' },
      { icon: ShieldCheck, title: 'Role-Based Access', status: 'live', body: 'Admin, analyst and viewer roles control what each teammate can do.' },
      { icon: Layers, title: 'Platform Integrations / Auto-Sync', status: 'soon', body: 'Direct sync with Meta, Google, LinkedIn Ads and Shopify is on the roadmap.' },
      { icon: FileText, title: 'Automated Email Report Delivery', status: 'soon', body: 'Scheduled email delivery of reports is on the roadmap.' },
    ],
  },
  {
    key: 'billing',
    title: 'Subscriptions & Billing',
    intro: 'Straightforward plans and transparent billing.',
    items: [
      { icon: CreditCard, title: 'Free / Pro / Agency Plans', status: 'live', body: 'Three plans that scale with the number of clients you manage.' },
      { icon: CreditCard, title: 'Razorpay Payments', status: 'live', body: 'Subscription upgrades are processed securely through Razorpay.' },
      { icon: Receipt, title: 'Billing History', status: 'live', body: 'View past payments and receipts at any time.' },
    ],
  },
];

const StatusBadge = ({ status }) => {
  if (status === 'live') return <span className="pub-badge pub-badge-live">Available Now</span>;
  if (status === 'plan') return <span className="pub-badge pub-badge-plan">Pro &amp; Agency</span>;
  return <span className="pub-badge pub-badge-soon">Coming Soon</span>;
};

export default function PublicFeatures() {
  return (
    <PublicLayout>
      <SEO
        title="Features"
        description="Explore Unbrand Agency's marketing reporting features: CSV/Excel import, dashboards, campaign analytics, automated insights, professional PDF reports and agency branding."
        path="/features"
      />

      <section className="pub-hero" style={{ paddingBottom: 20 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">Features</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>
            Everything Unbrand Agency does, organized by workflow
          </h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            Grouped the way you'll actually use it — from getting data in, to understanding it, to
            handing a finished report to a client.
          </p>
        </div>
      </section>

      {GROUPS.map((group, gi) => (
        <section key={group.key} className="pub-section" style={{ background: gi % 2 ? 'var(--bg2)' : 'transparent', paddingTop: gi === 0 ? 20 : undefined }}>
          <div className="pub-container">
            <div className="pub-section-head left">
              <h2 className="pub-h2">{group.title}</h2>
              <p className="pub-body" style={{ marginTop: 8, maxWidth: 620 }}>{group.intro}</p>
            </div>
            <div className="pub-grid-3">
              {group.items.map((item, i) => (
                <Reveal key={item.title} delay={(i % 3) * 60} className="pub-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div className="pub-icon-box" style={{ marginBottom: 0 }}><item.icon size={20} /></div>
                    <StatusBadge status={item.status} />
                  </div>
                  <h3 className="pub-h3" style={{ marginBottom: 8, fontSize: 16 }}>{item.title}</h3>
                  <p className="pub-body">{item.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">See it on your own data</h2>
            <p className="pub-lede">Create a free account and import your first campaign file today.</p>
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
