-- Add missing columns and tables for finance app
-- Migration 0003 - fixes gaps identified in deep dive

-- Add missing columns to yoco_payouts
ALTER TABLE finance.yoco_payouts 
  ADD COLUMN IF NOT EXISTS gross_amount_cents integer,
  ADD COLUMN IF NOT EXISTS fee_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_arrival_date timestamptz,
  ADD COLUMN IF NOT EXISTS bank_account_last_four text;

-- Update gross_amount_cents from existing amount_cents if needed
UPDATE finance.yoco_payouts SET gross_amount_cents = amount_cents WHERE gross_amount_cents IS NULL;

-- Add computed net_amount_cents column (drop if exists as different type)
ALTER TABLE finance.yoco_payouts DROP COLUMN IF EXISTS net_amount_cents;
ALTER TABLE finance.yoco_payouts ADD COLUMN net_amount_cents integer GENERATED ALWAYS AS (COALESCE(gross_amount_cents, amount_cents) - COALESCE(fee_amount_cents, 0)) STORED;

-- Add missing columns to reconciliation_matches
ALTER TABLE finance.reconciliation_matches
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confidence_score numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS bank_import_id uuid REFERENCES finance.bank_imports(id),
  ADD COLUMN IF NOT EXISTS matched_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Create yoco_sync_runs table
CREATE TABLE IF NOT EXISTS finance.yoco_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  payments_synced integer DEFAULT 0,
  payouts_synced integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create pocket_snapshots table
CREATE TABLE IF NOT EXISTS finance.pocket_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pocket_id uuid REFERENCES finance.savings_pockets(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  balance_cents integer NOT NULL DEFAULT 0,
  contributions_cents integer DEFAULT 0,
  withdrawals_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(pocket_id, snapshot_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_runs_created ON finance.yoco_sync_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON finance.yoco_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_pocket_snapshots_pocket ON finance.pocket_snapshots(pocket_id);
CREATE INDEX IF NOT EXISTS idx_pocket_snapshots_date ON finance.pocket_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON finance.reconciliation_matches(status);

-- Enable RLS on new tables
ALTER TABLE finance.yoco_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.pocket_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "authenticated_all" ON finance.yoco_sync_runs;
CREATE POLICY "authenticated_all" ON finance.yoco_sync_runs FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.pocket_snapshots;
CREATE POLICY "authenticated_all" ON finance.pocket_snapshots FOR ALL USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT ALL ON finance.yoco_sync_runs TO authenticated;
GRANT ALL ON finance.pocket_snapshots TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO authenticated;
