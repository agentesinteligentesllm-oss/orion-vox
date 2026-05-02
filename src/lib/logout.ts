import { router } from './router.svelte.ts';
import { localStore } from './storage/local-store.ts';
import { supabase } from './supabase.ts';

export async function performLogout(): Promise<void> {
  await supabase.auth.signOut();
  await localStore.wipeAll();
  router.navigate('config', { firstTime: true });
}
