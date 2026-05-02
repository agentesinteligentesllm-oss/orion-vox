import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { getSchemaSummary, type SqlRunner } from '../_shared/schema-summary-core.ts';

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_USER_ID = Deno.env.get('ORION_ALLOWED_USER_ID') ?? '';
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
const PWA_ORIGIN = Deno.env.get('PWA_ORIGIN') ?? '*';

// ─── DB connection (lazy singleton) ──────────────────────────────────────────

let _db: ReturnType<typeof postgres> | null = null;
function db(): SqlRunner {
  if (!_db) _db = postgres(DB_URL, { max: 1 });
  return _db as unknown as SqlRunner;
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

// ─── Schema validation ────────────────────────────────────────────────────────

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/;

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // 1+2. Auth — JWT only. No SERVICE_ROLE_KEY bypass: callers (plan-intent, execute-plan)
  // import getSchemaSummary directly and never make HTTP calls to this endpoint.
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

  // 5. Core — pg_catalog → markdown → hash
  let result: Awaited<ReturnType<typeof getSchemaSummary>>;
  try {
    result = await getSchemaSummary(db(), allowedTables, schemaName);
  } catch (e) {
    console.error('pg_error', e);
    return err(500, 'pg_error', 'Error al leer el schema de la base de datos.');
  }

  // 6. Return
  return ok({
    ...result,
    schema: schemaName,
  });
});
