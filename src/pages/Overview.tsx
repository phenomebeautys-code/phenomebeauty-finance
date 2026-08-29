import { useMemo } from 'react'
import type { FinanceSaleWithLines, LineType } from '../lib/types'
import { LINE_TYPE_LABELS } from '../lib/types'
import { formatRands } from '../lib/money'
import { SplitBar } from '../components/SplitBar'
import { StatusPill } from '../components/StatusPill'
import { CashPositionCard } from '../components/CashPositionCard'
import { SectionCard, SourceBadge, FigureRow, NotConnectedNote } from '../components/SectionCard'
import { AttentionPanel, type AttentionItem } from '../components/AttentionPanel'

function todayLabel(): string {
  return new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })
}

export function Overview({
  sales,
  expectedCents,
  expectedCount,
  reconciliationExceptions,
  syncStale,
}: {
  sales: FinanceSaleWithLines[]
  expectedCents: number
  expectedCount: number
  reconciliationExceptions: number
  syncStale: boolean
}) {
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
    let refunds = 0
    for (const sale of thisMonthSales) {
      for (const line of sale.finance_sale_lines) {
        if (line.line_type === 'refund') {
          refunds += Math.abs(line.total_amount_cents)
          continue
        }
        if (line.line_type === 'discount') continue
        if (!byType[line.line_type]) byType[line.line_type] = { amount: 0, saleIds: new Set() }
        byType[line.line_type].amount += line.total_amount_cents
        byType[line.line_type].saleIds.add(sale.id)
      }
    }
    return { byType, refunds }
  }, [thisMonthSales])

  const grossRevenue = Object.values(totals.byType).reduce((sum, t) => sum + t.amount, 0)
  const netRevenue = grossRevenue - totals.refunds

  const overallSegments: { line_type: LineType; amount_cents: number }[] = [
    { line_type: 'service', amount_cents: totals.byType.service?.amount ?? 0 },
    { line_type: 'call_out', amount_cents: totals.byType.call_out?.amount ?? 0 },
    { line_type: 'product', amount_cents: totals.byType.product?.amount ?? 0 },
  ]

  const awaitingReview = sales.filter((s) => s.reconciliation_status === 'awaiting_review')

  const attentionItems: AttentionItem[] = [
    ...awaitingReview.slice(0, 5).map((s) => ({
      id: s.id,
      label: `${s.customer_reference ?? 'Unnamed sale'} · ${formatRands(
        s.gross_amount_cents
      )} not yet matched to a Yoco payment or booking`,
    })),
    ...(reconciliationExceptions > 0
      ? [
          {
            id: 'reconciliation-exceptions',
            label: `${reconciliationExceptions} reconciliation ${
              reconciliationExceptions === 1 ? 'match needs' : 'matches need'
            } review`,
          },
        ]
      : []),
    ...(syncStale
      ? [{ id: 'sync-stale', label: 'Yoco sync has not completed successfully recently' }]
      : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Today</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{todayLabel()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Revenue ledger</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Live</div>
        </div>
      </header>

      {/* 9.3 — primary financial status */}
      <CashPositionCard expectedCents={expectedCents} expectedCount={expectedCount} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        {/* 9.4 — weekly cash control */}
        <SectionCard
          eyebrow="Weekly cash control"
          title="Sunday → Sunday"
          status={<SourceBadge state="not_connected" />}
        >
          <FigureRow label="FNB balance" value="—" muted />
          <FigureRow label="Expected Yoco payout" value="—" muted />
          <FigureRow label="Fuel buffer" value="R 400" muted />
          <FigureRow label="Operating floor" value="R 2,500" muted />
          <FigureRow label="Safe vehicle contribution" value="—" muted emphasis />
          <NotConnectedNote>
            Connect FNB and Yoco to calculate this week's safe vehicle contribution automatically.
          </NotConnectedNote>
        </SectionCard>

        {/* 9.5 — vehicle settlement */}
        <SectionCard
          eyebrow="Vehicle settlement"
          title="Not yet configured"
          status={<SourceBadge state="not_connected" />}
        >
          <FigureRow label="Remaining balance" value="—" muted />
          <FigureRow label="Target date" value="—" muted />
          <FigureRow label="Required this week" value="—" muted />
          <FigureRow label="Gap" value="—" muted />
          <NotConnectedNote>
            Set the settlement balance and target date under Vehicle &amp; Mobility to see the
            dynamic weekly target here.
          </NotConnectedNote>
        </SectionCard>
      </div>

      {/* 9.7 — revenue snapshot (live, computed from finance_sales) */}
      <SectionCard
        eyebrow="Revenue"
        title={monthLabel(now.toISOString())}
        status={<SourceBadge state="live" />}
      >
        <FigureRow label="Service revenue" value={formatRands(totals.byType.service?.amount ?? 0)} />
        <FigureRow label="Call-out fees" value={formatRands(totals.byType.call_out?.amount ?? 0)} />
        <FigureRow label="Product revenue" value={formatRands(totals.byType.product?.amount ?? 0)} />
        <FigureRow label="Refunds" value={`-${formatRands(totals.refunds)}`} />
        <FigureRow label="Net revenue" value={formatRands(netRevenue)} emphasis />

        <div style={{ marginTop: 14 }}>
          <SplitBar segments={overallSegments} height={12} />
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--ink-soft)' }}>
            <Legend swatch="var(--rose)" label="Service" />
            <Legend swatch="var(--slate)" label="Call out" />
            <Legend swatch="var(--clay)" label="Product" />
          </div>
        </div>
      </SectionCard>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}
      >
        {/* 9.8 — reserves */}
        <SectionCard eyebrow="Reserves" status={<SourceBadge state="not_connected" />}>
          <FigureRow label="Fuel buffer" value="R 400 target" muted />
          <FigureRow label="Operating floor" value="R 2,500 target" muted />
          <FigureRow label="Vehicle settlement" value="—" muted />
          <NotConnectedNote>Reserve balances need FNB and Yoco Savings connected.</NotConnectedNote>
        </SectionCard>

        {/* 9.9 — owner allocation preview */}
        <SectionCard
          eyebrow="Provisional allocation"
          title="Month not closed"
          status={<SourceBadge state="not_connected" />}
        >
          <FigureRow label="Current surplus" value="—" muted />
          <FigureRow label="Shu-meez (60%)" value="—" muted />
          <FigureRow label="Arshad (40%)" value="—" muted />
          <NotConnectedNote>
            Owner allocation is calculated at month-end once cash position and advances are
            tracked.
          </NotConnectedNote>
        </SectionCard>
      </div>

      {/* 9.10 — attention panel (live) */}
      <AttentionPanel items={attentionItems} />

      {sales.length > 0 && (
        <section>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, margin: '0 0 12px' }}>
            Recent sales
          </h3>
          <SalesLedger sales={sales.slice(0, 8)} />
        </section>
      )}
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
