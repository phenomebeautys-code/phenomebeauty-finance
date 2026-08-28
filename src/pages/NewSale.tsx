import { useState } from 'react'
import type { LineType, PaymentMethod, SaleSource, SourceSystem } from '../lib/types'
import { LINE_TYPE_LABELS } from '../lib/types'
import { formatRands, randsToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

interface DraftLine {
  id: string
  line_type: LineType
  description: string
  amount: string
}

function newLine(line_type: LineType = 'service'): DraftLine {
  return { id: crypto.randomUUID(), line_type, description: '', amount: '' }
}

const SOURCE_SYSTEM_BY_LINE: Record<LineType, SourceSystem> = {
  service: 'nextslot',
  call_out: 'nextslot',
  product: 'manual',
  delivery: 'manual',
  discount: 'manual',
  refund: 'manual',
}

export function NewSale({ onSaved }: { onSaved: () => void }) {
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [customerReference, setCustomerReference] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('yoco_card')
  const [grossAmount, setGrossAmount] = useState('')
  const [yocoPaymentId, setYocoPaymentId] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([newLine('service')])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const linesTotalCents = lines.reduce((sum, l) => sum + randsToCents(l.amount || '0'), 0)
  const grossCents = randsToCents(grossAmount || '0')
  const differenceCents = grossCents - linesTotalCents
  const hasGross = grossAmount.trim() !== ''

  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))
  }

  function determineSource(): SaleSource {
    const types = new Set(lines.map((l) => l.line_type))
    if (types.has('service') || types.has('call_out')) return 'nextslot_service'
    if (bookingId.trim()) return 'in_service_product_sale'
    return 'manual_product_sale'
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validLines = lines.filter((l) => l.description.trim() && l.amount.trim())
    if (validLines.length === 0) {
      setError('Add at least one line with a description and an amount.')
      return
    }

    setSaving(true)

    const gross = hasGross ? grossCents : linesTotalCents

    const { data: sale, error: saleError } = await supabase
      .from('finance_sales')
      .insert({
        sale_date: saleDate,
        customer_reference: customerReference.trim() || null,
        source: determineSource(),
        reconciliation_status: yocoPaymentId.trim() ? 'matched' : 'awaiting_review',
        payment_method: paymentMethod,
        gross_amount_cents: gross,
        yoco_payment_id: yocoPaymentId.trim() || null,
        booking_id: bookingId.trim() || null,
        notes: notes.trim() || null,
      })
      .select()
      .single()

    if (saleError || !sale) {
      setError(saleError?.message ?? 'Could not save the sale.')
      setSaving(false)
      return
    }

    const linePayload = validLines.map((l) => ({
      sale_id: sale.id,
      line_type: l.line_type,
      description: l.description.trim(),
      quantity: 1,
      unit_price_cents: randsToCents(l.amount),
      total_amount_cents: randsToCents(l.amount),
      source_system: SOURCE_SYSTEM_BY_LINE[l.line_type],
    }))

    const { error: lineError } = await supabase.from('finance_sale_lines').insert(linePayload)

    setSaving(false)

    if (lineError) {
      setError(lineError.message)
      return
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setCustomerReference('')
    setGrossAmount('')
    setYocoPaymentId('')
    setBookingId('')
    setNotes('')
    setLines([newLine('service')])
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
        Record a sale
      </h2>
      <p style={{ margin: '0 0 24px', color: 'var(--ink-soft)', fontSize: 14, maxWidth: 560 }}>
        One payment can cover a service, a call out fee, and a product together. Break it into
        lines here so each part lands in the right revenue stream.
      </p>

      <div className="field-grid">
        <Field label="Sale date">
          <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
        </Field>
        <Field label="Customer or booking reference">
          <input
            type="text"
            placeholder="e.g. NS-2026-000311"
            value={customerReference}
            onChange={(e) => setCustomerReference(e.target.value)}
          />
        </Field>
        <Field label="Payment method">
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="yoco_card">Yoco card</option>
            <option value="yoco_online">Yoco online</option>
            <option value="eft">EFT</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Yoco payment reference (optional)">
          <input
            type="text"
            placeholder="yoco_..."
            value={yocoPaymentId}
            onChange={(e) => setYocoPaymentId(e.target.value)}
          />
        </Field>
        <Field label="NextSlot booking ID (optional)">
          <input
            type="text"
            placeholder="NS-2026-..."
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          />
        </Field>
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label style={labelStyle}>What the payment covers</label>
          <button type="button" className="link-button" onClick={() => setLines((p) => [...p, newLine('product')])}>
            Add a line
          </button>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
          {lines.map((line, i) => (
            <div
              key={line.id}
              className="sale-line-row"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                background: 'var(--paper-raised)',
              }}
            >
              <select
                value={line.line_type}
                onChange={(e) => updateLine(line.id, { line_type: e.target.value as LineType })}
                className="sale-line-type"
              >
                {(Object.keys(LINE_TYPE_LABELS) as LineType[]).map((t) => (
                  <option key={t} value={t}>
                    {LINE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Description, e.g. Brazilian wax"
                value={line.description}
                onChange={(e) => updateLine(line.id, { description: e.target.value })}
                className="sale-line-description"
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="R 0.00"
                value={line.amount}
                onChange={(e) => updateLine(line.id, { amount: e.target.value })}
                className="sale-line-amount tabular"
              />
              <button
                type="button"
                onClick={() => removeLine(line.id)}
                aria-label="Remove line"
                className="icon-button"
                disabled={lines.length === 1}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field-grid" style={{ marginTop: 20 }}>
        <Field label="Total the client paid (optional, defaults to the lines above)">
          <input
            type="text"
            inputMode="decimal"
            placeholder={formatRands(linesTotalCents)}
            value={grossAmount}
            onChange={(e) => setGrossAmount(e.target.value)}
          />
        </Field>
      </div>

      {hasGross && differenceCents !== 0 && (
        <p style={{ color: 'var(--warn)', fontSize: 13, marginTop: 8 }}>
          The lines add up to {formatRands(linesTotalCents)}, which is {formatRands(Math.abs(differenceCents))}{' '}
          {differenceCents > 0 ? 'short of' : 'more than'} what you entered as the total paid. Check the
          amounts before saving.
        </p>
      )}

      <Field label="Notes (optional)">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering about this sale"
        />
      </Field>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13 }}>{error}</p>}
      {saved && <p style={{ color: 'var(--good)', fontSize: 13 }}>Sale saved.</p>}

      <button type="submit" className="primary-button" disabled={saving}>
        {saving ? 'Saving…' : 'Save sale'}
      </button>
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
