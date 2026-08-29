-- Phenome Beauty Finance - Complete Schema
-- Adds missing tables and columns for full app functionality

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create finance schema if not exists
CREATE SCHEMA IF NOT EXISTS finance;

-- Yoco payments table (add missing fields)
CREATE TABLE IF NOT EXISTS finance.yoco_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,
  fee_amount_cents integer DEFAULT 0,
  net_amount_cents integer GENERATED ALWAYS AS (amount_cents - fee_amount_cents) STORED,
  currency text DEFAULT 'ZAR',
  status text DEFAULT 'pending',
  payment_method text,
  card_brand text,
  card_last_four text,
  customer_email text,
  customer_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Yoco payouts table (add missing fields)
CREATE TABLE IF NOT EXISTS finance.yoco_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id text UNIQUE NOT NULL,
  gross_amount_cents integer NOT NULL,
  fee_amount_cents integer DEFAULT 0,
  net_amount_cents integer GENERATED ALWAYS AS (gross_amount_cents - fee_amount_cents) STORED,
  currency text DEFAULT 'ZAR',
  status text DEFAULT 'pending',
  expected_arrival_date timestamptz,
  actual_arrival_date timestamptz,
  bank_account_last_four text,
  created_at timestamptz DEFAULT now()
);

-- Yoco sync runs table
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

-- Reconciliation matches table (add status field)
CREATE TABLE IF NOT EXISTS finance.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES finance.yoco_payments(id),
  payout_id uuid REFERENCES finance.yoco_payouts(id),
  bank_import_id uuid REFERENCES finance.bank_imports(id),
  match_type text,
  status text DEFAULT 'pending',
  confidence_score numeric DEFAULT 1.0,
  matched_at timestamptz DEFAULT now(),
  matched_by uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Bank imports table
CREATE TABLE IF NOT EXISTS finance.bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_date date,
  amount_cents integer NOT NULL,
  description text,
  reference text,
  transaction_type text,
  balance_after_cents integer,
  imported_at timestamptz DEFAULT now(),
  source text DEFAULT 'manual'
);

-- Expenses table
CREATE TABLE IF NOT EXISTS finance.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount_cents integer NOT NULL,
  description text,
  date date NOT NULL,
  receipt_url text,
  paid_from text DEFAULT 'business',
  created_at timestamptz DEFAULT now()
);

-- Advances table
CREATE TABLE IF NOT EXISTS finance.advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents integer NOT NULL,
  description text,
  date date NOT NULL,
  repaid boolean DEFAULT false,
  repaid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Savings pockets table
CREATE TABLE IF NOT EXISTS finance.savings_pockets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_amount_cents integer,
  current_amount_cents integer DEFAULT 0,
  color text DEFAULT '#3b82f6',
  icon text,
  created_at timestamptz DEFAULT now()
);

-- Pocket snapshots table
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
CREATE INDEX IF NOT EXISTS idx_yoco_payments_checkout ON finance.yoco_payments(checkout_id);
CREATE INDEX IF NOT EXISTS idx_yoco_payments_created ON finance.yoco_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yoco_payouts_created ON finance.yoco_payouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_created ON finance.yoco_sync_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON finance.reconciliation_matches(status);
CREATE INDEX IF NOT EXISTS idx_pocket_snapshots_pocket ON finance.pocket_snapshots(pocket_id);

-- Enable RLS
ALTER TABLE finance.yoco_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.yoco_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.yoco_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.savings_pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.pocket_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "authenticated_all" ON finance.yoco_payments;
CREATE POLICY "authenticated_all" ON finance.yoco_payments FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.yoco_payouts;
CREATE POLICY "authenticated_all" ON finance.yoco_payouts FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.yoco_sync_runs;
CREATE POLICY "authenticated_all" ON finance.yoco_sync_runs FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.reconciliation_matches;
CREATE POLICY "authenticated_all" ON finance.reconciliation_matches FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.bank_imports;
CREATE POLICY "authenticated_all" ON finance.bank_imports FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.expenses;
CREATE POLICY "authenticated_all" ON finance.expenses FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.advances;
CREATE POLICY "authenticated_all" ON finance.advances FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.savings_pockets;
CREATE POLICY "authenticated_all" ON finance.savings_pockets FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_all" ON finance.pocket_snapshots;
CREATE POLICY "authenticated_all" ON finance.pocket_snapshots FOR ALL USING (auth.role() = 'authenticated');

GRANT ALL ON ALL TABLES IN SCHEMA finance TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO authenticated;
