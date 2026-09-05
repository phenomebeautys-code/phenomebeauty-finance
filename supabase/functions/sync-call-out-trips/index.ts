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
    return Response.json({ success: false, error: 'Missing Supabase configuration.' }, { status: 500, headers: corsHeaders })
  }

  const db = createClient(supabaseUrl, serviceRoleKey)

  try {
    // Assumes a single active vehicle, which matches the current fleet.
    // If a second vehicle is ever added, this will need a way to choose
    // which vehicle a call-out trip belongs to.
    const { data: vehicle, error: vehicleErr } = await db
      .from('finance_vehicles')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (vehicleErr) throw new Error(`Could not load active vehicle: ${vehicleErr.message}`)
    if (!vehicle) {
      return Response.json({ success: true, imported: 0, skipped: 0, note: 'No active vehicle configured; nothing to sync.' }, { headers: corsHeaders })
    }

    // Only real, distance-bearing call-outs that aren't cancelled.
    const { data: bookings, error: bookingsErr } = await db
      .from('nextslot_bookings_mirror')
      .select('id, booking_date, call_out_distance_km, call_out_address, status')
      .eq('is_call_out', true)
      .not('call_out_distance_km', 'is', null)
      .gt('call_out_distance_km', 0)
      .neq('status', 'cancelled')
    if (bookingsErr) throw new Error(`Could not load call-out bookings: ${bookingsErr.message}`)

    const { data: existingTrips, error: existingErr } = await db
      .from('finance_vehicle_trips')
      .select('source_booking_id')
      .not('source_booking_id', 'is', null)
    if (existingErr) throw new Error(`Could not load existing trips: ${existingErr.message}`)
    const alreadyImported = new Set((existingTrips ?? []).map((t) => t.source_booking_id as string))

    const toInsert = (bookings ?? [])
      .filter((b) => !alreadyImported.has(b.id as string))
      .map((b) => ({
        vehicle_id: vehicle.id,
        trip_date: b.booking_date,
        category: 'call_out',
        distance_km: b.call_out_distance_km,
        notes: b.call_out_address ? `Call-out to ${b.call_out_address}` : 'Call-out (address not recorded)',
        approved: true, // sourced directly from a real booking record, not a manual claim
        source_booking_id: b.id,
      }))

    let imported = 0
    if (toInsert.length > 0) {
      const { error: insertErr } = await db.from('finance_vehicle_trips').insert(toInsert)
      if (insertErr) throw new Error(`Could not insert call-out trips: ${insertErr.message}`)
      imported = toInsert.length
    }

    return Response.json(
      {
        success: true,
        imported,
        skipped: (bookings ?? []).length - imported,
        total_call_out_bookings: (bookings ?? []).length,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Call-out trip sync failed.'
    return Response.json({ success: false, error: message }, { status: 500, headers: corsHeaders })
  }
})
