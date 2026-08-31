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
  onImportFNB,
}: {
  matches: ReconciliationMatch[]
  bankImports: FinanceBankImport[]
  payouts: YocoPayout[]
  onImportFNB: () => void
}) {
  const counts = useMemo(() => {
    const byStatus: Record<MatchStatus, number> = {
      confirmed: 0,
      suggested: 0,
      broken: 0,
      rejected: 0,
    }

    for (const match of matches) {
      byStatus[match.status]++
    }

    return byStatus
  }, [matches])

  const needsAttention = useMemo(
    () => matches.filter((match) => match.status === 'suggested' || match.status === 'broken'),
    [matches]
  )

  const unpaidPayouts = useMemo(
    () => payouts.filter((payout) => payout.status !== 'paid'),
    [payouts]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px' }}>
              Reconciliation
            </h2>
            <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14, maxWidth: 760 }}>
              Match bookings and orders to Yoco payments, Yoco payouts to bank credits, and review
              anything unmatched.
            </p>
          </div>

          <button
            type="button"
            onClick={onImportFNB}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: 8,
              background: 'var(--ink)',
              color: 'var(--paper)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
              padding: '10px 14px',
              whiteSpace: 'nowrap',
            }}
          >
            Import FNB statement
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <MiniStat label="Confirmed" value={counts.confirmed} tone="good" />
        <MiniStat label="Suggested" value={counts.suggested} tone="clay" />
        <MiniStat label="Broken" value={counts.broken} tone="warn" />
        <MiniStat label="Rejected" value={counts.rejected} tone="neutral" />
      </div>

      <SectionCard
        eyebrow="FNB import"
        title="Statements and closing-balance verification"
        status={<SourceBadge state={bankImports.length > 0 ? 'live' : 'not_connected'} />}
      >
        {bankImports.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <NotConnectedNote>
              No FNB statement has been imported yet. Upload an FNB PDF to parse the statement,
              verify its opening and closing balances, and begin matching bank credits.
            </NotConnectedNote>

            <button
              type="button"
              onClick={onImportFNB}
              style={{
                appearance: 'none',
                border: '1px solid var(--line)',
                borderRadius: 7,
                background: 'var(--paper-raised)',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                padding: '9px 12px',
              }}
            >
              Upload FNB PDF
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bankImports.map((bankImport) => (
              <FigureRow
                key={bankImport.id}
                label={`${bankImport.source_filename} · ${bankImport.statement_start_date ?? '?'} – ${bankImport.statement_end_date ?? '?'}`}
                value={
                  bankImport.closing_balance_cents != null
                    ? formatRands(bankImport.closing_balance_cents)
                    : '—'
                }
              />
            ))}

            <button
              type="button"
              onClick={onImportFNB}
              style={{
                alignSelf: 'flex-start',
                appearance: 'none',
                border: '1px solid var(--line)',
                borderRadius: 7,
                background: 'var(--paper-raised)',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 700,
                marginTop: 4,
                padding: '9px 12px',
              }}
            >
              Import another FNB statement
            </button>
          </div>
        )}
      </SectionCard>

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
          unpaidPayouts.slice(0, 8).map((payout) => (
            <FigureRow
              key={payout.id}
              label={`${payout.payout_date ?? 'Pending'} · ${payout.status}`}
              value={formatRands(payout.net_amount_cents)}
            />
          ))
        )}

        {unpaidPayouts.length > 8 && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '8px 0 0' }}>
            +{unpaidPayouts.length - 8} more
          </p>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Exception queue"
        title={`${needsAttention.length} ${needsAttention.length === 1 ? 'item needs' : 'items need'} review`}
      >
        {needsAttention.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
            Nothing outstanding.
          </p>
        ) : (
          <div style={{ border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden' }}>
            {needsAttention.slice(0, 25).map((match, index) => (
              <div
                key={match.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderTop: index === 0 ? 'none' : '1px solid var(--line)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5 }}>{MATCH_TYPE_LABELS[match.match_type]}</div>

                  {match.notes && (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {match.notes}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {match.matched_amount_cents != null && (
                    <span className="tabular" style={{ fontSize: 13, fontWeight: 600 }}>
                      {formatRands(match.matched_amount_cents)}
                    </span>
                  )}

                  <Pill label={STATUS_TONE[match.status].label} tone={STATUS_TONE[match.status].tone} />
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

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'clay' | 'neutral'
}) {
  const color = {
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
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--ink-soft)',
        }}
      >
        {label}
      </div>

      <div
        className="tabular"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          color,
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  )
}
