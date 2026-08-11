import React from 'react';
import { Link } from 'react-router-dom';
import {
  UserPlus, Users2, FileSpreadsheet, UploadCloud, Table2, Database,
  LayoutDashboard, BarChart4, Sparkles, FileText, Palette, History, ArrowRight,
} from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';
import Reveal from '../../components/public/Reveal';

const STEPS = [
  {
    icon: UserPlus,
    title: '1. Create your account',
    body: 'Register your agency and sign in. Every account starts on the Free plan — no credit card required.',
  },
  {
    icon: Users2,
    title: '2. Add a client',
    body: 'Create a client profile to organize that client\'s data, uploads and reports separately from the rest of your agency.',
  },
  {
    icon: FileSpreadsheet,
    title: '3. Prepare your file',
    body: 'Export campaign performance from your ad platform as a CSV or Excel file — spend, results, revenue and any other metrics you track.',
  },
  {
    icon: UploadCloud,
    title: '4. Upload the file',
    body: 'Drag and drop the file into Unbrand Agency, select the platform and date range, and let the system read the columns.',
  },
  {
    icon: Table2,
    title: '5. Confirm column mapping',
    body: 'Review how each column was matched to a metric (spend, revenue, conversions, etc.) and correct anything before importing.',
  },
  {
    icon: Database,
    title: '6. Data is imported',
    body: 'Once confirmed, the data is saved and the report type (Lead Generation, Sales Campaign or Sales Data) is detected automatically.',
  },
  {
    icon: LayoutDashboard,
    title: '7. Review the dashboard',
    body: 'See KPIs, month-over-month comparison and trend charts for the client immediately after import.',
  },
  {
    icon: BarChart4,
    title: '8. Analyze campaigns & platforms',
    body: 'Drill into campaign-level and platform-level performance to see where budget is working hardest.',
  },
  {
    icon: Sparkles,
    title: '9. Read the automated insights',
    body: 'Review plain-language observations and recommendations generated from the metrics in your data.',
  },
  {
    icon: FileText,
    title: '10. Generate the PDF report',
    body: 'Create a multi-page, client-ready PDF report from the same reviewed data.',
  },
  {
    icon: Palette,
    title: '11. Choose a theme',
    body: 'Pick from 5 report themes. Pro and Agency plans can also apply their own agency branding.',
  },
  {
    icon: History,
    title: '12. Access report history',
    body: 'Every report you generate is saved to that client\'s history, ready to download again whenever you need it.',
  },
];

export default function PublicHowItWorks() {
  return (
    <PublicLayout>
      <SEO
        title="How It Works"
        description="A step-by-step walkthrough of Unbrand Agency: create an account, add a client, upload CSV/Excel data, review your dashboard and generate a professional PDF report."
        path="/how-it-works"
      />

      <section className="pub-hero" style={{ paddingBottom: 20 }}>
        <div className="pub-container pub-section-head">
          <span className="pub-eyebrow">How It Works</span>
          <h1 className="pub-h1" style={{ fontSize: 'clamp(30px,4.4vw,46px)' }}>
            From a blank account to a finished report
          </h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            A complete walkthrough of the product — no prior experience needed.
          </p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 20 }}>
        <div className="pub-container">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 780, margin: '0 auto' }}>
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={(i % 4) * 60} className="pub-card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div className="pub-icon-box" style={{ marginBottom: 0, flexShrink: 0 }}>
                  <step.icon size={20} />
                </div>
                <div>
                  <h3 className="pub-h3" style={{ marginBottom: 6, fontSize: 16 }}>{step.title}</h3>
                  <p className="pub-body">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-section" style={{ background: 'var(--bg2)' }}>
        <div className="pub-container">
          <div className="pub-cta-band">
            <h2 className="pub-h2">Ready to try it yourself?</h2>
            <p className="pub-lede">Start on the Free plan and generate your first report in minutes.</p>
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
