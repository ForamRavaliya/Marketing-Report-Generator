-- Phase 3 bucket A: generated_reports has zero indexes despite being queried
-- by agency_id/client_id in hot paths (routes/reports.js, routes/email.js,
-- routes/superAdmin.js's per-agency correlated subquery). Pure additive
-- indexes, no data risk, no lock beyond a normal CREATE INDEX.
--
-- NOT YET APPLIED to production -- draft for review only.

CREATE INDEX IF NOT EXISTS idx_generated_reports_agency ON generated_reports(agency_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_client_agency ON generated_reports(client_id, agency_id);
