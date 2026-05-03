import type { Plan } from '../contracts/plan-schema.ts';
import { localStore } from '../storage/local-store.ts';
import type { LocalStorageAPI, SchemaCacheEntry } from '../storage/types.ts';

export const PLAN_INTENT_CLIENT_VERSION = '0.0.0';
export const PLAN_INTENT_REFRESH_SCHEMA_SETTING = 'planIntent.refreshSchemaNext';

export type PlanIntentServerErrorCode =
  | 'unauthorized'
  | 'invalid_token'
  | 'forbidden_user'
  | 'invalid_request'
  | 'invalid_plan_from_llm'
  | 'gemini_unavailable'
  | 'gemini_timeout'
  | 'gemini_quota_exceeded'
  | 'schema_summary_failed'
  | 'audit_insert_failed'
  | 'internal';

export type PlanIntentClientErrorCode =
  | PlanIntentServerErrorCode
  | 'missing_token'
  | 'network_error'
  | 'invalid_response';

export interface PlanIntentPlanResponse {
  ok: true;
  kind: 'plan';
  plan: Plan;
  schema_hash: string;
  plan_intent_audit_id: string;
  duration_ms: number;
}

export interface PlanIntentClarificationResponse {
  ok: true;
  kind: 'clarification';
  clarification: {
    question: string;
    reason?: string;
  };
  plan_intent_audit_id: string;
  duration_ms: number;
}

export type PlanIntentResponse = PlanIntentPlanResponse | PlanIntentClarificationResponse;

export interface PlanIntentRequestOptions {
  accessToken: string;
  userPrompt: string;
  hints?: string;
  clientVersion?: string;
  endpoint?: string;
  supabaseUrl?: string;
  fetcher?: typeof fetch;
  storage?: Pick<
    LocalStorageAPI,
    'getSchemaCache' | 'clearSchemaCache' | 'getSetting' | 'putSetting' | 'deleteSetting'
  >;
  onUnauthorized?: (error: PlanIntentClientError) => void | Promise<void>;
}

interface PlanIntentErrorParams {
  code: PlanIntentClientErrorCode;
  message: string;
  status?: number;
  details?: unknown;
  planIntentAuditId?: string;
}

export class PlanIntentClientError extends Error {
  readonly code: PlanIntentClientErrorCode;
  readonly status?: number;
  readonly details?: unknown;
  readonly planIntentAuditId?: string;

  constructor(params: PlanIntentErrorParams) {
    super(params.message);
    this.name = 'PlanIntentClientError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
    this.planIntentAuditId = params.planIntentAuditId;
  }
}

const PLAN_INTENT_SERVER_ERROR_CODES: ReadonlySet<string> = new Set<PlanIntentServerErrorCode>([
  'unauthorized',
  'invalid_token',
  'forbidden_user',
  'invalid_request',
  'invalid_plan_from_llm',
  'gemini_unavailable',
  'gemini_timeout',
  'gemini_quota_exceeded',
  'schema_summary_failed',
  'audit_insert_failed',
  'internal',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServerErrorCode(value: unknown): value is PlanIntentServerErrorCode {
  return typeof value === 'string' && PLAN_INTENT_SERVER_ERROR_CODES.has(value);
}

function resolveEndpoint(endpoint?: string, supabaseUrl?: string): string {
  if (endpoint) return endpoint;
  const baseUrl = supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) {
    throw new PlanIntentClientError({
      code: 'invalid_response',
      message: 'Falta configurar VITE_SUPABASE_URL para plan-intent.',
    });
  }
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/plan-intent`;
}

function parseSuccessBody(body: unknown): PlanIntentResponse {
  if (!isRecord(body) || body.ok !== true || typeof body.kind !== 'string') {
    throw new PlanIntentClientError({
      code: 'invalid_response',
      message: 'plan-intent devolvió una respuesta inesperada.',
    });
  }

  const auditId = body.plan_intent_audit_id;
  const durationMs = body.duration_ms;
  if (typeof auditId !== 'string' || typeof durationMs !== 'number') {
    throw new PlanIntentClientError({
      code: 'invalid_response',
      message: 'plan-intent devolvió metadatos incompletos.',
    });
  }

  if (body.kind === 'plan') {
    if (!isRecord(body.plan) || typeof body.schema_hash !== 'string') {
      throw new PlanIntentClientError({
        code: 'invalid_response',
        message: 'plan-intent devolvió un plan incompleto.',
      });
    }
    return {
      ok: true,
      kind: 'plan',
      plan: body.plan as Plan,
      schema_hash: body.schema_hash,
      plan_intent_audit_id: auditId,
      duration_ms: durationMs,
    };
  }

  if (body.kind === 'clarification') {
    const clarification = body.clarification;
    if (!isRecord(clarification) || typeof clarification.question !== 'string') {
      throw new PlanIntentClientError({
        code: 'invalid_response',
        message: 'plan-intent devolvió una aclaración incompleta.',
      });
    }
    return {
      ok: true,
      kind: 'clarification',
      clarification: {
        question: clarification.question,
        reason: typeof clarification.reason === 'string' ? clarification.reason : undefined,
      },
      plan_intent_audit_id: auditId,
      duration_ms: durationMs,
    };
  }

  throw new PlanIntentClientError({
    code: 'invalid_response',
    message: 'plan-intent devolvió un tipo de respuesta desconocido.',
  });
}

function parseErrorBody(body: unknown, status: number): PlanIntentClientError {
  if (!isRecord(body) || body.ok !== false || !isServerErrorCode(body.error)) {
    return new PlanIntentClientError({
      code: 'invalid_response',
      status,
      message: 'plan-intent devolvió un error inesperado.',
      details: body,
    });
  }

  return new PlanIntentClientError({
    code: body.error,
    status,
    message: typeof body.message === 'string' ? body.message : 'plan-intent rechazó la solicitud.',
    details: body.details,
    planIntentAuditId:
      typeof body.plan_intent_audit_id === 'string' ? body.plan_intent_audit_id : undefined,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new PlanIntentClientError({
      code: 'invalid_response',
      status: response.status,
      message: 'plan-intent no devolvió JSON válido.',
    });
  }
}

async function consumeRefreshSchemaFlag(
  storage: Pick<LocalStorageAPI, 'getSetting' | 'deleteSetting'>,
): Promise<boolean> {
  const shouldRefresh = await storage.getSetting<boolean>(PLAN_INTENT_REFRESH_SCHEMA_SETTING);
  if (shouldRefresh === true) {
    await storage.deleteSetting(PLAN_INTENT_REFRESH_SCHEMA_SETTING);
    return true;
  }
  return false;
}

async function markSchemaCacheIfStale(
  response: PlanIntentResponse,
  storage: Pick<LocalStorageAPI, 'getSchemaCache' | 'clearSchemaCache' | 'putSetting'>,
): Promise<void> {
  if (response.kind !== 'plan') return;

  const cached: SchemaCacheEntry | null = await storage.getSchemaCache();
  if (cached && cached.schema_hash !== response.schema_hash) {
    await storage.clearSchemaCache();
    await storage.putSetting(PLAN_INTENT_REFRESH_SCHEMA_SETTING, true);
  }
}

export function buildClarifiedPrompt(promptOriginal: string, respuestaUsuario: string): string {
  return `${promptOriginal}\n\nAclaración del usuario: ${respuestaUsuario}`;
}

export async function requestPlanIntent(
  options: PlanIntentRequestOptions,
): Promise<PlanIntentResponse> {
  const token = options.accessToken.trim();
  const prompt = options.userPrompt.trim();

  if (!token) {
    throw new PlanIntentClientError({
      code: 'missing_token',
      message: 'Falta sesión para llamar a plan-intent.',
    });
  }
  if (!prompt) {
    throw new PlanIntentClientError({
      code: 'invalid_request',
      message: 'El prompt no puede estar vacío.',
    });
  }

  const storage = options.storage ?? localStore;
  const endpoint = resolveEndpoint(options.endpoint, options.supabaseUrl);
  const fetcher = options.fetcher ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (await consumeRefreshSchemaFlag(storage)) {
    headers['X-Refresh-Schema'] = '1';
  }

  let httpResponse: Response;
  try {
    httpResponse = await fetcher(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_prompt: prompt,
        client_version: options.clientVersion ?? PLAN_INTENT_CLIENT_VERSION,
        ...(options.hints ? { hints: options.hints } : {}),
      }),
    });
  } catch (error) {
    throw new PlanIntentClientError({
      code: 'network_error',
      message: 'No pude conectar con plan-intent.',
      details: error,
    });
  }

  const body = await readJson(httpResponse);
  if (!httpResponse.ok) {
    const error = parseErrorBody(body, httpResponse.status);
    if (error.code === 'unauthorized' || error.code === 'invalid_token') {
      await options.onUnauthorized?.(error);
    }
    throw error;
  }

  const parsed = parseSuccessBody(body);
  await markSchemaCacheIfStale(parsed, storage);
  return parsed;
}
