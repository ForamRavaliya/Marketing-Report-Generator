ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS row_level VARCHAR(50);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(100);

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_value NUMERIC DEFAULT 0;

ALTER TABLE performance_data
  ADD COLUMN IF NOT EXISTS result_breakdown JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_performance_row_level
  ON performance_data(client_id, platform, report_month, row_level);
