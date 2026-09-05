import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, error: 'Missing configuration.' }, { status: 500, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { importId } = body as { importId: string }
    
    if (!importId) {
      return Response.json({ success: false, error: 'Missing importId.' }, { status: 400, headers: corsHeaders })
    }

    const db = createClient(supabaseUrl, serviceRoleKey)
    
    // Get import record
    const { data: importData, error: importError } = await db.from('finance_bank_imports').select('*').eq('id', importId).single()
    if (importError || !importData) {
      return Response.json({ success: false, error: 'Import not found.' }, { status: 404, headers: corsHeaders })
    }
    
    // Validate balance before import
    if (importData.balance_variance_cents && Math.abs(importData.balance_variance_cents) > 0) {
      return Response.json({ success: false, error: 'Cannot import: statement balance variance detected. Please review and correct before importing.' }, { status: 400, headers: corsHeaders })
    }
    
    // Get parsed rows
    const { data: rows, error: rowsError } = await db.from('fnb_parsed_rows').select('*').eq('bank_import_id', importId).order('row_index')
    if (rowsError) {
      return Response.json({ success: false, error: 'Failed to fetch parsed rows.' }, { status: 500, headers: corsHeaders })
    }
    
    if (!rows || rows.length === 0) {
      return Response.json({ success: false, error: 'No parsed rows found for this import.' }, { status: 400, headers: corsHeaders })
    }
    
    // Create finance_bank_transactions
    let imported = 0
    let skipped = 0
    
    for (const row of rows) {
      if (!row.include_in_import) {
        skipped++
        continue
      }
      
      // Generate unique fingerprint for idempotency
      const fingerprint = `${importId}-${row.row_index}-${row.transaction_date}-${row.amount_cents}-${row.direction}`
      
      // Convert direction to signed amount
      const signedAmountCents = row.direction === 'debit' ? -row.amount_cents : row.amount_cents
      
      const { error: txError } = await db.from('finance_bank_transactions').insert({
        bank_import_id: importId,
        transaction_date: row.transaction_date,
        description: row.description,
        raw_reference: row.raw_reference,
        signed_amount_cents: signedAmountCents,
        running_balance_cents: row.running_balance_cents,
        direction: row.direction,
        transaction_fingerprint: fingerprint,
        category: row.suggested_category,
        business_status: 'unreviewed',
        review_status: 'awaiting_review',
      })
      
      if (txError) {
        skipped++
      } else {
        imported++
      }
    }
    
    // Update import record - set to 'parsed' NOT 'imported' (not in constraint)
    const { error: updateError } = await db.from('finance_bank_imports').update({
      imported_count: imported,
      skipped_count: skipped,
      parse_status: 'parsed',
    }).eq('id', importId)
    
    if (updateError) {
      return Response.json({ success: false, error: 'Failed to update import record.' }, { status: 500, headers: corsHeaders })
    }

    // Kick off Yoco-payout and PayShap suggested-match generation for the
    // rows we just imported. This is best-effort: a matching failure should
    // not block the finalize call from succeeding, since the bank rows are
    // already safely imported and matches can be regenerated later.
    let matchSummary: Record<string, unknown> | null = null
    try {
      const matchResponse = await fetch(`${supabaseUrl}/functions/v1/match-bank-transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ bankImportId: importId }),
      })
      matchSummary = await matchResponse.json().catch(() => null)
    } catch (matchErr) {
      matchSummary = { success: false, error: matchErr instanceof Error ? matchErr.message : 'Matching call failed.' }
    }

    return Response.json({ success: true, imported, skipped, matching: matchSummary }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Finalization failed.'
    return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders })
  }
})
