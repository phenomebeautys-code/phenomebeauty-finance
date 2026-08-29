# Archived incorrect migrations

These SQL files were created during a failed investigation that targeted a separate `finance.*` schema and an unrelated Supabase project. They do **not** describe the production finance database.

Production is project `pzrhvbxjgjucqxnrofgj` and uses the `public` schema, including tables such as `finance_sales`, `yoco_payments`, `yoco_payouts`, `finance_reconciliation_matches`, and `finance_vehicles`.

Do not move these files back into `supabase/migrations/` and do not apply them to production. They are retained here only for audit/history.
