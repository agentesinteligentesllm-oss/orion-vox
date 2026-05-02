// Deno parity for schema-stale-integration.test.ts

import { isSchemaStale } from '../_shared/schema-stale.ts';
import { getSchemaSummary, type SqlRunner } from '../_shared/schema-summary-core.ts';

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

Deno.test('[schema-stale-integration] Case A: matching hash → not stale → no 409', async () => {
  const { schema_hash: currentHash } = await getSchemaSummary(makeMockSql(), ['tareas']);
  const clientHash = currentHash;
  if (isSchemaStale(clientHash, currentHash))
    throw new Error('Case A: expected isSchemaStale=false (matching hash → proceed, no 409)');
});

Deno.test('[schema-stale-integration] Case B: outdated hash → stale → 409', async () => {
  const { schema_hash: currentHash } = await getSchemaSummary(makeMockSql(), ['tareas']);
  const clientHash = 'a'.repeat(64);
  if (clientHash === currentHash) throw new Error('test guard: hashes must differ');
  if (!isSchemaStale(clientHash, currentHash))
    throw new Error('Case B: expected isSchemaStale=true (stale hash → 409)');
});

Deno.test('[schema-stale-integration] graceful fallback: null currentHash → no 409', () => {
  if (isSchemaStale('any-client-hash', null))
    throw new Error('graceful fallback: null currentHash should not trigger 409');
});
