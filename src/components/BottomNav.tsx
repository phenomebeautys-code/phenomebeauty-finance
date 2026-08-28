import { LedgerIcon, PlusCircleIcon, ListIcon } from './icons'

type Tab = 'dashboard' | 'new-sale' | 'ledger'

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
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
        Dashboard
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
        data-active={tab === 'ledger'}
        onClick={() => onChange('ledger')}
      >
        <span className="bottom-nav-icon">
          <ListIcon active={tab === 'ledger'} />
        </span>
        All sales
      </button>
    </nav>
  )
}
