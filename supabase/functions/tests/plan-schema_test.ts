import { ALL_FILTER_OPS, PlanSchema } from '../_shared/plan-schema.ts';

// Passes Zod schema — rejected by execute-plan business-rule (multi-statement detection)
const SCHEMA_VALID_INVALIDS = new Set(['01-multi-statement-in-value.json']);

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function loadFixtures(type: 'valid' | 'invalid'): Array<{ name: string; data: unknown }> {
  const baseUrl = new URL(`../../../tests/fixtures/plans/${type}/`, import.meta.url);
  const result: Array<{ name: string; data: unknown }> = [];
  for (const entry of Deno.readDirSync(baseUrl)) {
    if (entry.isFile && entry.name.endsWith('.json')) {
      const fileUrl = new URL(entry.name, baseUrl);
      result.push({
        name: entry.name,
        data: JSON.parse(Deno.readTextFileSync(fileUrl)) as unknown,
      });
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

const validFixtures = loadFixtures('valid');
const invalidFixtures = loadFixtures('invalid');

// Valid fixtures
for (const { name, data } of validFixtures) {
  Deno.test(`[valid] ${name}`, () => {
    const result = PlanSchema.safeParse(data);
    const errMsg = result.success ? '' : result.error.message;
    assert(result.success, `${name} should parse: ${errMsg}`);
  });
}

// Invalid fixtures
for (const { name, data } of invalidFixtures) {
  if (SCHEMA_VALID_INVALIDS.has(name)) {
    Deno.test(`[schema-valid] ${name} — passes schema (business-rule rejection only)`, () => {
      const result = PlanSchema.safeParse(data);
      assert(result.success, `${name} should pass schema`);
    });
  } else {
    Deno.test(`[invalid] ${name} — must fail schema`, () => {
      const result = PlanSchema.safeParse(data);
      assert(!result.success, `${name} should NOT parse`);
    });
  }
}

// Coverage assert — must cover all 12 ops from ALL_FILTER_OPS
Deno.test('valid fixtures cover all 12 filter ops (ALL_FILTER_OPS)', () => {
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
  assert(missing.length === 0, `Ops sin cobertura: ${missing.join(', ')}`);
  assert(
    coveredOps.size === ALL_FILTER_OPS.length,
    `Expected ${ALL_FILTER_OPS.length} ops, got ${coveredOps.size}`,
  );
});
