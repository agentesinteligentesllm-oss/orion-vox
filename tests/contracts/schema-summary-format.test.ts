import { describe, expect, it } from 'vitest';
import {
  buildSchemaSummary,
  buildTableMarkdown,
  type ColumnInfo,
  type TableInfo,
} from '$shared/schema-markdown';

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

// ─── Single table with all features ──────────────────────────────────────────

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

describe('buildTableMarkdown', () => {
  it('generates correct bullet format — full table with comment, pk, fk, indexes', () => {
    const md = buildTableMarkdown(tareas);
    const lines = md.split('\n');
    expect(lines[0]).toBe('## tareas');
    expect(lines[1]).toBe('Comentario: Lista personal de tareas.');
    expect(lines[2]).toBe('- id (uuid, pk, not null, default gen_random_uuid())');
    expect(lines[3]).toBe('- titulo (text, not null) — Texto corto del item.');
    expect(lines[4]).toBe('- estado (text)');
    expect(lines[5]).toBe('- categoria_id (uuid) — FK → categorias.id');
    expect(lines[6]).toBe('- creado_en (timestamptz, not null, default now())');
    expect(lines[7]).toBe('FKs: categoria_id → categorias.id');
    expect(lines[8]).toBe('Indexes: idx_tareas_estado, idx_tareas_creado_en');
  });

  it('emits "FKs: ninguna" when table has no foreign keys', () => {
    const t: TableInfo = {
      table_name: 'categorias',
      table_comment: null,
      columns: [col('id', 'uuid', 'NO', { ordinal_position: 1 })],
      pk_columns: ['id'],
      fks: [],
      non_pk_index_names: [],
    };
    const md = buildTableMarkdown(t);
    expect(md).toContain('FKs: ninguna');
    expect(md).not.toContain('Indexes:');
  });

  it('omits Indexes line when no non-pk indexes', () => {
    const t: TableInfo = {
      table_name: 'simple',
      table_comment: null,
      columns: [col('id', 'uuid', 'NO', { ordinal_position: 1 })],
      pk_columns: ['id'],
      fks: [],
      non_pk_index_names: [],
    };
    expect(buildTableMarkdown(t)).not.toContain('Indexes:');
  });

  it('omits Comentario line when table has no comment', () => {
    const t: TableInfo = {
      table_name: 'simple',
      table_comment: null,
      columns: [],
      pk_columns: [],
      fks: [],
      non_pk_index_names: [],
    };
    expect(buildTableMarkdown(t)).not.toContain('Comentario:');
  });

  it('prefers column_comment over FK annotation when both present', () => {
    const t: TableInfo = {
      table_name: 'foo',
      table_comment: null,
      columns: [
        col('ref_id', 'uuid', 'YES', { column_comment: 'custom note', ordinal_position: 1 }),
      ],
      pk_columns: [],
      fks: [{ fk_column: 'ref_id', ref_table: 'bar', ref_column: 'id' }],
      non_pk_index_names: [],
    };
    const md = buildTableMarkdown(t);
    expect(md).toContain('— custom note');
    expect(md).not.toContain('FK →');
  });
});

describe('buildSchemaSummary', () => {
  it('generates correct H1 header', () => {
    const md = buildSchemaSummary([tareas], 'public', FIXED_TS);
    expect(md.startsWith(`# Schema summary — public — generado ${FIXED_TS}`)).toBe(true);
  });

  it('sorts tables alphabetically for determinism', () => {
    const t1: TableInfo = {
      table_name: 'zonas',
      table_comment: null,
      columns: [],
      pk_columns: [],
      fks: [],
      non_pk_index_names: [],
    };
    const t2: TableInfo = {
      table_name: 'articulos',
      table_comment: null,
      columns: [],
      pk_columns: [],
      fks: [],
      non_pk_index_names: [],
    };
    const md = buildSchemaSummary([t1, t2], 'public', FIXED_TS);
    const idx1 = md.indexOf('## articulos');
    const idx2 = md.indexOf('## zonas');
    expect(idx1).toBeLessThan(idx2);
  });

  it('returns (sin tablas) placeholder when no tables', () => {
    const md = buildSchemaSummary([], 'public', FIXED_TS);
    expect(md).toContain('(sin tablas)');
  });

  it('is deterministic — same input produces same output', () => {
    const md1 = buildSchemaSummary([tareas], 'public', FIXED_TS);
    const md2 = buildSchemaSummary([tareas], 'public', FIXED_TS);
    expect(md1).toBe(md2);
  });

  it('includes all table sections separated by blank lines', () => {
    const t1: TableInfo = {
      table_name: 'alpha',
      table_comment: null,
      columns: [],
      pk_columns: [],
      fks: [],
      non_pk_index_names: [],
    };
    const t2: TableInfo = {
      table_name: 'beta',
      table_comment: null,
      columns: [],
      pk_columns: [],
      fks: [],
      non_pk_index_names: [],
    };
    const md = buildSchemaSummary([t1, t2], 'public', FIXED_TS);
    expect(md).toContain('## alpha');
    expect(md).toContain('## beta');
    // blank line separator between sections
    expect(md).toContain('\n\n## beta');
  });
});
