import { useMemo } from 'react'
import type { ReconciliationMatch, FinanceBankImport, YocoPayout, MatchStatus, MatchType } from '../lib/types'
import { formatRands } from '../lib/money'
import { SectionCard, SourceBadge, FigureRow, NotConnectedNote } from '../components/SectionCard'
import { Pill } from '../components/Pill'

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  source_to_yoco_payment: 'Booking/order → Yoco payment',
  yoco_payout_to_bank_transaction: 'Yoco payout → bank transaction',
  sale_to_bank_transaction: 'Sale → bank transaction',
  manual: 'Manual match',
}

const STATUS_TONE: Record<MatchStatus, { tone: 'good' | 'warn' | 'clay' | 'neutral'; label: string }> = {
  confirmed: { tone: 'good', label: 'Confirmed' },
  suggested: { tone: 'clay', label: 'Suggested' },
  broken: { tone: 'warn', label: 'Broken' },
  rejected: { tone: 'neutral', label: 'Rejected' },
}

export function Reconciliation({
  matches,
  bankImports,
  payouts,
}: {
  matches: ReconciliationMatch[]
  bankImports: FinanceBankImport[]
  payouts: YocoPayout[]
}) {
  const counts = useMemo(() => {
    const byStatus: Record<MatchStatus, number> = { confirmed: 0, suggested: 0, broken: 0, rejected: 0 }
    for (const m of matches) byStatus[m.status]++
    return byStatus
  }, [matches])

  const needsAttention = matches.filter((m) => m.status === 'suggested' || m.status === 'broken')
  const unpaidPayouts = payouts.filter((p) => p.status !== 'paid')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
          Reconciliation
        </h2>
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          Matches bookings and orders to Yoco payments, Yoco payouts to bank credits, and flags
          anything unmatched.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <MiniStat label="Confirmed" value={counts.confirmed} tone="good" />
        <MiniStat label="Suggested" value={counts.suggested} tone="clay" />
        <MiniStat label="Broken" value={counts.broken} tone="warn" />
        <MiniStat label="Rejected" value={counts.rejected} tone="neutral" />
      </div>

      {/* FNB import / closing balance verification — no imports yet */}
      <SectionCard
        eyebrow="FNB import"
        title="Closing balance verification"
        status={<SourceBadge state={bankImports.length > 0 ? 'live' : 'not_connected'} />}
      >
        {bankImports.length === 0 ? (
          <NotConnectedNote>
            No FNB statement has been imported yet. Import a CSV to begin matching payouts and
            bank credits.
          </NotConnectedNote>
        ) : (
          bankImports.map((b) => (
            <FigureRow
              key={b.id}
              label={`${b.source_filename} · ${b.statement_start_date ?? '?'} – ${b.statement_end_date ?? '?'}`}
              value={b.closing_balance_cents != null ? formatRands(b.closing_balance_cents) : '—'}
            />
          ))
        )}
      </SectionCard>

      {/* Yoco payouts pending bank confirmation */}
      <SectionCard
        eyebrow="Yoco payouts"
        title="Awaiting bank confirmation"
        status={<SourceBadge state="live" />}
      >
        {unpaidPayouts.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
            All known Yoco payouts are confirmed against the bank.
          </p>
        ) : (
          unpaidPayouts.slice(0, 8).map((p) => (
            <FigureRow
              key={p.id}
              label={`${p.payout_date ?? 'Pending'} · ${p.status}`}
              value={formatRands(p.net_amount_cents)}
            />
          ))
        )}
        {unpaidPayouts.length > 8 && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
            +{unpaidPayouts.length - 8} more
          </p>
        )}
      </SectionCard>

      {/* Exception queue */}
      <SectionCard
        eyebrow="Exception queue"
        title={`${needsAttention.length} ${needsAttention.length === 1 ? 'item needs' : 'items need'} review`}
      >
        {needsAttention.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>Nothing outstanding.</p>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {needsAttention.slice(0, 25).map((m, i) => (
              <div
                key={m.id}
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
                  <div style={{ fontSize: 13.5 }}>{MATCH_TYPE_LABELS[m.match_type]}</div>
                  {m.notes && (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{m.notes}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {m.matched_amount_cents != null && (
                    <span className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>
                      {formatRands(m.matched_amount_cents)}
                    </span>
                  )}
                  <Pill label={STATUS_TONE[m.status].label} tone={STATUS_TONE[m.status].tone} />
                </div>
              </div>
            ))}
          </div>
        )}
        {needsAttention.length > 25 && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
            +{needsAttention.length - 25} more
          </p>
        )}
      </SectionCard>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'warn' | 'clay' | 'neutral' }) {
  const c = {
    good: 'var(--good)',
    warn: 'var(--warn)',
    clay: 'var(--clay)',
    neutral: 'var(--ink-soft)',
  }[tone]
  return (
    <div
      style={{
        background: 'var(--paper-raised)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-soft)' }}>
        {label}
      </div>
      <div className="tabular" style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: c, marginTop: 4 }}>
        {value}
      </div>
    </div>
  )
}
