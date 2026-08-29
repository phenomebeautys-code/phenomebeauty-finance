import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getSession, subscribeToAuthChanges, signOut } from './lib/auth';
import type { Session, User } from '@supabase/supabase-js';
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
import './App.css';

function AuthenticatedApp({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <BrowserRouter>
      <div className="app-container">
        <header className="app-header">
          <h1>Phenome Beauty Finance</h1>
          <div className="user-info">
            <span>{user.email}</span>
            <button onClick={onSignOut} className="sign-out-btn">Sign out</button>
          </div>
        </header>
        <nav className="app-nav">
          <a href="/">Overview</a>
          <a href="/new-sale">New Sale</a>
          <a href="/sales-ledger">Sales Ledger</a>
          <a href="/reconciliation">Reconciliation</a>
          <a href="/vehicle">Vehicle</a>
          <a href="/checkin">Check-in</a>
          <a href="/expenses">Expenses</a>
          <a href="/protected-cash">Protected Cash</a>
          <a href="/sync">Sync</a>
        </nav>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/new-sale" element={<NewSale />} />
            <Route path="/sales-ledger" element={<SalesLedgerPage />} />
            <Route path="/reconciliation" element={<Reconciliation />} />
            <Route path="/sync" element={<SyncIntegrations />} />
            <Route path="/protected-cash" element={<ProtectedCash />} />
            <Route path="/expenses" element={<ExpensesAndAdvances />} />
            <Route path="/vehicle" element={<VehicleMobility />} />
            <Route path="/checkin" element={<OdometerCheckIn />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
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
