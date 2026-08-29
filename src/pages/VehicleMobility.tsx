import { useMemo } from 'react'
import type { FinanceVehicle, VehicleOdometerEntry, VehicleTrip, VehicleContribution } from '../lib/types'
import { TRIP_CATEGORY_LABELS } from '../lib/types'
import type { CallOutSummary } from '../lib/useVehicleData'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, FigureRow, NotConnectedNote } from '../components/SectionCard'
import { Pill } from '../components/Pill'
import {
  weeksRemaining,
  requiredWeeklyContribution,
  businessKmForWeek,
  weekVariance,
  fuelCostPerKm,
  expectedFuelCost,
  projectedSettlementDate,
} from '../lib/vehicleCalc'

export function VehicleMobility({
  vehicle,
  odometerEntries,
  trips,
  contributions,
  callOutSummary,
  onCheckIn,
}: {
  vehicle: FinanceVehicle | null
  odometerEntries: VehicleOdometerEntry[]
  trips: VehicleTrip[]
  contributions: VehicleContribution[]
  callOutSummary: CallOutSummary
  onCheckIn: () => void
}) {
  const latestEntry = odometerEntries[0]
  const latestEntryTrips = useMemo(
    () => trips.filter((t) => t.odometer_entry_id === latestEntry?.id),
    [trips, latestEntry]
  )

  if (!vehicle) {
    return (
      <SectionCard eyebrow="Vehicle & Mobility" title="No vehicle configured">
        <NotConnectedNote>
          No active vehicle record exists yet. Add one under Settings to start tracking
          settlement, odometer readings, and fuel.
        </NotConnectedNote>
      </SectionCard>
    )
  }

  // Call-out km isn't tracked yet (NextSlot doesn't record distance per booking),
  // so business km for now is approved trips only — flagged honestly below.
  const businessKm = latestEntry ? businessKmForWeek(0, latestEntryTrips) : 0
  const variance = latestEntry ? weekVariance(latestEntry, businessKm) : null

  const weeks = weeksRemaining(vehicle.settlement_deadline)
  const requiredWeekly = requiredWeeklyContribution(vehicle)

  const reserveHeld = contributions.reduce((sum, c) => sum + c.amount_cents, 0)
  const thisWeekContribution = contributions[0]?.amount_cents ?? 0
  const avgWeekly =
    contributions.length > 0 ? contributions.reduce((s, c) => s + c.amount_cents, 0) / contributions.length : 0
  const projected = projectedSettlementDate(vehicle, reserveHeld, avgWeekly)

  const gap =
    vehicle.remaining_finance_cents != null ? Math.max(vehicle.remaining_finance_cents - reserveHeld, 0) : null

  const perKm = fuelCostPerKm(vehicle)
  const expectedFuel = latestEntry ? expectedFuelCost(vehicle, businessKm) : null
  const fuelVariance =
    latestEntry != null && expectedFuel != null ? latestEntry.fuel_spent_cents - expectedFuel : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Vehicle &amp; Mobility</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '4px 0 0' }}>{vehicle.name}</h2>
        </div>
        <button type="button" className="primary-button" style={{ marginTop: 0 }} onClick={onCheckIn}>
          Sunday check-in
        </button>
      </header>

      {vehicle.phase === 'settled' ? (
        <SettledState vehicle={vehicle} />
      ) : (
        <SectionCard eyebrow="Vehicle finance" title="Settlement tracker" status={<SourceBadge state="live" />}>
          <FigureRow
            label="Remaining"
            value={vehicle.remaining_finance_cents != null ? formatRands(vehicle.remaining_finance_cents) : '—'}
            emphasis
          />
          <FigureRow label="Settlement date" value={vehicle.settlement_deadline ?? '—'} />
          <FigureRow label="Weeks remaining" value={weeks != null ? weeks.toFixed(1) : '—'} />
          <FigureRow label="Required weekly contribution" value={requiredWeekly != null ? formatRands(requiredWeekly) : '—'} />
          <FigureRow label="Reserve currently held" value={formatRands(reserveHeld)} />
          <FigureRow label="This week's contribution" value={formatRands(thisWeekContribution)} />
          <FigureRow label="Settlement gap" value={gap != null ? formatRands(gap) : '—'} emphasis />

          {vehicle.remaining_finance_cents != null && (
            <div style={{ marginTop: 14 }}>
              <ProgressBar value={reserveHeld} total={vehicle.remaining_finance_cents} />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>
                {formatRands(reserveHeld)} reserved of {formatRands(vehicle.remaining_finance_cents)}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {projected ? (
              <Pill
                label={
                  projected.onTarget
                    ? `On target — estimated settlement ${projected.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : `Behind target — estimated settlement ${projected.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
                }
                tone={projected.onTarget ? 'good' : 'warn'}
              />
            ) : (
              <NotConnectedNote>
                Log at least one weekly contribution to project a settlement date at the current
                pace.
              </NotConnectedNote>
            )}
          </div>
        </SectionCard>
      )}

      {/* Weekly mobility / call-out economics — spec 22 */}
      <SectionCard eyebrow="Call-out economics" title="Last 30 days" status={<SourceBadge state="live" />}>
        <FigureRow label="Completed call-outs" value={String(callOutSummary.completedCount)} />
        <FigureRow label="Call-out fees" value={formatRands(callOutSummary.totalFeesCents)} emphasis />
        <NotConnectedNote>
          NextSlot doesn't record distance per call-out yet, so supported business kilometres and
          expected fuel cost can't be calculated from call-outs alone. Approved trips logged at
          Sunday check-in are used for kilometre tracking below instead.
        </NotConnectedNote>
      </SectionCard>

      {/* Fuel — spec 21 */}
      <SectionCard eyebrow="Fuel" status={<SourceBadge state={latestEntry ? 'live' : 'not_connected'} />}>
        <FigureRow label="Fuel buffer" value={formatRands(vehicle.fuel_buffer_cents)} />
        {latestEntry ? (
          <>
            <FigureRow label="Fuel spent this week" value={formatRands(latestEntry.fuel_spent_cents)} />
            <FigureRow label="Expected business fuel" value={expectedFuel != null ? formatRands(expectedFuel) : '—'} />
            {fuelVariance != null && (
              <FigureRow
                label="Variance"
                value={`${fuelVariance >= 0 ? '+' : '-'}${formatRands(Math.abs(fuelVariance))}`}
              />
            )}
          </>
        ) : (
          <NotConnectedNote>No odometer check-in logged yet this period.</NotConnectedNote>
        )}
        {perKm == null && (
          <NotConnectedNote>
            Set a fuel price and consumption benchmark under Settings to calculate expected fuel
            cost automatically.
          </NotConnectedNote>
        )}
      </SectionCard>

      {/* Weekly mileage / unallocated km — spec 20 */}
      <SectionCard eyebrow="This week's mileage" status={<SourceBadge state={latestEntry ? 'live' : 'not_connected'} />}>
        {latestEntry && variance ? (
          <>
            <FigureRow label="Week" value={`${latestEntry.week_start} → ${latestEntry.week_end}`} />
            <FigureRow label="Total km" value={`${variance.totalKm} km`} />
            <FigureRow label="Business km (approved trips)" value={`${variance.businessKm} km`} />
            <FigureRow label="Unallocated km" value={`${variance.unallocatedKm} km`} emphasis />
            <div style={{ marginTop: 10 }}>
              <Pill
                label={
                  variance.status === 'normal'
                    ? 'Normal operating variance'
                    : variance.status === 'explanation_requested'
                      ? 'Explanation requested'
                      : 'Personal-use review'
                }
                tone={variance.status === 'normal' ? 'good' : variance.status === 'explanation_requested' ? 'clay' : 'warn'}
              />
            </div>
            {latestEntryTrips.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {latestEntryTrips.map((t) => (
                  <FigureRow key={t.id} label={TRIP_CATEGORY_LABELS[t.category]} value={`${t.distance_km} km`} muted />
                ))}
              </div>
            )}
          </>
        ) : (
          <NotConnectedNote>
            No Sunday check-in submitted yet for this period. Tap "Sunday check-in" above to
            record it.
          </NotConnectedNote>
        )}
      </SectionCard>
    </div>
  )
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div style={{ height: 10, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--good)', borderRadius: 999 }} />
    </div>
  )
}

function SettledState({ vehicle }: { vehicle: FinanceVehicle }) {
  const allocations = Object.values(vehicle.post_settlement_allocations ?? {})
  return (
    <SectionCard eyebrow="Vehicle settled" title="Vehicle & Mobility Reserve" status={<Pill label="Settled" tone="good" />}>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 14px', lineHeight: 1.5 }}>
        The former vehicle-payment budget is now available to maintain and protect the vehicle.
      </p>
      {allocations.map((a, i) => (
        <FigureRow
          key={i}
          label={a.label}
          value={a.mode === 'first_funded' ? 'First funded' : `${a.percent}%`}
        />
      ))}
    </SectionCard>
  )
}
