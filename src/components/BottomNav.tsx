import { useState } from 'react'
import { LedgerIcon, PlusCircleIcon, ListIcon } from './icons'

export type Tab =
  | 'dashboard'
  | 'vehicle'
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
          data-active={tab === 'vehicle'}
          onClick={() => onChange('vehicle')}
        >
          <span className="bottom-nav-icon">
            <CarIcon active={tab === 'vehicle'} />
          </span>
          Vehicle
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

function CarIcon({ active }: { active?: boolean }) {
  const stroke = active ? 'var(--rose)' : 'currentColor'
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 15.5V12l1.6-4.2A2 2 0 0 1 7.5 6.5h9a2 2 0 0 1 1.9 1.3L20 12v3.5"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="3" y="12" width="18" height="5" rx="1.4" stroke={stroke} strokeWidth="1.6" />
      <circle cx="7.5" cy="17.5" r="1.4" stroke={stroke} strokeWidth="1.6" />
      <circle cx="16.5" cy="17.5" r="1.4" stroke={stroke} strokeWidth="1.6" />
    </svg>
  )
}
