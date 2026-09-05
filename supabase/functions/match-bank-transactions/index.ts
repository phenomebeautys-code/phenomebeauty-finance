import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

// How many days either side of the bank transaction date we'll look for a
// matching source record. FNB settlement dates lag Yoco/NextSlot activity by
// a day or two, and PayShap can be same-day, so a small symmetric window
// keeps false positives low without missing legitimate matches.
const DATE_WINDOW_DAYS = 3
const AMOUNT_TOLERANCE_CENTS = 1

type Json = Record<string, unknown>

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
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

    const summary = {
      yoco_payout_candidates: 0,
      yoco_payout_matched: 0,
      payshap_candidates: 0,
      payshap_matched: 0,
    }

    let txQuery = db
      .from('finance_bank_transactions')
      .select('id, transaction_date, description, signed_amount_cents, category, bank_import_id')
      .in('category', ['yoco_payout', 'payshap_candidate'])
    if (bankImportId) txQuery = txQuery.eq('bank_import_id', bankImportId)

    const { data: bankRows, error: bankErr } = await txQuery
    if (bankErr) throw new Error(`Could not load bank transactions: ${bankErr.message}`)

    const { data: existingMatches, error: matchErr } = await db
      .from('finance_reconciliation_matches')
      .select('bank_transaction_id')
      .not('bank_transaction_id', 'is', null)
    if (matchErr) throw new Error(`Could not load existing matches: ${matchErr.message}`)
    const alreadyMatched = new Set((existingMatches ?? []).map((m) => m.bank_transaction_id as string))

    const candidateRows = (bankRows ?? []).filter((row) => !alreadyMatched.has(row.id as string))

    // --- Yoco payout matching: FNB "Magtape Credit Yoco" rows against
    // yoco_payouts.net_amount_cents (what actually lands in the bank). ---
    const payoutCandidates = candidateRows.filter((r) => r.category === 'yoco_payout' && (r.signed_amount_cents as number) > 0)
    summary.yoco_payout_candidates = payoutCandidates.length

    if (payoutCandidates.length > 0) {
      const { data: payouts, error: payoutErr } = await db
        .from('yoco_payouts')
        .select('id, net_amount_cents, payout_date, status')
        .eq('status', 'paid')
      if (payoutErr) throw new Error(`Could not load Yoco payouts: ${payoutErr.message}`)

      const usedPayoutIds = new Set<string>()
      const inserts: Json[] = []

      for (const row of payoutCandidates) {
        const amount = row.signed_amount_cents as number
        const date = row.transaction_date as string
        const match = (payouts ?? []).find(
          (p) =>
            !usedPayoutIds.has(p.id as string) &&
            Math.abs((p.net_amount_cents as number) - amount) <= AMOUNT_TOLERANCE_CENTS &&
            p.payout_date &&
            daysBetween(p.payout_date as string, date) <= DATE_WINDOW_DAYS
        )
        if (!match) continue
        usedPayoutIds.add(match.id as string)
        inserts.push({
          match_type: 'yoco_payout_to_bank_transaction',
          status: 'suggested',
          confidence_score: 0.9,
          yoco_payout_id: match.id,
          bank_transaction_id: row.id,
          matched_amount_cents: amount,
          notes: `Auto-suggested: FNB credit on ${date} (${row.description}) matched to Yoco payout dated ${match.payout_date}.`,
        })
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await db.from('finance_reconciliation_matches').insert(inserts)
        if (insertErr) throw new Error(`Could not insert Yoco payout matches: ${insertErr.message}`)
        summary.yoco_payout_matched = inserts.length
      }
    }

    // --- PayShap matching: FNB PayShap credits against NextSlot/Shop Admin
    // source records (finance_source_records covers both, ahead of whether
    // they've been promoted into finance_sales). These stay in 'suggested'
    // status - a bank credit alone is not proof of a specific sale, so a
    // human has to confirm before it counts as revenue. ---
    const payshapCandidates = candidateRows.filter((r) => r.category === 'payshap_candidate' && (r.signed_amount_cents as number) > 0)
    summary.payshap_candidates = payshapCandidates.length

    if (payshapCandidates.length > 0) {
      const { data: sourceRecords, error: sourceErr } = await db
        .from('finance_source_records')
        .select('id, occurred_at, amount_cents, source_system, source_record_type, payment_status')
        .not('payment_status', 'eq', 'refunded')
      if (sourceErr) throw new Error(`Could not load source records: ${sourceErr.message}`)

      const usedSourceIds = new Set<string>()
      const inserts: Json[] = []

      for (const row of payshapCandidates) {
        const amount = row.signed_amount_cents as number
        const date = row.transaction_date as string

        const match = (sourceRecords ?? []).find(
          (s) =>
            !usedSourceIds.has(s.id as string) &&
            typeof s.amount_cents === 'number' &&
            Math.abs((s.amount_cents as number) - amount) <= AMOUNT_TOLERANCE_CENTS &&
            s.occurred_at &&
            daysBetween((s.occurred_at as string).slice(0, 10), date) <= DATE_WINDOW_DAYS
        )
        if (!match) continue

        usedSourceIds.add(match.id as string)
        inserts.push({
          match_type: 'source_to_bank_transaction',
          status: 'suggested',
          confidence_score: 0.65,
          source_record_id: match.id,
          bank_transaction_id: row.id,
          matched_amount_cents: amount,
          notes: `Auto-suggested: PayShap credit on ${date} (${row.description}) matched to ${match.source_system} ${match.source_record_type} by amount + date. Awaiting review before confirming as revenue.`,
        })
      }

      if (inserts.length > 0) {
        const { error: insertErr } = await db.from('finance_reconciliation_matches').insert(inserts)
        if (insertErr) throw new Error(`Could not insert PayShap matches: ${insertErr.message}`)
        summary.payshap_matched = inserts.length
      }
    }

    return Response.json({ success: true, ...summary }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Matching failed.'
    return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders })
  }
})
