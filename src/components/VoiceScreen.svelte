<script lang="ts">
import {
  PlanIntentClientError,
  type PlanIntentResponse,
  requestPlanIntent,
} from '../lib/api/plan-intent-client.ts';
import { planIntentErrorToMessage } from '../lib/api/plan-intent-messages.ts';
import { authStore } from '../lib/auth-store.svelte.ts';
import { router } from '../lib/router.svelte.ts';
import { localStore } from '../lib/storage/local-store.ts';
import type { Idioma } from '../lib/storage/types.ts';
import {
  VoiceInputController,
  type VoiceInputError,
  type VoiceInputState,
} from '../lib/voice/recognition.ts';
import { TtsOutputController } from '../lib/voice/synthesis.ts';

const recognition = new VoiceInputController();
const tts = new TtsOutputController();

let voiceState = $state<VoiceInputState>('idle');
let interimText = $state('');
let lastResult = $state('');
let errorInfo = $state<VoiceInputError | null>(null);
let showKeyboard = $state(false);
let keyboardInput = $state('');
let micPermission = $state<PermissionState | null>(null);
let planResponse = $state<PlanIntentResponse | null>(null);
let planError = $state<string | null>(null);

recognition.on('state', (s) => {
  voiceState = s;
  if (s === 'listening') {
    interimText = '';
    planResponse = null;
    planError = null;
    errorInfo = null;
  } else if (s === 'idle') {
    interimText = '';
    errorInfo = null;
  }
});
recognition.on('interim', (text) => {
  interimText = text;
});
recognition.on('result', async (text) => {
  lastResult = text;
  interimText = '';
  await callPlanIntent(text);
});
recognition.on('error', (err) => {
  errorInfo = err;
  if (err.code === 'unavailable' || err.code === 'not-allowed') showKeyboard = true;
});

async function callPlanIntent(text: string): Promise<void> {
  planResponse = null;
  planError = null;
  voiceState = 'processing';

  const token = authStore.session?.access_token;
  if (!token) {
    recognition.resetToIdle();
    router.navigate('config', { firstTime: true });
    return;
  }

  try {
    const response = await requestPlanIntent({
      accessToken: token,
      userPrompt: text,
      onUnauthorized: () => {
        router.navigate('config', { firstTime: true });
      },
    });
    planResponse = response;
  } catch (err) {
    const clientErr =
      err instanceof PlanIntentClientError
        ? err
        : new PlanIntentClientError({ code: 'internal', message: 'Error interno.' });
    const isAuthError = clientErr.code === 'unauthorized' || clientErr.code === 'invalid_token';
    if (!isAuthError) {
      planError = planIntentErrorToMessage(clientErr);
      tts.speak(`Hubo un error: ${planError}`);
    }
  } finally {
    recognition.resetToIdle();
  }
}

$effect(() => {
  localStore.getSetting<Idioma>('idioma').then((lang) => {
    if (lang) tts.selectVoiceForLang(lang);
  });
});

// Auto-listen: fires only when mode=voice, session active, and mic already granted.
// Avoids surprise permission prompt on first load.
$effect(() => {
  if (router.mode !== 'voice') return;
  if (!authStore.session) return;
  if (!navigator.permissions) return;

  navigator.permissions
    .query({ name: 'microphone' as PermissionName })
    .then((status) => {
      micPermission = status.state;
      status.onchange = () => {
        micPermission = status.state;
        if (status.state === 'granted' && voiceState === 'idle') {
          recognition.start();
        } else if (status.state === 'denied') {
          showKeyboard = true;
        }
      };
      if (status.state === 'granted' && voiceState === 'idle') {
        recognition.start();
      } else if (status.state === 'denied') {
        showKeyboard = true;
      }
    })
    .catch(() => {
      // Permission API unavailable — normal tap flow
    });
});

async function handleMicTap() {
  if (micPermission === 'denied') return;
  if (voiceState === 'idle' || voiceState === 'error') {
    errorInfo = null;
    tts.cancel();
    await recognition.start();
  } else if (voiceState === 'listening') {
    recognition.stop();
  }
}

function handleCancel() {
  recognition.cancel();
  tts.cancel();
  planResponse = null;
  planError = null;
}

async function handleKeyboardSubmit(e: SubmitEvent) {
  e.preventDefault();
  const text = keyboardInput.trim();
  if (!text) return;
  keyboardInput = '';
  lastResult = text;
  await callPlanIntent(text);
}

function goToSettings() {
  router.navigate('config');
}
</script>

<div class="flex min-h-dvh flex-col bg-gray-950 text-gray-100">
  <!-- Header -->
  <header class="flex items-center justify-between px-4 py-4">
    <h1 class="text-lg font-bold tracking-tight text-gray-200">Orion Vox</h1>
    <button
      type="button"
      onclick={goToSettings}
      aria-label="Configuración"
      class="rounded-full p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 active:bg-gray-700"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.28c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </button>
  </header>

  <!-- Main -->
  <main class="flex flex-1 flex-col items-center justify-center gap-8 p-6">
    <!-- Mic button -->
    <div class="relative flex flex-col items-center gap-6">
      <button
        type="button"
        onclick={handleMicTap}
        aria-label={voiceState === 'listening' ? 'Detener' : micPermission === 'prompt' ? 'Activar micrófono' : 'Hablar'}
        disabled={voiceState === 'processing' || micPermission === 'denied'}
        class={[
          'flex h-24 w-24 items-center justify-center rounded-full border-2 transition-colors duration-200',
          (voiceState === 'idle' && micPermission !== 'denied') && 'border-gray-600 bg-gray-800 text-gray-300 hover:border-indigo-500 hover:bg-indigo-900/30 hover:text-indigo-300 active:bg-indigo-900/50',
          micPermission === 'denied' && 'cursor-not-allowed border-gray-800 bg-gray-900 text-gray-700',
          voiceState === 'listening' && 'animate-pulse border-indigo-500 bg-indigo-900/40 text-indigo-300',
          voiceState === 'processing' && 'cursor-not-allowed border-gray-700 bg-gray-800 text-gray-500',
          voiceState === 'error' && 'border-red-700 bg-red-950/30 text-red-400 hover:border-red-500 hover:bg-red-900/40',
        ].filter(Boolean).join(' ')}
      >
        {#if voiceState === 'processing'}
          <!-- Spinner -->
          <svg class="h-10 w-10 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {:else if voiceState === 'error'}
          <!-- Warning icon -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        {:else}
          <!-- Mic icon -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        {/if}
      </button>

      <!-- State label -->
      <div class="min-h-6 text-center">
        {#if voiceState === 'idle'}
          {#if micPermission === 'denied'}
            <p class="max-w-xs text-center text-sm text-red-400">
              Permiso de micrófono denegado. Habilitalo en Ajustes del navegador o usá el teclado.
            </p>
          {:else if micPermission === 'prompt'}
            <p class="text-sm text-gray-400">Tocá para activar el micrófono.</p>
            <p class="mt-1 text-xs text-gray-600">El navegador pedirá permiso de micrófono.</p>
          {:else}
            <p class="text-sm text-gray-500">
              {lastResult ? 'Tocá para continuar.' : 'Listo para escucharte.'}
            </p>
          {/if}
        {:else if voiceState === 'listening'}
          <p class="text-sm font-medium text-indigo-400">Escuchando…</p>
        {:else if voiceState === 'processing'}
          <p class="text-sm text-gray-400">Pensando…</p>
        {:else if voiceState === 'error' && errorInfo}
          <p class="max-w-xs text-center text-sm text-red-400">{errorInfo.message}</p>
        {/if}
      </div>

      <!-- Interim text -->
      {#if interimText}
        <p class="max-w-xs text-center text-base text-gray-500 italic">{interimText}</p>
      {/if}

      <!-- Last result -->
      {#if lastResult && voiceState === 'idle'}
        <p class="max-w-xs rounded-xl border border-gray-800 bg-gray-900 px-4 py-2 text-center text-sm text-gray-300">
          {lastResult}
        </p>
      {/if}
    </div>

    <!-- Error de plan-intent (B4.2) -->
    {#if planError && voiceState === 'idle'}
      <div class="flex w-full max-w-sm items-start gap-3 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3">
        <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <p class="text-sm text-red-300">{planError}</p>
      </div>
    {/if}

    <!-- Respuesta del plan (B4.2 — B4.3 reemplaza el interior con PlanPreview.svelte) -->
    {#if planResponse && voiceState === 'idle'}
      {#if planResponse.kind === 'plan'}
        <div class="w-full max-w-sm rounded-xl border border-indigo-900 bg-indigo-950/30 px-4 py-3">
          <p class="text-xs font-medium uppercase tracking-wide text-indigo-400">
            {planResponse.plan.operation}
            <span class="mx-1 text-indigo-600" aria-hidden="true">→</span>
            {planResponse.plan.table}
          </p>
          <p class="mt-1 text-xs text-gray-500">Plan recibido. Confirmación pendiente.</p>
        </div>
      {:else}
        <div class="w-full max-w-sm rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3">
          <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-400">Necesito más información</p>
          <p class="text-sm text-gray-200">{planResponse.clarification.question}</p>
        </div>
      {/if}
    {/if}

    <!-- Cancel button (only when active) -->
    {#if voiceState === 'listening' || voiceState === 'processing'}
      <button
        type="button"
        onclick={handleCancel}
        class="rounded-lg border border-gray-700 bg-gray-800 px-6 py-2 text-sm text-gray-300 hover:bg-gray-700 active:bg-gray-600"
      >
        Cancelar
      </button>
    {/if}

    <!-- Keyboard fallback (always accessible) -->
    {#if showKeyboard}
      <form onsubmit={handleKeyboardSubmit} class="flex w-full max-w-sm gap-2">
        <input
          type="text"
          bind:value={keyboardInput}
          placeholder="Escribí tu comando…"
          class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          class="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 active:bg-indigo-800"
        >
          Enviar
        </button>
      </form>
    {:else}
      <button
        type="button"
        onclick={() => { showKeyboard = true; }}
        class="text-xs text-gray-600 underline-offset-2 hover:text-gray-400 hover:underline"
      >
        Usar teclado
      </button>
    {/if}
  </main>
</div>
