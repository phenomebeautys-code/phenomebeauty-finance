import { SourceBadge } from './SectionCard'

const FIGURES = [
  { key: 'available', label: 'Available now', hint: 'FNB operating cash + Yoco Savings' },
  { key: 'protected', label: 'Protected', hint: 'Reserves that are not for spending' },
  { key: 'expected', label: 'Expected', hint: 'Yoco payouts not yet settled' },
  { key: 'safe', label: 'Safe to use', hint: 'Available − protected − committed' },
] as const

/**
 * Hero card answering "what can the business safely do with its money right now".
 * Cash figures require FNB and Yoco Savings sync, which are not connected yet,
 * so this renders an honest not-connected state rather than a fabricated number.
 */
export function CashPositionCard() {
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
        {FIGURES.map((f) => (
          <div key={f.key}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>{f.label}</div>
            <div
              className="tabular"
              style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--ink-soft)' }}
            >
              —
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{f.hint}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '16px 0 0', lineHeight: 1.5 }}>
        Cash position needs FNB and Yoco Savings connected under Sync &amp; Integrations. Once
        those are live, this card will show available, protected, expected and safe-to-use cash
        as separate figures — never combined into one number.
      </p>
    </section>
  )
}
