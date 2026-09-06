import { supabase } from './supabase'
import type { FNBParseResult } from './types-fnb'

const FNB_STATEMENTS_BUCKET = 'fnb-statements'

function normaliseFileName(fileName: string) {
  return fileName.replace(/[^\w.-]+/g, '-')
}

function toNullableNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function uploadFNBPDF(file: File) {
  if (!file) {
    throw new Error('No PDF file was provided.')
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Only PDF files can be uploaded for FNB statements.')
  }

  const timestamp = Date.now()
  const storagePath = `statements/${timestamp}-${normaliseFileName(file.name)}`

  const { error: storageError } = await supabase.storage
    .from(FNB_STATEMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: 'application/pdf',
      upsert: false,
    })

  if (storageError) {
    throw new Error(`FNB statement upload failed: ${storageError.message}`)
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw new Error(`Could not identify the signed-in user: ${userError.message}`)
  }

  if (!user) {
    throw new Error('You must be signed in before importing an FNB statement.')
  }

  const { data: importRecord, error: importError } = await supabase
    .from('finance_bank_imports')
    .insert({
      bank_name: 'FNB',
      source_filename: file.name,
      storage_path: storagePath,
      imported_by: user.id,
      parse_status: 'pending',
    })
    .select('id')
    .single()

  if (importError) {
    throw new Error(`Could not create the FNB import record: ${importError.message}`)
  }

  if (!importRecord?.id) {
    throw new Error('The FNB import record was created without an ID.')
  }

  return {
    importId: importRecord.id,
    storagePath,
  }
}

export async function saveParsedRows(importId: string, result: FNBParseResult) {
  if (!importId) {
    throw new Error('Cannot save parsed rows without an FNB import ID.')
  }

  if (!result.success) {
    throw new Error(result.error || 'Cannot save rows because the statement parser failed.')
  }

  if (!Array.isArray(result.transactions) || result.transactions.length === 0) {
    throw new Error('The parser returned no transaction rows. Nothing was saved for this statement.')
  }

  const parsedRows = result.transactions.map((transaction, rowIndex) => ({
    bank_import_id: importId,
    row_index: rowIndex,
    transaction_date: transaction.date,
    description: transaction.description,
    raw_reference: transaction.rawReference || null,
    amount_cents: transaction.amountCents,
    running_balance_cents: toNullableNumber(transaction.runningBalanceCents),
    direction: transaction.direction,
    suggested_category: transaction.suggestedCategory || null,
    confidence_score: toNullableNumber(transaction.confidenceScore),
    parse_warning: transaction.parseWarning || null,
    raw_extracted_text: transaction.rawExtractedText ?? {},
    user_corrected: false,
    include_in_import: true,
  }))

  if (parsedRows.length === 0) {
    throw new Error('The parser returned transactions, but no valid database rows could be built.')
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from('fnb_parsed_rows')
    .insert(parsedRows)
    .select('id')

  if (insertError) {
    throw new Error(`Could not save parsed FNB statement rows: ${insertError.message}`)
  }

  if (!insertedRows || insertedRows.length !== parsedRows.length) {
    throw new Error(
      `Only ${insertedRows?.length ?? 0} of ${parsedRows.length} parsed FNB statement rows were saved. The import was not finalized.`
    )
  }

  const statement = result.statement
  const balanceCheck = result.balanceCheck

  const { error: updateError } = await supabase
    .from('finance_bank_imports')
    .update({
      statement_number: statement?.statementNumber || null,
      account_number: statement?.accountNumber || null,
      branch_number: statement?.branchNumber || null,
      statement_start_date: statement?.periodStart || null,
      statement_end_date: statement?.periodEnd || null,
      opening_balance_cents: toNullableNumber(statement?.openingBalanceCents),
      closing_balance_cents: toNullableNumber(statement?.closingBalanceCents),
      total_credits_cents: toNullableNumber(statement?.totalCreditsCents),
      total_debits_cents: toNullableNumber(statement?.totalDebitsCents),
      credit_transaction_count: statement?.creditTransactionCount ?? null,
      debit_transaction_count: statement?.debitTransactionCount ?? null,
      calculated_closing_balance_cents: toNullableNumber(balanceCheck?.calculatedClosingCents),
      balance_variance_cents: toNullableNumber(balanceCheck?.varianceCents),
      parse_status: balanceCheck?.balanced ? 'parsed' : 'needs_review',
      parse_error: null,
    })
    .eq('id', importId)

  if (updateError) {
    throw new Error(`Parsed rows were saved, but the FNB import summary could not be updated: ${updateError.message}`)
  }

  return {
    savedRows: insertedRows.length,
  }
}

export interface FNBImportSummary {
  id: string
  sourceFilename: string | null
  storagePath: string | null
  statementStartDate: string | null
  statementEndDate: string | null
  parseStatus: string | null
  importedCount: number | null
  skippedCount: number | null
  balanceVarianceCents: number | null
  createdAt: string
  transactionCount: number
}

export async function listFNBImports(): Promise<FNBImportSummary[]> {
  const { data: imports, error } = await supabase
    .from('finance_bank_imports')
    .select(
      'id, source_filename, storage_path, statement_start_date, statement_end_date, parse_status, imported_count, skipped_count, balance_variance_cents, created_at'
    )
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Could not load FNB statement imports: ${error.message}`)
  }

  const { data: txCounts, error: txError } = await supabase
    .from('finance_bank_transactions')
    .select('bank_import_id')

  if (txError) {
    throw new Error(`Could not load bank transaction counts: ${txError.message}`)
  }

  const countByImport = new Map<string, number>()
  for (const row of txCounts ?? []) {
    const id = row.bank_import_id as string
    countByImport.set(id, (countByImport.get(id) ?? 0) + 1)
  }

  return (imports ?? []).map((row) => ({
    id: row.id as string,
    sourceFilename: row.source_filename as string | null,
    storagePath: row.storage_path as string | null,
    statementStartDate: row.statement_start_date as string | null,
    statementEndDate: row.statement_end_date as string | null,
    parseStatus: row.parse_status as string | null,
    importedCount: row.imported_count as number | null,
    skippedCount: row.skipped_count as number | null,
    balanceVarianceCents: row.balance_variance_cents as number | null,
    createdAt: row.created_at as string,
    transactionCount: countByImport.get(row.id as string) ?? 0,
  }))
}

export async function deleteFNBImport(importId: string, storagePath: string | null) {
  if (!importId) {
    throw new Error('Cannot delete an FNB import without an import ID.')
  }

  // DB rows (fnb_parsed_rows, finance_bank_transactions, and any
  // finance_reconciliation_matches pointing at them) cascade automatically.
  const { error } = await supabase.from('finance_bank_imports').delete().eq('id', importId)
  if (error) {
    throw new Error(`Could not delete the FNB import: ${error.message}`)
  }

  if (storagePath) {
    // Best-effort: the DB row is already gone even if this fails, so don't
    // throw and leave the user stuck with an import they can't remove just
    // because the underlying PDF couldn't be cleaned up from storage.
    await supabase.storage.from(FNB_STATEMENTS_BUCKET).remove([storagePath]).catch(() => null)
  }
}

export async function confirmFNBImport(importId: string, result: FNBParseResult) {
  if (!importId) {
    throw new Error('Cannot confirm an FNB import without an import ID.')
  }

  if (!result.success) {
    throw new Error(result.error || 'Cannot confirm an FNB import because parsing failed.')
  }

  if (!result.balanceCheck.balanced) {
    throw new Error('Cannot confirm this FNB import because the statement balance has a non-zero variance.')
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw new Error(`Could not identify the signed-in user: ${userError.message}`)
  }

  if (!user) {
    throw new Error('You must be signed in before confirming an FNB import.')
  }

  const { error: confirmationError } = await supabase
    .from('finance_bank_imports')
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
      parse_status: 'parsed',
    })
    .eq('id', importId)

  if (confirmationError) {
    throw new Error(`Could not confirm the FNB import: ${confirmationError.message}`)
  }
}

export async function finalizeFNBImport(importId: string) {
  if (!importId) {
    throw new Error('Cannot finalize an FNB import without an import ID.')
  }

  const { data, error } = await supabase.functions.invoke('finalize-fnb-import', {
    body: {
      importId,
    },
  })

  if (error) {
    throw new Error(`FNB import finalization failed: ${error.message}`)
  }

  if (!data?.success) {
    throw new Error(data?.error || 'FNB import finalization failed.')
  }

  return {
    imported: Number(data.imported ?? 0),
    skipped: Number(data.skipped ?? 0),
  }
}
