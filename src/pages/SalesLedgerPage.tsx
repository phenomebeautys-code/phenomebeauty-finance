import { useState } from 'react'
import type { FinanceSaleWithLines, ReconciliationStatus } from '../lib/types'
import { LINE_TYPE_LABELS, SOURCE_LABELS } from '../lib/types'
import { formatRands } from '../lib/money'
import { StatusPill } from '../components/StatusPill'

const FILTERS: { value: ReconciliationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'awaiting_review', label: 'Awaiting review' },
  { value: 'partly_matched', label: 'Partly matched' },
  { value: 'excluded', label: 'Excluded' },
]

export function SalesLedgerPage({ sales }: { sales: FinanceSaleWithLines[] }) {
  const [filter, setFilter] = useState<ReconciliationStatus | 'all'>('all')

  const filtered = filter === 'all' ? sales : sales.filter((s) => s.reconciliation_status === filter)

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

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>No sales match this filter.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((sale) => (
            <div
              key={sale.id}
              style={{
                border: '1px solid var(--line)',
                borderRadius: 6,
                padding: '16px 18px',
                background: 'var(--paper-raised)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {sale.customer_reference ?? 'Unnamed sale'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {new Date(sale.sale_date).toLocaleDateString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · '}
                    {SOURCE_LABELS[sale.source]}
                    {sale.payment_method ? ` · ${sale.payment_method.replace('_', ' ')}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusPill status={sale.reconciliation_status} />
                  <span className="tabular" style={{ fontWeight: 600, fontSize: 16 }}>
                    {formatRands(sale.gross_amount_cents)}
                  </span>
                </div>
              </div>

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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
