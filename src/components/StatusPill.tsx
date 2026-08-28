import type { ReconciliationStatus } from '../lib/types'

const STYLES: Record<ReconciliationStatus, { bg: string; fg: string; label: string }> = {
  matched: { bg: 'var(--good-soft)', fg: 'var(--good)', label: 'Matched' },
  partly_matched: { bg: 'var(--warn-soft)', fg: 'var(--warn)', label: 'Partly matched' },
  awaiting_review: { bg: 'var(--clay-soft)', fg: 'var(--clay)', label: 'Awaiting review' },
  excluded: { bg: 'var(--line)', fg: 'var(--ink-soft)', label: 'Excluded' },
}

export function StatusPill({ status }: { status: ReconciliationStatus }) {
  const style = STYLES[status]
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: style.fg,
        background: style.bg,
        padding: '3px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  )
}
