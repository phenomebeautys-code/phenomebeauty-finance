import { SourceBadge } from './SectionCard'
import { formatRands } from '../lib/money'

export function CashPositionCard({
  expectedCents,
  expectedCount,
}: {
  /** Sum of Yoco payouts not yet reflected as a bank credit (status !== paid). */
  expectedCents: number
  expectedCount: number
}) {
  const hasExpected = expectedCount > 0

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
        <SourceBadge state="not_connected" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 18,
          marginTop: 16,
        }}
      >
        <Figure label="Available now" hint="FNB operating cash + Yoco Savings" value="—" muted />
        <Figure label="Protected" hint="Reserves that are not for spending" value="—" muted />
        <Figure
          label="Expected"
          hint={
            hasExpected
              ? `${expectedCount} Yoco payout${expectedCount === 1 ? '' : 's'} not yet in the bank`
              : 'Yoco payouts not yet settled'
          }
          value={hasExpected ? formatRands(expectedCents) : '—'}
          muted={!hasExpected}
        />
        <Figure label="Safe to use" hint="Available − protected − committed" value="—" muted />
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '16px 0 0', lineHeight: 1.5 }}>
        {hasExpected
          ? 'Expected cash is live from Yoco payouts. Available, protected, and safe-to-use still need FNB and Yoco Savings connected under Sync & Integrations before they can be calculated.'
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
