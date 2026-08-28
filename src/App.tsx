import { useState } from 'react'
import './App.css'
import { useSales } from './lib/useSales'
import { Dashboard } from './pages/Dashboard'
import { NewSale } from './pages/NewSale'
import { SalesLedgerPage } from './pages/SalesLedgerPage'
import { BottomNav } from './components/BottomNav'

type Tab = 'dashboard' | 'new-sale' | 'ledger'

function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const { sales, loading, usingDemoData, refresh } = useSales()

  return (
    <>
      <header className="shell-header">
        <div>
          <h1 className="shell-title">
            Phenome<span>Beauty</span> Finance
          </h1>
          <p className="shell-subtitle">Service revenue and product revenue, from the same till.</p>
        </div>
        <nav className="shell-tabs">
          <button className="shell-tab" data-active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className="shell-tab" data-active={tab === 'new-sale'} onClick={() => setTab('new-sale')}>
            Record a sale
          </button>
          <button className="shell-tab" data-active={tab === 'ledger'} onClick={() => setTab('ledger')}>
            All sales
          </button>
        </nav>
      </header>

      <main className="shell-main">
        {usingDemoData && (
          <div className="banner">
            Showing sample data. Connect a Supabase project in <code>.env</code> to record real sales.
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard sales={sales} />}
            {tab === 'new-sale' && <NewSale onSaved={refresh} />}
            {tab === 'ledger' && <SalesLedgerPage sales={sales} />}
          </>
        )}
      </main>

      <footer className="shell-footer">
        <span>Phase 1: manual capture, reconciled by hand before anything is automated.</span>
        <span>Yoco and NextSlot syncing come later, once this model runs clean for a few weeks.</span>
      </footer>

      <BottomNav tab={tab} onChange={setTab} />
    </>
  )
}

export default App
