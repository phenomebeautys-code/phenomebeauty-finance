import { supabase } from './supabase';
import type { User, Session, AuthError } from '@supabase/supabase-js';

export type AuthState = 
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: User; session: Session };

export async function signInWithEmail(email: string, password: string): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export function subscribeToAuthChanges(
  callback: (event: string, session: Session | null) => void
): { subscription: { unsubscribe: () => void } } {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return { subscription };
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
