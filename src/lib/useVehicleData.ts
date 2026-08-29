import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import type { FinanceVehicle, VehicleOdometerEntry, VehicleTrip, VehicleContribution } from './types'

export interface CallOutSummary {
  completedCount: number
  totalFeesCents: number
}

interface VehicleData {
  vehicle: FinanceVehicle | null
  odometerEntries: VehicleOdometerEntry[]
  trips: VehicleTrip[]
  contributions: VehicleContribution[]
  callOutSummary: CallOutSummary
}

const EMPTY: VehicleData = {
  vehicle: null,
  odometerEntries: [],
  trips: [],
  contributions: [],
  callOutSummary: { completedCount: 0, totalFeesCents: 0 },
}

export function useVehicleData() {
  const [data, setData] = useState<VehicleData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!isSupabaseConfigured) {
      setData(EMPTY)
      setLoading(false)
      return
    }

    const vehicleRes = await supabase
      .from('finance_vehicles')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (vehicleRes.error) {
      setError(vehicleRes.error.message)
      setData(EMPTY)
      setLoading(false)
      return
    }

    const vehicle = vehicleRes.data as FinanceVehicle | null

    if (!vehicle) {
      setData(EMPTY)
      setLoading(false)
      return
    }

    // Call-out economics reads NextSlot's own data; Finance does not redefine its pricing.
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [odometerEntries, trips, contributions, callOuts] = await Promise.all([
      supabase
        .from('finance_vehicle_odometer_entries')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .order('week_start', { ascending: false })
        .limit(20),
      supabase
        .from('finance_vehicle_trips')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .order('trip_date', { ascending: false })
        .limit(50),
      supabase
        .from('finance_vehicle_contributions')
        .select('*')
        .eq('vehicle_id', vehicle.id)
        .order('week_start', { ascending: false })
        .limit(20),
      supabase
        .from('nextslot_bookings_mirror')
        .select('call_out_fee, completed_at, is_call_out')
        .eq('is_call_out', true)
        .not('completed_at', 'is', null)
        .gte('completed_at', thirtyDaysAgo.toISOString()),
    ])

    const firstError = [odometerEntries, trips, contributions, callOuts].find((r) => r.error)?.error
    if (firstError) setError(firstError.message)

    const callOutRows = (callOuts.data as { call_out_fee: number | null }[]) ?? []
    const callOutSummary: CallOutSummary = {
      completedCount: callOutRows.length,
      totalFeesCents: Math.round(callOutRows.reduce((sum, r) => sum + (r.call_out_fee ?? 0), 0) * 100),
    }

    setData({
      vehicle,
      odometerEntries: (odometerEntries.data as VehicleOdometerEntry[]) ?? [],
      trips: (trips.data as VehicleTrip[]) ?? [],
      contributions: (contributions.data as VehicleContribution[]) ?? [],
      callOutSummary,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...data, loading, error, refresh: load }
}
