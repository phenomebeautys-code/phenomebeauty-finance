import type { FinanceExpense, FinancePersonalAdvance } from '../lib/types'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, NotConnectedNote } from '../components/SectionCard'
import { Pill } from '../components/Pill'

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

export function ExpensesAndAdvances({
  expenses,
  advances,
}: {
  expenses: FinanceExpense[]
  advances: FinancePersonalAdvance[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          Expenses &amp; Advances
        </h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          Business expenses and personal advances, deducted from each owner's allocation at
          month-end.
        </p>
      </header>

      <SectionCard eyebrow="Expenses" status={<SourceBadge state={expenses.length > 0 ? 'live' : 'not_connected'} />}>
        {expenses.length === 0 ? (
          <NotConnectedNote>
            No expenses captured yet. Capturing an expense on mobile with a receipt photo will
            appear here for review.
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

      <SectionCard eyebrow="Personal advances" status={<SourceBadge state={advances.length > 0 ? 'live' : 'not_connected'} />}>
        {advances.length === 0 ? (
          <NotConnectedNote>
            No personal advances recorded yet. Advances reduce the relevant owner's payable amount
            at month-end close.
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
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
