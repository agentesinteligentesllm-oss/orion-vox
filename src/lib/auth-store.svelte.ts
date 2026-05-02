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

// Fast hydration from persisted session
supabase.auth.getSession().then(({ data }) => {
  authStore.session = data.session;
  authStore.loading = false;
});

// Subscribe to all future auth state changes (login, logout, token refresh)
supabase.auth.onAuthStateChange((_, session) => {
  authStore.session = session;
  authStore.loading = false;
});
