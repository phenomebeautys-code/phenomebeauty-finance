import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// Monday of the ISO week containing `dateStr` (YYYY-MM-DD), also as YYYY-MM-DD.
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const day = d.getUTCDay() // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diffToMonday)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ success: false, error: 'Missing Supabase configuration.' }, { status: 500, headers: corsHeaders })
  }

  const db = createClient(supabaseUrl, serviceRoleKey)

  try {
    const body = await req.json().catch(() => ({}))
    const { bankImportId } = body as { bankImportId?: string }

    const { data: vehicle, error: vehicleErr } = await db
      .from('finance_vehicles')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (vehicleErr) throw new Error(`Could not load active vehicle: ${vehicleErr.message}`)
    if (!vehicle) {
      return Response.json({ success: true, imported: 0, note: 'No active vehicle configured; nothing to sync.' }, { headers: corsHeaders })
    }

    // Only debits categorised as vehicle finance AND whose description
    // clearly names the car (e.g. "FNB App Rtc Pmt To Car"). This is
    // intentionally narrower than the full 'Vehicle finance' category used
    // in the ledger (which also catches ambiguous ABSA/DebiCheck collection
    // attempts that may not be the car instalment at all) -- we'd rather
    // under-count real payments and let a human add the rest than
    // mis-attribute an unrelated debit order as a car payment.
    let txQuery = db
      .from('finance_bank_transactions')
      .select('id, transaction_date, description, signed_amount_cents, category, bank_import_id')
      // Exact string the client-side FNB parser (src/lib/fnbParser.ts)
      // assigns -- keep in sync if that categorisation changes.
      .eq('category', 'Vehicle finance')
      .lt('signed_amount_cents', 0)
      .ilike('description', '%car%')
    if (bankImportId) txQuery = txQuery.eq('bank_import_id', bankImportId)

    const { data: candidates, error: candidatesErr } = await txQuery
    if (candidatesErr) throw new Error(`Could not load candidate transactions: ${candidatesErr.message}`)

    const { data: existing, error: existingErr } = await db
      .from('finance_vehicle_contributions')
      .select('source_bank_transaction_id')
      .not('source_bank_transaction_id', 'is', null)
    if (existingErr) throw new Error(`Could not load existing contributions: ${existingErr.message}`)
    const alreadyLinked = new Set((existing ?? []).map((c) => c.source_bank_transaction_id as string))

    const toInsert = (candidates ?? [])
      .filter((c) => !alreadyLinked.has(c.id as string))
      .map((c) => ({
        vehicle_id: vehicle.id,
        week_start: mondayOf(c.transaction_date as string),
        amount_cents: Math.abs(c.signed_amount_cents as number),
        notes: `Auto-matched from FNB debit on ${c.transaction_date} (${c.description}).`,
        source_bank_transaction_id: c.id,
      }))

    let imported = 0
    if (toInsert.length > 0) {
      const { error: insertErr } = await db.from('finance_vehicle_contributions').insert(toInsert)
      if (insertErr) throw new Error(`Could not insert vehicle contributions: ${insertErr.message}`)
      imported = toInsert.length
    }

    return Response.json(
      { success: true, imported, candidates: (candidates ?? []).length },
      { headers: corsHeaders }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Vehicle contribution sync failed.'
    return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders })
  }
})
