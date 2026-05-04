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
// Fires INITIAL_SESSION on load and SIGNED_IN when the implicit-flow hash token is detected.
supabase.auth.onAuthStateChange((_, session) => {
  authStore.session = session;
  authStore.loading = false;
});
