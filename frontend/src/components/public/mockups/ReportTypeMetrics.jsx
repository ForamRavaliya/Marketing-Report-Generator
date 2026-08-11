import React from 'react';
import { CheckCircle2 } from 'lucide-react';

// Real metric/terminology sets the product actually renders per report
// type (utils/reportMetricConfig.js + utils/pdf report labels) -- kept in
// sync by hand since this is presentational copy, not live-fetched data.
const TYPES = [
  {
    key: 'lead',
    title: 'Lead Generation Reports',
    blurb: 'For campaigns optimized for leads, form fills or inquiries.',
    metrics: ['Leads', 'Cost Per Lead (CPL)', 'Spend', 'Impressions', 'CTR', 'Clicks'],
  },
  {
    key: 'sales',
    title: 'Sales Campaign Reports',
    blurb: 'For campaigns optimized for purchases and revenue.',
    metrics: ['Purchases', 'Revenue', 'ROAS', 'Cost Per Purchase (CPP)', 'Spend', 'Clicks'],
  },
  {
    key: 'salesdata',
    title: 'Sales Data Reports',
    blurb: 'For imported order/sales data, e.g. store or CRM exports.',
    metrics: ['Orders', 'Revenue', 'Average Order Value (AOV)', 'Profit', 'Refunds'],
  },
];

export default function ReportTypeMetrics() {
  return (
    <div className="pub-grid-3">
      {TYPES.map((type) => (
        <div key={type.key} className="pub-card">
          <h3 className="pub-h3" style={{ marginBottom: 6 }}>{type.title}</h3>
          <p className="pub-body" style={{ marginBottom: 16 }}>{type.blurb}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {type.metrics.map((m) => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <CheckCircle2 size={14} color="var(--success)" style={{ flexShrink: 0 }} />
                {m}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
