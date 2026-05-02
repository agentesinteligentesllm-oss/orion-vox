<script lang="ts">
import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import { validateEmail } from '../lib/utils.ts';

type UiState = 'idle' | 'sending' | 'sent' | 'error';

let email = $state('');
let uiState = $state<UiState>('idle');
let errorMsg = $state('');

function friendlyError(err: AuthError): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'No hay conexión. Probá cuando vuelvas a tener internet.';
  }
  if (err.message.toLowerCase().includes('rate') || err.status === 429) {
    return 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.';
  }
  return 'No se pudo enviar el enlace. Verificá tu email e intentá de nuevo.';
}

async function sendLink() {
  const trimmed = email.trim();
  if (!validateEmail(trimmed)) {
    errorMsg = 'Ingresá un email válido.';
    uiState = 'error';
    return;
  }
  uiState = 'sending';
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

        {#if uiState === 'error'}
          <p class="mb-3 rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
            {errorMsg}
          </p>
        {/if}

        <button
          type="submit"
          disabled={uiState === 'sending' || !email.trim()}
          class="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uiState === 'sending' ? 'Enviando…' : 'Enviar enlace de acceso'}
        </button>
      </form>
    {/if}
  </div>
</div>
