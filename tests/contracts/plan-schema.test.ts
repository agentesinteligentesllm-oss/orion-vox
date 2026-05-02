import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_FILTER_OPS, PlanSchema } from '$shared/plan-schema';

// Passes Zod schema — rejected by execute-plan business-rule (multi-statement detection)
const SCHEMA_VALID_INVALIDS = new Set(['01-multi-statement-in-value.json']);

function loadFixtures(dir: string): Array<{ name: string; data: unknown }> {
  return globSync(`${dir}/*.json`)
    .sort()
    .map((file) => ({
      name: file.split(/[/\\]/).pop() ?? file,
      data: JSON.parse(readFileSync(file, 'utf-8')) as unknown,
    }));
}

describe('PlanSchema — fixture validation', () => {
  const validFixtures = loadFixtures('tests/fixtures/plans/valid');
  const invalidFixtures = loadFixtures('tests/fixtures/plans/invalid');

  describe('valid fixtures must parse successfully', () => {
    for (const { name, data } of validFixtures) {
      it(name, () => {
        const result = PlanSchema.safeParse(data);
        const errMsg = result.success ? '' : result.error.message;
        expect(result.success, `${name} failed: ${errMsg}`).toBe(true);
      });
    }
  });

  describe('invalid fixtures', () => {
    for (const { name, data } of invalidFixtures) {
      if (SCHEMA_VALID_INVALIDS.has(name)) {
        it(`${name} — passes schema (business-rule rejection only)`, () => {
          const result = PlanSchema.safeParse(data);
          expect(result.success, `${name} should pass schema`).toBe(true);
        });
      } else {
        it(`${name} — must fail schema`, () => {
          const result = PlanSchema.safeParse(data);
          expect(result.success, `${name} should NOT parse`).toBe(false);
        });
      }
    }
  });

  it('valid fixtures cover all 12 filter ops (ALL_FILTER_OPS)', () => {
    const coveredOps = new Set<string>();
    for (const { data } of validFixtures) {
      const raw = data as Record<string, unknown>;
      if (Array.isArray(raw.filters)) {
        for (const f of raw.filters as Array<{ op?: unknown }>) {
          if (typeof f.op === 'string') coveredOps.add(f.op);
        }
      }
    }
    const missing = ALL_FILTER_OPS.filter((op) => !coveredOps.has(op));
    expect(missing, `Ops sin cobertura: ${missing.join(', ')}`).toHaveLength(0);
    expect(coveredOps.size).toBe(ALL_FILTER_OPS.length);
  });
});
