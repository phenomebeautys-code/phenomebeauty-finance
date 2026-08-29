import type { FinanceVehicle, VehicleOdometerEntry, VehicleTrip } from './types'

/** Weeks remaining until the settlement deadline, fractional, floored at 0. */
export function weeksRemaining(deadline: string | null, from: Date = new Date()): number | null {
  if (!deadline) return null
  const target = new Date(deadline)
  const ms = target.getTime() - from.getTime()
  const weeks = ms / (1000 * 60 * 60 * 24 * 7)
  return Math.max(weeks, 0)
}

/**
 * Required weekly contribution per spec 47.5: remaining balance ÷ remaining weeks,
 * rounded up for planning. Returns null when there isn't enough information yet.
 */
export function requiredWeeklyContribution(vehicle: FinanceVehicle): number | null {
  if (vehicle.remaining_finance_cents == null) return null
  const weeks = weeksRemaining(vehicle.settlement_deadline)
  if (weeks == null || weeks <= 0) return vehicle.remaining_finance_cents
  return Math.ceil(vehicle.remaining_finance_cents / weeks / 100) * 100
}

/** Business kilometres for a week: call-out km already supplied by caller, plus approved trips. */
export function businessKmForWeek(supportedCallOutKm: number, trips: VehicleTrip[]): number {
  const tripKm = trips.filter((t) => t.approved).reduce((sum, t) => sum + t.distance_km, 0)
  return supportedCallOutKm + tripKm
}

export interface WeekVarianceResult {
  totalKm: number
  businessKm: number
  unallocatedKm: number
  variancePercent: number
  status: 'normal' | 'explanation_requested' | 'personal_use_review'
}

/** Unallocated-km variance and status per spec 20.4. */
export function weekVariance(
  entry: Pick<VehicleOdometerEntry, 'opening_odometer_km' | 'closing_odometer_km'>,
  businessKm: number
): WeekVarianceResult {
  const totalKm = entry.closing_odometer_km - entry.opening_odometer_km
  const unallocatedKm = Math.max(totalKm - businessKm, 0)
  const variancePercent = totalKm > 0 ? (unallocatedKm / totalKm) * 100 : 0
  const status: WeekVarianceResult['status'] =
    variancePercent <= 10 ? 'normal' : variancePercent <= 30 ? 'explanation_requested' : 'personal_use_review'
  return { totalKm, businessKm, unallocatedKm, variancePercent, status }
}

/** Fuel cost per km per spec 21.2. Null when the vehicle's benchmark isn't configured. */
export function fuelCostPerKm(vehicle: FinanceVehicle): number | null {
  if (vehicle.fuel_price_cents_per_litre == null || vehicle.consumption_l_per_100km == null) return null
  return (vehicle.fuel_price_cents_per_litre * vehicle.consumption_l_per_100km) / 100
}

/** Expected business fuel cost for a distance, using the configured benchmark. */
export function expectedFuelCost(vehicle: FinanceVehicle, distanceKm: number): number | null {
  const perKm = fuelCostPerKm(vehicle)
  if (perKm == null) return null
  return Math.round(perKm * distanceKm)
}

/**
 * Projected settlement date at the current contribution pace, per spec 19.2.
 * Returns null when there isn't a reliable weekly pace yet.
 */
export function projectedSettlementDate(
  vehicle: FinanceVehicle,
  reserveHeldCents: number,
  avgWeeklyContributionCents: number
): { date: Date; onTarget: boolean } | null {
  if (vehicle.remaining_finance_cents == null || avgWeeklyContributionCents <= 0) return null
  const remaining = vehicle.remaining_finance_cents - reserveHeldCents
  const weeksNeeded = Math.max(remaining, 0) / avgWeeklyContributionCents
  const date = new Date()
  date.setDate(date.getDate() + Math.ceil(weeksNeeded * 7))

  const deadline = vehicle.settlement_deadline ? new Date(vehicle.settlement_deadline) : null
  const onTarget = deadline ? date.getTime() <= deadline.getTime() : true
  return { date, onTarget }
}

/** Returns the Monday-to-Sunday week containing `from`. */
export function currentWeekRange(from: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(from)
  const day = end.getDay() // 0 = Sunday
  end.setDate(end.getDate() + ((7 - day) % 7))
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { start, end }
}

export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}
