import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://phenomebeauty-finance.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

type Row = Record<string, unknown>

function toCents(amount: unknown): number {
  const n = typeof amount === 'string' ? Number(amount) : (typeof amount === 'number' ? amount : 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: 'Finance DB Edge Function secret is missing.' }, { status: 500, headers: corsHeaders })
  }
  const db = createClient(supabaseUrl, serviceRoleKey)

  const { data: run, error: runError } = await db
    .from('finance_source_sync_runs')
    .insert({ sync_scope: 'full', status: 'running' })
    .select('id')
    .single()
  if (runError || !run) {
    return Response.json(
      { ok: false, error: `Unable to create sync run: ${runError?.message ?? 'no row returned'} (code: ${runError?.code ?? 'n/a'}, details: ${runError?.details ?? 'n/a'}, hint: ${runError?.hint ?? 'n/a'})` },
      { status: 500, headers: corsHeaders }
    )
  }

  const summary = {
    nextslot_bookings_read: 0,
    nextslot_sales_upserted: 0,
    nextslot_lines_upserted: 0,
    nextslot_skipped_unpaid: 0,
    shop_orders_read: 0,
    shop_sales_upserted: 0,
    shop_lines_upserted: 0,
    shop_skipped_unpaid: 0,
    failed: 0,
  }

  try {
    // ---- Load everything up front (a handful of bulk reads, not hundreds) ----
    const { data: bookings, error: bErr } = await db
      .from('nextslot_bookings_mirror')
      .select('*')
      .order('booking_date', { ascending: false })
    if (bErr) throw new Error(`Could not read nextslot_bookings_mirror: ${bErr.message}`)
    summary.nextslot_bookings_read = bookings?.length ?? 0

    const bookingIds = (bookings ?? []).map((b: Row) => b.id as string)
    const { data: items, error: itemsErr } = await db
      .from('nextslot_booking_items_mirror')
      .select('*')
      .in('booking_id', bookingIds.length > 0 ? bookingIds : ['00000000-0000-0000-0000-000000000000'])
    if (itemsErr) throw new Error(`Could not read nextslot_booking_items_mirror: ${itemsErr.message}`)

    const { data: yocoPayments, error: yocoErr } = await db
      .from('yoco_payments')
      .select('id, checkout_id, gross_amount_cents')
    if (yocoErr) throw new Error(`Could not read yoco_payments: ${yocoErr.message}`)
    const yocoByCheckout = new Map<string, Row>()
    for (const p of (yocoPayments ?? []) as Row[]) {
      if (p.checkout_id) yocoByCheckout.set(p.checkout_id as string, p)
    }

    const itemsByBooking = new Map<string, Row[]>()
    for (const it of (items ?? []) as Row[]) {
      const bid = it.booking_id as string
      if (!itemsByBooking.has(bid)) itemsByBooking.set(bid, [])
      itemsByBooking.get(bid)!.push(it)
    }

    const { data: orders, error: ordersErr } = await db.from('product_orders_mirror').select('*')
    if (ordersErr) throw new Error(`Could not read product_orders_mirror: ${ordersErr.message}`)
    summary.shop_orders_read = orders?.length ?? 0

    const paidStatuses = new Set(['completed'])
    const importedAt = new Date().toISOString()

    // ---- Build every finance_sales row to upsert, in memory, before touching the DB ----
    const salePayloads: Row[] = []
    // Per-booking bookkeeping needed to build line rows once we have sale ids back.
    const nextslotSaleMeta = new Map<string, { bookingId: string; totalCents: number; calloutFeeCents: number; isCallOut: boolean; hasClientName: boolean }>()

    for (const booking of (bookings ?? []) as Row[]) {
      const status = booking.status as string
      const isPaid = booking.full_payment_received === true || booking.final_payment_paid === true || (paidStatuses.has(status) && booking.deposit_paid === true)
      if (!isPaid) {
        summary.nextslot_skipped_unpaid += 1
        continue
      }

      const bookingId = booking.id as string
      const totalCents = toCents(booking.total_amount)
      const calloutFeeCents = booking.call_out_fee != null ? toCents(booking.call_out_fee) : 0
      const isCallOut = booking.is_call_out === true
      const checkoutId = (booking.yoco_final_checkout_id || booking.yoco_checkout_id) as string | null
      const matchedYoco = checkoutId ? yocoByCheckout.get(checkoutId) : null
      const externalSaleKey = `nextslot:${bookingId}`
      // Real client name when NextSlot has one; a booking's service names
      // (filled in once we have line items) is a fallback further below,
      // never left as a dead-end "Unnamed sale".
      const clientName = (booking.client_name as string | null) || (booking.guest_name as string | null) || null

      salePayloads.push({
        sale_date: booking.booking_date,
        source: isCallOut ? 'nextslot_callout' : 'nextslot_service',
        source_system: 'nextslot',
        reconciliation_status: matchedYoco ? 'matched' : 'awaiting_review',
        payment_method: 'yoco_card',
        gross_amount_cents: totalCents,
        yoco_payment_id: matchedYoco ? (matchedYoco.id as string) : null,
        booking_id: bookingId,
        external_sale_key: externalSaleKey,
        customer_reference: clientName,
        source_updated_at: booking.completed_at ?? booking.created_at ?? null,
        imported_at: importedAt,
        import_run_id: run.id,
        notes: isCallOut && calloutFeeCents === 0 ? 'Call-out booking; no separate call-out fee recorded.' : null,
      })
      nextslotSaleMeta.set(externalSaleKey, { bookingId, totalCents, calloutFeeCents, isCallOut, hasClientName: clientName !== null })
    }

    const shopSaleMeta = new Map<string, { orderId: string; hasCustomerName: boolean }>()
    for (const order of (orders ?? []) as Row[]) {
      const paymentStatus = (order.payment_status as string | null)?.toLowerCase() ?? ''
      const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed'
      if (!isPaid) {
        summary.shop_skipped_unpaid += 1
        continue
      }
      const orderId = order.id as string
      const totalCents = toCents(order.total_amount)
      const externalSaleKey = `products:${orderId}`
      const customerName = (order.customer_name as string | null) || null

      salePayloads.push({
        sale_date: ((order.paid_at as string | null) ?? (order.created_at as string)).slice(0, 10),
        source: 'shop_order',
        source_system: 'shop_admin',
        reconciliation_status: 'awaiting_review',
        payment_method: 'yoco_card',
        gross_amount_cents: totalCents,
        shop_order_id: orderId,
        external_sale_key: externalSaleKey,
        customer_reference: customerName,
        source_updated_at: order.paid_at ?? order.created_at ?? null,
        imported_at: importedAt,
        import_run_id: run.id,
      })
      shopSaleMeta.set(externalSaleKey, { orderId, hasCustomerName: customerName !== null })
    }

    // ---- One batched upsert for every sale, then look the ids back up by key ----
    const saleIdByKey = new Map<string, string>()
    if (salePayloads.length > 0) {
      const { data: upserted, error: upsertErr } = await db
        .from('finance_sales')
        .upsert(salePayloads, { onConflict: 'external_sale_key' })
        .select('id, external_sale_key')
      if (upsertErr) throw new Error(`Could not upsert finance_sales: ${upsertErr.message}`)
      for (const row of (upserted ?? []) as Row[]) {
        saleIdByKey.set(row.external_sale_key as string, row.id as string)
      }
    }
    summary.nextslot_sales_upserted = [...nextslotSaleMeta.keys()].filter((k) => saleIdByKey.has(k)).length
    summary.shop_sales_upserted = [...shopSaleMeta.keys()].filter((k) => saleIdByKey.has(k)).length
    summary.failed = (nextslotSaleMeta.size + shopSaleMeta.size) - (summary.nextslot_sales_upserted + summary.shop_sales_upserted)

    // ---- Build every line row now that we have sale ids, then one batched upsert ----
    const lineRows: Row[] = []
    // For sales with no real client/customer name, collect their line-item
    // names here so we can fill customer_reference with something useful
    // (e.g. "Half Leg, Hollywood, Underarm") instead of leaving it null --
    // that's what used to render as "Unnamed sale" even though the app had
    // full detail on what was actually sold.
    const fallbackNamesBySaleId = new Map<string, string[]>()
    function addFallbackName(saleId: string, name: string) {
      if (!fallbackNamesBySaleId.has(saleId)) fallbackNamesBySaleId.set(saleId, [])
      const list = fallbackNamesBySaleId.get(saleId)!
      if (!list.includes(name)) list.push(name)
    }

    for (const [externalSaleKey, meta] of nextslotSaleMeta) {
      const saleId = saleIdByKey.get(externalSaleKey)
      if (!saleId) continue
      const bookingItems = itemsByBooking.get(meta.bookingId) ?? []
      let serviceLinesCents = 0
      for (const item of bookingItems) {
        const priceCents = toCents(item.price)
        const qty = Number(item.quantity ?? 1)
        const lineTotal = priceCents * qty
        serviceLinesCents += lineTotal
        const serviceName = (item.service_name as string | null) ?? 'Service'
        if (!meta.hasClientName) addFallbackName(saleId, serviceName)
        lineRows.push({
          sale_id: saleId,
          line_type: 'service',
          description: serviceName,
          quantity: qty,
          unit_price_cents: priceCents,
          total_amount_cents: lineTotal,
          source_system: 'nextslot',
          source_record_id: item.id as string,
          external_line_key: `nextslot:${meta.bookingId}:item:${item.id}`,
        })
      }

      if (meta.calloutFeeCents > 0) {
        lineRows.push({
          sale_id: saleId,
          line_type: 'call_out',
          description: 'Call-out fee',
          quantity: 1,
          unit_price_cents: meta.calloutFeeCents,
          total_amount_cents: meta.calloutFeeCents,
          source_system: 'nextslot',
          source_record_id: meta.bookingId,
          external_line_key: `nextslot:${meta.bookingId}:callout`,
        })
      } else if (meta.isCallOut && meta.totalCents > serviceLinesCents) {
        const gap = meta.totalCents - serviceLinesCents
        lineRows.push({
          sale_id: saleId,
          line_type: 'call_out',
          description: 'Call-out (fee not itemised at time of booking)',
          quantity: 1,
          unit_price_cents: gap,
          total_amount_cents: gap,
          source_system: 'nextslot',
          source_record_id: meta.bookingId,
          external_line_key: `nextslot:${meta.bookingId}:callout`,
        })
      }
    }

    const ordersById = new Map<string, Row>((orders ?? []).map((o: Row) => [o.id as string, o]))
    for (const [externalSaleKey, meta] of shopSaleMeta) {
      const saleId = saleIdByKey.get(externalSaleKey)
      const order = ordersById.get(meta.orderId)
      if (!saleId || !order) continue

      const items = Array.isArray(order.items) ? (order.items as Row[]) : []
      items.forEach((item, idx) => {
        const priceCents = toCents(item.price ?? item.unit_price)
        const qty = Number(item.quantity ?? 1)
        const productName = (item.name as string) ?? (item.product_name as string) ?? 'Product'
        if (!meta.hasCustomerName) addFallbackName(saleId, productName)
        lineRows.push({
          sale_id: saleId,
          line_type: 'product',
          description: productName,
          quantity: qty,
          unit_price_cents: priceCents,
          total_amount_cents: priceCents * qty,
          source_system: 'shop_admin',
          source_record_id: meta.orderId,
          external_line_key: `products:${meta.orderId}:item:${idx}`,
        })
      })

      const deliveryCents = toCents(order.delivery_fee)
      if (deliveryCents > 0) {
        lineRows.push({
          sale_id: saleId,
          line_type: 'delivery',
          description: 'Delivery',
          quantity: 1,
          unit_price_cents: deliveryCents,
          total_amount_cents: deliveryCents,
          source_system: 'shop_admin',
          source_record_id: meta.orderId,
          external_line_key: `products:${meta.orderId}:delivery`,
        })
      }
    }

    if (lineRows.length > 0) {
      const { error: lineErr } = await db.from('finance_sale_lines').upsert(lineRows, { onConflict: 'external_line_key' })
      if (lineErr) throw new Error(`Could not upsert finance_sale_lines: ${lineErr.message}`)
      summary.nextslot_lines_upserted = lineRows.filter((l) => (l.source_system as string) === 'nextslot').length
      summary.shop_lines_upserted = lineRows.filter((l) => (l.source_system as string) === 'shop_admin').length
    }

    // Backfill customer_reference from line-item names for every sale that
    // had no real client/customer name. One batched upsert keyed on id --
    // PostgREST upsert only touches the columns present in each row, so
    // this safely updates just customer_reference without touching
    // anything else (learned from the earlier sequential-loop timeout bug
    // in this same function: never do N individual round trips when one
    // batched call will do).
    let fallbackNamesApplied = 0
    if (fallbackNamesBySaleId.size > 0) {
      const nameUpdates = [...fallbackNamesBySaleId.entries()].map(([saleId, names]) => ({
        id: saleId,
        customer_reference: names.slice(0, 4).join(', ') + (names.length > 4 ? ', +more' : ''),
      }))
      const { error: nameErr } = await db.from('finance_sales').upsert(nameUpdates, { onConflict: 'id' })
      if (nameErr) throw new Error(`Could not backfill customer_reference: ${nameErr.message}`)
      fallbackNamesApplied = nameUpdates.length
    }

    await db
      .from('finance_source_sync_runs')
      .update({
        status: summary.failed > 0 ? 'completed_with_errors' : 'completed',
        completed_at: new Date().toISOString(),
        records_read: summary.nextslot_bookings_read + summary.shop_orders_read,
        records_inserted: summary.nextslot_sales_upserted + summary.shop_sales_upserted,
        records_failed: summary.failed,
      })
      .eq('id', run.id)

    return Response.json({ ok: true, ...summary, fallbackNamesApplied }, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed.'
    await db.from('finance_source_sync_runs').update({ status: 'failed', completed_at: new Date().toISOString(), error_summary: message }).eq('id', run.id)
    return Response.json({ ok: false, error: message, ...summary }, { status: 502, headers: corsHeaders })
  }
})
