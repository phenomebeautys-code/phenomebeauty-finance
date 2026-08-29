import { useState } from 'react';
import { signInWithEmail } from '../lib/auth';
import type { AuthError } from '@supabase/supabase-js';

export function Login({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthError | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await signInWithEmail(email.trim(), password);
    
    if (signInError) {
      setError(signInError);
      setLoading(false);
    } else {
      onLoginSuccess();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f5f5f5',
      padding: 20
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          padding: 32,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: 360
        }}
      >
        <h1 style={{ margin: '0 0 24px', fontSize: 24, textAlign: 'center' }}>
          Phenome Beauty Finance
        </h1>
        
        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14
          }}>
            {error.message}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="email"
            style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 16,
              boxSizing: 'border-box'
            }}
            placeholder="you@example.com"
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="password"
            style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 16,
              boxSizing: 'border-box'
            }}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: loading ? '#9ca3af' : '#111827',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{
          marginTop: 16,
          fontSize: 13,
          color: '#6b7280',
          textAlign: 'center'
        }}>
          Use your Supabase auth credentials to access finance data.
        </p>
      </form>
    </div>
  );
}
