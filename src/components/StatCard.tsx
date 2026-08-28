interface StatCardProps {
  label: string
  amount: string
  accent: 'rose' | 'slate' | 'clay'
  saleCount: number
}

const ACCENTS = {
  rose: { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
  slate: { bg: 'var(--slate-soft)', fg: 'var(--slate)' },
  clay: { bg: 'var(--clay-soft)', fg: 'var(--clay)' },
}

export function StatCard({ label, amount, accent, saleCount }: StatCardProps) {
  const colors = ACCENTS[accent]
  return (
    <div
      style={{
        background: 'var(--paper-raised)',
        border: '1px solid var(--line)',
        borderTop: `3px solid ${colors.fg}`,
        borderRadius: 6,
        padding: '18px 20px',
        flex: '1 1 200px',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: colors.fg,
          background: colors.bg,
          padding: '3px 8px',
          borderRadius: 4,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        className="tabular"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          lineHeight: 1.1,
        }}
      >
        {amount}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>
        {saleCount} {saleCount === 1 ? 'sale' : 'sales'} this month
      </div>
    </div>
  )
}
