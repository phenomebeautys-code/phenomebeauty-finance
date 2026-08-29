-- PhenomeBeauty Finance: Phase 5 — Month-end close, owner allocation, deferred obligations, audit
-- This migration adds:
-- 1. finance_monthly_closes — one row per month, with status and totals.
-- 2. finance_owner_allocations — calculated 60/40 splits per month.
-- 3. finance_owner_payments — actual payments/carry-forwards per owner per month.
-- 4. finance_deferred_obligations — e.g. NextSlot R699/month accrued but deferred.
-- 5. finance_audit_log — append-only audit trail for meaningful finance changes.
-- 6. Helper views for month-end UI.

--------------------------------------------------------------------------------
-- 1. Monthly closes
--------------------------------------------------------------------------------

CREATE TABLE finance_monthly_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month date NOT NULL, -- first day of month, e.g. 2026-08-01
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','pending_approval','approved','locked')),
  gross_sales_cents bigint NOT NULL DEFAULT 0,
  yoco_fees_cents bigint NOT NULL DEFAULT 0,
  approved_expenses_cents bigint NOT NULL DEFAULT 0,
  protected_buffer_cents bigint NOT NULL DEFAULT 0,
  distributable_surplus_cents bigint NOT NULL DEFAULT 0,
  nextslot_deferred_accrued_cents bigint NOT NULL DEFAULT 0,
  notes text,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_finance_monthly_closes_year_month
  ON finance_monthly_closes (year_month);

CREATE INDEX idx_finance_monthly_closes_status
  ON finance_monthly_closes (status);

CREATE TRIGGER trg_finance_monthly_closes_updated_at
  BEFORE UPDATE ON finance_monthly_closes
  FOR EACH ROW EXECUTE FUNCTION public.set_finance_control_settings_updated_at();

--------------------------------------------------------------------------------
-- 2. Owner allocations
--------------------------------------------------------------------------------

CREATE TABLE finance_owner_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_close_id uuid NOT NULL REFERENCES finance_monthly_closes(id) ON DELETE CASCADE,
  owner_name text NOT NULL CHECK (owner_name IN ('Shu-meez','Arshad')),
  allocation_percent numeric NOT NULL CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  allocation_cents bigint NOT NULL CHECK (allocation_cents >= 0),
  advances_deducted_cents bigint NOT NULL DEFAULT 0,
  final_payable_cents bigint NOT NULL CHECK (final_payable_cents >= 0),
  status text NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated','approved','paid','partially_paid','carried_forward')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finance_owner_allocations_close
  ON finance_owner_allocations (monthly_close_id);

CREATE INDEX idx_finance_owner_allocations_owner
  ON finance_owner_allocations (owner_name);

CREATE TRIGGER trg_finance_owner_allocations_updated_at
  BEFORE UPDATE ON finance_owner_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_finance_control_settings_updated_at();

--------------------------------------------------------------------------------
-- 3. Owner payments
--------------------------------------------------------------------------------

CREATE TABLE finance_owner_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_allocation_id uuid NOT NULL REFERENCES finance_owner_allocations(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  paid_from text NOT NULL
    CHECK (paid_from IN ('fnb','yoco_savings','cash','other')),
  reference text,
  evidence_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_finance_owner_payments_allocation
  ON finance_owner_payments (owner_allocation_id);

--------------------------------------------------------------------------------
-- 4. Deferred obligations
--------------------------------------------------------------------------------

CREATE TABLE finance_deferred_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_name text NOT NULL, -- e.g. "NextSlot platform fee"
  year_month date NOT NULL,      -- first day of month
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'accrued'
    CHECK (status IN ('accrued','paid','waived')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_deferred_obligations_name_month
  ON finance_deferred_obligations (obligation_name, year_month);

CREATE INDEX idx_finance_deferred_obligations_status
  ON finance_deferred_obligations (status);

CREATE TRIGGER trg_finance_deferred_obligations_updated_at
  BEFORE UPDATE ON finance_deferred_obligations
  FOR EACH ROW EXECUTE FUNCTION public.set_finance_control_settings_updated_at();

--------------------------------------------------------------------------------
-- 5. Audit log
--------------------------------------------------------------------------------

CREATE TABLE finance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT NOW(),
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL, -- e.g. "expense.created", "month.locked", "allocation.adjusted"
  target_table text,
  target_id uuid,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  source text -- "ui", "edge_function", "manual", etc.
);

CREATE INDEX idx_finance_audit_log_target
  ON finance_audit_log (target_table, target_id);

CREATE INDEX idx_finance_audit_log_action
  ON finance_audit_log (action);

CREATE INDEX idx_finance_audit_log_occurred_at
  ON finance_audit_log (occurred_at);

--------------------------------------------------------------------------------
-- 6. Helper views for month-end UI
--------------------------------------------------------------------------------

CREATE VIEW finance_month_end_summary AS
SELECT
  mc.year_month,
  mc.status AS close_status,
  mc.gross_sales_cents,
  mc.yoco_fees_cents,
  mc.approved_expenses_cents,
  mc.protected_buffer_cents,
  mc.distributable_surplus_cents,
  mc.nextslot_deferred_accrued_cents,
  shu.allocation_cents AS shu_allocation_cents,
  shu.advances_deducted_cents AS shu_advances_deducted_cents,
  shu.final_payable_cents AS shu_final_payable_cents,
  arsh.allocation_cents AS arsh_allocation_cents,
  arsh.advances_deducted_cents AS arsh_advances_deducted_cents,
  arsh.final_payable_cents AS arsh_final_payable_cents,
  mc.closed_at,
  mc.closed_by
FROM finance_monthly_closes mc
LEFT JOIN finance_owner_allocations shu
  ON shu.monthly_close_id = mc.id AND shu.owner_name = 'Shu-meez'
LEFT JOIN finance_owner_allocations arsh
  ON arsh.monthly_close_id = mc.id AND arsh.owner_name = 'Arshad';

CREATE VIEW finance_owner_balance AS
SELECT
  o.owner_name,
  SUM(o.allocation_cents) AS total_allocated_cents,
  SUM(o.advances_deducted_cents) AS total_advances_deducted_cents,
  SUM(o.final_payable_cents) AS total_final_payable_cents,
  SUM(COALESCE(p.amount_cents,0)) AS total_paid_cents,
  (SUM(o.final_payable_cents) - SUM(COALESCE(p.amount_cents,0))) AS outstanding_cents
FROM finance_owner_allocations o
LEFT JOIN finance_owner_payments p ON p.owner_allocation_id = o.id
GROUP BY o.owner_name;

--------------------------------------------------------------------------------
-- 7. RLS policies
--------------------------------------------------------------------------------

ALTER TABLE finance_monthly_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_owner_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_owner_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_deferred_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit_log ENABLE ROW LEVEL SECURITY;

-- Monthly closes: authenticated read/write
CREATE POLICY "authenticated read monthly closes"
  ON finance_monthly_closes FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert monthly closes"
  ON finance_monthly_closes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update monthly closes"
  ON finance_monthly_closes FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Owner allocations
CREATE POLICY "authenticated read owner allocations"
  ON finance_owner_allocations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert owner allocations"
  ON finance_owner_allocations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update owner allocations"
  ON finance_owner_allocations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Owner payments
CREATE POLICY "authenticated read owner payments"
  ON finance_owner_payments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert owner payments"
  ON finance_owner_payments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Deferred obligations
CREATE POLICY "authenticated read deferred obligations"
  ON finance_deferred_obligations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert deferred obligations"
  ON finance_deferred_obligations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update deferred obligations"
  ON finance_deferred_obligations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Audit log: authenticated read; writes via functions or UI only
CREATE POLICY "authenticated read audit log"
  ON finance_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert audit log"
  ON finance_audit_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- No update/delete on audit log to preserve immutability.
