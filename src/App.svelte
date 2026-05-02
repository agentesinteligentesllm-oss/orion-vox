<script lang="ts">
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
  <!-- B2.3: Config.svelte (LoginWizard when firstTime, Settings otherwise) -->
  <div class="flex min-h-dvh flex-col items-center justify-center bg-gray-950 text-gray-100">
    <h1 class="text-4xl font-bold tracking-tight">Orion Vox</h1>
    <p class="mt-2 text-gray-400">Configuración…</p>
  </div>
{:else}
  <!-- B3+: VoiceScreen.svelte goes here -->
  <div class="flex min-h-dvh flex-col items-center justify-center bg-gray-950 text-gray-100">
    <h1 class="text-4xl font-bold tracking-tight">Orion Vox</h1>
    <p class="mt-2 text-gray-400">Listo para escucharte.</p>
  </div>
{/if}
