-- PhenomeBeauty Finance: Phase 0B — Security Invoker fixes for views and functions
-- This migration:
-- 1. Recreates 6 views explicitly as SECURITY INVOKER (plain views).
-- 2. Recreates 3 trigger functions as SECURITY INVOKER with fixed search_path.
-- 3. Revokes public EXECUTE on those functions to close the security lints.

--------------------------------------------------------------------------------
-- 1. Recreate views as SECURITY INVOKER (plain views)
--------------------------------------------------------------------------------

-- finance_sale_totals
DROP VIEW IF EXISTS public.finance_sale_totals;
CREATE VIEW public.finance_sale_totals
WITH (security_invoker = on)
AS
SELECT
  s.id AS sale_id,
  s.gross_amount_cents,
  COALESCE(SUM(l.total_amount_cents), 0) AS lines_total_cents,
  s.gross_amount_cents - COALESCE(SUM(l.total_amount_cents), 0) AS difference_cents
FROM finance_sales s
LEFT JOIN finance_sale_lines l ON l.sale_id = s.id
GROUP BY s.id, s.gross_amount_cents;

-- finance_revenue_by_type
DROP VIEW IF EXISTS public.finance_revenue_by_type;
CREATE VIEW public.finance_revenue_by_type
WITH (security_invoker = on)
AS
SELECT
  l.line_type,
  date_trunc('month', s.sale_date) AS month,
  SUM(l.total_amount_cents) AS total_cents,
  COUNT(DISTINCT s.id) AS sale_count
FROM finance_sale_lines l
JOIN finance_sales s ON s.id = l.sale_id
WHERE s.reconciliation_status <> 'excluded'
GROUP BY l.line_type, date_trunc('month', s.sale_date);

-- finance_yoco_payout_reconciliation
DROP VIEW IF EXISTS public.finance_yoco_payout_reconciliation;
CREATE VIEW public.finance_yoco_payout_reconciliation
WITH (security_invoker = on)
AS
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

-- finance_monthly_cash_overview
DROP VIEW IF EXISTS public.finance_monthly_cash_overview;
CREATE VIEW public.finance_monthly_cash_overview
WITH (security_invoker = on)
AS
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

-- finance_month_end_summary
DROP VIEW IF EXISTS public.finance_month_end_summary;
CREATE VIEW public.finance_month_end_summary
WITH (security_invoker = on)
AS
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

-- finance_owner_balance
DROP VIEW IF EXISTS public.finance_owner_balance;
CREATE VIEW public.finance_owner_balance
WITH (security_invoker = on)
AS
SELECT
  o.owner_name,
  SUM(o.allocation_cents) AS total_allocated_cents,
  SUM(o.advances_deducted_cents) AS total_advances_deducted_cents,
  SUM(o.final_payable_cents) AS total_final_payable_cents,
  SUM(COALESCE(p.amount_cents, 0)) AS total_paid_cents,
  (SUM(o.final_payable_cents) - SUM(COALESCE(p.amount_cents, 0))) AS outstanding_cents
FROM finance_owner_allocations o
LEFT JOIN finance_owner_payments p ON p.owner_allocation_id = o.id
GROUP BY o.owner_name;

--------------------------------------------------------------------------------
-- 2. Recreate trigger functions as SECURITY INVOKER with fixed search_path
--------------------------------------------------------------------------------

-- set_finance_sales_updated_at
DROP FUNCTION IF EXISTS public.set_finance_sales_updated_at();
CREATE FUNCTION public.set_finance_sales_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- set_finance_reconciliation_updated_at
DROP FUNCTION IF EXISTS public.set_finance_reconciliation_updated_at();
CREATE FUNCTION public.set_finance_reconciliation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- set_finance_control_settings_updated_at
DROP FUNCTION IF EXISTS public.set_finance_control_settings_updated_at();
CREATE FUNCTION public.set_finance_control_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- 3. Revoke public EXECUTE on these functions
--------------------------------------------------------------------------------

-- Revoke from anon and authenticated
REVOKE EXECUTE ON FUNCTION public.set_finance_sales_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_finance_reconciliation_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_finance_control_settings_updated_at() FROM anon, authenticated;

-- Ensure only postgres and service_role can execute (adjust if you use a different role)
GRANT EXECUTE ON FUNCTION public.set_finance_sales_updated_at() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.set_finance_reconciliation_updated_at() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.set_finance_control_settings_updated_at() TO postgres, service_role;

--------------------------------------------------------------------------------
-- Notes
--------------------------------------------------------------------------------
-- Leaked-password protection must still be enabled in the Supabase dashboard:
-- Auth → Settings → Password security → Enable "Check against HaveIBeenPwned".
--
-- After applying this migration, re-run the Security advisor. The following
-- should be resolved:
-- - security_definer_view (all 6 views)
-- - anon_security_definer_function_executable (3 functions)
-- - authenticated_security_definer_function_executable (3 functions)
