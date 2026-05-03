<script lang="ts">
import { router } from '../lib/router.svelte.ts';
import { localStore } from '../lib/storage/local-store.ts';
import type { AuditMirrorEntry } from '../lib/storage/types.ts';

let entries = $state<AuditMirrorEntry[]>([]);
let loading = $state(true);
let expandedId = $state<string | null>(null);

const OP_LABELS: Record<string, string> = {
  select: 'CONSULTA',
  insert: 'INSERTAR',
  update: 'ACTUALIZAR',
  delete: 'ELIMINAR',
};

const OP_COLORS: Record<string, string> = {
  select: 'text-indigo-400 bg-indigo-900/30 border-indigo-800',
  insert: 'text-blue-400 bg-blue-900/30 border-blue-800',
  update: 'text-orange-400 bg-orange-900/30 border-orange-800',
  delete: 'text-red-400 bg-red-900/30 border-red-800',
};

async function loadEntries() {
  loading = true;
  try {
    const raw = await localStore.listAuditMirror({ limit: 50 });
    // mostrar más reciente primero
    entries = [...raw].sort((a, b) => b.ts.localeCompare(a.ts));
  } finally {
    loading = false;
  }
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

function getOperation(plan: unknown): string {
  return (plan as { operation?: string })?.operation ?? '?';
}

function getTable(plan: unknown): string {
  return (plan as { table?: string })?.table ?? '?';
}

function toggleExpand(id: string) {
  expandedId = expandedId === id ? null : id;
}

$effect(() => {
  loadEntries();
});
</script>

<div class="flex min-h-dvh flex-col bg-gray-950 text-gray-100">
  <!-- Header -->
  <header class="flex items-center gap-3 border-b border-gray-800 px-4 py-4">
    <button
      type="button"
      onclick={() => router.navigate('voice')}
      aria-label="Volver"
      class="rounded-full p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 active:bg-gray-700"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
      </svg>
    </button>
    <h1 class="flex-1 text-base font-bold text-gray-200">Auditoría local</h1>
    <button
      type="button"
      onclick={loadEntries}
      aria-label="Actualizar"
      class="rounded-full p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 active:bg-gray-700"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    </button>
  </header>

  <!-- Body -->
  <main class="flex-1 overflow-y-auto p-4">
    {#if loading}
      <p class="text-center text-sm text-gray-500">Cargando…</p>
    {:else if entries.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
        <p class="text-sm text-gray-500">Sin operaciones registradas en este dispositivo.</p>
        <p class="text-xs text-gray-600">Las operaciones confirmadas se guardan aquí localmente.</p>
      </div>
    {:else}
      <ul class="space-y-2">
        {#each entries as entry (entry.id)}
          {@const op = getOperation(entry.plan_json)}
          {@const table = getTable(entry.plan_json)}
          {@const isError = entry.error !== null}
          {@const isExpanded = expandedId === entry.id}
          <li class="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <!-- Row principal (siempre visible) -->
            <button
              type="button"
              onclick={() => toggleExpand(entry.id)}
              class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/50 active:bg-gray-800"
            >
              <!-- Badge operación -->
              <span class={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-bold ${isError ? 'border-red-800 bg-red-900/30 text-red-400' : (OP_COLORS[op] ?? 'border-gray-700 bg-gray-800 text-gray-400')}`}>
                {isError ? 'ERROR' : (OP_LABELS[op] ?? op.toUpperCase())}
              </span>

              <!-- Tabla + timestamp -->
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium text-gray-200">{table}</span>
                <span class="block text-xs text-gray-500">{formatTs(entry.ts)}</span>
              </span>

              <!-- Filas afectadas (si aplica) -->
              {#if entry.rows_affected !== undefined && !isError}
                <span class="shrink-0 text-xs text-gray-500">{entry.rows_affected} fila{entry.rows_affected !== 1 ? 's' : ''}</span>
              {/if}

              <!-- Chevron -->
              <span class="shrink-0 text-gray-600 text-xs" aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
            </button>

            <!-- Detalle expandible -->
            {#if isExpanded}
              <div class="border-t border-gray-800 px-4 py-3 space-y-3 text-sm">
                <!-- Prompt del usuario -->
                <div>
                  <p class="text-xs text-gray-500 mb-0.5">Comando</p>
                  <p class="text-gray-300">{entry.user_prompt || '(sin texto)'}</p>
                </div>

                <!-- Resultado o error -->
                {#if isError}
                  <div>
                    <p class="text-xs text-gray-500 mb-0.5">Error</p>
                    <p class="text-red-400">{entry.error}</p>
                  </div>
                {:else if entry.result_summary}
                  <div>
                    <p class="text-xs text-gray-500 mb-0.5">Resultado</p>
                    <p class="text-gray-300">{entry.result_summary}</p>
                  </div>
                {/if}

                <!-- Audit ID servidor -->
                {#if entry.server_audit_id}
                  <div>
                    <p class="text-xs text-gray-500 mb-0.5">Audit ID</p>
                    <p class="font-mono text-xs text-gray-600 break-all">{entry.server_audit_id}</p>
                  </div>
                {/if}

                <!-- Plan JSON colapsable -->
                <details class="rounded-lg border border-gray-800">
                  <summary class="cursor-pointer px-3 py-2 text-xs text-gray-500 hover:text-gray-300">
                    Ver plan JSON
                  </summary>
                  <pre class="overflow-x-auto whitespace-pre-wrap border-t border-gray-800 px-3 py-2 font-mono text-xs text-gray-500">{JSON.stringify(entry.plan_json, null, 2)}</pre>
                </details>
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      <p class="mt-4 text-center text-xs text-gray-600">
        {entries.length} entrada{entries.length !== 1 ? 's' : ''} en este dispositivo.
        Refrescá para ver los últimos cambios.
      </p>
    {/if}
  </main>
</div>
