import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import type { ColumnInfo, FKInfo, TableInfo } from '../_shared/schema-markdown.ts';
import { buildSchemaSummary } from '../_shared/schema-markdown.ts';

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_USER_ID = Deno.env.get('ORION_ALLOWED_USER_ID') ?? '';
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
const PWA_ORIGIN = Deno.env.get('PWA_ORIGIN') ?? '*';

// Tables that are always excluded regardless of allowlist
const HARDCODED_DENY = new Set(['orion_audit']);

// ─── DB connection (lazy singleton) ──────────────────────────────────────────

let _db: ReturnType<typeof postgres> | null = null;
function db(): ReturnType<typeof postgres> {
  if (!_db) _db = postgres(DB_URL, { max: 1 });
  return _db;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

const HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': PWA_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
}

function err(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: HEADERS,
  });
}

// ─── SHA-256 hex ──────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── pg_catalog queries ───────────────────────────────────────────────────────

type Row = Record<string, unknown>;

async function fetchTableInfos(schemaName: string, tableNames: string[]): Promise<TableInfo[]> {
  if (tableNames.length === 0) return [];

  const sql = db();
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
    // 2. Columns (udt_name for compact type alias e.g. timestamptz over "timestamp with time zone")
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
  for (const r of colsRows as Row[]) {
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
  for (const r of pkRows as Row[]) {
    const tn = r.table_name as string;
    if (!pksByTable.has(tn)) pksByTable.set(tn, []);
    pksByTable.get(tn)?.push(r.column_name as string);
  }

  const fksByTable = new Map<string, FKInfo[]>();
  for (const r of fkRows as Row[]) {
    const tn = r.table_name as string;
    if (!fksByTable.has(tn)) fksByTable.set(tn, []);
    fksByTable.get(tn)?.push({
      fk_column: r.fk_column as string,
      ref_table: r.ref_table as string,
      ref_column: r.ref_column as string,
    });
  }

  const idxsByTable = new Map<string, string[]>();
  for (const r of idxRows as Row[]) {
    const tn = r.tablename as string;
    if (!idxsByTable.has(tn)) idxsByTable.set(tn, []);
    idxsByTable.get(tn)?.push(r.indexname as string);
  }

  const result: TableInfo[] = [];
  for (const r of tablesRows as Row[]) {
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

// ─── Schema validation ────────────────────────────────────────────────────────

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/;

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // 1+2. Auth — user JWT or internal SERVICE_ROLE_KEY call from plan-intent/execute-plan
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return err(401, 'unauthorized', 'Falta autenticación.');
  }
  const token = authHeader.slice(7);

  // Internal call from plan-intent or execute-plan using SERVICE_ROLE_KEY — trusted
  const isInternalCall = SERVICE_ROLE_KEY.length > 0 && token === SERVICE_ROLE_KEY;

  if (!isInternalCall) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return err(401, 'invalid_token', 'Tu sesión expiró. Iniciá sesión de nuevo.');
    }
    if (user.id !== ALLOWED_USER_ID) {
      return err(403, 'forbidden_user', 'Tu cuenta no está autorizada en esta instancia.');
    }
  }

  // 3. Query params
  const url = new URL(req.url);
  const schemaName = url.searchParams.get('schema') ?? 'public';
  if (!SCHEMA_RE.test(schemaName)) {
    return err(400, 'invalid_schema', `Schema "${schemaName}" contiene caracteres no válidos.`);
  }

  // 4. Allowlist
  const allowedTablesEnv = Deno.env.get('ORION_ALLOWED_TABLES') ?? '';
  const allowedTables = allowedTablesEnv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (allowedTables.length === 0) {
    return err(500, 'allowlist_misconfigured', 'ORION_ALLOWED_TABLES no está configurada.');
  }

  // 5. Apply hardcoded denylist: exclude orion_audit and _-prefixed tables
  const filteredAllowList = allowedTables.filter(
    (t) => !HARDCODED_DENY.has(t) && !t.startsWith('_'),
  );
  const allowedCount = allowedTables.length;

  // 6. Query pg_catalog
  let tables: TableInfo[];
  try {
    tables = await fetchTableInfos(schemaName, filteredAllowList);
  } catch (e) {
    console.error('pg_error', e);
    return err(500, 'pg_error', 'Error al leer el schema de la base de datos.');
  }

  // 7. Generate markdown + hash
  const generatedAt = new Date().toISOString();
  const markdown = buildSchemaSummary(tables, schemaName, generatedAt);
  const schemaHash = await sha256hex(markdown);

  // 8. Return — include both schema_hash (spec) and hash (used by plan-intent/execute-plan)
  return ok({
    markdown,
    schema_hash: schemaHash,
    hash: schemaHash,
    generated_at: generatedAt,
    tables_count: tables.length,
    allowed_count: allowedCount,
    schema: schemaName,
  });
});
