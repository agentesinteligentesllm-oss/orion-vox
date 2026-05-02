import type { Plan, PlanFilter } from './plan-schema.ts';

/**
 * Redact sensitive column values from SQL params.
 *
 * Param ordering mirrors query-builder.ts:
 *   SELECT  → [...filter_values, LIMIT]
 *   INSERT  → [...values]
 *   UPDATE  → [...values, ...filter_values]
 *   DELETE  → [...filter_values]
 *
 * is_null / is_not_null ops produce no param slot — skipped in index tracking.
 */
export function redactSqlParams(
  plan: Plan,
  params: unknown[],
  redactedCols: Set<string>,
): unknown[] {
  if (redactedCols.size === 0) return params;
  const result = [...params];

  if (plan.operation === 'insert') {
    const keys = Object.keys(plan.values);
    for (let i = 0; i < keys.length; i++) {
      const col = keys[i];
      if (col !== undefined && redactedCols.has(col.toLowerCase())) result[i] = '[REDACTED]';
    }
    return result;
  }

  if (plan.operation === 'update') {
    const keys = Object.keys(plan.values);
    for (let i = 0; i < keys.length; i++) {
      const col = keys[i];
      if (col !== undefined && redactedCols.has(col.toLowerCase())) result[i] = '[REDACTED]';
    }
    // filter params follow values — index starts at keys.length
    let idx = keys.length;
    for (const f of plan.filters) {
      if (f.op === 'is_null' || f.op === 'is_not_null') continue;
      if (redactedCols.has(f.column.toLowerCase())) result[idx] = '[REDACTED]';
      idx++;
    }
    return result;
  }

  // select / delete: filter params from index 0
  // For SELECT, LIMIT is appended last and is never a column value — not touched here.
  const filters: PlanFilter[] = plan.operation === 'select' ? (plan.filters ?? []) : plan.filters;
  let idx = 0;
  for (const f of filters) {
    if (f.op === 'is_null' || f.op === 'is_not_null') continue;
    if (redactedCols.has(f.column.toLowerCase())) result[idx] = '[REDACTED]';
    idx++;
  }
  return result;
}
