import { supabase } from './supabase'
import type { ParsedTransaction, FNBParseResult } from './types-fnb'

export async function uploadFNBPDF(file: File): Promise<{ importId: string; storagePath: string }> {
  const storagePath = `statements/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage.from('fnb-statements').upload(storagePath, file)
  if (uploadError) throw uploadError
  
  const { data: importData, error: importError } = await supabase.from('finance_bank_imports').insert({
    bank_name: 'FNB',
    source_filename: file.name,
    storage_path: storagePath,
    parse_status: 'pending',
  }).select('id').single()
  
  if (importError) throw importError
  return { importId: importData.id, storagePath }
}

export async function saveParsedRows(importId: string, parseResult: FNBParseResult): Promise<void> {
  const rows = parseResult.transactions.map((t, idx) => ({
    bank_import_id: importId,
    row_index: idx,
    transaction_date: t.date,
    description: t.description,
    amount_cents: t.amountCents,
    direction: t.direction,
    suggested_category: t.suggestedCategory,
    confidence_score: t.confidenceScore,
    raw_extracted_text: t.rawExtractedText,
    include_in_import: t.includeInImport,
  }))
  const { error } = await supabase.from('fnb_parsed_rows').insert(rows)
  if (error) throw error
}

export async function updateParsedRow(rowId: string, updates: Partial<ParsedTransaction>): Promise<void> {
  const { error } = await supabase.from('fnb_parsed_rows').update({
    transaction_date: updates.date,
    description: updates.description,
    amount_cents: updates.amountCents,
    suggested_category: updates.suggestedCategory,
    user_corrected: true,
  }).eq('id', rowId)
  if (error) throw error
}

export async function confirmFNBImport(importId: string, parseResult: FNBParseResult): Promise<void> {
  const { data: user } = await supabase.auth.getUser()
  const { error } = await supabase.from('finance_bank_imports').update({
    parse_status: 'needs_review',
    statement_number: parseResult.statement?.statementNumber,
    account_number: parseResult.statement?.accountNumber,
    opening_balance_cents: parseResult.statement?.openingBalanceCents,
    closing_balance_cents: parseResult.statement?.closingBalanceCents,
    total_credits_cents: parseResult.statement?.totalCreditsCents,
    total_debits_cents: parseResult.statement?.totalDebitsCents,
    credit_transaction_count: parseResult.statement?.creditTransactionCount,
    debit_transaction_count: parseResult.statement?.debitTransactionCount,
    calculated_closing_balance_cents: parseResult.balanceCheck.calculatedClosingCents,
    balance_variance_cents: parseResult.balanceCheck.varianceCents,
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.user?.id,
  }).eq('id', importId)
  if (error) throw error
}

export async function finalizeFNBImport(importId: string): Promise<{ imported: number; skipped: number }> {
  const { data, error } = await supabase.functions.invoke('finalize-fnb-import', {
    body: { importId },
  })
  if (error) throw error
  if (!data.success) throw new Error(data.error || 'Finalization failed')
  return { imported: data.imported || 0, skipped: data.skipped || 0 }
}

export async function getParsedRows(importId: string): Promise<ParsedTransaction[]> {
  const { data, error } = await supabase.from('fnb_parsed_rows').select('*').eq('bank_import_id', importId).order('row_index')
  if (error) throw error
  return data.map((row: any) => ({
    id: row.id,
    rowIndex: row.row_index,
    date: row.transaction_date,
    description: row.description,
    rawReference: row.raw_reference,
    amountCents: row.amount_cents,
    runningBalanceCents: row.running_balance_cents,
    direction: row.direction,
    suggestedCategory: row.suggested_category,
    confidenceScore: row.confidence_score,
    parseWarning: row.parse_warning,
    rawExtractedText: row.raw_extracted_text,
    userCorrected: row.user_corrected,
    includeInImport: row.include_in_import,
  }))
}
