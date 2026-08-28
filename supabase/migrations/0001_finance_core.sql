-- Phenomebeauty Finance: core schema
-- Phase 1: manual sale capture that separates service revenue from product revenue,
-- while keeping one record for what the client actually paid.

create extension if not exists "pgcrypto";

-- A sale is one moment of payment. It can hold a service, a call out fee,
-- a product, or any mix of these in one Yoco transaction.
create table if not exists finance_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default current_date,
  customer_reference text,
  source text not null default 'manual_product_sale'
    check (source in (
      'nextslot_service',
      'nextslot_callout',
      'shop_order',
      'in_service_product_sale',
      'manual_product_sale',
      'yoco_unmatched',
      'fnb_unmatched'
    )),
  reconciliation_status text not null default 'awaiting_review'
    check (reconciliation_status in (
      'matched', 'partly_matched', 'awaiting_review', 'excluded'
    )),
  payment_method text
    check (payment_method in ('yoco_card', 'eft', 'cash', 'yoco_online', 'other')),
  gross_amount_cents integer not null default 0,
  yoco_payment_id text,
  booking_id text,
  shop_order_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every sale is broken into lines, so a single payment can carry a service,
-- a call out fee, and a product without any of them hiding the others.
create table if not exists finance_sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references finance_sales(id) on delete cascade,
  line_type text not null
    check (line_type in ('service', 'call_out', 'product', 'delivery', 'discount', 'refund')),
  description text not null,
  quantity numeric not null default 1,
  unit_price_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  source_system text
    check (source_system in ('nextslot', 'shop_admin', 'manual')),
  source_record_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_sale_lines_sale_id on finance_sale_lines(sale_id);
create index if not exists idx_finance_sales_sale_date on finance_sales(sale_date);
create index if not exists idx_finance_sales_status on finance_sales(reconciliation_status);

-- Keeps updated_at honest without needing application code to remember it.
create or replace function set_finance_sales_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finance_sales_updated_at on finance_sales;
create trigger trg_finance_sales_updated_at
  before update on finance_sales
  for each row execute function set_finance_sales_updated_at();

-- A sale's gross amount should equal the sum of its lines. This view makes
-- the gap visible instead of silently trusting either number.
create or replace view finance_sale_totals as
select
  s.id as sale_id,
  s.gross_amount_cents,
  coalesce(sum(l.total_amount_cents), 0) as lines_total_cents,
  s.gross_amount_cents - coalesce(sum(l.total_amount_cents), 0) as difference_cents
from finance_sales s
left join finance_sale_lines l on l.sale_id = s.id
group by s.id, s.gross_amount_cents;

-- Revenue split by line type, the number this whole app exists to answer:
-- how much of what came in was service revenue, and how much was product.
create or replace view finance_revenue_by_type as
select
  l.line_type,
  date_trunc('month', s.sale_date) as month,
  sum(l.total_amount_cents) as total_cents,
  count(distinct s.id) as sale_count
from finance_sale_lines l
join finance_sales s on s.id = l.sale_id
where s.reconciliation_status <> 'excluded'
group by l.line_type, date_trunc('month', s.sale_date);

alter table finance_sales enable row level security;
alter table finance_sale_lines enable row level security;

-- Phase 1 is single-tenant and internal. Any authenticated user tied to
-- this project can read and write. Tighten this once staff accounts exist.
create policy "authenticated read sales" on finance_sales
  for select using (auth.role() = 'authenticated');
create policy "authenticated write sales" on finance_sales
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update sales" on finance_sales
  for update using (auth.role() = 'authenticated');

create policy "authenticated read lines" on finance_sale_lines
  for select using (auth.role() = 'authenticated');
create policy "authenticated write lines" on finance_sale_lines
  for insert with check (auth.role() = 'authenticated');
create policy "authenticated update lines" on finance_sale_lines
  for update using (auth.role() = 'authenticated');

