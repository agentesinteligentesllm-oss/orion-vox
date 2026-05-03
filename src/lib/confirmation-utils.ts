import type { Plan, PlanFilter } from './contracts/plan-schema.ts';

export interface UserConfirmSettings {
  doubleConfirmDelete: boolean;
  doubleConfirmUpdateNoFilter: boolean;
}

export function shouldConfirm(plan: Plan): boolean {
  return plan.operation !== 'select';
}

export function requiresDoubleConfirm(plan: Plan, settings: UserConfirmSettings): boolean {
  if (plan.operation === 'delete' && settings.doubleConfirmDelete) return true;
  if (plan.operation === 'update' && settings.doubleConfirmUpdateNoFilter) return true;
  return false;
}

function renderFilterSql(f: PlanFilter): string {
  if (!('value' in f)) {
    return f.op === 'is_null' ? `"${f.column}" IS NULL` : `"${f.column}" IS NOT NULL`;
  }
  const opMap: Record<string, string> = {
    '=': '=',
    '!=': '!=',
    '<': '<',
    '>': '>',
    '<=': '<=',
    '>=': '>=',
    in: 'IN',
    not_in: 'NOT IN',
    like: 'LIKE',
    ilike: 'ILIKE',
  };
  const op = opMap[f.op] ?? f.op;
  const v = Array.isArray(f.value)
    ? `(${f.value.map(String).join(', ')})`
    : String(f.value ?? 'null');
  return `"${f.column}" ${op} ${v}`;
}

export function buildSqlPreview(plan: Plan): string {
  if (plan.operation === 'select') return '';
  const t = `"${plan.table}"`;
  if (plan.operation === 'insert') {
    const keys = Object.keys(plan.values);
    const cols = keys.map((c) => `"${c}"`).join(', ');
    const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
    return `INSERT INTO ${t}\n  (${cols})\nVALUES (${vals})`;
  }
  if (plan.operation === 'update') {
    const keys = Object.keys(plan.values);
    const sets = keys.map((c, i) => `  "${c}" = $${i + 1}`).join(',\n');
    const where = plan.filters.map(renderFilterSql).join('\n  AND ');
    return `UPDATE ${t}\nSET\n${sets}\nWHERE ${where}`;
  }
  const where = plan.filters.map(renderFilterSql).join('\n  AND ');
  return `DELETE FROM ${t}\nWHERE ${where}`;
}

export function buildWarnings(plan: Plan): string[] {
  if (plan.operation === 'delete') {
    return ['Esta operación es irreversible. Los datos eliminados no se pueden recuperar.'];
  }
  if (plan.operation === 'update') {
    return ['Esta operación modificará datos existentes.'];
  }
  return [];
}
