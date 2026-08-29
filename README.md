# Phenome Beauty Finance

A private finance-control application for Phenome Beauty. It consolidates normalized sales, Yoco payments and payouts, reconciliation, cash protection, expenses, and vehicle-settlement tracking.

## Production Supabase project

Production is Supabase project `pzrhvbxjgjucqxnrofgj`:

```env
VITE_SUPABASE_URL=https://pzrhvbxjgjucqxnrofgj.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-public-browser-key>
```

Configure both values in Vercel for Production, Preview, and Development as appropriate. Use the project’s browser publishable key. Never expose a `service_role` key through a `VITE_*` variable.

## Authentication and financial-data access

All browser access to the finance product requires a signed-in Supabase Auth user. The client persists and automatically refreshes the user session, so requests made by `useSales`, `useFinanceData`, and `useVehicleData` include the current access token. The database uses authenticated-only Row Level Security policies for finance data.

Create/manage users in **Supabase Dashboard → Authentication → Users** for project `pzrhvbxjgjucqxnrofgj`.

## Database model

The production database uses the `public` schema. Its primary tables include:

- `finance_sales` and `finance_sale_lines` for the finance ledger
- `yoco_payments`, `yoco_payouts`, and `yoco_sync_runs` for Yoco records
- `finance_reconciliation_matches` and FNB-import tables for reconciliation
- `finance_pockets`, `finance_pocket_snapshots`, and `finance_pocket_movements` for protected cash
- `finance_vehicles`, `finance_vehicle_odometer_entries`, `finance_vehicle_trips`, and `finance_vehicle_contributions` for mobility tracking

Source-mirror tables are ingestion internals. They should not be read directly by browser code unless their RLS model is deliberately changed.

## Migration note

The production database migrations were applied directly in the Supabase project. Files under `supabase/migrations-archive/incorrect-nonproduction-schema/` are archived investigation artifacts; they target a non-production `finance.*` schema and must not be replayed.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Set the two Vite variables before running the app.
