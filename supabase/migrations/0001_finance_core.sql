-- Phenome Beauty Finance Core Schema
-- Creates finance schema, tables, and RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create finance schema
CREATE SCHEMA IF NOT EXISTS finance;

-- Yoco payments table
CREATE TABLE IF NOT EXISTS finance.yoco_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'ZAR',
  status text,
  payment_method text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Yoco payouts table
CREATE TABLE IF NOT EXISTS finance.yoco_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id text UNIQUE NOT NULL,
  amount_cents integer NOT NULL,
  currency text DEFAULT 'ZAR',
  status text,
  expected_arrival_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Reconciliation matches
CREATE TABLE IF NOT EXISTS finance.reconciliation_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES finance.yoco_payments(id),
  payout_id uuid REFERENCES finance.yoco_payouts(id),
  matched_at timestamptz DEFAULT now(),
  match_type text,
  notes text
);

-- Bank imports
CREATE TABLE IF NOT EXISTS finance.bank_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_date date,
  amount_cents integer NOT NULL,
  description text,
  reference text,
  imported_at timestamptz DEFAULT now()
);

-- Expenses
CREATE TABLE IF NOT EXISTS finance.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount_cents integer NOT NULL,
  description text,
  date date NOT NULL,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);

-- Advances
CREATE TABLE IF NOT EXISTS finance.advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents integer NOT NULL,
  description text,
  date date NOT NULL,
  repaid boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Savings pockets
CREATE TABLE IF NOT EXISTS finance.savings_pockets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_amount_cents integer,
  current_amount_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE finance.yoco_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.yoco_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.reconciliation_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bank_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.savings_pockets ENABLE ROW LEVEL SECURITY;

-- RLS Policies: authenticated users can read all
CREATE POLICY "authenticated_read" ON finance.yoco_payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.yoco_payouts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.reconciliation_matches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.bank_imports FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.expenses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.advances FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON finance.savings_pockets FOR SELECT USING (auth.role() = 'authenticated');

-- RLS Policies: authenticated users can insert
CREATE POLICY "authenticated_insert" ON finance.yoco_payments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.yoco_payouts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.reconciliation_matches FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.bank_imports FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.expenses FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.advances FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "authenticated_insert" ON finance.savings_pockets FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- RLS Policies: authenticated users can update
CREATE POLICY "authenticated_update" ON finance.yoco_payments FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.yoco_payouts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.reconciliation_matches FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.bank_imports FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.expenses FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.advances FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_update" ON finance.savings_pockets FOR UPDATE USING (auth.role() = 'authenticated');

-- RLS Policies: authenticated users can delete
CREATE POLICY "authenticated_delete" ON finance.yoco_payments FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.yoco_payouts FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.reconciliation_matches FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.bank_imports FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.expenses FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.advances FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_delete" ON finance.savings_pockets FOR DELETE USING (auth.role() = 'authenticated');
