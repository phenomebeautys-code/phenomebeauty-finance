import { useMemo, useState, useEffect } from 'react'
import './App.css'
import { useSales } from './lib/useSales'
import { useFinanceData } from './lib/useFinanceData'
import { useVehicleData } from './lib/useVehicleData'
import { getSession, subscribeToAuthChanges, signOut } from './lib/auth'
import type { User } from '@supabase/supabase-js'
import { Login } from './pages/Login'
import { Overview } from './pages/Overview'
import { NewSale } from './pages/NewSale'
import { SalesLedgerPage } from './pages/SalesLedgerPage'
import { Reconciliation } from './pages/Reconciliation'
import { SyncIntegrations } from './pages/SyncIntegrations'
import { ProtectedCash } from './pages/ProtectedCash'
import { ExpensesAndAdvances } from './pages/ExpensesAndAdvances'
import { VehicleMobility } from './pages/VehicleMobility'
import { OdometerCheckIn } from './pages/OdometerCheckIn'
import FNBImport from './pages/FNBImport'
import { BottomNav, type Tab } from './components/BottomNav'

type AppTab = Tab | 'fnb-import'

const TAB_LABELS: Record<AppTab, string> = {
  dashboard: 'Overview',
  vehicle: 'Vehicle & Mobility',
  reconciliation: 'Reconciliation',
  'fnb-import': 'Import FNB statement',
  'protected-cash': 'Protected Cash',
  expenses: 'Expenses & Advances',
  sync: 'Sync & Integrations',
  'new-sale': 'Record a sale',
  ledger: 'Transactions',
}

function AuthenticatedApp({ user }: { user: User }) {
  const [tab, setTab] = useState<AppTab>('dashboard')
  const [checkingIn, setCheckingIn] = useState(false)
  const [backfillWeek, setBackfillWeek] = useState<{ start: Date; end: Date } | null>(null)
  const { sales, loading, usingDemoData, refresh } = useSales()
  const finance = useFinanceData()
  const vehicleData = useVehicleData()

  const reconciliationExceptions = useMemo(
    () => finance.reconciliationMatches.filter((match) => match.status === 'suggested' || match.status === 'broken').length,
    [finance.reconciliationMatches]
  )

  const syncStale = useMemo(() => {
    const last = finance.syncRuns[0]

    if (!last) {
      return false
    }

    return last.status === 'failed' || last.status === 'completed_with_errors'
  }, [finance.syncRuns])

  const vehicleReserveCents = useMemo(
    () => vehicleData.contributions.reduce((sum, contribution) => sum + contribution.amount_cents, 0),
    [vehicleData.contributions]
  )

  const isLoading = loading || finance.loading || vehicleData.loading

  const handleSignOut = async () => {
    await signOut()
  }

  const handleBottomNavChange = (nextTab: Tab) => {
    setTab(nextTab)
  }

  return (
    <>
      <header className="shell-header">
        <div>
          <h1 className="shell-title">Phenomebeauty Finance</h1>
          <p className="shell-subtitle">What can the business safely afford to do right now.</p>
        </div>

        <div className="shell-user">
          <span>{user.email}</span>
          <button className="shell-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <nav className="shell-tabs">
          {(Object.keys(TAB_LABELS) as AppTab[]).map((currentTab) => (
            <button
              key={currentTab}
              className="shell-tab"
              data-active={tab === currentTab}
              onClick={() => setTab(currentTab)}
            >
              {TAB_LABELS[currentTab]}
            </button>
          ))}
        </nav>
      </header>

      <main className="shell-main">
        {usingDemoData && (
          <div className="banner">
            Showing sample data. Set the Vite Supabase variables to use production data.
          </div>
        )}

        {finance.error && (
          <div className="banner">
            Some finance data could not load: {finance.error}
          </div>
        )}

        {isLoading ? (
          <p style={{ color: 'var(--ink-soft)' }}>Loading financial position…</p>
        ) : (
          <>
            {tab === 'dashboard' && (
              <Overview
                sales={sales}
                reconciliationExceptions={reconciliationExceptions}
                syncStale={syncStale}
                vehicle={vehicleData.vehicle}
                vehicleReserveCents={vehicleReserveCents}
              />
            )}

            {tab === 'new-sale' && <NewSale onSaved={refresh} />}

            {tab === 'ledger' && <SalesLedgerPage sales={sales} onChanged={refresh} />}

            {tab === 'reconciliation' && (
              <Reconciliation
                matches={finance.reconciliationMatches}
                bankImports={finance.bankImports}
                payouts={finance.yocoPayouts}
                onImportFNB={() => setTab('fnb-import')}
              />
            )}

            {tab === 'fnb-import' && <FNBImport />}

            {tab === 'protected-cash' && (
              <ProtectedCash
                pockets={finance.pockets}
                snapshots={finance.pocketSnapshots}
              />
            )}

            {tab === 'expenses' && (
              <ExpensesAndAdvances
                expenses={finance.expenses}
                advances={finance.advances}
              />
            )}

            {tab === 'sync' && <SyncIntegrations syncRuns={finance.syncRuns} />}

            {tab === 'vehicle' &&
              ((checkingIn || backfillWeek) && vehicleData.vehicle ? (
                <OdometerCheckIn
                  vehicle={vehicleData.vehicle}
                  odometerEntries={vehicleData.odometerEntries}
                  targetWeek={backfillWeek ?? undefined}
                  onSaved={() => {
                    setCheckingIn(false)
                    setBackfillWeek(null)
                    vehicleData.refresh()
                  }}
                  onCancel={() => {
                    setCheckingIn(false)
                    setBackfillWeek(null)
                  }}
                />
              ) : (
                <VehicleMobility
                  vehicle={vehicleData.vehicle}
                  odometerEntries={vehicleData.odometerEntries}
                  trips={vehicleData.trips}
                  contributions={vehicleData.contributions}
                  callOutSummary={vehicleData.callOutSummary}
                  onCheckIn={() => setCheckingIn(true)}
                  onBackfillWeek={(week) => setBackfillWeek(week)}
                />
              ))}
          </>
        )}
      </main>

      <footer className="shell-footer">
        <span>Revenue, Yoco payments/payouts, reconciliation matches, and vehicle settlement are live.</span>
        <span>FNB, Yoco Savings, expenses and advances are wired up but awaiting data.</span>
      </footer>

      <BottomNav
        tab={tab === 'fnb-import' ? 'reconciliation' : tab}
        onChange={handleBottomNavChange}
      />
    </>
  )
}

function App() {
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true

    getSession().then((session) => {
      if (!active) {
        return
      }

      setUser(session?.user ?? null)
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })

    const { subscription } = subscribeToAuthChanges((_event, session) => {
      if (!active) {
        return
      }

      setUser(session?.user ?? null)
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (authState === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
        }}
      >
        <div style={{ fontSize: 16, color: '#6b7280' }}>Loading…</div>
      </div>
    )
  }

  if (authState === 'unauthenticated' || !user) {
    return <Login onLoginSuccess={() => undefined} />
  }

  return <AuthenticatedApp user={user} />
}

export default App
