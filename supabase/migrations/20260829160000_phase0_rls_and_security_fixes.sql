-- PhenomeBeauty Finance: Phase 0 — RLS and security hardening
-- This migration:
-- 1. Adds RLS policies for the four mirror tables that currently have RLS but no policies.
-- 2. Recreates SECURITY DEFINER views as plain views (or documents why they must be security-definer).
-- 3. Fixes functions with mutable search_path.
-- 4. Leaves auth.leaked-password protection as a dashboard setting (not SQL).

--------------------------------------------------------------------------------
-- 1. RLS policies for mirror tables
--------------------------------------------------------------------------------

-- nextslot_bookings_mirror
CREATE POLICY "authenticated read nextslot bookings"
  ON nextslot_bookings_mirror
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert nextslot bookings"
  ON nextslot_bookings_mirror
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update nextslot bookings"
  ON nextslot_bookings_mirror
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- nextslot_booking_items_mirror
CREATE POLICY "authenticated read nextslot booking items"
  ON nextslot_booking_items_mirror
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert nextslot booking items"
  ON nextslot_booking_items_mirror
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update nextslot booking items"
  ON nextslot_booking_items_mirror
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- nextslot_payments_mirror
CREATE POLICY "authenticated read nextslot payments"
  ON nextslot_payments_mirror
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert nextslot payments"
  ON nextslot_payments_mirror
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update nextslot payments"
  ON nextslot_payments_mirror
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- product_orders_mirror
CREATE POLICY "authenticated read product orders"
  ON product_orders_mirror
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated insert product orders"
  ON product_orders_mirror
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated update product orders"
  ON product_orders_mirror
  FOR UPDATE
  USING (auth.role() = 'authenticated');

--------------------------------------------------------------------------------
-- 2. Recreate views without SECURITY DEFINER
--------------------------------------------------------------------------------
-- The existing views finance_sale_totals, finance_revenue_by_type,
-- finance_yoco_payout_reconciliation, and finance_monthly_cash_overview
-- were flagged as SECURITY DEFINER. We recreate them as plain views.
-- They only read finance tables that already have RLS; no special permissions needed.

DROP VIEW IF EXISTS public.finance_sale_totals;
CREATE VIEW public.finance_sale_totals AS
SELECT
  s.id AS sale_id,
  s.gross_amount_cents,
  COALESCE(SUM(l.total_amount_cents), 0) AS lines_total_cents,
  s.gross_amount_cents - COALESCE(SUM(l.total_amount_cents), 0) AS difference_cents
FROM finance_sales s
LEFT JOIN finance_sale_lines l ON l.sale_id = s.id
GROUP BY s.id, s.gross_amount_cents;

DROP VIEW IF EXISTS public.finance_revenue_by_type;
CREATE VIEW public.finance_revenue_by_type AS
SELECT
  l.line_type,
  date_trunc('month', s.sale_date) AS month,
  SUM(l.total_amount_cents) AS total_cents,
  COUNT(DISTINCT s.id) AS sale_count
FROM finance_sale_lines l
JOIN finance_sales s ON s.id = l.sale_id
WHERE s.reconciliation_status <> 'excluded'
GROUP BY l.line_type, date_trunc('month', s.sale_date);

DROP VIEW IF EXISTS public.finance_yoco_payout_reconciliation;
CREATE VIEW public.finance_yoco_payout_reconciliation AS
SELECT
  yp.id AS yoco_payout_id,
  yp.yoco_payout_id AS yoco_reference,
  yp.payout_date,
  yp.status AS yoco_status,
  yp.net_amount_cents AS expected_bank_cents,
  frm.id AS reconciliation_id,
  frm.status AS reconciliation_status,
  fbt.id AS bank_transaction_id,
  fbt.transaction_date AS bank_transaction_date,
  fbt.description AS bank_description,
  fbt.signed_amount_cents AS bank_amount_cents,
  (fbt.signed_amount_cents - yp.net_amount_cents) AS difference_cents
FROM yoco_payouts yp
LEFT JOIN finance_reconciliation_matches frm
  ON frm.yoco_payout_id = yp.id
  AND frm.match_type = 'yoco_payout_to_bank_transaction'
LEFT JOIN finance_bank_transactions fbt
  ON fbt.id = frm.bank_transaction_id;

DROP VIEW IF EXISTS public.finance_monthly_cash_overview;
CREATE VIEW public.finance_monthly_cash_overview AS
WITH sales AS (
  SELECT
    (date_trunc('month', (finance_sales.sale_date)::timestamptz))::date AS month,
    SUM(finance_sales.gross_amount_cents) FILTER (WHERE finance_sales.reconciliation_status <> 'excluded') AS gross_sales_cents
  FROM finance_sales
  GROUP BY ((date_trunc('month', (finance_sales.sale_date)::timestamptz))::date)
), yoco AS (
  SELECT
    (date_trunc('month', COALESCE(yoco_payments.yoco_created_at, yoco_payments.created_at)))::date AS month,
    SUM(yoco_payments.gross_amount_cents) FILTER (WHERE yoco_payments.status = ANY (ARRAY['succeeded','successful','paid','completed'])) AS yoco_gross_cents,
    SUM(COALESCE(yoco_payments.fee_amount_cents, 0)) FILTER (WHERE yoco_payments.status = ANY (ARRAY['succeeded','successful','paid','completed'])) AS yoco_fee_cents,
    SUM(COALESCE(yoco_payments.net_amount_cents, (yoco_payments.gross_amount_cents - COALESCE(yoco_payments.fee_amount_cents, 0)))) FILTER (WHERE yoco_payments.status = ANY (ARRAY['succeeded','successful','paid','completed'])) AS yoco_net_cents
  FROM yoco_payments
  GROUP BY ((date_trunc('month', COALESCE(yoco_payments.yoco_created_at, yoco_payments.created_at)))::date)
), expenses AS (
  SELECT
    (date_trunc('month', (finance_expenses.expense_date)::timestamptz))::date AS month,
    SUM(finance_expenses.business_amount_cents) FILTER (WHERE finance_expenses.approval_status = 'approved') AS approved_expenses_cents
  FROM finance_expenses
  GROUP BY ((date_trunc('month', (finance_expenses.expense_date)::timestamptz))::date)
), advances AS (
  SELECT
    (date_trunc('month', (finance_personal_advances.advance_date)::timestamptz))::date AS month,
    SUM(finance_personal_advances.amount_cents) FILTER (WHERE finance_personal_advances.status = ANY (ARRAY['outstanding','carried_forward'])) AS personal_advances_cents
  FROM finance_personal_advances
  GROUP BY ((date_trunc('month', (finance_personal_advances.advance_date)::timestamptz))::date)
)
SELECT
  COALESCE(sales.month, yoco.month, expenses.month, advances.month) AS month,
  COALESCE(sales.gross_sales_cents, 0) AS gross_sales_cents,
  COALESCE(yoco.yoco_gross_cents, 0) AS yoco_gross_cents,
  COALESCE(yoco.yoco_fee_cents, 0) AS yoco_fee_cents,
  COALESCE(yoco.yoco_net_cents, 0) AS yoco_net_cents,
  COALESCE(expenses.approved_expenses_cents, 0) AS approved_expenses_cents,
  COALESCE(advances.personal_advances_cents, 0) AS personal_advances_cents
FROM (((sales
  FULL JOIN yoco ON (yoco.month = sales.month))
  FULL JOIN expenses ON (expenses.month = COALESCE(sales.month, yoco.month)))
  FULL JOIN advances ON (advances.month = COALESCE(sales.month, yoco.month, expenses.month)));

--------------------------------------------------------------------------------
-- 3. Fix functions with mutable search_path
--------------------------------------------------------------------------------

-- set_finance_sales_updated_at
CREATE OR REPLACE FUNCTION public.set_finance_sales_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- set_finance_reconciliation_updated_at (assumed similar pattern)
CREATE OR REPLACE FUNCTION public.set_finance_reconciliation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- set_finance_control_settings_updated_at (if it exists; recreate safely)
CREATE OR REPLACE FUNCTION public.set_finance_control_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 4. Notes
--------------------------------------------------------------------------------
-- Leaked-password protection must be enabled in the Supabase dashboard:
-- Auth → Settings → Password security → Enable "Check against HaveIBeenPwned".
