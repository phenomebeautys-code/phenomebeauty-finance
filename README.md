# PhenomeBeauty Finance

Phase 1 of the finance app: a place to record what a client paid and see how
much of it was service revenue against how much was product revenue, even
when both happened in the same appointment and the same Yoco payment.

This follows the model agreed on before any automation:

- NextSlot stays the source of truth for services, call outs and bookings.
- Shop Admin stays the source of truth for products and retail stock.
- This finance app is where a sale is captured once, split into lines, and
  marked as matched to a Yoco payment or left for review.
- Nothing here writes back to NextSlot or Shop Admin. It reads and records
  summaries only.

Run this manually for a few weeks before wiring up the Yoco and NextSlot
syncs mentioned in the wider finance plan.

## What is here

- `src/pages/Dashboard.tsx` — this month's service, call out and product
  revenue, plus a split bar showing the proportion of each.
- `src/pages/NewSale.tsx` — the capture form. One sale, several lines, with a
  check against the total the client actually paid.
- `src/pages/SalesLedgerPage.tsx` — every sale recorded, filterable by
  reconciliation status.
- `supabase/migrations/0001_finance_core.sql` — the two tables this runs on,
  `finance_sales` and `finance_sale_lines`, plus the views the dashboard
  reads from.

The app runs on sample data out of the box, so it never shows a blank
screen while Supabase is being set up.

## Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create a Supabase project for finance data, separate from the NextSlot
   and Shop Admin projects, as agreed in the architecture notes.

3. Run the migration in `supabase/migrations/0001_finance_core.sql` against
   that project, either through the SQL editor or the Supabase CLI.

4. Copy `.env.example` to `.env` and fill in the project URL and anon key.

   ```bash
   cp .env.example .env
   ```

5. Start the app.

   ```bash
   npm run dev
   ```

## Pushing to GitHub

This was built locally and has not been pushed to
`phenomebeautys-code/phenomebeauty-finance`, since this session has no
write access to that repository. To get it there:

```bash
git init
git remote add origin https://github.com/phenomebeautys-code/phenomebeauty-finance.git
git add .
git commit -m "Phase 1: sale capture and revenue split dashboard"
git branch -M main
git push -u origin main
```

If the repository already has a placeholder commit, pull first or push with
`--force` only once you are sure the placeholder is disposable.

## Next steps, in order

1. Run this manually for two to four weeks. Check how often a Yoco payment
   comes in without a matching booking or product sale.
2. Add the `finance-export-nextslot` and `finance-export-shop` edge
   functions described in the architecture plan, so completed bookings and
   shop orders can be pulled in rather than typed in by hand.
3. Add the Yoco API import for payments and payouts, and match them against
   sales here rather than trusting the gross amount typed on capture.
4. Only after that, add FNB statement import and the 60/40 month end
   allocation view.
