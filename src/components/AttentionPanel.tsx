import { SectionCard } from './SectionCard'

export interface AttentionItem {
  id: string
  label: string
  onClick?: () => void
}

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <SectionCard eyebrow="Attention" title="Nothing needs attention">
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
          No unmatched payments, missing receipts, or outstanding workflows right now.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard
      eyebrow="Attention"
      title={`${items.length} ${items.length === 1 ? 'item needs' : 'items need'} attention`}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <li key={item.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
            <button
              type="button"
              onClick={item.onClick}
              disabled={!item.onClick}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                padding: '10px 0',
                font: 'inherit',
                color: 'var(--ink)',
                cursor: item.onClick ? 'pointer' : 'default',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--warn)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13.5 }}>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
