import {
  buildSchemaSummary,
  buildTableMarkdown,
  type ColumnInfo,
  type TableInfo,
} from '../_shared/schema-markdown.ts';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  actual:   ${a}\n  expected: ${b}`);
}

function assertContains(str: string, sub: string, label: string): void {
  if (!str.includes(sub)) throw new Error(`${label}: expected to contain "${sub}"\n  actual: ${str}`);
}

function assertNotContains(str: string, sub: string, label: string): void {
  if (str.includes(sub)) throw new Error(`${label}: expected NOT to contain "${sub}"\n  actual: ${str}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function col(
  column_name: string,
  data_type: string,
  is_nullable: 'YES' | 'NO',
  opts: Partial<Omit<ColumnInfo, 'column_name' | 'data_type' | 'is_nullable'>> = {},
): ColumnInfo {
  return {
    column_name,
    data_type,
    is_nullable,
    column_default: null,
    column_comment: null,
    ordinal_position: 1,
    ...opts,
  };
}

const FIXED_TS = '2026-05-02T12:00:00.000Z';

const tareas: TableInfo = {
  table_name: 'tareas',
  table_comment: 'Lista personal de tareas.',
  columns: [
    col('id', 'uuid', 'NO', { column_default: 'gen_random_uuid()', ordinal_position: 1 }),
    col('titulo', 'text', 'NO', { column_comment: 'Texto corto del item.', ordinal_position: 2 }),
    col('estado', 'text', 'YES', { ordinal_position: 3 }),
    col('categoria_id', 'uuid', 'YES', { ordinal_position: 4 }),
    col('creado_en', 'timestamptz', 'NO', { column_default: 'now()', ordinal_position: 5 }),
  ],
  pk_columns: ['id'],
  fks: [{ fk_column: 'categoria_id', ref_table: 'categorias', ref_column: 'id' }],
  non_pk_index_names: ['idx_tareas_estado', 'idx_tareas_creado_en'],
};

// ─── buildTableMarkdown ───────────────────────────────────────────────────────

Deno.test('[schema-markdown] buildTableMarkdown: full table with comment, pk, fk, indexes', () => {
  const md = buildTableMarkdown(tareas);
  const lines = md.split('\n');
  assertEqual(lines[0], '## tareas', 'H2 header');
  assertEqual(lines[1], 'Comentario: Lista personal de tareas.', 'table comment');
  assertEqual(lines[2], '- id (uuid, pk, not null, default gen_random_uuid())', 'id bullet');
  assertEqual(lines[3], '- titulo (text, not null) — Texto corto del item.', 'titulo with comment');
  assertEqual(lines[4], '- estado (text)', 'nullable column');
  assertEqual(lines[5], '- categoria_id (uuid) — FK → categorias.id', 'fk annotation');
  assertEqual(lines[6], '- creado_en (timestamptz, not null, default now())', 'creado_en');
  assertEqual(lines[7], 'FKs: categoria_id → categorias.id', 'FK list');
  assertEqual(lines[8], 'Indexes: idx_tareas_estado, idx_tareas_creado_en', 'indexes');
});

Deno.test('[schema-markdown] buildTableMarkdown: emits "FKs: ninguna" when no foreign keys', () => {
  const t: TableInfo = {
    table_name: 'categorias',
    table_comment: null,
    columns: [col('id', 'uuid', 'NO', { ordinal_position: 1 })],
    pk_columns: ['id'],
    fks: [],
    non_pk_index_names: [],
  };
  const md = buildTableMarkdown(t);
  assertContains(md, 'FKs: ninguna', 'should emit "FKs: ninguna"');
  assertNotContains(md, 'Indexes:', 'should not emit Indexes line');
});

Deno.test('[schema-markdown] buildTableMarkdown: omits Indexes line when no non-pk indexes', () => {
  const t: TableInfo = {
    table_name: 'simple',
    table_comment: null,
    columns: [col('id', 'uuid', 'NO', { ordinal_position: 1 })],
    pk_columns: ['id'],
    fks: [],
    non_pk_index_names: [],
  };
  assertNotContains(buildTableMarkdown(t), 'Indexes:', 'should omit Indexes line');
});

Deno.test('[schema-markdown] buildTableMarkdown: omits Comentario line when no table comment', () => {
  const t: TableInfo = {
    table_name: 'simple',
    table_comment: null,
    columns: [],
    pk_columns: [],
    fks: [],
    non_pk_index_names: [],
  };
  assertNotContains(buildTableMarkdown(t), 'Comentario:', 'should omit Comentario line');
});

Deno.test('[schema-markdown] buildTableMarkdown: prefers column_comment over FK annotation', () => {
  const t: TableInfo = {
    table_name: 'foo',
    table_comment: null,
    columns: [col('ref_id', 'uuid', 'YES', { column_comment: 'custom note', ordinal_position: 1 })],
    pk_columns: [],
    fks: [{ fk_column: 'ref_id', ref_table: 'bar', ref_column: 'id' }],
    non_pk_index_names: [],
  };
  const md = buildTableMarkdown(t);
  assertContains(md, '— custom note', 'column_comment shown');
  assertNotContains(md, 'FK →', 'FK annotation suppressed when column_comment present');
});

// ─── buildSchemaSummary ───────────────────────────────────────────────────────

Deno.test('[schema-markdown] buildSchemaSummary: generates correct H1 header', () => {
  const md = buildSchemaSummary([tareas], 'public', FIXED_TS);
  const expectedPrefix = `# Schema summary — public — generado ${FIXED_TS}`;
  if (!md.startsWith(expectedPrefix)) {
    throw new Error(`expected to start with "${expectedPrefix}"\n  actual: ${md.slice(0, 80)}`);
  }
});

Deno.test('[schema-markdown] buildSchemaSummary: sorts tables alphabetically', () => {
  const t1: TableInfo = { table_name: 'zonas', table_comment: null, columns: [], pk_columns: [], fks: [], non_pk_index_names: [] };
  const t2: TableInfo = { table_name: 'articulos', table_comment: null, columns: [], pk_columns: [], fks: [], non_pk_index_names: [] };
  const md = buildSchemaSummary([t1, t2], 'public', FIXED_TS);
  const idx1 = md.indexOf('## articulos');
  const idx2 = md.indexOf('## zonas');
  if (!(idx1 < idx2)) throw new Error(`articulos (${idx1}) should appear before zonas (${idx2})`);
});

Deno.test('[schema-markdown] buildSchemaSummary: returns (sin tablas) when no tables', () => {
  const md = buildSchemaSummary([], 'public', FIXED_TS);
  assertContains(md, '(sin tablas)', '(sin tablas) placeholder');
});

Deno.test('[schema-markdown] buildSchemaSummary: is deterministic', () => {
  const md1 = buildSchemaSummary([tareas], 'public', FIXED_TS);
  const md2 = buildSchemaSummary([tareas], 'public', FIXED_TS);
  assertEqual(md1, md2, 'same input → same output');
});

Deno.test('[schema-markdown] buildSchemaSummary: sections separated by blank lines', () => {
  const t1: TableInfo = { table_name: 'alpha', table_comment: null, columns: [], pk_columns: [], fks: [], non_pk_index_names: [] };
  const t2: TableInfo = { table_name: 'beta', table_comment: null, columns: [], pk_columns: [], fks: [], non_pk_index_names: [] };
  const md = buildSchemaSummary([t1, t2], 'public', FIXED_TS);
  assertContains(md, '## alpha', 'alpha section');
  assertContains(md, '## beta', 'beta section');
  assertContains(md, '\n\n## beta', 'blank line before beta');
});
