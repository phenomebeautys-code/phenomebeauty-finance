import { useMemo } from 'react'
import type { FinanceSaleWithLines, LineType } from '../lib/types'
import { LINE_TYPE_LABELS } from '../lib/types'
import { formatRands } from '../lib/money'
import { StatCard } from '../components/StatCard'
import { SplitBar } from '../components/SplitBar'
import { StatusPill } from '../components/StatusPill'

function monthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

export function Dashboard({ sales }: { sales: FinanceSaleWithLines[] }) {
  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`

  const thisMonthSales = useMemo(
    () =>
      sales.filter((s) => {
        const d = new Date(s.sale_date)
        return `${d.getFullYear()}-${d.getMonth()}` === thisMonthKey
      }),
    [sales, thisMonthKey]
  )

  const totals = useMemo(() => {
    const byType: Record<string, { amount: number; saleIds: Set<string> }> = {}
    for (const sale of thisMonthSales) {
      for (const line of sale.finance_sale_lines) {
        if (line.line_type === 'discount' || line.line_type === 'refund') continue
        if (!byType[line.line_type]) byType[line.line_type] = { amount: 0, saleIds: new Set() }
        byType[line.line_type].amount += line.total_amount_cents
        byType[line.line_type].saleIds.add(sale.id)
      }
    }
    return byType
  }, [thisMonthSales])

  const totalRevenue = Object.values(totals).reduce((sum, t) => sum + t.amount, 0)

  const overallSegments: { line_type: LineType; amount_cents: number }[] = [
    { line_type: 'service', amount_cents: totals.service?.amount ?? 0 },
    { line_type: 'call_out', amount_cents: totals.call_out?.amount ?? 0 },
    { line_type: 'product', amount_cents: totals.product?.amount ?? 0 },
  ]

  const awaitingReview = sales.filter((s) => s.reconciliation_status === 'awaiting_review')

  return (
    <div>
      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          {monthLabel(now.toISOString())}
        </h2>
        <p style={{ margin: '0 0 20px', color: 'var(--ink-soft)', fontSize: 14 }}>
          What clients paid for services and call outs, next to what they paid for products,
          drawn from the same transactions.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard
            label="Service revenue"
            amount={formatRands(totals.service?.amount ?? 0)}
            accent="rose"
            saleCount={totals.service?.saleIds.size ?? 0}
          />
          <StatCard
            label="Call out revenue"
            amount={formatRands(totals.call_out?.amount ?? 0)}
            accent="slate"
            saleCount={totals.call_out?.saleIds.size ?? 0}
          />
          <StatCard
            label="Product revenue"
            amount={formatRands(totals.product?.amount ?? 0)}
            accent="clay"
            saleCount={totals.product?.saleIds.size ?? 0}
          />
        </div>

        <div
          style={{
            background: 'var(--paper-raised)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            padding: '18px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Total revenue this month</span>
            <span className="tabular" style={{ fontWeight: 600 }}>
              {formatRands(totalRevenue)}
            </span>
          </div>
          <SplitBar segments={overallSegments} height={14} />
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--ink-soft)' }}>
            <Legend swatch="var(--rose)" label="Service" />
            <Legend swatch="var(--slate)" label="Call out" />
            <Legend swatch="var(--clay)" label="Product" />
          </div>
        </div>
      </section>

      {awaitingReview.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 4px' }}>
            Needs a closer look
          </h3>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 13 }}>
            {awaitingReview.length} {awaitingReview.length === 1 ? 'sale is' : 'sales are'} not yet
            matched to a Yoco payment or booking.
          </p>
          <SalesLedger sales={awaitingReview} />
        </section>
      )}

      <section style={{ marginTop: 32 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, margin: '0 0 12px' }}>
          Recent sales
        </h3>
        <SalesLedger sales={sales.slice(0, 8)} />
      </section>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: swatch, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function SalesLedger({ sales }: { sales: FinanceSaleWithLines[] }) {
  if (sales.length === 0) {
    return (
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, fontStyle: 'italic' }}>
        Nothing here yet.
      </p>
    )
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
      {sales.map((sale, i) => {
        const segments: { line_type: LineType; amount_cents: number }[] = sale.finance_sale_lines
          .filter((l) => l.line_type !== 'discount' && l.line_type !== 'refund')
          .map((l) => ({ line_type: l.line_type, amount_cents: l.total_amount_cents }))

        return (
          <div
            key={sale.id}
            style={{
              padding: '14px 18px',
              borderTop: i === 0 ? 'none' : '1px solid var(--line)',
              background: 'var(--paper-raised)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {sale.customer_reference ?? 'Unnamed sale'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {new Date(sale.sale_date).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' · '}
                  {sale.finance_sale_lines.map((l) => LINE_TYPE_LABELS[l.line_type]).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusPill status={sale.reconciliation_status} />
                <span className="tabular" style={{ fontWeight: 600, minWidth: 90, textAlign: 'right' }}>
                  {formatRands(sale.gross_amount_cents)}
                </span>
              </div>
            </div>
            {segments.length > 1 && (
              <div style={{ marginTop: 8 }}>
                <SplitBar segments={segments} height={6} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
