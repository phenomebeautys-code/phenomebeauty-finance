import { useMemo, useState } from 'react'
import './App.css'
import { useSales } from './lib/useSales'
import { useFinanceData } from './lib/useFinanceData'
import { Overview } from './pages/Overview'
import { NewSale } from './pages/NewSale'
import { SalesLedgerPage } from './pages/SalesLedgerPage'
import { Reconciliation } from './pages/Reconciliation'
import { SyncIntegrations } from './pages/SyncIntegrations'
import { ProtectedCash } from './pages/ProtectedCash'
import { ExpensesAndAdvances } from './pages/ExpensesAndAdvances'
import { BottomNav, type Tab } from './components/BottomNav'

const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Overview',
  reconciliation: 'Reconciliation',
  'protected-cash': 'Protected Cash',
  expenses: 'Expenses & Advances',
  sync: 'Sync & Integrations',
  'new-sale': 'Record a sale',
  ledger: 'Transactions',
}

function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const { sales, loading, usingDemoData, refresh } = useSales()
  const finance = useFinanceData()

  const expected = useMemo(() => {
    const unpaid = finance.yocoPayouts.filter((p) => p.status !== 'paid')
    return {
      cents: unpaid.reduce((sum, p) => sum + p.net_amount_cents, 0),
      count: unpaid.length,
    }
  }, [finance.yocoPayouts])

  const reconciliationExceptions = useMemo(
    () => finance.reconciliationMatches.filter((m) => m.status === 'suggested' || m.status === 'broken').length,
    [finance.reconciliationMatches]
  )

  const syncStale = useMemo(() => {
    const last = finance.syncRuns[0]
    if (!last) return false
    return last.status === 'failed' || last.status === 'completed_with_errors'
  }, [finance.syncRuns])

  const isLoading = loading || finance.loading

  return (
    <>
      <header className="shell-header">
        <div>
          <h1 className="shell-title">
            Phenome<span>Beauty</span> Finance
          </h1>
          <p className="shell-subtitle">What can the business safely afford to do right now.</p>
        </div>
        <nav className="shell-tabs">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button key={t} className="shell-tab" data-active={tab === t} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>

      <main className="shell-main">
        {usingDemoData && (
          <div className="banner">
            Showing sample data. Connect a Supabase project in <code>.env</code> to record real sales.
          </div>
        )}
        {finance.error && (
          <div className="banner">Some finance data could not load: {finance.error}</div>
        )}

        {isLoading ? (
          <p style={{ color: 'var(--ink-soft)' }}>Loading financial position…</p>
        ) : (
          <>
            {tab === 'dashboard' && (
              <Overview
                sales={sales}
                expectedCents={expected.cents}
                expectedCount={expected.count}
                reconciliationExceptions={reconciliationExceptions}
                syncStale={syncStale}
              />
            )}
            {tab === 'new-sale' && <NewSale onSaved={refresh} />}
            {tab === 'ledger' && <SalesLedgerPage sales={sales} />}
            {tab === 'reconciliation' && (
              <Reconciliation
                matches={finance.reconciliationMatches}
                bankImports={finance.bankImports}
                payouts={finance.yocoPayouts}
              />
            )}
            {tab === 'protected-cash' && (
              <ProtectedCash pockets={finance.pockets} snapshots={finance.pocketSnapshots} />
            )}
            {tab === 'expenses' && (
              <ExpensesAndAdvances expenses={finance.expenses} advances={finance.advances} />
            )}
            {tab === 'sync' && <SyncIntegrations syncRuns={finance.syncRuns} />}
          </>
        )}
      </main>

      <footer className="shell-footer">
        <span>Revenue, Yoco payments/payouts, and reconciliation matches are live.</span>
        <span>FNB, Yoco Savings, vehicle, expenses and advances are wired up but awaiting data.</span>
      </footer>

      <BottomNav tab={tab} onChange={setTab} />
    </>
  )
}

export default App
