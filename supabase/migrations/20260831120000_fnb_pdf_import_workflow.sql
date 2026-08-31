-- FNB PDF import workflow
-- The finance_bank_imports, fnb_parsed_rows, and finance_bank_transactions
-- tables already exist in production because the base FNB schema was applied
-- directly in Supabase. This migration records the supporting indexes needed
-- by the application and is safe to apply to an existing database.

create index if not exists idx_fnb_parsed_rows_bank_import_id
  on public.fnb_parsed_rows (bank_import_id);

create index if not exists idx_fnb_parsed_rows_bank_import_row_index
  on public.fnb_parsed_rows (bank_import_id, row_index);

create index if not exists idx_finance_bank_transactions_bank_import_id
  on public.finance_bank_transactions (bank_import_id);

create index if not exists idx_finance_bank_transactions_review_status
  on public.finance_bank_transactions (review_status);

create index if not exists idx_finance_bank_transactions_transaction_date
  on public.finance_bank_transactions (transaction_date);

create unique index if not exists idx_finance_bank_transactions_fingerprint
  on public.finance_bank_transactions (transaction_fingerprint);

comment on table public.finance_bank_imports is
  'FNB statement import metadata and balance validation.';

comment on table public.fnb_parsed_rows is
  'Staging table for parsed FNB statement rows before import.';

comment on table public.finance_bank_transactions is
  'Final bank transactions imported from FNB statements.';
