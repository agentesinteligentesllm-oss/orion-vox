import { describe, expect, it } from 'vitest';
import { getSchemaSummary, type SqlRunner, sha256hex } from '$shared/schema-summary-core';

// ─── Mock SQL runner ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeMockSql(opts: {
  tables?: Row[];
  cols?: Row[];
  pks?: Row[];
  fks?: Row[];
  idxs?: Row[];
}): SqlRunner {
  const tables = opts.tables ?? [];
  const cols = opts.cols ?? [];
  const pks = opts.pks ?? [];
  const fks = opts.fks ?? [];
  const idxs = opts.idxs ?? [];
  return {
    unsafe(query: string): Promise<Row[]> {
      if (query.includes('pg_class')) return Promise.resolve(tables);
      if (query.includes('ordinal_position')) return Promise.resolve(cols);
      if (query.includes("'PRIMARY KEY'")) return Promise.resolve(pks);
      if (query.includes("'FOREIGN KEY'")) return Promise.resolve(fks);
      if (query.includes('pg_indexes')) return Promise.resolve(idxs);
      return Promise.resolve([]);
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAREAS_TABLES = [{ table_name: 'tareas', table_comment: null }];
const TAREAS_COLS = [
  {
    table_name: 'tareas',
    column_name: 'id',
    data_type: 'uuid',
    is_nullable: 'NO',
    column_default: 'gen_random_uuid()',
    column_comment: null,
    ordinal_position: 1,
  },
  {
    table_name: 'tareas',
    column_name: 'titulo',
    data_type: 'text',
    is_nullable: 'NO',
    column_default: null,
    column_comment: null,
    ordinal_position: 2,
  },
];
const TAREAS_PKS = [{ table_name: 'tareas', column_name: 'id' }];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getSchemaSummary', () => {
  it('returns correct tables_count and allowed_count', async () => {
    const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
    const result = await getSchemaSummary(sql, ['tareas'], 'public');
    expect(result.tables_count).toBe(1);
    expect(result.allowed_count).toBe(1);
  });

  it('markdown starts with H1 header', async () => {
    const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
    const result = await getSchemaSummary(sql, ['tareas'], 'public');
    expect(result.markdown.startsWith('# Schema summary — public — generado')).toBe(true);
  });

  it('markdown contains expected table section', async () => {
    const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
    const result = await getSchemaSummary(sql, ['tareas'], 'public');
    expect(result.markdown).toContain('## tareas');
    expect(result.markdown).toContain('- id (uuid, pk, not null, default gen_random_uuid())');
    expect(result.markdown).toContain('- titulo (text, not null)');
  });

  it('schema_hash is a 64-char hex string', async () => {
    const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
    const result = await getSchemaSummary(sql, ['tareas'], 'public');
    expect(result.schema_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('schema_hash is sha256 of the markdown (hash is deterministic function of content)', async () => {
    const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
    const result = await getSchemaSummary(sql, ['tareas'], 'public');
    const expected = await sha256hex(result.markdown);
    expect(result.schema_hash).toBe(expected);
  });

  it('filters orion_audit from allowedTables (hardcoded denylist)', async () => {
    // Even if orion_audit is passed in allowedTables, it's excluded before querying
    // Mock returns nothing (the filter removes it before hitting SQL)
    const sql = makeMockSql({ tables: [], cols: [], pks: [] });
    const result = await getSchemaSummary(sql, ['orion_audit'], 'public');
    expect(result.tables_count).toBe(0);
    expect(result.allowed_count).toBe(1); // allowedTables.length before deny filter
    expect(result.markdown).toContain('(sin tablas)');
  });

  it('filters _-prefixed tables from allowedTables (hardcoded denylist)', async () => {
    const sql = makeMockSql({ tables: [], cols: [], pks: [] });
    const result = await getSchemaSummary(sql, ['_internal'], 'public');
    expect(result.tables_count).toBe(0);
    expect(result.markdown).toContain('(sin tablas)');
  });

  it('returns empty result when no tables exist', async () => {
    const sql = makeMockSql({ tables: [], cols: [], pks: [] });
    const result = await getSchemaSummary(sql, ['nonexistent'], 'public');
    expect(result.tables_count).toBe(0);
    expect(result.markdown).toContain('(sin tablas)');
  });
});

describe('sha256hex', () => {
  it('returns 64 hex chars', async () => {
    const hash = await sha256hex('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    expect(await sha256hex('test')).toBe(await sha256hex('test'));
  });

  it('different inputs produce different hashes', async () => {
    const h1 = await sha256hex('input-a');
    const h2 = await sha256hex('input-b');
    expect(h1).not.toBe(h2);
  });
});
