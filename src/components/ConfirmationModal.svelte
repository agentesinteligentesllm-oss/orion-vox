<script lang="ts">
import type { Plan, PlanFilter } from '../lib/contracts/plan-schema.ts';

let {
  plan,
  sqlPreview,
  warnings,
  requiresDouble,
  onConfirm,
  onCancel,
}: {
  plan: Plan;
  sqlPreview: string;
  warnings: string[];
  requiresDouble: boolean;
  onConfirm(): void;
  onCancel(): void;
} = $props();

type ModalStep = 'waiting' | 'double' | 'confirming';

let step = $state<ModalStep>('waiting');
let sqlExpanded = $state(false);
let timeLeft = $state<number | null>(null);
let cancelBtn = $state<HTMLButtonElement | null>(null);

const OP_LABELS: Record<string, string> = {
  insert: 'INSERTAR',
  update: 'ACTUALIZAR',
  delete: 'ELIMINAR',
};

const HEADER_CLASSES: Record<string, string> = {
  insert: 'bg-blue-900/40 border-b border-blue-800',
  update: 'bg-orange-900/40 border-b border-orange-800',
  delete: 'bg-red-900/40 border-b border-red-800',
};

const HEADER_TEXT_CLASSES: Record<string, string> = {
  insert: 'text-blue-300',
  update: 'text-orange-300',
  delete: 'text-red-300',
};

const CONFIRM_BTN_CLASSES: Record<string, string> = {
  insert: 'bg-blue-700 hover:bg-blue-600 active:bg-blue-800',
  update: 'bg-orange-700 hover:bg-orange-600 active:bg-orange-800',
  delete: 'bg-red-700 hover:bg-red-600 active:bg-red-800',
};

function renderFilterLabel(f: PlanFilter): string {
  if (!('value' in f)) {
    return f.op === 'is_null' ? `${f.column} está vacío` : `${f.column} no está vacío`;
  }
  const opMap: Record<string, string> = {
    '=': '=',
    '!=': '≠',
    '<': '<',
    '>': '>',
    '<=': '≤',
    '>=': '≥',
    in: 'en',
    not_in: 'no en',
    like: 'como',
    ilike: 'como',
  };
  const v = Array.isArray(f.value) ? `[${f.value.join(', ')}]` : String(f.value ?? '');
  return `${f.column} ${opMap[f.op] ?? f.op} ${v}`;
}

function handleFirstConfirm() {
  if (step !== 'waiting') return;
  if (requiresDouble) {
    step = 'double';
  } else {
    step = 'confirming';
    onConfirm();
  }
}

function handleSecondConfirm() {
  if (step !== 'double') return;
  step = 'confirming';
  onConfirm();
}

function handleCancel() {
  onCancel();
}

$effect(() => {
  cancelBtn?.focus();
});

$effect(() => {
  const start = Date.now();
  const id = setInterval(() => {
    const elapsed = Date.now() - start;
    const remaining = Math.ceil((60_000 - elapsed) / 1000);
    timeLeft = remaining <= 10 ? Math.max(0, remaining) : null;
    if (elapsed >= 60_000) {
      clearInterval(id);
      handleCancel();
    }
  }, 500);
  return () => clearInterval(id);
});
</script>

<div
  role="dialog"
  aria-modal="true"
  aria-label="Confirmar operación"
  tabindex="-1"
  class="fixed inset-0 z-50 flex flex-col bg-gray-950"
  onkeydown={(e) => { if (e.key === 'Escape') handleCancel(); }}
>
  <!-- Header -->
  <header class={`px-4 py-4 ${HEADER_CLASSES[plan.operation] ?? ''}`}>
    {#if step === 'double'}
      <h2 class="text-lg font-bold text-gray-100">⚠ ¿Estás seguro?</h2>
    {:else}
      <h2 class={`text-lg font-bold ${HEADER_TEXT_CLASSES[plan.operation] ?? 'text-gray-100'}`}>
        ⚠ CONFIRMAR {OP_LABELS[plan.operation] ?? plan.operation.toUpperCase()}
      </h2>
    {/if}
  </header>

  <!-- Body -->
  <main class="flex-1 space-y-4 overflow-y-auto p-4">
    {#if step === 'double'}
      <p class="text-sm text-gray-200">Esta acción es irreversible.</p>
    {:else}
      <!-- Plan details -->
      <div class="space-y-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-500">Tabla</span>
          <span class="text-sm font-medium text-gray-100">{plan.table}</span>
        </div>

        {#if (plan.operation === 'update' || plan.operation === 'delete') && plan.filters.length > 0}
          <div>
            <p class="mb-1 text-xs text-gray-500">Filtros</p>
            <ul class="space-y-0.5">
              {#each plan.filters as f}
                <li class="text-sm text-gray-300">• {renderFilterLabel(f)}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if (plan.operation === 'insert' || plan.operation === 'update') && Object.keys(plan.values).length > 0}
          <div>
            <p class="mb-1 text-xs text-gray-500">Campos</p>
            <ul class="space-y-0.5">
              {#each Object.entries(plan.values) as [col, val]}
                <li class="text-sm text-gray-300">• {col} = {String(val ?? 'null')}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>

      <!-- Warnings -->
      {#if warnings.length > 0}
        <div class="space-y-2">
          {#each warnings as w}
            <div class="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2">
              <span class="shrink-0 text-amber-400" aria-hidden="true">⚠</span>
              <p class="text-sm text-amber-200">{w}</p>
            </div>
          {/each}
        </div>
      {/if}

      <!-- SQL preview (collapsible) -->
      <div class="rounded-xl border border-gray-800 bg-gray-900">
        <button
          type="button"
          onclick={() => { sqlExpanded = !sqlExpanded; }}
          class="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200"
        >
          <span>SQL preview</span>
          <span class="text-xs" aria-hidden="true">{sqlExpanded ? '▲' : '▼'}</span>
        </button>
        {#if sqlExpanded}
          <pre class="overflow-x-auto whitespace-pre-wrap border-t border-gray-800 px-4 py-3 font-mono text-xs text-gray-400">{sqlPreview}</pre>
        {/if}
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <footer class="space-y-3 border-t border-gray-800 p-4">
    {#if timeLeft !== null}
      <p class="text-center text-xs text-gray-500">Se cerrará en {timeLeft}s</p>
    {/if}

    {#if step === 'double'}
      <div class="flex gap-3">
        <button
          bind:this={cancelBtn}
          type="button"
          onclick={handleCancel}
          class="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-700 active:bg-gray-600"
        >
          NO, cancelar
        </button>
        <button
          type="button"
          onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          onclick={handleSecondConfirm}
          class={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white opacity-80 ${CONFIRM_BTN_CLASSES[plan.operation] ?? ''}`}
        >
          Sí, confirmar
        </button>
      </div>
    {:else}
      <div class="flex gap-3">
        <button
          bind:this={cancelBtn}
          type="button"
          onclick={handleCancel}
          class="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-700 active:bg-gray-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          onclick={handleFirstConfirm}
          disabled={step === 'confirming'}
          class={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white opacity-80 disabled:opacity-30 ${CONFIRM_BTN_CLASSES[plan.operation] ?? ''}`}
        >
          {step === 'confirming' ? 'Confirmando…' : 'Confirmar'}
        </button>
      </div>
    {/if}
  </footer>
</div>
