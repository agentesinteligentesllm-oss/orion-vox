import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

class AuthState {
  session = $state<Session | null>(null);
  loading = $state(true);

  get user(): User | null {
    return this.session?.user ?? null;
  }

  get isAuthenticated(): boolean {
    return this.session !== null;
  }
}

export const authStore = new AuthState();

// onAuthStateChange is the single source of truth for auth state.
// It fires INITIAL_SESSION after SDK initialization — including AFTER any PKCE code
// exchange completes. This means loading stays true during the exchange, preventing
// the route guard from incorrectly redirecting to login while the session is being established.
supabase.auth.onAuthStateChange((_, session) => {
  authStore.session = session;
  authStore.loading = false;
});
