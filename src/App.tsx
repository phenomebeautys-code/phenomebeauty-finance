import { useEffect, useState } from 'react';
import { getSession, subscribeToAuthChanges, signOut } from './lib/auth';
import { useFinanceData } from './lib/useFinanceData';
import { useSales } from './lib/useSales';
import { useVehicleData } from './lib/useVehicleData';
import type { User } from '@supabase/supabase-js';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { NewSale } from './pages/NewSale';
import { SalesLedgerPage } from './pages/SalesLedgerPage';
import { Reconciliation } from './pages/Reconciliation';
import { SyncIntegrations } from './pages/SyncIntegrations';
import { ProtectedCash } from './pages/ProtectedCash';
import { ExpensesAndAdvances } from './pages/ExpensesAndAdvances';
import { VehicleMobility } from './pages/VehicleMobility';
import { OdometerCheckIn } from './pages/OdometerCheckIn';
import { BottomNav } from './components/BottomNav';
import './App.css';

type Page = 'overview' | 'new-sale' | 'sales-ledger' | 'reconciliation' | 'sync' | 'protected-cash' | 'expenses' | 'vehicle' | 'checkin';

function AuthenticatedApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const [currentPage, setCurrentPage] = useState<Page>('overview');
  
  const financeData = useFinanceData();
  const salesData = useSales();
  const vehicleData = useVehicleData();

  const handleNewSaleSaved = () => {
    // Refresh sales data after new sale
    salesData.refresh?.();
    setCurrentPage('overview');
  };

  const handleCheckInSaved = () => {
    // Refresh vehicle data after check-in
    vehicleData.refresh?.();
    setCurrentPage('overview');
  };

  const handleCheckInCancel = () => {
    setCurrentPage('vehicle');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <Overview {...financeData} />;
      case 'new-sale':
        return <NewSale onSaved={handleNewSaleSaved} />;
      case 'sales-ledger':
        return <SalesLedgerPage sales={salesData.sales} />;
      case 'reconciliation':
        return <Reconciliation matches={financeData.reconciliationMatches} bankImports={financeData.bankImports} payouts={financeData.payouts} />;
      case 'sync':
        return <SyncIntegrations syncRuns={financeData.syncRuns} />;
      case 'protected-cash':
        return <ProtectedCash pockets={financeData.pockets} snapshots={financeData.snapshots} />;
      case 'expenses':
        return <ExpensesAndAdvances expenses={financeData.expenses} advances={financeData.advances} />;
      case 'vehicle':
        return <VehicleMobility 
          vehicle={vehicleData.vehicle} 
          odometerEntries={vehicleData.odometerEntries} 
          trips={vehicleData.trips} 
          contributions={vehicleData.contributions} 
          callOutSummary={vehicleData.callOutSummary} 
          onCheckIn={() => setCurrentPage('checkin')} 
        />;
      case 'checkin':
        return <OdometerCheckIn 
          vehicle={vehicleData.vehicle!} 
          lastEntry={vehicleData.odometerEntries[0]} 
          onSaved={handleCheckInSaved} 
          onCancel={handleCheckInCancel} 
        />;
      default:
        return <Overview {...financeData} />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Phenome Beauty Finance</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={onSignOut} className="sign-out-btn">Sign out</button>
        </div>
      </header>
      <main className="app-main">
        {renderPage()}
      </main>
      <BottomNav currentPage={currentPage} onPageChange={setCurrentPage} />
    </div>
  );
}

export function App() {
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getSession().then((s) => {
      if (s) {
        setUser(s.user);
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    });

    const { subscription } = subscribeToAuthChanges((_event, s) => {
      if (s) {
        setUser(s.user);
        setAuthState('authenticated');
      } else {
        setUser(null);
        setAuthState('unauthenticated');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleLoginSuccess = () => {
    setAuthState('authenticated');
  };

  const handleSignOut = async () => {
    await signOut();
    setAuthState('unauthenticated');
  };

  if (authState === 'loading') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5'
      }}>
        <div style={{ fontSize: 16, color: '#6b7280' }}>Loading...</div>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <AuthenticatedApp user={user!} onSignOut={handleSignOut} />;
}
