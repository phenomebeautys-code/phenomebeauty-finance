import type { ReactNode } from 'react'

export function SectionCard({
  eyebrow,
  title,
  status,
  action,
  children,
}: {
  eyebrow: string
  title?: string
  status?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--paper-raised)',
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '18px 20px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: title ? 4 : 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--ink-soft)',
            }}
          >
            {eyebrow}
          </div>
          {title && (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, marginTop: 4 }}>
              {title}
            </div>
          )}
        </div>
        {status}
      </div>
      {children}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </section>
  )
}

/** Small pill communicating whether a section's data source is live or not yet connected. */
export function SourceBadge({ state }: { state: 'live' | 'not_connected' | 'stale' }) {
  const styles = {
    live: { bg: 'var(--good-soft)', fg: 'var(--good)', label: 'Live' },
    stale: { bg: 'var(--warn-soft)', fg: 'var(--warn)', label: 'Needs sync' },
    not_connected: { bg: 'var(--line)', fg: 'var(--ink-soft)', label: 'Not connected yet' },
  }[state]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: styles.fg,
        background: styles.bg,
        padding: '3px 9px',
        borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      {styles.label}
    </span>
  )
}

/** A label/value row used inside cash, weekly, vehicle, and reserve cards. */
export function FigureRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string
  value: string
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '7px 0',
        borderBottom: '1px solid var(--line)',
        opacity: muted ? 0.6 : 1,
      }}
    >
      <span style={{ fontSize: 13, color: emphasis ? 'var(--ink)' : 'var(--ink-soft)' }}>{label}</span>
      <span
        className="tabular"
        style={{ fontSize: 13, fontWeight: emphasis ? 700 : 600, whiteSpace: 'nowrap' }}
      >
        {value}
      </span>
    </div>
  )
}

/** Placeholder shown in place of figures the app cannot compute until a source is connected. */
export function NotConnectedNote({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  )
}
