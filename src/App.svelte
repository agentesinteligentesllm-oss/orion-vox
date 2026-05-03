<script lang="ts">
import AuditView from './components/AuditView.svelte';
import Config from './components/Config.svelte';
import VoiceScreen from './components/VoiceScreen.svelte';
import { authStore } from './lib/auth-store.svelte.ts';
import { router } from './lib/router.svelte.ts';

// Route guard — two cases:
// 1. Not authenticated and not already at the login wizard → send to config+firstTime
// 2. Authenticated but firstTime still set (e.g. cross-tab login) → go to voice
$effect(() => {
  if (authStore.loading) return;
  if (!authStore.isAuthenticated && !(router.mode === 'config' && router.firstTime)) {
    router.navigate('config', { firstTime: true });
  } else if (authStore.isAuthenticated && router.firstTime) {
    router.navigate('voice');
  }
});
</script>

{#if authStore.loading}
  <div class="flex min-h-dvh items-center justify-center bg-gray-950 text-gray-100">
    <p class="text-gray-400">Cargando…</p>
  </div>
{:else if router.mode === 'config'}
  <Config />
{:else if router.mode === 'audit'}
  <AuditView />
{:else}
  <VoiceScreen />
{/if}
