import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { PlanSchema } from '../_shared/plan-schema.ts';
import { buildQuery } from '../_shared/query-builder.ts';
import { redactSqlParams } from '../_shared/redact.ts';

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_USER_ID = Deno.env.get('ORION_ALLOWED_USER_ID') ?? '';
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
const ALLOWED_TABLES = (Deno.env.get('ORION_ALLOWED_TABLES') ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const REDACTED_COLS = new Set(
  (Deno.env.get('ORION_REDACTED_COLUMNS') ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean),
);
const PWA_ORIGIN = Deno.env.get('PWA_ORIGIN') ?? '*';

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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

function err(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message, ...extra }), {
    status,
    headers: HEADERS,
  });
}

// ─── Redaction ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function redactRows(rows: Row[]): Row[] {
  if (REDACTED_COLS.size === 0) return rows;
  return rows.map((row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = REDACTED_COLS.has(k.toLowerCase()) ? '[REDACTED]' : v;
    }
    return out;
  });
}

// ─── Schema hash (T1.6 stub — graceful fallback if not yet deployed) ──────────

async function fetchCurrentSchemaHash(): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schema-summary`, {
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { hash?: string };
    return data.hash ?? null;
  } catch {
    return null;
  }
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

async function auditInsert(
  userPrompt: string,
  planJson: unknown,
  schemaHash: string,
  clientVersion: string,
  wasConfirmed: boolean,
  wasDryRun: boolean,
  error: string | null,
): Promise<string> {
  const rows = (await db().unsafe(
    `INSERT INTO public.orion_audit
      (source, user_prompt, plan_json, schema_hash, client_version,
       was_confirmed, was_dry_run, error)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      'execute-plan',
      userPrompt,
      planJson !== null ? JSON.stringify(planJson) : null,
      schemaHash,
      clientVersion,
      wasConfirmed,
      wasDryRun,
      error,
    ],
  )) as Row[];
  return rows[0].id as string;
}

async function auditUpdate(
  id: string,
  rowsAffected: number,
  resultSummary: unknown,
  sqlExecuted: string,
  sqlParams: unknown[],
  durationMs: number,
  error: string | null,
): Promise<void> {
  await db().unsafe(
    `UPDATE public.orion_audit
     SET rows_affected = $1, result_summary = $2::jsonb,
         sql_executed = $3, sql_params = $4::jsonb,
         duration_ms = $5, error = $6
     WHERE id = $7`,
    [
      rowsAffected,
      JSON.stringify(resultSummary),
      sqlExecuted,
      JSON.stringify(sqlParams),
      durationMs,
      error,
      id,
    ],
  );
}

// Best-effort audit for early-exit error paths (validation/allowlist failures).
// These are called BEFORE the main execution path when we're already returning an error,
// so a secondary audit failure doesn't change the outcome for the client.
// The pre-execution audit at step 7 is NOT best-effort: it aborts with 500 on failure.
async function tryAuditError(
  userPrompt: string,
  planJson: unknown,
  schemaHash: string,
  clientVersion: string,
  wasConfirmed: boolean,
  error: string,
): Promise<void> {
  try {
    await auditInsert(userPrompt, planJson, schemaHash, clientVersion, wasConfirmed, false, error);
  } catch {
    // swallow — we're already returning an error response
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // 1+2. Auth — extract JWT and verify
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return err(401, 'unauthorized', 'Falta autenticación.');
  }
  const token = authHeader.slice(7);

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

  // 3. Parse body
  let body: {
    plan?: unknown;
    user_prompt?: unknown;
    client_version?: unknown;
    schema_hash?: unknown;
    dry_run?: unknown;
    was_confirmed?: unknown;
    rejected_by_user?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, 'invalid_plan', 'El plan recibido no es válido.');
  }

  const userPrompt = typeof body.user_prompt === 'string' ? body.user_prompt : '';
  const clientVersion = typeof body.client_version === 'string' ? body.client_version : '';
  const schemaHash = typeof body.schema_hash === 'string' ? body.schema_hash : '';
  const wasConfirmed = body.was_confirmed === true;
  const rejectedByUser = body.rejected_by_user === true;
  const isDryRun = body.dry_run === true;

  // 4. Validate plan (Zod)
  const parsed = PlanSchema.safeParse(body.plan);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    await tryAuditError(
      userPrompt,
      body.plan,
      schemaHash,
      clientVersion,
      wasConfirmed,
      'validation_failed',
    );
    return err(422, 'validation_failed', `El plan tiene errores: ${details.join(', ')}.`, {
      details,
    });
  }
  const plan = parsed.data;

  // 5. Allowlist — main table
  if (!ALLOWED_TABLES.includes(plan.table)) {
    await tryAuditError(
      userPrompt,
      plan,
      schemaHash,
      clientVersion,
      wasConfirmed,
      'table_not_allowed',
    );
    return err(403, 'table_not_allowed', `La tabla ${plan.table} no está autorizada.`, {
      details: { table: plan.table },
    });
  }
  // Allowlist — join tables
  if (plan.operation === 'select' && plan.joins) {
    for (const j of plan.joins) {
      if (!ALLOWED_TABLES.includes(j.table)) {
        await tryAuditError(
          userPrompt,
          plan,
          schemaHash,
          clientVersion,
          wasConfirmed,
          'table_not_allowed',
        );
        return err(403, 'table_not_allowed', `La tabla ${j.table} no está autorizada.`, {
          details: { table: j.table },
        });
      }
    }
  }

  // 5b. Schema hash check (skipped gracefully if schema-summary not yet deployed — T1.6)
  const currentHash = await fetchCurrentSchemaHash();
  if (currentHash !== null && schemaHash !== currentHash) {
    return err(409, 'schema_stale', 'El esquema cambió. Volvé a pedir el plan.');
  }

  // 6. Hardcoded blocks
  if (plan.table === 'orion_audit') {
    await tryAuditError(
      userPrompt,
      plan,
      schemaHash,
      clientVersion,
      wasConfirmed,
      'audit_table_protected',
    );
    return err(403, 'audit_table_protected', 'No se puede operar sobre la tabla de auditoría.');
  }
  // Defense in depth — Zod already enforces min(1) on filters for update/delete
  if ((plan.operation === 'update' || plan.operation === 'delete') && plan.filters.length === 0) {
    await tryAuditError(
      userPrompt,
      plan,
      schemaHash,
      clientVersion,
      wasConfirmed,
      'missing_filters',
    );
    return err(403, 'missing_filters', 'Operación destructiva sin filtros: rechazada.');
  }

  // 7. INSERT pre-execution audit ("sin audit, no hay ejecución")
  let auditId: string;
  try {
    auditId = await auditInsert(
      userPrompt,
      plan,
      schemaHash,
      clientVersion,
      wasConfirmed,
      isDryRun || rejectedByUser,
      rejectedByUser ? 'rejected_by_user' : null,
    );
  } catch (e) {
    console.error('audit_insert_failed', e);
    return err(
      500,
      'audit_insert_failed',
      'No se pudo registrar la auditoría. Operación abortada por seguridad.',
    );
  }

  const t0 = Date.now();

  // 8. rejected_by_user shortcut — return immediately, no SQL
  if (rejectedByUser) {
    return ok({
      ok: true,
      rows_affected: 0,
      audit_id: auditId,
      sql_preview: null,
      duration_ms: Date.now() - t0,
    });
  }

  // 10. Build SQL (needed for both dry_run and real execution)
  const { sql: sqlText, params } = buildQuery(plan);

  // 11b. dry_run shortcut — return SQL preview without executing
  if (isDryRun) {
    try {
      await auditUpdate(auditId, 0, { dry_run: true, sql_preview: sqlText }, sqlText, [], 0, null);
    } catch {
      // best-effort
    }
    return ok({
      ok: true,
      rows_affected: 0,
      audit_id: auditId,
      sql_preview: sqlText,
      duration_ms: 0,
    });
  }

  // 9+11. Execute with statement_timeout inside transaction
  let pgRows: Row[] = [];
  let pgCount = 0;
  let pgError: string | null = null;
  const t1 = Date.now();
  try {
    const result = await db().begin(async (sql) => {
      await sql`SET LOCAL statement_timeout = '10s'`;
      return sql.unsafe(sqlText, params);
    });
    pgRows = result as unknown as Row[];
    pgCount = (result as unknown as { count?: number }).count ?? pgRows.length;
  } catch (e) {
    const isTimeout =
      (e !== null &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code: string }).code === '57014') ||
      (e instanceof Error && e.message.includes('canceling statement'));
    pgError = isTimeout ? 'query_timeout' : e instanceof Error ? e.message : String(e);
    pgCount = 0;
  }

  const durationMs = Date.now() - t1;

  // 12. Redact sensitive columns
  const redacted = redactRows(pgRows);
  const redactedParams = redactSqlParams(plan, params, REDACTED_COLS);

  // 13. UPDATE audit post-execution
  try {
    await auditUpdate(
      auditId,
      pgCount,
      { sample: redacted.slice(0, 3), total: pgCount },
      sqlText,
      redactedParams,
      durationMs,
      pgError,
    );
  } catch (e) {
    console.error('audit_update_failed', e);
  }

  if (pgError === 'query_timeout') {
    return err(504, 'query_timeout', 'La consulta tardó demasiado y se canceló.', {
      audit_id: auditId,
    });
  }
  if (pgError) {
    return err(400, 'pg_error', 'Error de base de datos.', {
      audit_id: auditId,
      details: { pg_message: pgError },
    });
  }

  // 14. Return 200
  return ok({
    ok: true,
    result: redacted,
    rows_affected: pgCount,
    audit_id: auditId,
    sql_preview: sqlText,
    duration_ms: durationMs,
  });
});
