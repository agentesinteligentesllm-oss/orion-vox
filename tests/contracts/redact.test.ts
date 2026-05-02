import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlanSchema } from '$shared/plan-schema';
import { buildQuery } from '$shared/query-builder';
import { redactSqlParams } from '$shared/redact';

const VALID_DIR = resolve(process.cwd(), 'tests/fixtures/plans/valid');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(VALID_DIR, name), 'utf-8')) as unknown;
}

const PASSWORD_COLS = new Set(['password']);

describe('redactSqlParams (Vitest)', () => {
  it('UPDATE: redacts filter param when column is in redactedCols, leaves values untouched', () => {
    const plan = PlanSchema.parse(loadFixture('12-update-with-redacted-filter.json'));
    const { params } = buildQuery(plan);
    // params: ['new@example.com' (values.email), 'secret123' (filters[0].value = password)]
    const redacted = redactSqlParams(plan, params, PASSWORD_COLS);
    expect(redacted[0]).toBe('new@example.com'); // values.email — not in redactedCols
    expect(redacted[1]).toBe('[REDACTED]'); // filters[0].value — password in redactedCols
    expect(params[1]).toBe('secret123'); // original params unchanged (defensive copy)
  });

  it('SELECT: redacts filter param when column is in redactedCols, LIMIT untouched', () => {
    const plan = PlanSchema.parse(loadFixture('13-select-with-redacted-filter.json'));
    const { params } = buildQuery(plan);
    // params: ['secret123' (filters[0].value = password), 10 (LIMIT)]
    const redacted = redactSqlParams(plan, params, PASSWORD_COLS);
    expect(redacted[0]).toBe('[REDACTED]'); // filters[0].value — password in redactedCols
    expect(redacted[1]).toBe(10); // LIMIT — not a column value, not redacted
  });

  it('returns original params unchanged when redactedCols is empty', () => {
    const plan = PlanSchema.parse(loadFixture('12-update-with-redacted-filter.json'));
    const { params } = buildQuery(plan);
    const redacted = redactSqlParams(plan, params, new Set());
    expect(redacted).toEqual(params);
  });
});
