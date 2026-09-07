import { supabase } from './supabase'
import type { PaymentMethod } from './types'

/**
 * Marks a sale as reviewed: records which channel actually collected the
 * payment (Yoco or PayShap -- the two real options for how a client can pay
 * PhenomeBeauty) and flips reconciliation_status to 'matched', clearing it
 * from the "needs review" list.
 */
export async function verifySale(saleId: string, paymentMethod: Extract<PaymentMethod, 'yoco_card' | 'payshap'>) {
  const { error } = await supabase
    .from('finance_sales')
    .update({ payment_method: paymentMethod, reconciliation_status: 'matched' })
    .eq('id', saleId)

  if (error) {
    throw new Error(`Could not verify this sale: ${error.message}`)
  }
}
