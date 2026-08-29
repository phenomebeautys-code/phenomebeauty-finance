// src/pages/CashControl.tsx
import { useState } from 'react'
import { supabase } from '../lib/supabase'

type CashControlProps = {
  onSaved?: () => void
}

export function CashControl({ onSaved }: CashControlProps) {
  const [fnbBalance, setFnbBalance] = useState<string>('')
  const [yocoSavings, setYocoSavings] = useState<string>('')
  const [expectedPayout, setExpectedPayout] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const { error } = await supabase.from('finance_cash_snapshots').insert({
        fnb_operating_balance_cents: Math.round(Number(fnbBalance) * 100),
        yoco_savings_balance_cents: Math.round(Number(yocoSavings) * 100),
        expected_yoco_payout_cents: Math.round(Number(expectedPayout) * 100),
        notes: notes || null,
      })

      if (error) throw error

      setFnbBalance('')
      setYocoSavings('')
      setExpectedPayout('')
      setNotes('')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save snapshot')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 16 }}>Record cash position</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          FNB operating balance (R)
          <input
            type="number"
            step="0.01"
            value={fnbBalance}
            onChange={(e) => setFnbBalance(e.target.value)}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        <label>
          Yoco Savings balance (R)
          <input
            type="number"
            step="0.01"
            value={yocoSavings}
            onChange={(e) => setYocoSavings(e.target.value)}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        <label>
          Expected Yoco payout (R)
          <input
            type="number"
            step="0.01"
            value={expectedPayout}
            onChange={(e) => setExpectedPayout(e.target.value)}
            required
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        <label>
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>

        {error && <div style={{ color: 'red' }}>{error}</div>}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save snapshot'}
        </button>
      </form>
    </div>
  )
}
