import { getSchemaSummary, type SqlRunner, sha256hex } from '../_shared/schema-summary-core.ts';

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

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  actual:   ${a}\n  expected: ${b}`);
}

function assertContains(str: string, sub: string, label: string): void {
  if (!str.includes(sub)) throw new Error(`${label}: expected to contain "${sub}"`);
}

function assertMatch(str: string, re: RegExp, label: string): void {
  if (!re.test(str)) throw new Error(`${label}: "${str}" did not match ${re}`);
}

// ─── getSchemaSummary tests ───────────────────────────────────────────────────

Deno.test('[schema-summary-core] returns correct tables_count and allowed_count', async () => {
  const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
  const result = await getSchemaSummary(sql, ['tareas'], 'public');
  assertEqual(result.tables_count, 1, 'tables_count');
  assertEqual(result.allowed_count, 1, 'allowed_count');
});

Deno.test('[schema-summary-core] markdown starts with H1 header', async () => {
  const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
  const result = await getSchemaSummary(sql, ['tareas'], 'public');
  if (!result.markdown.startsWith('# Schema summary — public — generado')) {
    throw new Error(`unexpected H1: ${result.markdown.slice(0, 60)}`);
  }
});

Deno.test('[schema-summary-core] markdown contains expected table section', async () => {
  const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
  const result = await getSchemaSummary(sql, ['tareas'], 'public');
  assertContains(result.markdown, '## tareas', '## tareas header');
  assertContains(
    result.markdown,
    '- id (uuid, pk, not null, default gen_random_uuid())',
    'id bullet',
  );
  assertContains(result.markdown, '- titulo (text, not null)', 'titulo bullet');
});

Deno.test('[schema-summary-core] schema_hash is a 64-char hex string', async () => {
  const sql = makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS });
  const result = await getSchemaSummary(sql, ['tareas'], 'public');
  assertMatch(result.schema_hash, /^[0-9a-f]{64}$/, 'schema_hash hex64');
});

Deno.test('[schema-summary-core] is deterministic — same mock data produces same schema_hash', async () => {
  const makeResult = () =>
    getSchemaSummary(
      makeMockSql({ tables: TAREAS_TABLES, cols: TAREAS_COLS, pks: TAREAS_PKS }),
      ['tareas'],
      'public',
    );
  const r1 = await makeResult();
  const r2 = await makeResult();
  assertEqual(r1.schema_hash, r2.schema_hash, 'hash deterministic');
  assertEqual(r1.markdown, r2.markdown, 'markdown deterministic');
});

Deno.test('[schema-summary-core] filters orion_audit from allowedTables (hardcoded denylist)', async () => {
  const sql = makeMockSql({ tables: [], cols: [], pks: [] });
  const result = await getSchemaSummary(sql, ['orion_audit'], 'public');
  assertEqual(result.tables_count, 0, 'tables_count = 0');
  assertEqual(result.allowed_count, 1, 'allowed_count = 1 (before deny filter)');
  assertContains(result.markdown, '(sin tablas)', '(sin tablas) placeholder');
});

Deno.test('[schema-summary-core] filters _-prefixed tables (hardcoded denylist)', async () => {
  const sql = makeMockSql({ tables: [], cols: [], pks: [] });
  const result = await getSchemaSummary(sql, ['_internal'], 'public');
  assertEqual(result.tables_count, 0, 'tables_count = 0');
  assertContains(result.markdown, '(sin tablas)', '(sin tablas) placeholder');
});

Deno.test('[schema-summary-core] returns empty result when no matching tables', async () => {
  const sql = makeMockSql({ tables: [], cols: [], pks: [] });
  const result = await getSchemaSummary(sql, ['nonexistent'], 'public');
  assertEqual(result.tables_count, 0, 'tables_count = 0');
  assertContains(result.markdown, '(sin tablas)', '(sin tablas) placeholder');
});

// ─── sha256hex tests ──────────────────────────────────────────────────────────

Deno.test('[schema-summary-core] sha256hex returns 64 hex chars', async () => {
  assertMatch(await sha256hex('hello world'), /^[0-9a-f]{64}$/, 'sha256hex hex64');
});

Deno.test('[schema-summary-core] sha256hex is deterministic', async () => {
  assertEqual(await sha256hex('test'), await sha256hex('test'), 'sha256hex deterministic');
});

Deno.test('[schema-summary-core] sha256hex different inputs produce different hashes', async () => {
  const h1 = await sha256hex('input-a');
  const h2 = await sha256hex('input-b');
  if (h1 === h2) throw new Error('expected different hashes for different inputs');
});
