// Integration test: getSchemaSummary + isSchemaStale = fetchCurrentSchemaHash behavior
// This tests the exact logic that drives the 409 schema_stale check in execute-plan.
// No Supabase, no Deno.serve needed — pure module mocks.

import { describe, expect, it } from 'vitest';
import { isSchemaStale } from '$shared/schema-stale';
import { getSchemaSummary, type SqlRunner } from '$shared/schema-summary-core';

type Row = Record<string, unknown>;

function makeMockSql(): SqlRunner {
  return {
    unsafe(query: string): Promise<Row[]> {
      if (query.includes('pg_class'))
        return Promise.resolve([{ table_name: 'tareas', table_comment: null }]);
      if (query.includes('ordinal_position'))
        return Promise.resolve([
          {
            table_name: 'tareas',
            column_name: 'id',
            data_type: 'uuid',
            is_nullable: 'NO',
            column_default: null,
            column_comment: null,
            ordinal_position: 1,
          },
        ]);
      if (query.includes("'PRIMARY KEY'"))
        return Promise.resolve([{ table_name: 'tareas', column_name: 'id' }]);
      return Promise.resolve([]);
    },
  };
}

describe('execute-plan schema_stale check — 409 branching logic', () => {
  it('Case A: client sends correct schema_hash → isSchemaStale false → execute-plan proceeds (no 409)', async () => {
    // Simulate what fetchCurrentSchemaHash returns (direct pg_catalog call)
    const { schema_hash: currentHash } = await getSchemaSummary(makeMockSql(), ['tareas']);
    // Client sends the same hash it got from plan-intent (schema unchanged)
    const clientHash = currentHash;
    expect(isSchemaStale(clientHash, currentHash)).toBe(false);
  });

  it('Case B: client sends outdated schema_hash → isSchemaStale true → execute-plan returns 409', async () => {
    // Simulate what fetchCurrentSchemaHash returns
    const { schema_hash: currentHash } = await getSchemaSummary(makeMockSql(), ['tareas']);
    // Client sends a stale hash (schema changed server-side since last plan-intent call)
    const clientHash = 'a'.repeat(64);
    expect(clientHash).not.toBe(currentHash); // guard: hashes must differ for this test to mean anything
    expect(isSchemaStale(clientHash, currentHash)).toBe(true);
  });

  it('graceful fallback: if getSchemaSummary fails, currentHash is null → no 409', () => {
    // fetchCurrentSchemaHash catches errors and returns null
    const currentHash = null;
    expect(isSchemaStale('any-client-hash', currentHash)).toBe(false);
  });
});
