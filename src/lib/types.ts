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
