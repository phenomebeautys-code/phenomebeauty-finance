import { useEffect, useState } from 'react'
import type { FinanceExpense, FinancePersonalAdvance } from '../lib/types'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, NotConnectedNote } from '../components/SectionCard'
import { Pill } from '../components/Pill'
import {
  listUnclassifiedTransactions,
  createExpense,
  createAdvance,
  dismissTransaction,
  settleAdvance,
  type UnclassifiedTransaction,
} from '../lib/expenseAdvance'

const EXPENSE_STATUS: Record<FinanceExpense['approval_status'], { tone: 'good' | 'clay' | 'warn'; label: string }> = {
  approved: { tone: 'good', label: 'Approved' },
  awaiting_review: { tone: 'clay', label: 'Awaiting review' },
  rejected: { tone: 'warn', label: 'Rejected' },
}

const ADVANCE_STATUS: Record<FinancePersonalAdvance['status'], { tone: 'good' | 'clay' | 'warn' | 'neutral'; label: string }> = {
  outstanding: { tone: 'clay', label: 'Outstanding' },
  settled: { tone: 'good', label: 'Settled' },
  carried_forward: { tone: 'warn', label: 'Carried forward' },
  written_off: { tone: 'neutral', label: 'Written off' },
}

const EXPENSE_CATEGORIES = ['Stock and supplies', 'Fuel', 'Utilities', 'Bank fees', 'Marketing', 'Equipment', 'Other']

function ClassifyRow({
  tx,
  onClassified,
}: {
  tx: UnclassifiedTransaction
  onClassified: () => void
}) {
  const [mode, setMode] = useState<'closed' | 'expense' | 'advance'>('closed')
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0])
  const [businessPercent, setBusinessPercent] = useState('100')
  const [personName, setPersonName] = useState<'Shu-meez' | 'Arshad'>('Shu-meez')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amountCents = Math.abs(tx.signed_amount_cents)

  async function handleSaveExpense() {
    setSaving(true)
    setError('')
    try {
      await createExpense({
        expenseDate: tx.transaction_date,
        description: tx.description,
        category,
        paidFrom: 'fnb',
        grossAmountCents: amountCents,
        businessUsePercent: Number(businessPercent),
        bankTransactionId: tx.id,
      })
      onClassified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this expense.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAdvance() {
    setSaving(true)
    setError('')
    try {
      await createAdvance({
        advanceDate: tx.transaction_date,
        personName,
        amountCents,
        paidFrom: 'fnb',
        bankTransactionId: tx.id,
      })
      onClassified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this advance.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDismiss(asTransfer: boolean) {
    setSaving(true)
    setError('')
    try {
      await dismissTransaction(tx.id, asTransfer)
      onClassified()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dismiss this transaction.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13.5 }}>{tx.description}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
            {tx.transaction_date}{tx.category ? ` · ${tx.category}` : ''}
          </div>
        </div>
        <span className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>{formatRands(amountCents)}</span>
      </div>

      {mode === 'closed' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setMode('expense')} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>Tag as expense</button>
          <button onClick={() => setMode('advance')} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>Tag as advance</button>
          <button onClick={() => handleDismiss(true)} disabled={saving} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>It's a transfer</button>
          <button onClick={() => handleDismiss(false)} disabled={saving} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>Already accounted for</button>
        </div>
      )}

      {mode === 'expense' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            % business
            <input
              type="number"
              min={0}
              max={100}
              value={businessPercent}
              onChange={(e) => setBusinessPercent(e.target.value)}
              style={{ width: 56, fontSize: 12, padding: '4px 6px' }}
            />
          </label>
          <button onClick={handleSaveExpense} disabled={saving} className="primary-button" style={{ fontSize: 12, padding: '4px 10px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setMode('closed')} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
        </div>
      )}

      {mode === 'advance' && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={personName} onChange={(e) => setPersonName(e.target.value as 'Shu-meez' | 'Arshad')} style={{ fontSize: 12, padding: '4px 6px' }}>
            <option value="Shu-meez">Shu-meez</option>
            <option value="Arshad">Arshad</option>
          </select>
          <button onClick={handleSaveAdvance} disabled={saving} className="primary-button" style={{ fontSize: 12, padding: '4px 10px' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setMode('closed')} className="secondary-button" style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
        </div>
      )}

      {error && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

export function ExpensesAndAdvances({
  expenses,
  advances,
  onChanged,
}: {
  expenses: FinanceExpense[]
  advances: FinancePersonalAdvance[]
  onChanged?: () => void
}) {
  const [unclassified, setUnclassified] = useState<UnclassifiedTransaction[]>([])
  const [loadingUnclassified, setLoadingUnclassified] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [settlingId, setSettlingId] = useState('')

  async function refreshUnclassified() {
    setLoadingUnclassified(true)
    setLoadError('')
    try {
      const rows = await listUnclassifiedTransactions()
      setUnclassified(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load unclassified transactions.')
    } finally {
      setLoadingUnclassified(false)
    }
  }

  useEffect(() => {
    refreshUnclassified()
  }, [])

  async function handleClassified() {
    await refreshUnclassified()
    onChanged?.()
  }

  async function handleSettle(advanceId: string) {
    setSettlingId(advanceId)
    try {
      await settleAdvance(advanceId)
      onChanged?.()
    } finally {
      setSettlingId('')
    }
  }

  const outstandingTotal = advances
    .filter((a) => a.status === 'outstanding')
    .reduce((sum, a) => sum + a.amount_cents, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          Expenses &amp; Advances
        </h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          FNB debits get tagged here as business expenses or personal advances. The main
          account's real balance already reflects these — this view is for tracking who
          spent what and what owners still owe.
        </p>
      </header>

      <SectionCard
        eyebrow="Needs classification"
        title={unclassified.length > 0 ? `${unclassified.length} FNB debit${unclassified.length === 1 ? '' : 's'} to review` : undefined}
        status={<SourceBadge state={unclassified.length > 0 ? 'live' : 'not_connected'} />}
      >
        {loadError && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{loadError}</div>}
        {loadingUnclassified ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</p>
        ) : unclassified.length === 0 ? (
          <NotConnectedNote>
            Every imported FNB debit has been classified as a business expense, a personal
            advance, a transfer, or dismissed. New debits appear here after each statement import.
          </NotConnectedNote>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {unclassified.map((tx) => (
              <ClassifyRow key={tx.id} tx={tx} onClassified={handleClassified} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard eyebrow="Expenses" status={<SourceBadge state={expenses.length > 0 ? 'live' : 'not_connected'} />}>
        {expenses.length === 0 ? (
          <NotConnectedNote>
            No expenses tagged yet. Classify an FNB debit above, or they'll show here once tagged.
          </NotConnectedNote>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {expenses.slice(0, 15).map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>{e.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {e.expense_date} · {e.category} · {e.business_use_percent}% business
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>
                    {formatRands(e.business_amount_cents)}
                  </span>
                  <Pill label={EXPENSE_STATUS[e.approval_status].label} tone={EXPENSE_STATUS[e.approval_status].tone} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Personal advances"
        title={outstandingTotal > 0 ? `${formatRands(outstandingTotal)} outstanding` : undefined}
        status={<SourceBadge state={advances.length > 0 ? 'live' : 'not_connected'} />}
      >
        {advances.length === 0 ? (
          <NotConnectedNote>
            No personal advances tagged yet. Classify an FNB debit above, or they'll show here
            once tagged.
          </NotConnectedNote>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {advances.slice(0, 15).map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>{a.person_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {a.advance_date} · from {a.paid_from}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>
                    {formatRands(a.amount_cents)}
                  </span>
                  <Pill label={ADVANCE_STATUS[a.status].label} tone={ADVANCE_STATUS[a.status].tone} />
                  {a.status === 'outstanding' && (
                    <button
                      onClick={() => handleSettle(a.id)}
                      disabled={settlingId === a.id}
                      className="secondary-button"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                    >
                      {settlingId === a.id ? 'Settling…' : 'Settle'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
