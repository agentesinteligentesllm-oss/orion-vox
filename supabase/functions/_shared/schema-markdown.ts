// Pure markdown formatting for schema-summary. No Deno/Postgres deps — testable in Vitest.

export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  column_comment: string | null;
  ordinal_position: number;
}

export interface FKInfo {
  fk_column: string;
  ref_table: string;
  ref_column: string;
}

export interface TableInfo {
  table_name: string;
  table_comment: string | null;
  columns: ColumnInfo[]; // ordered by ordinal_position ascending
  pk_columns: string[];
  fks: FKInfo[]; // ordered by fk_column ascending
  non_pk_index_names: string[]; // ordered alphabetically
}

// ─── Column bullet ─────────────────────────────────────────────────────────────

function buildColumnBullet(
  col: ColumnInfo,
  pkSet: Set<string>,
  fkMap: Map<string, FKInfo>,
): string {
  const parts: string[] = [col.data_type];
  if (pkSet.has(col.column_name)) parts.push('pk');
  if (col.is_nullable === 'NO') parts.push('not null');
  if (col.column_default !== null) parts.push(`default ${col.column_default}`);

  let line = `- ${col.column_name} (${parts.join(', ')})`;

  if (col.column_comment) {
    line += ` — ${col.column_comment}`;
  } else {
    const fk = fkMap.get(col.column_name);
    if (fk) {
      line += ` — FK → ${fk.ref_table}.${fk.ref_column}`;
    }
  }
  return line;
}

// ─── Table section ─────────────────────────────────────────────────────────────

export function buildTableMarkdown(table: TableInfo): string {
  const lines: string[] = [];
  lines.push(`## ${table.table_name}`);

  if (table.table_comment) {
    lines.push(`Comentario: ${table.table_comment}`);
  }

  const pkSet = new Set(table.pk_columns);
  const fkMap = new Map(table.fks.map((f) => [f.fk_column, f]));

  for (const col of table.columns) {
    lines.push(buildColumnBullet(col, pkSet, fkMap));
  }

  if (table.fks.length > 0) {
    const fkList = table.fks
      .map((f) => `${f.fk_column} → ${f.ref_table}.${f.ref_column}`)
      .join(', ');
    lines.push(`FKs: ${fkList}`);
  } else {
    lines.push('FKs: ninguna');
  }

  if (table.non_pk_index_names.length > 0) {
    lines.push(`Indexes: ${table.non_pk_index_names.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Full schema markdown ──────────────────────────────────────────────────────

export function buildSchemaSummary(
  tables: TableInfo[],
  schemaName: string,
  timestamp: string,
): string {
  const header = `# Schema summary — ${schemaName} — generado ${timestamp}`;
  // Tables sorted alphabetically for deterministic output
  const sorted = [...tables].sort((a, b) => a.table_name.localeCompare(b.table_name));
  if (sorted.length === 0) {
    return `${header}\n\n(sin tablas)`;
  }
  return [header, '', ...sorted.map(buildTableMarkdown)].join('\n\n');
}
