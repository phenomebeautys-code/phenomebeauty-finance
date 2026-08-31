import { useState } from 'react'
import type { FinanceSaleWithLines, LineType, PaymentMethod, ReconciliationStatus } from '../lib/types'
import { LINE_TYPE_LABELS, SOURCE_LABELS } from '../lib/types'
import { formatRands, randsToCents } from '../lib/money'
import { StatusPill } from '../components/StatusPill'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const FILTERS: { value: ReconciliationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'matched', label: 'Matched' },
  { value: 'partly_matched', label: 'Partly matched' },
  { value: 'excluded', label: 'Excluded' },
]

interface DraftLineEdit {
  id: string
  description: string
  amount: string
  line_type: LineType
}

export function SalesLedgerPage({ sales, onChanged }: { sales: FinanceSaleWithLines[]; onChanged?: () => void }) {
  const [filter, setFilter] = useState<ReconciliationStatus | 'all'>('awaiting_review')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Draft state for the sale currently being edited.
  const [draftCustomerRef, setDraftCustomerRef] = useState('')
  const [draftPaymentMethod, setDraftPaymentMethod] = useState<PaymentMethod>('yoco_card')
  const [draftYocoId, setDraftYocoId] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLineEdit[]>([])

  const filtered = filter === 'all' ? sales : sales.filter((s) => s.reconciliation_status === filter)

  function startEdit(sale: FinanceSaleWithLines) {
    setError(null)
    setEditingId(sale.id)
    setDraftCustomerRef(sale.customer_reference ?? '')
    setDraftPaymentMethod(sale.payment_method ?? 'yoco_card')
    setDraftYocoId(sale.yoco_payment_id ?? '')
    setDraftNotes(sale.notes ?? '')
    setDraftLines(
      sale.finance_sale_lines.map((l) => ({
        id: l.id,
        description: l.description,
        amount: (l.total_amount_cents / 100).toFixed(2),
        line_type: l.line_type,
      }))
    )
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function updateDraftLine(id: string, patch: Partial<DraftLineEdit>) {
    setDraftLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  async function saveEdits(sale: FinanceSaleWithLines) {
    if (!isSupabaseConfigured) {
      setError('No Supabase project is connected, so changes cannot be saved.')
      return
    }
    setBusyId(sale.id)
    setError(null)

    const newGross = draftLines.reduce((sum, l) => sum + randsToCents(l.amount || '0'), 0)

    const { error: saleError } = await supabase
      .from('finance_sales')
      .update({
        customer_reference: draftCustomerRef.trim() || null,
        payment_method: draftPaymentMethod,
        yoco_payment_id: draftYocoId.trim() || null,
        notes: draftNotes.trim() || null,
        gross_amount_cents: newGross,
      })
      .eq('id', sale.id)

    if (saleError) {
      setError(saleError.message)
      setBusyId(null)
      return
    }

    for (const line of draftLines) {
      const { error: lineError } = await supabase
        .from('finance_sale_lines')
        .update({
          description: line.description.trim(),
          line_type: line.line_type,
          unit_price_cents: randsToCents(line.amount || '0'),
          total_amount_cents: randsToCents(line.amount || '0'),
        })
        .eq('id', line.id)
      if (lineError) {
        setError(lineError.message)
        setBusyId(null)
        return
      }
    }

    setBusyId(null)
    setEditingId(null)
    onChanged?.()
  }

  async function setStatus(sale: FinanceSaleWithLines, status: ReconciliationStatus) {
    if (!isSupabaseConfigured) {
      setError('No Supabase project is connected, so changes cannot be saved.')
      return
    }
    setBusyId(sale.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('finance_sales')
      .update({ reconciliation_status: status })
      .eq('id', sale.id)
    setBusyId(null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    if (editingId === sale.id) setEditingId(null)
    onChanged?.()
  }

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 16px' }}>All sales</h2>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="shell-tab"
            data-active={filter === f.value}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--rose)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>No sales match this filter.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((sale) => {
            const isEditing = editingId === sale.id
            const isBusy = busyId === sale.id
            const needsReview = sale.reconciliation_status === 'awaiting_review'

            return (
              <div
                key={sale.id}
                style={{
                  border: needsReview ? '1px solid var(--clay)' : '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '16px 18px',
                  background: 'var(--paper-raised)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={draftCustomerRef}
                        onChange={(e) => setDraftCustomerRef(e.target.value)}
                        placeholder="Customer or booking reference"
                        style={{ fontWeight: 600, fontSize: 15 }}
                      />
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: 15 }}>
                        {sale.customer_reference ?? 'Unnamed sale'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {new Date(sale.sale_date).toLocaleDateString('en-ZA', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {SOURCE_LABELS[sale.source]}
                      {!isEditing && sale.payment_method ? ` · ${sale.payment_method.replace('_', ' ')}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StatusPill status={sale.reconciliation_status} />
                    <span className="tabular" style={{ fontWeight: 600, fontSize: 16 }}>
                      {formatRands(
                        isEditing
                          ? draftLines.reduce((sum, l) => sum + randsToCents(l.amount || '0'), 0)
                          : sale.gross_amount_cents
                      )}
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <>
                    <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
                      {draftLines.map((line, i) => (
                        <div
                          key={line.id}
                          className="sale-line-row"
                          style={{
                            borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                            background: 'var(--paper)',
                          }}
                        >
                          <select
                            value={line.line_type}
                            onChange={(e) => updateDraftLine(line.id, { line_type: e.target.value as LineType })}
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
                            value={line.description}
                            onChange={(e) => updateDraftLine(line.id, { description: e.target.value })}
                            className="sale-line-description"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.amount}
                            onChange={(e) => updateDraftLine(line.id, { amount: e.target.value })}
                            className="sale-line-amount tabular"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="field-grid" style={{ marginTop: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                          Payment method
                        </label>
                        <select
                          value={draftPaymentMethod}
                          onChange={(e) => setDraftPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          <option value="yoco_card">Yoco card</option>
                          <option value="yoco_online">Yoco online</option>
                          <option value="eft">EFT</option>
                          <option value="cash">Cash</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                          Yoco payment reference
                        </label>
                        <input
                          type="text"
                          placeholder="yoco_..."
                          value={draftYocoId}
                          onChange={(e) => setDraftYocoId(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>
                        Notes
                      </label>
                      <textarea
                        rows={2}
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={isBusy}
                        onClick={() => saveEdits(sale)}
                      >
                        {isBusy ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        disabled={isBusy}
                        onClick={() => setStatus(sale, 'matched')}
                      >
                        Save &amp; approve
                      </button>
                      <button type="button" className="link-button" disabled={isBusy} onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 13 }}>
                      <tbody>
                        {sale.finance_sale_lines.map((line) => (
                          <tr key={line.id} style={{ borderTop: '1px solid var(--line)' }}>
                            <td style={{ padding: '6px 0', color: 'var(--ink-soft)', width: 100 }}>
                              {LINE_TYPE_LABELS[line.line_type]}
                            </td>
                            <td style={{ padding: '6px 0' }}>{line.description}</td>
                            <td className="tabular" style={{ padding: '6px 0', textAlign: 'right', width: 100 }}>
                              {formatRands(line.total_amount_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {sale.notes && (
                      <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>
                        {sale.notes}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      {needsReview && (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={isBusy}
                          onClick={() => setStatus(sale, 'matched')}
                        >
                          {isBusy ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                      <button type="button" className="link-button" disabled={isBusy} onClick={() => startEdit(sale)}>
                        Edit
                      </button>
                      {sale.reconciliation_status !== 'excluded' && (
                        <button
                          type="button"
                          className="link-button"
                          disabled={isBusy}
                          onClick={() => setStatus(sale, 'excluded')}
                        >
                          Reject / exclude
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
