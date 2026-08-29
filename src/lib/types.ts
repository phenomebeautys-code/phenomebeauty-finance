export type SaleSource =
  | 'nextslot_service'
  | 'nextslot_callout'
  | 'shop_order'
  | 'in_service_product_sale'
  | 'manual_product_sale'
  | 'yoco_unmatched'
  | 'fnb_unmatched'

export type ReconciliationStatus =
  | 'matched'
  | 'partly_matched'
  | 'awaiting_review'
  | 'excluded'

export type PaymentMethod = 'yoco_card' | 'eft' | 'cash' | 'yoco_online' | 'other'

export type LineType = 'service' | 'call_out' | 'product' | 'delivery' | 'discount' | 'refund'

export type SourceSystem = 'nextslot' | 'shop_admin' | 'manual'

export interface FinanceSale {
  id: string
  sale_date: string
  customer_reference: string | null
  source: SaleSource
  reconciliation_status: ReconciliationStatus
  payment_method: PaymentMethod | null
  gross_amount_cents: number
  yoco_payment_id: string | null
  booking_id: string | null
  shop_order_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceSaleLine {
  id: string
  sale_id: string
  line_type: LineType
  description: string
  quantity: number
  unit_price_cents: number
  total_amount_cents: number
  source_system: SourceSystem | null
  source_record_id: string | null
  created_at: string
}

export interface FinanceSaleWithLines extends FinanceSale {
  finance_sale_lines: FinanceSaleLine[]
}

export interface RevenueByType {
  line_type: LineType
  month: string
  total_cents: number
  sale_count: number
}

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  service: 'Service',
  call_out: 'Call out fee',
  product: 'Product',
  delivery: 'Delivery',
  discount: 'Discount',
  refund: 'Refund',
}

export const SOURCE_LABELS: Record<SaleSource, string> = {
  nextslot_service: 'NextSlot service',
  nextslot_callout: 'NextSlot call out',
  shop_order: 'Shop order',
  in_service_product_sale: 'In service product sale',
  manual_product_sale: 'Manual product sale',
  yoco_unmatched: 'Yoco unmatched',
  fnb_unmatched: 'FNB unmatched',
}

// --- Yoco ---

export type YocoPaymentStatus = string

export interface YocoPayment {
  id: string
  yoco_payment_id: string
  payment_reference: string | null
  status: YocoPaymentStatus
  currency: string
  gross_amount_cents: number
  fee_amount_cents: number | null
  net_amount_cents: number | null
  checkout_id: string | null
  yoco_created_at: string | null
  yoco_updated_at: string | null
}

export interface YocoPayout {
  id: string
  yoco_payout_id: string
  status: string
  gross_amount_cents: number | null
  fee_amount_cents: number | null
  net_amount_cents: number
  payout_date: string | null
  expected_bank_date: string | null
}

export type SyncScope = 'payments' | 'refunds' | 'payouts' | 'webhooks' | 'full'
export type SyncStatus = 'running' | 'completed' | 'completed_with_errors' | 'failed'

export interface YocoSyncRun {
  id: string
  sync_scope: SyncScope
  sync_mode: string
  status: SyncStatus
  started_at: string
  completed_at: string | null
  records_read: number
  records_inserted: number
  records_updated: number
  records_failed: number
  error_summary: string | null
}

// --- Reconciliation ---

export type MatchType =
  | 'source_to_yoco_payment'
  | 'yoco_payout_to_bank_transaction'
  | 'sale_to_bank_transaction'
  | 'manual'
export type MatchStatus = 'suggested' | 'confirmed' | 'rejected' | 'broken'

export interface ReconciliationMatch {
  id: string
  match_type: MatchType
  status: MatchStatus
  confidence_score: number | null
  matched_amount_cents: number | null
  matched_at: string | null
  created_at: string
  notes: string | null
}

// --- Bank ---

export interface FinanceBankImport {
  id: string
  bank_name: string
  source_filename: string
  statement_start_date: string | null
  statement_end_date: string | null
  opening_balance_cents: number | null
  closing_balance_cents: number | null
  parse_status: 'pending' | 'parsed' | 'needs_review' | 'failed'
  imported_at: string
}

export interface FinanceBankTransaction {
  id: string
  transaction_date: string
  description: string
  signed_amount_cents: number
  running_balance_cents: number | null
  direction: 'credit' | 'debit'
  category: string | null
  business_status: 'business' | 'personal_advance' | 'mixed' | 'transfer' | 'excluded' | 'unreviewed'
  review_status: 'awaiting_review' | 'reviewed' | 'matched' | 'excluded'
}

// --- Expenses & advances ---

export interface FinanceExpense {
  id: string
  expense_date: string
  description: string
  category: string
  paid_from: 'fnb' | 'yoco_savings' | 'cash' | 'personal' | 'other'
  gross_amount_cents: number
  business_use_percent: number
  business_amount_cents: number
  approval_status: 'awaiting_review' | 'approved' | 'rejected'
  receipt_url: string | null
}

export interface FinancePersonalAdvance {
  id: string
  advance_date: string
  person_name: 'Shu-meez' | 'Arshad'
  amount_cents: number
  paid_from: 'fnb' | 'yoco_savings' | 'cash' | 'other'
  status: 'outstanding' | 'settled' | 'carried_forward' | 'written_off'
  settled_at: string | null
}

// --- Protected cash / pockets ---

export interface FinancePocket {
  id: string
  name: string
  purpose: string
  is_active: boolean
  target_amount_cents: number | null
}

export interface FinancePocketSnapshot {
  id: string
  snapshot_at: string
  total_savings_cents: number
  savings_rate_percent: number | null
  notes: string | null
}

// --- Vehicle & Mobility ---

export type VehiclePhase = 'settlement' | 'settled'

export interface PostSettlementAllocation {
  label: string
  mode?: 'first_funded'
  percent?: number
}

export interface FinanceVehicle {
  id: string
  name: string
  phase: VehiclePhase
  remaining_finance_cents: number | null
  settlement_deadline: string | null
  fuel_buffer_cents: number
  fuel_price_cents_per_litre: number | null
  consumption_l_per_100km: number | null
  post_settlement_allocations: Record<string, PostSettlementAllocation>
  is_active: boolean
}

export interface VehicleOdometerEntry {
  id: string
  vehicle_id: string
  week_start: string
  week_end: string
  opening_odometer_km: number
  closing_odometer_km: number
  fuel_spent_cents: number
  notes: string | null
  submitted_at: string
}

export type TripCategory = 'stock_collection' | 'supplier_trip' | 'delivery' | 'vehicle_service' | 'other'

export interface VehicleTrip {
  id: string
  vehicle_id: string
  odometer_entry_id: string | null
  trip_date: string
  category: TripCategory
  distance_km: number
  notes: string | null
  approved: boolean
}

export interface VehicleContribution {
  id: string
  vehicle_id: string
  week_start: string
  amount_cents: number
  notes: string | null
}

export const TRIP_CATEGORY_LABELS: Record<TripCategory, string> = {
  stock_collection: 'Stock collection',
  supplier_trip: 'Supplier trip',
  delivery: 'Delivery',
  vehicle_service: 'Vehicle service',
  other: 'Other approved business',
}

export type FinanceCashSnapshot = {
  id: string
  snapshot_at: string
  fnb_operating_balance_cents: number
  yoco_savings_balance_cents: number
  expected_yoco_payout_cents: number
  notes: string | null
  captured_by: string | null
  created_at: string
}
