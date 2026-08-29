export type PillTone = 'good' | 'warn' | 'clay' | 'neutral' | 'rose'

const TONES: Record<PillTone, { bg: string; fg: string }> = {
  good: { bg: 'var(--good-soft)', fg: 'var(--good)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
  clay: { bg: 'var(--clay-soft)', fg: 'var(--clay)' },
  rose: { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
  neutral: { bg: 'var(--line)', fg: 'var(--ink-soft)' },
}

export function Pill({ label, tone }: { label: string; tone: PillTone }) {
  const c = TONES[tone]
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: c.fg,
        background: c.bg,
        padding: '3px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
