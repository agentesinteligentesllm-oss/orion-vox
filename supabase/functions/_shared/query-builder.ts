import type { Plan, PlanFilter } from './plan-schema.ts';

export interface BuildResult {
  sql: string;
  params: unknown[];
}

export function buildQuery(plan: Plan): BuildResult {
  switch (plan.operation) {
    case 'select':
      return buildSelect(plan);
    case 'insert':
      return buildInsert(plan);
    case 'update':
      return buildUpdate(plan);
    case 'delete':
      return buildDelete(plan);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quoteIdent(s: string): string {
  // Handles table.column notation ("tareas"."id") and plain identifiers ("id")
  if (s.includes('.')) {
    return s
      .split('.')
      .map((p) => `"${p.replace(/"/g, '""')}"`)
      .join('.');
  }
  return `"${s.replace(/"/g, '""')}"`;
}

type FilterClause = { clause: string; nextIdx: number };

function applyFilter(f: PlanFilter, idx: number, params: unknown[]): FilterClause {
  const col = quoteIdent(f.column);

  if (f.op === 'is_null') return { clause: `${col} IS NULL`, nextIdx: idx };
  if (f.op === 'is_not_null') return { clause: `${col} IS NOT NULL`, nextIdx: idx };

  // Remaining ops all carry a value — safe assertion after null-op early returns
  const val = (f as { column: string; op: string; value: unknown }).value;
  params.push(val);

  switch (f.op) {
    case 'in':
      return { clause: `${col} = ANY($${idx})`, nextIdx: idx + 1 };
    case 'not_in':
      return { clause: `${col} != ALL($${idx})`, nextIdx: idx + 1 };
    case 'like':
      return { clause: `${col} LIKE $${idx}`, nextIdx: idx + 1 };
    case 'ilike':
      return { clause: `${col} ILIKE $${idx}`, nextIdx: idx + 1 };
    default:
      // =, !=, <, >, <=, >= — valid SQL operators used verbatim
      return { clause: `${col} ${f.op} $${idx}`, nextIdx: idx + 1 };
  }
}

function buildWhere(
  filters: PlanFilter[] | undefined,
  startIdx: number,
  params: unknown[],
): { clause: string; nextIdx: number } {
  if (!filters || filters.length === 0) return { clause: '', nextIdx: startIdx };
  const parts: string[] = [];
  let idx = startIdx;
  for (const f of filters) {
    const { clause, nextIdx } = applyFilter(f, idx, params);
    parts.push(clause);
    idx = nextIdx;
  }
  return { clause: ` WHERE ${parts.join(' AND ')}`, nextIdx: idx };
}

// ─── Operation builders ───────────────────────────────────────────────────────

type SelectPlan = Extract<Plan, { operation: 'select' }>;
type InsertPlan = Extract<Plan, { operation: 'insert' }>;
type UpdatePlan = Extract<Plan, { operation: 'update' }>;
type DeletePlan = Extract<Plan, { operation: 'delete' }>;

function buildSelect(plan: SelectPlan): BuildResult {
  const params: unknown[] = [];
  let idx = 1;

  const cols =
    plan.columns && plan.columns.length > 0 ? plan.columns.map(quoteIdent).join(', ') : '*';

  let sql = `SELECT ${cols} FROM ${quoteIdent(plan.table)}`;

  for (const j of plan.joins ?? []) {
    sql += ` INNER JOIN ${quoteIdent(j.table)} ON ${quoteIdent(j.on.left)} = ${quoteIdent(j.on.right)}`;
  }

  const { clause: where, nextIdx } = buildWhere(plan.filters, idx, params);
  sql += where;
  idx = nextIdx;

  if (plan.order_by && plan.order_by.length > 0) {
    const orderParts = plan.order_by.map((o) => `${quoteIdent(o.column)} ${o.dir.toUpperCase()}`);
    sql += ` ORDER BY ${orderParts.join(', ')}`;
  }

  params.push(plan.limit ?? 100);
  sql += ` LIMIT $${idx}`;

  return { sql, params };
}

function buildInsert(plan: InsertPlan): BuildResult {
  const params: unknown[] = [];
  const entries = Object.entries(plan.values);
  const cols = entries.map(([k]) => quoteIdent(k)).join(', ');
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
  for (const [, v] of entries) params.push(v);
  return {
    sql: `INSERT INTO ${quoteIdent(plan.table)} (${cols}) VALUES (${placeholders}) RETURNING *`,
    params,
  };
}

function buildUpdate(plan: UpdatePlan): BuildResult {
  const params: unknown[] = [];
  let idx = 1;
  const sets: string[] = [];
  for (const [k, v] of Object.entries(plan.values)) {
    params.push(v);
    sets.push(`${quoteIdent(k)} = $${idx}`);
    idx++;
  }
  const { clause: where } = buildWhere(plan.filters, idx, params);
  return {
    sql: `UPDATE ${quoteIdent(plan.table)} SET ${sets.join(', ')}${where}`,
    params,
  };
}

function buildDelete(plan: DeletePlan): BuildResult {
  const params: unknown[] = [];
  const { clause: where } = buildWhere(plan.filters, 1, params);
  return {
    sql: `DELETE FROM ${quoteIdent(plan.table)}${where}`,
    params,
  };
}
