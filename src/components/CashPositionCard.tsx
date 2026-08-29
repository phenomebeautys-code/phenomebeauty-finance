// src/components/CashPositionCard.tsx
import { SourceBadge } from './SectionCard'
import { formatRands } from '../lib/money'

export function CashPositionCard({
  fnbCents,
  yocoSavingsCents,
  expectedPayoutCents,
  protectedCents,
  safeToUseCents,
}: {
  /** FNB operating balance from latest cash snapshot. */
  fnbCents: number
  /** Yoco Savings balance from latest cash snapshot. */
  yocoSavingsCents: number
  /** Expected Yoco payout (from snapshot or computed). */
  expectedPayoutCents: number
  /** Protected reserves (FNB floor + fuel buffer, etc.). */
  protectedCents: number
  /** Safe to use = (FNB + expected) − protected − committed. */
  safeToUseCents: number
}) {
  const hasCash = fnbCents > 0 || yocoSavingsCents > 0
  const availableCents = fnbCents + yocoSavingsCents

  return (
    <section
      style={{
        background: 'var(--paper-raised)',
        border: '1px solid var(--line)',
        borderTop: '3px solid var(--ink)',
        borderRadius: 8,
        padding: '20px 22px 22px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'var(--ink-soft)',
          }}
        >
          Business cash position
        </div>
        <SourceBadge state={hasCash ? 'live' : 'not_connected'} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 18,
          marginTop: 16,
        }}
      >
        <Figure
          label="Available now"
          hint="FNB operating cash + Yoco Savings"
          value={hasCash ? formatRands(availableCents) : '—'}
          muted={!hasCash}
        />
        <Figure
          label="Protected"
          hint="Reserves that are not for spending"
          value={protectedCents > 0 ? formatRands(protectedCents) : '—'}
          muted={protectedCents === 0}
        />
        <Figure
          label="Expected"
          hint="Yoco payouts not yet settled"
          value={expectedPayoutCents > 0 ? formatRands(expectedPayoutCents) : '—'}
          muted={expectedPayoutCents === 0}
        />
        <Figure
          label="Safe to use"
          hint="Available − protected − committed"
          value={hasCash ? formatRands(safeToUseCents) : '—'}
          muted={!hasCash}
        />
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '16px 0 0', lineHeight: 1.5 }}>
        {hasCash
          ? 'Cash position is live from your latest snapshot. Expected cash is computed from Yoco payouts not yet settled.'
          : 'Cash position needs FNB and Yoco Savings connected under Sync & Integrations. Once those are live, this card will show available, protected, expected and safe-to-use cash as separate figures — never combined into one number.'}
      </p>
    </section>
  )
}

function Figure({
  label,
  hint,
  value,
  muted,
}: {
  label: string
  hint: string
  value: string
  muted?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{label}</div>
      <div
        className="tabular"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: muted ? 'var(--ink-soft)' : 'var(--ink)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{hint}</div>
    </div>
  )
}
