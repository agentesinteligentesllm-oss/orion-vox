<script lang="ts">
import type { AuthError } from '@supabase/supabase-js';
import { localStore } from '../lib/storage/local-store.ts';
import type { Idioma } from '../lib/storage/types.ts';
import { supabase } from '../lib/supabase.ts';
import { validateEmail } from '../lib/utils.ts';

type UiState = 'idle' | 'sending' | 'sent' | 'error';

let email = $state('');
let password = $state('');
let selectedIdioma = $state<Idioma>('es-MX');
let uiState = $state<UiState>('idle');
let errorMsg = $state('');
let usePassword = $state(false);

function friendlyError(err: AuthError): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'No hay conexión. Probá cuando vuelvas a tener internet.';
  }
  if (err.message.toLowerCase().includes('rate') || err.status === 429) {
    return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  }
  if (err.message.toLowerCase().includes('invalid login') || err.status === 400) {
    return 'Email o contraseña incorrectos.';
  }
  return 'No se pudo iniciar sesión. Verificá tu email e intentá de nuevo.';
}

async function sendLink() {
  const trimmed = email.trim();
  if (!validateEmail(trimmed)) {
    errorMsg = 'Ingresá un email válido.';
    uiState = 'error';
    return;
  }
  uiState = 'sending';
  await localStore.putSetting('idioma', selectedIdioma);

  if (usePassword) {
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) {
      errorMsg = friendlyError(error);
      uiState = 'error';
    }
    // on success onAuthStateChange fires and App.svelte redirects to voice
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) {
    errorMsg = friendlyError(error);
    uiState = 'error';
  } else {
    uiState = 'sent';
  }
}
</script>

<div class="flex min-h-dvh flex-col items-center justify-center bg-gray-950 px-6 text-gray-100">
  <div class="w-full max-w-sm">
    <h1 class="mb-2 text-center text-4xl font-bold tracking-tight">Orion Vox</h1>
    <p class="mb-8 text-center text-sm text-gray-400">Tu puente de voz a Supabase.</p>

    {#if uiState === 'sent'}
      <div class="rounded-xl border border-gray-700 bg-gray-900 p-6 text-center">
        <p class="text-lg font-semibold">Revisá tu email</p>
        <p class="mt-2 text-sm text-gray-400">
          Te mandamos un enlace de acceso a <strong class="text-gray-200">{email.trim()}</strong>.
          Tap el link para continuar.
        </p>
        <button
          type="button"
          class="mt-4 text-sm text-gray-500 underline hover:text-gray-300"
          onclick={() => {
            uiState = 'idle';
          }}
        >
          Usar otro email
        </button>
      </div>
    {:else}
      <form
        onsubmit={(e) => {
          e.preventDefault();
          sendLink();
        }}
      >
        <label class="mb-1 block text-sm text-gray-400" for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          disabled={uiState === 'sending'}
          placeholder="tu@email.com"
          autocomplete="email"
          class="mb-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-600 focus:border-gray-500 focus:outline-none disabled:opacity-50"
        />

        {#if usePassword}
          <label class="mb-1 block text-sm text-gray-400" for="password">Contraseña</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            disabled={uiState === 'sending'}
            placeholder="••••••••"
            autocomplete="current-password"
            class="mb-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-600 focus:border-gray-500 focus:outline-none disabled:opacity-50"
          />
        {/if}

        <label class="mb-1 block text-sm text-gray-400" for="idioma">Idioma de voz</label>
        <select
          id="idioma"
          bind:value={selectedIdioma}
          disabled={uiState === 'sending'}
          class="mb-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 focus:border-gray-500 focus:outline-none disabled:opacity-50"
        >
          <option value="es-MX">Español · México</option>
          <option value="es-AR">Español · Argentina</option>
          <option value="es-ES">Español · España</option>
        </select>

        <button
          type="button"
          class="mb-3 text-sm text-gray-500 underline hover:text-gray-300"
          onclick={() => { usePassword = !usePassword; errorMsg = ''; uiState = 'idle'; }}
        >
          {usePassword ? 'Usar enlace de acceso' : 'Usar contraseña'}
        </button>

        {#if uiState === 'error'}
          <p class="mb-3 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
            {errorMsg}
          </p>
        {/if}

        <button
          type="submit"
          disabled={uiState === 'sending' || !email.trim() || (usePassword && !password)}
          class="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uiState === 'sending' ? 'Entrando…' : usePassword ? 'Entrar' : 'Enviar enlace de acceso'}
        </button>
      </form>
    {/if}
  </div>
</div>
