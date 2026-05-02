import { PlanSchema } from '../_shared/plan-schema.ts';
import { buildQuery } from '../_shared/query-builder.ts';
import { redactSqlParams } from '../_shared/redact.ts';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  actual:   ${a}\n  expected: ${b}`);
}

function loadFixture(name: string): unknown {
  const url = new URL(`../../../tests/fixtures/plans/valid/${name}`, import.meta.url);
  return JSON.parse(Deno.readTextFileSync(url)) as unknown;
}

const PASSWORD_COLS = new Set(['password']);

Deno.test('[redact] UPDATE: redacts filter param when column is in redactedCols, leaves values untouched', () => {
  const plan = PlanSchema.parse(loadFixture('12-update-with-redacted-filter.json'));
  const { params } = buildQuery(plan);
  // params: ['new@example.com' (values.email), 'secret123' (filters[0].value = password)]
  const redacted = redactSqlParams(plan, params, PASSWORD_COLS);
  assertEqual(redacted[0], 'new@example.com', 'values.email — not in redactedCols');
  assertEqual(redacted[1], '[REDACTED]', 'filters[0].value — password in redactedCols');
  assertEqual(params[1], 'secret123', 'original params unchanged (defensive copy)');
});

Deno.test('[redact] SELECT: redacts filter param when column is in redactedCols, LIMIT untouched', () => {
  const plan = PlanSchema.parse(loadFixture('13-select-with-redacted-filter.json'));
  const { params } = buildQuery(plan);
  // params: ['secret123' (filters[0].value = password), 10 (LIMIT)]
  const redacted = redactSqlParams(plan, params, PASSWORD_COLS);
  assertEqual(redacted[0], '[REDACTED]', 'filters[0].value — password in redactedCols');
  assertEqual(redacted[1], 10, 'LIMIT — not a column value, not redacted');
});

Deno.test('[redact] returns original params unchanged when redactedCols is empty', () => {
  const plan = PlanSchema.parse(loadFixture('12-update-with-redacted-filter.json'));
  const { params } = buildQuery(plan);
  const redacted = redactSqlParams(plan, params, new Set());
  assertEqual(redacted, params, 'empty redactedCols — params unchanged');
});
