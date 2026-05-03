import type { Plan } from '../contracts/plan-schema.ts';
import { redactResult } from '../utils/redact-client.ts';

export const EXECUTE_PLAN_CLIENT_VERSION = '0.0.0';

function resolveEndpoint(supabaseUrl?: string): string {
  const base = supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  if (!base) {
    throw new Error('Falta configurar VITE_SUPABASE_URL para execute-plan.');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/execute-plan`;
}

// --- Cancel audit (fire-and-forget) ---

export interface AuditCancelOptions {
  supabaseUrl?: string;
  userPrompt?: string;
  schemaHash?: string;
}

export function auditCancel(plan: Plan, accessToken: string, opts?: AuditCancelOptions): void {
  let url: string;
  try {
    url = resolveEndpoint(opts?.supabaseUrl);
  } catch (err) {
    console.warn('audit cancel: no endpoint configured', err);
    return;
  }
  fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan,
      user_prompt: opts?.userPrompt ?? '',
      client_version: EXECUTE_PLAN_CLIENT_VERSION,
      schema_hash: opts?.schemaHash ?? '',
      rejected_by_user: true,
    }),
  }).catch((err) => console.warn('audit cancel failed', err));
}

// --- Execute plan client (T6.1) ---

export type ExecutePlanClientErrorCode =
  | 'unauthorized'
  | 'invalid_token'
  | 'forbidden_user'
  | 'invalid_plan'
  | 'validation_failed'
  | 'schema_stale'
  | 'table_not_allowed'
  | 'operation_blocked'
  | 'missing_filters'
  | 'audit_table_protected'
  | 'query_timeout'
  | 'pg_error'
  | 'audit_insert_failed'
  | 'internal'
  | 'missing_token'
  | 'network_error'
  | 'invalid_response';

export const EXECUTE_PLAN_ERROR_MESSAGES: Record<ExecutePlanClientErrorCode, string> = {
  // — errores de servidor (spec §6.3) —
  unauthorized: 'Falta autenticación.',
  invalid_token: 'Tu sesión expiró. Iniciá sesión de nuevo.',
  forbidden_user: 'Tu cuenta no está autorizada en esta instancia.',
  invalid_plan: 'El plan recibido no es válido.',
  validation_failed: 'El plan tiene errores de validación.',
  schema_stale: 'El esquema cambió. Reformulá el comando.',
  table_not_allowed: 'Tabla no autorizada en esta instancia.',
  operation_blocked: 'Operación no permitida.',
  missing_filters: 'Operación destructiva sin filtros: rechazada.',
  audit_table_protected: 'No se puede operar sobre la tabla de auditoría.',
  query_timeout: 'La consulta tardó demasiado y se canceló.',
  pg_error: 'Error de base de datos. Probá de nuevo.',
  audit_insert_failed: 'No se pudo registrar la auditoría. Operación abortada.',
  internal: 'Error interno del servidor. Intentá de nuevo.',
  // — errores client-only —
  missing_token: 'Sesión no válida. Volvé a iniciar sesión.',
  network_error: 'Sin conexión. Revisá tu red e intentá de nuevo.',
  invalid_response: 'Respuesta inesperada del servidor. Intentá de nuevo.',
};

export class ExecutePlanClientError extends Error {
  readonly code: ExecutePlanClientErrorCode;
  readonly messageEs: string;
  readonly details?: unknown;
  readonly auditId?: string;

  constructor(init: {
    code: ExecutePlanClientErrorCode;
    messageEs?: string;
    details?: unknown;
    auditId?: string;
  }) {
    const messageEs = init.messageEs ?? EXECUTE_PLAN_ERROR_MESSAGES[init.code];
    super(`execute-plan [${init.code}]: ${messageEs}`);
    this.name = 'ExecutePlanClientError';
    this.code = init.code;
    this.messageEs = messageEs;
    this.details = init.details;
    this.auditId = init.auditId;
  }
}

export interface ExecutePlanSuccess {
  ok: true;
  result: unknown;
  rows_affected: number;
  audit_id: string;
  sql_preview: string | null;
  duration_ms: number;
}

export interface ExecutePlanOptions {
  supabaseUrl?: string;
  userPrompt?: string;
  schemaHash?: string;
  dryRun?: boolean;
  wasConfirmed?: boolean;
}

const SERVER_CODE_MAP: Partial<Record<string, ExecutePlanClientErrorCode>> = {
  unauthorized: 'unauthorized',
  invalid_token: 'invalid_token',
  forbidden_user: 'forbidden_user',
  invalid_plan: 'invalid_plan',
  validation_failed: 'validation_failed',
  schema_stale: 'schema_stale',
  table_not_allowed: 'table_not_allowed',
  operation_blocked: 'operation_blocked',
  missing_filters: 'missing_filters',
  audit_table_protected: 'audit_table_protected',
  query_timeout: 'query_timeout',
  pg_error: 'pg_error',
  audit_insert_failed: 'audit_insert_failed',
  internal: 'internal',
};

function toClientCode(serverCode: string): ExecutePlanClientErrorCode {
  return SERVER_CODE_MAP[serverCode] ?? 'internal';
}

export async function executePlan(
  plan: Plan,
  accessToken: string,
  opts?: ExecutePlanOptions,
): Promise<ExecutePlanSuccess> {
  if (!accessToken) {
    throw new ExecutePlanClientError({ code: 'missing_token' });
  }

  let url: string;
  try {
    url = resolveEndpoint(opts?.supabaseUrl);
  } catch {
    throw new ExecutePlanClientError({ code: 'network_error' });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan,
        user_prompt: opts?.userPrompt ?? '',
        client_version: EXECUTE_PLAN_CLIENT_VERSION,
        schema_hash: opts?.schemaHash ?? '',
        dry_run: opts?.dryRun ?? false,
        was_confirmed: opts?.wasConfirmed ?? true,
      }),
    });
  } catch {
    throw new ExecutePlanClientError({ code: 'network_error' });
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ExecutePlanClientError({ code: 'invalid_response' });
  }

  if (!response.ok) {
    const err = body as {
      error?: string;
      message?: string;
      details?: unknown;
      audit_id?: string;
    };
    const code = toClientCode(err.error ?? 'internal');
    const messageEs = err.message ?? EXECUTE_PLAN_ERROR_MESSAGES[code];
    throw new ExecutePlanClientError({
      code,
      messageEs,
      details: err.details,
      auditId: err.audit_id,
    });
  }

  const ok = body as Record<string, unknown>;
  if (ok.ok !== true || typeof ok.rows_affected !== 'number' || typeof ok.audit_id !== 'string') {
    throw new ExecutePlanClientError({ code: 'invalid_response' });
  }

  // T6.3: aplicar redacción client-side antes de retornar (defensa en profundidad)
  const redactedResult = redactResult(ok.result ?? null);

  return {
    ok: true,
    result: redactedResult,
    rows_affected: ok.rows_affected,
    audit_id: ok.audit_id,
    sql_preview: typeof ok.sql_preview === 'string' ? ok.sql_preview : null,
    duration_ms: typeof ok.duration_ms === 'number' ? ok.duration_ms : 0,
  };
}
