// Pure pg_catalog → markdown → hash logic. No Deno env reads, no HTTP.
// Accepts a SqlRunner interface so tests can inject a mock without postgres.

import type { ColumnInfo, FKInfo, TableInfo } from './schema-markdown.ts';
import { buildSchemaSummary } from './schema-markdown.ts';

// Tables always excluded regardless of allowlist
const HARDCODED_DENY = new Set(['orion_audit']);

export interface SchemaSummaryResult {
  markdown: string;
  schema_hash: string;
  generated_at: string;
  tables_count: number;
  allowed_count: number;
}

// Minimal interface — compatible with postgres client and plain mock objects
export type SqlRunner = {
  unsafe(query: string, params: unknown[]): PromiseLike<Record<string, unknown>[]>;
};

// ─── SHA-256 hex ──────────────────────────────────────────────────────────────

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── pg_catalog queries ───────────────────────────────────────────────────────

async function fetchTableInfos(
  sql: SqlRunner,
  schemaName: string,
  tableNames: string[],
): Promise<TableInfo[]> {
  if (tableNames.length === 0) return [];

  const [tablesRows, colsRows, pkRows, fkRows, idxRows] = await Promise.all([
    // 1. Table names + comments
    sql.unsafe(
      `SELECT c.relname AS table_name,
              obj_description(c.oid, 'pg_class') AS table_comment
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind = 'r'
         AND n.nspname = $1
         AND c.relname = ANY($2)
       ORDER BY c.relname`,
      [schemaName, tableNames],
    ),
    // 2. Columns — udt_name for compact type alias (e.g. timestamptz not "timestamp with time zone")
    sql.unsafe(
      `SELECT table_name, column_name, udt_name AS data_type,
              is_nullable, column_default, ordinal_position,
              col_description(
                (table_schema || '.' || table_name)::regclass::oid,
                ordinal_position
              ) AS column_comment
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = ANY($2)
       ORDER BY table_name, ordinal_position`,
      [schemaName, tableNames],
    ),
    // 3. Primary keys
    sql.unsafe(
      `SELECT kcu.table_name, kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
       WHERE tc.table_schema = $1
         AND tc.table_name = ANY($2)
         AND tc.constraint_type = 'PRIMARY KEY'`,
      [schemaName, tableNames],
    ),
    // 4. Foreign keys
    sql.unsafe(
      `SELECT kcu.table_name, kcu.column_name AS fk_column,
              ccu.table_name AS ref_table, ccu.column_name AS ref_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
       WHERE tc.table_schema = $1
         AND tc.table_name = ANY($2)
         AND tc.constraint_type = 'FOREIGN KEY'
       ORDER BY kcu.table_name, kcu.column_name`,
      [schemaName, tableNames],
    ),
    // 5. Non-PK indexes
    sql.unsafe(
      `SELECT tablename, indexname
       FROM pg_indexes
       WHERE schemaname = $1
         AND tablename = ANY($2)
         AND indexname NOT LIKE '%_pkey'
       ORDER BY tablename, indexname`,
      [schemaName, tableNames],
    ),
  ]);

  // Group by table_name
  const colsByTable = new Map<string, ColumnInfo[]>();
  for (const r of colsRows) {
    const tn = r.table_name as string;
    if (!colsByTable.has(tn)) colsByTable.set(tn, []);
    colsByTable.get(tn)?.push({
      column_name: r.column_name as string,
      data_type: r.data_type as string,
      is_nullable: r.is_nullable as 'YES' | 'NO',
      column_default: (r.column_default as string | null) ?? null,
      column_comment: (r.column_comment as string | null) ?? null,
      ordinal_position: r.ordinal_position as number,
    });
  }

  const pksByTable = new Map<string, string[]>();
  for (const r of pkRows) {
    const tn = r.table_name as string;
    if (!pksByTable.has(tn)) pksByTable.set(tn, []);
    pksByTable.get(tn)?.push(r.column_name as string);
  }

  const fksByTable = new Map<string, FKInfo[]>();
  for (const r of fkRows) {
    const tn = r.table_name as string;
    if (!fksByTable.has(tn)) fksByTable.set(tn, []);
    fksByTable.get(tn)?.push({
      fk_column: r.fk_column as string,
      ref_table: r.ref_table as string,
      ref_column: r.ref_column as string,
    });
  }

  const idxsByTable = new Map<string, string[]>();
  for (const r of idxRows) {
    const tn = r.tablename as string;
    if (!idxsByTable.has(tn)) idxsByTable.set(tn, []);
    idxsByTable.get(tn)?.push(r.indexname as string);
  }

  const result: TableInfo[] = [];
  for (const r of tablesRows) {
    const tn = r.table_name as string;
    result.push({
      table_name: tn,
      table_comment: (r.table_comment as string | null) ?? null,
      columns: colsByTable.get(tn) ?? [],
      pk_columns: pksByTable.get(tn) ?? [],
      fks: fksByTable.get(tn) ?? [],
      non_pk_index_names: idxsByTable.get(tn) ?? [],
    });
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSchemaSummary(
  sql: SqlRunner,
  allowedTables: string[],
  schemaName = 'public',
): Promise<SchemaSummaryResult> {
  const filteredAllowList = allowedTables.filter(
    (t) => !HARDCODED_DENY.has(t) && !t.startsWith('_'),
  );
  const allowedCount = allowedTables.length;

  const tables = await fetchTableInfos(sql, schemaName, filteredAllowList);
  const generatedAt = new Date().toISOString();
  const markdown = buildSchemaSummary(tables, schemaName, generatedAt);
  const schema_hash = await sha256hex(markdown);

  return {
    markdown,
    schema_hash,
    generated_at: generatedAt,
    tables_count: tables.length,
    allowed_count: allowedCount,
  };
}
