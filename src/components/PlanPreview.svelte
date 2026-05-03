<script lang="ts">
import type { Plan, PlanFilter } from '../lib/contracts/plan-schema.ts';

let { plan }: { plan: Plan } = $props();

const OP_LABELS: Record<string, string> = {
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

const VERB: Record<Plan['operation'], string> = {
  select: 'Consultar',
  insert: 'Insertar',
  update: 'Actualizar',
  delete: 'Eliminar',
};

function renderFilter(f: PlanFilter): string {
  if (!('value' in f)) {
    return f.op === 'is_null' ? `${f.column} está vacío` : `${f.column} no está vacío`;
  }
  const v = f.value;
  const val = Array.isArray(v) ? `[${v.join(', ')}]` : String(v ?? '');
  return `${f.column} ${OP_LABELS[f.op] ?? f.op} ${val}`;
}

function buildSummary(p: Plan): string {
  if (p.operation === 'select') {
    const qty = p.limit === 1 ? '1 registro' : `${p.limit} registros`;
    const base = `Voy a buscar ${qty} en "${p.table}"`;
    if (!p.filters?.length) return base;
    return `${base} donde ${p.filters.map(renderFilter).join(', ')}`;
  }
  if (p.operation === 'insert') {
    const n = Object.keys(p.values).length;
    return `Voy a agregar 1 registro en "${p.table}" con ${n} campo${n !== 1 ? 's' : ''}`;
  }
  if (p.operation === 'update') {
    return `Voy a actualizar registros en "${p.table}" donde ${p.filters.map(renderFilter).join(', ')}`;
  }
  return `Voy a eliminar registros en "${p.table}" donde ${p.filters.map(renderFilter).join(', ')}`;
}

const summary = $derived(buildSummary(plan));
const isWrite = $derived(plan.operation !== 'select');
const verb = $derived(VERB[plan.operation]);
</script>

<div class="w-full max-w-sm rounded-xl border border-indigo-900 bg-indigo-950/30 px-4 py-3">
  <div class="mb-2 flex items-center gap-2">
    <span class="text-xs font-medium uppercase tracking-wide text-indigo-400">{verb}</span>
    <span class="text-xs text-indigo-600" aria-hidden="true">→</span>
    <span class="text-xs font-medium text-indigo-300">{plan.table}</span>
  </div>
  <p class="text-sm text-gray-200">{summary}</p>
  {#if isWrite}
    <p class="mt-2 text-xs text-amber-400">Requiere confirmación antes de ejecutar.</p>
  {/if}
</div>
