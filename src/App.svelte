<script lang="ts">
import { onMount } from 'svelte';
import AuditView from './components/AuditView.svelte';
import Config from './components/Config.svelte';
import VoiceScreen from './components/VoiceScreen.svelte';
import { authStore } from './lib/auth-store.svelte.ts';
import { pwa } from './lib/pwa.svelte.ts';
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

onMount(() => {
  pwa.init();
});
</script>

{#if pwa.needsUpdate}
  <div class="fixed bottom-4 left-4 right-4 z-50 flex items-center justify-between rounded-xl bg-violet-700 px-4 py-3 text-white shadow-lg">
    <span class="text-sm">Nueva versión disponible</span>
    <button
      onclick={() => { void pwa.applyUpdate(); }}
      class="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-violet-700"
    >
      Actualizar
    </button>
  </div>
{/if}

{#if pwa.canInstall}
  <div class="fixed top-4 left-4 right-4 z-50 flex items-center justify-between rounded-xl bg-gray-800 px-4 py-3 text-white shadow-lg">
    <span class="text-sm">Instalar Orion Vox</span>
    <div class="flex gap-2">
      <button
        onclick={() => pwa.dismissInstall()}
        class="rounded-lg px-3 py-1 text-sm text-gray-400"
      >
        Ahora no
      </button>
      <button
        onclick={() => { void pwa.install(); }}
        class="rounded-lg bg-violet-600 px-3 py-1 text-sm font-semibold text-white"
      >
        Instalar
      </button>
    </div>
  </div>
{/if}

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
