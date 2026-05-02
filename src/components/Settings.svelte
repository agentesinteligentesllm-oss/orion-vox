<script lang="ts">
import { authStore } from '../lib/auth-store.svelte.ts';
import { performLogout } from '../lib/logout.ts';
import { localStore } from '../lib/storage/local-store.ts';
import type { Idioma, SchemaCacheEntry } from '../lib/storage/types.ts';

let idioma = $state<Idioma>('es-MX');
let readOnly = $state(false);
let dryRun = $state(false);
let doubleConfirmDelete = $state(true);
let doubleConfirmUpdateNoFilter = $state(true);
let schemaCache = $state<SchemaCacheEntry | null>(null);
let showConfirm = $state(false);
let loggingOut = $state(false);

$effect(() => {
  Promise.all([
    localStore.getSetting<Idioma>('idioma'),
    localStore.getSetting<boolean>('readOnly'),
    localStore.getSetting<boolean>('dryRun'),
    localStore.getSetting<boolean>('doubleConfirmDelete'),
    localStore.getSetting<boolean>('doubleConfirmUpdateNoFilter'),
    localStore.getSchemaCache(),
  ]).then(([i, ro, dr, dc, du, sc]) => {
    if (i !== null) idioma = i;
    if (ro !== null) readOnly = ro;
    if (dr !== null) dryRun = dr;
    if (dc !== null) doubleConfirmDelete = dc;
    if (du !== null) doubleConfirmUpdateNoFilter = du;
    schemaCache = sc;
  });
});

const user = $derived(authStore.user);

function shortId(id: string): string {
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function previewTTS() {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance('Hola, soy Orion');
  u.lang = idioma;
  speechSynthesis.speak(u);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

async function doLogout() {
  loggingOut = true;
  await performLogout();
}
</script>

<div class="flex min-h-dvh flex-col bg-gray-950 text-gray-100">
  <header class="border-b border-gray-800 px-4 py-4">
    <h1 class="text-xl font-bold">Configuración</h1>
  </header>

  <main class="flex-1 space-y-4 overflow-y-auto p-4">
    <!-- Sesión -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Sesión</h2>
      {#if user}
        <p class="text-sm text-gray-200">{user.email}</p>
        <p class="mt-1 font-mono text-xs text-gray-500">{shortId(user.id)}</p>
      {/if}
    </section>

    <!-- Idioma de voz -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Idioma de voz</h2>
      <div class="flex items-center gap-2">
        <select
          value={idioma}
          onchange={(e) => {
            const val = e.currentTarget.value as Idioma;
            idioma = val;
            localStore.putSetting('idioma', val);
          }}
          class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-gray-500 focus:outline-none"
        >
          <option value="es-MX">Español · México</option>
          <option value="es-AR">Español · Argentina</option>
          <option value="es-ES">Español · España</option>
        </select>
        <button
          type="button"
          onclick={previewTTS}
          class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 active:bg-gray-600"
        >
          Probar
        </button>
      </div>
    </section>

    <!-- Seguridad -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Seguridad</h2>
      <div class="space-y-3">
        <label class="flex items-center justify-between gap-4">
          <span class="text-sm text-gray-300">Modo solo lectura</span>
          <input
            type="checkbox"
            checked={readOnly}
            onchange={(e) => {
              readOnly = e.currentTarget.checked;
              localStore.putSetting('readOnly', readOnly);
            }}
            class="h-4 w-4 accent-indigo-500"
          />
        </label>
        <label class="flex items-center justify-between gap-4">
          <span class="text-sm text-gray-300">Dry run global</span>
          <input
            type="checkbox"
            checked={dryRun}
            onchange={(e) => {
              dryRun = e.currentTarget.checked;
              localStore.putSetting('dryRun', dryRun);
            }}
            class="h-4 w-4 accent-indigo-500"
          />
        </label>
        <label class="flex items-center justify-between gap-4">
          <span class="text-sm text-gray-300">Doble confirmación para DELETE</span>
          <input
            type="checkbox"
            checked={doubleConfirmDelete}
            onchange={(e) => {
              doubleConfirmDelete = e.currentTarget.checked;
              localStore.putSetting('doubleConfirmDelete', doubleConfirmDelete);
            }}
            class="h-4 w-4 accent-indigo-500"
          />
        </label>
        <label class="flex items-center justify-between gap-4">
          <span class="text-sm text-gray-300">Doble confirmación para UPDATE sin filtros estrictos</span>
          <input
            type="checkbox"
            checked={doubleConfirmUpdateNoFilter}
            onchange={(e) => {
              doubleConfirmUpdateNoFilter = e.currentTarget.checked;
              localStore.putSetting('doubleConfirmUpdateNoFilter', doubleConfirmUpdateNoFilter);
            }}
            class="h-4 w-4 accent-indigo-500"
          />
        </label>
      </div>
    </section>

    <!-- Schema cache -->
    <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Schema cache</h2>
      {#if schemaCache}
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500">Hash</dt>
            <dd class="font-mono text-xs text-gray-300">{schemaCache.schema_hash.slice(0, 12)}…</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-gray-500">Generado</dt>
            <dd class="text-xs text-gray-300">{formatDate(schemaCache.generated_at)}</dd>
          </div>
        </dl>
      {:else}
        <p class="text-sm text-gray-500">Sin cache. Se generará en la primera llamada a plan-intent.</p>
      {/if}
      <button
        type="button"
        disabled
        class="mt-3 w-full cursor-not-allowed rounded-lg border border-gray-800 bg-gray-800 px-3 py-2 text-sm text-gray-600"
      >
        Refrescar schema (disponible en T1.6)
      </button>
    </section>
    <!-- Zona peligrosa -->
    <section class="rounded-xl border border-red-900/40 bg-gray-900 p-4">
      <h2 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Zona peligrosa</h2>
      <button
        type="button"
        onclick={() => {
          showConfirm = true;
        }}
        class="w-full rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400 hover:bg-red-900/50 active:bg-red-900/70"
      >
        Cerrar sesión y borrar caché local
      </button>
    </section>
  </main>
</div>

{#if showConfirm}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
    <div class="w-full max-w-sm rounded-t-2xl border border-gray-700 bg-gray-900 p-6 sm:rounded-2xl">
      <p class="text-sm text-gray-200">
        Esto cierra sesión y borra el caché local de schema y auditoría. ¿Seguro?
      </p>
      <div class="mt-5 flex gap-3">
        <button
          type="button"
          onclick={() => {
            showConfirm = false;
          }}
          disabled={loggingOut}
          class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onclick={doLogout}
          disabled={loggingOut}
          class="flex-1 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          {loggingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  </div>
{/if}
