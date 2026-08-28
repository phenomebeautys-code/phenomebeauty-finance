import type { LineType } from '../lib/types'

const COLORS: Partial<Record<LineType, string>> = {
  service: 'var(--rose)',
  call_out: 'var(--slate)',
  product: 'var(--clay)',
  delivery: 'var(--clay)',
  discount: 'var(--line-strong)',
  refund: 'var(--line-strong)',
}

interface Segment {
  line_type: LineType
  amount_cents: number
}

export function SplitBar({ segments, height = 10 }: { segments: Segment[]; height?: number }) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.amount_cents, 0), 0)

  if (total <= 0) {
    return (
      <div
        style={{
          height,
          borderRadius: 999,
          background: 'var(--line)',
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        height,
        borderRadius: 999,
        overflow: 'hidden',
        background: 'var(--line)',
        border: '1px solid var(--paper)',
      }}
      role="img"
      aria-label={segments
        .map((s) => `${s.line_type.replace('_', ' ')} ${Math.round((s.amount_cents / total) * 100)} percent`)
        .join(', ')}
    >
      {segments
        .filter((s) => s.amount_cents > 0)
        .map((s, i) => (
          <div
            key={`${s.line_type}-${i}`}
            style={{
              width: `${(s.amount_cents / total) * 100}%`,
              background: COLORS[s.line_type] ?? 'var(--ink-soft)',
            }}
          />
        ))}
    </div>
  )
}
