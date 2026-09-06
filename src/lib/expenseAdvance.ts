import { supabase } from './supabase'

export interface UnclassifiedTransaction {
  id: string
  transaction_date: string
  description: string
  category: string | null
  signed_amount_cents: number
}

/**
 * FNB debits that haven't been given a final disposition yet -- every one
 * of these needs to end up tagged as a business expense, a personal
 * advance, or explicitly dismissed (already accounted for, e.g. a normal
 * transfer or a Yoco-payout/PayShap line handled elsewhere).
 */
export async function listUnclassifiedTransactions(): Promise<UnclassifiedTransaction[]> {
  const { data, error } = await supabase
    .from('finance_bank_transactions')
    .select('id, transaction_date, description, category, signed_amount_cents')
    .eq('business_status', 'unreviewed')
    .lt('signed_amount_cents', 0) // only debits -- money leaving the account
    .order('transaction_date', { ascending: false })

  if (error) {
    throw new Error(`Could not load transactions needing classification: ${error.message}`)
  }

  return (data ?? []) as UnclassifiedTransaction[]
}

async function markTransactionStatus(
  bankTransactionId: string,
  businessStatus: 'business' | 'personal_advance' | 'mixed' | 'transfer' | 'excluded',
  reviewStatus: 'reviewed' | 'excluded' = 'reviewed'
) {
  const { error } = await supabase
    .from('finance_bank_transactions')
    .update({ business_status: businessStatus, review_status: reviewStatus })
    .eq('id', bankTransactionId)

  if (error) {
    throw new Error(`Could not update the bank transaction's status: ${error.message}`)
  }
}

export interface ExpenseInput {
  expenseDate: string
  description: string
  category: string
  paidFrom: 'fnb' | 'yoco_savings' | 'cash' | 'personal' | 'other'
  grossAmountCents: number
  businessUsePercent: number
  bankTransactionId?: string | null
  approvalStatus?: 'awaiting_review' | 'approved' | 'rejected'
}

export async function createExpense(input: ExpenseInput) {
  if (input.grossAmountCents <= 0) {
    throw new Error('Expense amount must be greater than zero.')
  }
  if (input.businessUsePercent < 0 || input.businessUsePercent > 100) {
    throw new Error('Business use percent must be between 0 and 100.')
  }

  // business_amount_cents is a generated column (gross * percent / 100) --
  // must not be included in the insert payload.
  const { error } = await supabase.from('finance_expenses').insert({
    expense_date: input.expenseDate,
    description: input.description,
    category: input.category,
    paid_from: input.paidFrom,
    gross_amount_cents: input.grossAmountCents,
    business_use_percent: input.businessUsePercent,
    approval_status: input.approvalStatus ?? 'approved',
    bank_transaction_id: input.bankTransactionId ?? null,
  })

  if (error) {
    throw new Error(`Could not save the expense: ${error.message}`)
  }

  if (input.bankTransactionId) {
    await markTransactionStatus(
      input.bankTransactionId,
      input.businessUsePercent === 100 ? 'business' : 'mixed'
    )
  }
}

export interface AdvanceInput {
  advanceDate: string
  personName: 'Shu-meez' | 'Arshad'
  amountCents: number
  paidFrom: 'fnb' | 'yoco_savings' | 'cash' | 'other'
  bankTransactionId?: string | null
}

export async function createAdvance(input: AdvanceInput) {
  if (input.amountCents <= 0) {
    throw new Error('Advance amount must be greater than zero.')
  }

  const { error } = await supabase.from('finance_personal_advances').insert({
    advance_date: input.advanceDate,
    person_name: input.personName,
    amount_cents: input.amountCents,
    paid_from: input.paidFrom,
    status: 'outstanding',
    bank_transaction_id: input.bankTransactionId ?? null,
  })

  if (error) {
    throw new Error(`Could not save the personal advance: ${error.message}`)
  }

  if (input.bankTransactionId) {
    await markTransactionStatus(input.bankTransactionId, 'personal_advance')
  }
}

/** Dismisses a transaction as already accounted for elsewhere (a routine transfer, etc.) -- no expense/advance record is created. */
export async function dismissTransaction(bankTransactionId: string, asTransfer: boolean) {
  await markTransactionStatus(bankTransactionId, asTransfer ? 'transfer' : 'excluded', 'excluded')
}

export async function settleAdvance(advanceId: string) {
  const { error } = await supabase
    .from('finance_personal_advances')
    .update({ status: 'settled', settled_at: new Date().toISOString().slice(0, 10) })
    .eq('id', advanceId)

  if (error) {
    throw new Error(`Could not settle the advance: ${error.message}`)
  }
}
