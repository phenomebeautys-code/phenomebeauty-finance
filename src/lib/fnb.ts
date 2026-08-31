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
