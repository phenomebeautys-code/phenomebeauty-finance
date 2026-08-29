import { useState } from 'react'
import type { FinanceVehicle, VehicleOdometerEntry, TripCategory } from '../lib/types'
import { TRIP_CATEGORY_LABELS } from '../lib/types'
import { randsToCents } from '../lib/money'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { currentWeekRange, toDateInput } from '../lib/vehicleCalc'

interface DraftTrip {
  id: string
  category: TripCategory
  distanceKm: string
  notes: string
}

function newTrip(): DraftTrip {
  return { id: crypto.randomUUID(), category: 'stock_collection', distanceKm: '', notes: '' }
}

export function OdometerCheckIn({
  vehicle,
  lastEntry,
  onSaved,
  onCancel,
}: {
  vehicle: FinanceVehicle
  lastEntry: VehicleOdometerEntry | undefined
  onSaved: () => void
  onCancel: () => void
}) {
  const { start, end } = currentWeekRange()
  const [closingOdometer, setClosingOdometer] = useState('')
  const [fuelSpent, setFuelSpent] = useState('')
  const [notes, setNotes] = useState('')
  const [trips, setTrips] = useState<DraftTrip[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const opening = lastEntry?.closing_odometer_km ?? null

  function updateTrip(id: string, patch: Partial<DraftTrip>) {
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function removeTrip(id: string) {
    setTrips((prev) => prev.filter((t) => t.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isSupabaseConfigured) {
      setError('No Supabase project is connected yet, so this check-in cannot be saved.')
      return
    }

    if (opening == null) {
      setError('No previous odometer reading found. Set an opening reading for this vehicle first.')
      return
    }

    const closing = parseInt(closingOdometer, 10)
    if (Number.isNaN(closing) || closing < opening) {
      setError(`Closing odometer must be a number of at least ${opening} km.`)
      return
    }

    setSaving(true)

    const { data: entry, error: entryError } = await supabase
      .from('finance_vehicle_odometer_entries')
      .insert({
        vehicle_id: vehicle.id,
        week_start: toDateInput(start),
        week_end: toDateInput(end),
        opening_odometer_km: opening,
        closing_odometer_km: closing,
        fuel_spent_cents: randsToCents(fuelSpent || '0'),
        notes: notes.trim() || null,
      })
      .select()
      .single()

    if (entryError || !entry) {
      setError(entryError?.message ?? 'Could not save the check-in.')
      setSaving(false)
      return
    }

    const validTrips = trips.filter((t) => t.distanceKm.trim())
    if (validTrips.length > 0) {
      const { error: tripsError } = await supabase.from('finance_vehicle_trips').insert(
        validTrips.map((t) => ({
          vehicle_id: vehicle.id,
          odometer_entry_id: entry.id,
          category: t.category,
          distance_km: parseFloat(t.distanceKm),
          notes: t.notes.trim() || null,
        }))
      )
      if (tripsError) {
        setError(tripsError.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
        Sunday vehicle check-in
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--ink-soft)', fontSize: 14, maxWidth: 560 }}>
        {toDateInput(start)} → {toDateInput(end)}
      </p>

      <Field label="Your last recorded odometer">
        <input type="text" value={opening != null ? `${opening} km` : 'Not set'} disabled />
      </Field>

      <Field label="Enter closing odometer (km)">
        <input
          type="text"
          inputMode="numeric"
          placeholder={opening != null ? String(opening) : '0'}
          value={closingOdometer}
          onChange={(e) => setClosingOdometer(e.target.value)}
          required
        />
      </Field>

      <Field label="Fuel spent this week">
        <input
          type="text"
          inputMode="decimal"
          placeholder="R 0.00"
          value={fuelSpent}
          onChange={(e) => setFuelSpent(e.target.value)}
        />
      </Field>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle}>Additional business trips</label>
          <button type="button" className="link-button" onClick={() => setTrips((p) => [...p, newTrip()])}>
            + Add trip
          </button>
        </div>

        {trips.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
            {trips.map((t, i) => (
              <div
                key={t.id}
                className="sale-line-row"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: 'var(--paper-raised)' }}
              >
                <select
                  value={t.category}
                  onChange={(e) => updateTrip(t.id, { category: e.target.value as TripCategory })}
                  className="sale-line-type"
                >
                  {(Object.keys(TRIP_CATEGORY_LABELS) as TripCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {TRIP_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={t.notes}
                  onChange={(e) => updateTrip(t.id, { notes: e.target.value })}
                  className="sale-line-description"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="km"
                  value={t.distanceKm}
                  onChange={(e) => updateTrip(t.id, { distanceKm: e.target.value })}
                  className="sale-line-amount tabular"
                />
                <button
                  type="button"
                  onClick={() => removeTrip(t.id)}
                  aria-label="Remove trip"
                  className="icon-button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Notes (optional)">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering about this week"
        />
      </Field>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button type="submit" className="primary-button" style={{ marginTop: 0 }} disabled={saving}>
          {saving ? 'Saving…' : 'Complete weekly check'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-soft)',
  marginBottom: 6,
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}
