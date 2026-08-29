import { useState } from 'react'
import { LedgerIcon, PlusCircleIcon, ListIcon } from './icons'

export type Tab =
  | 'dashboard'
  | 'reconciliation'
  | 'protected-cash'
  | 'expenses'
  | 'sync'
  | 'new-sale'
  | 'ledger'

const MORE_TABS: { tab: Tab; label: string }[] = [
  { tab: 'reconciliation', label: 'Reconciliation' },
  { tab: 'protected-cash', label: 'Protected Cash' },
  { tab: 'expenses', label: 'Expenses & Advances' },
  { tab: 'sync', label: 'Sync & Integrations' },
]

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MORE_TABS.some((m) => m.tab === tab)

  return (
    <>
      {moreOpen && (
        <div className="more-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            {MORE_TABS.map((m) => (
              <button
                key={m.tab}
                type="button"
                className="more-sheet-item"
                data-active={tab === m.tab}
                onClick={() => {
                  onChange(m.tab)
                  setMoreOpen(false)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Primary">
        <button
          type="button"
          className="bottom-nav-item"
          data-active={tab === 'dashboard'}
          onClick={() => onChange('dashboard')}
        >
          <span className="bottom-nav-icon">
            <LedgerIcon active={tab === 'dashboard'} />
          </span>
          Home
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          data-active={tab === 'ledger'}
          onClick={() => onChange('ledger')}
        >
          <span className="bottom-nav-icon">
            <ListIcon active={tab === 'ledger'} />
          </span>
          Activity
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          data-active={tab === 'new-sale'}
          onClick={() => onChange('new-sale')}
        >
          <span className="bottom-nav-icon">
            <PlusCircleIcon active={tab === 'new-sale'} />
          </span>
          Record
        </button>
        <button
          type="button"
          className="bottom-nav-item"
          data-active={moreActive}
          onClick={() => setMoreOpen(true)}
        >
          <span className="bottom-nav-icon">
            <DotsIcon active={moreActive} />
          </span>
          More
        </button>
      </nav>
    </>
  )
}

function DotsIcon({ active }: { active?: boolean }) {
  const fill = active ? 'var(--rose)' : 'currentColor'
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="1.6" fill={fill} />
      <circle cx="12" cy="12" r="1.6" fill={fill} />
      <circle cx="18" cy="12" r="1.6" fill={fill} />
    </svg>
  )
}
