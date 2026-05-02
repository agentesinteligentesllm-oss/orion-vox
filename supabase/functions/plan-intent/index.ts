import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { PlanSchema } from '../_shared/plan-schema.ts';

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ALLOWED_USER_ID = Deno.env.get('ORION_ALLOWED_USER_ID') ?? '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
const PWA_ORIGIN = Deno.env.get('PWA_ORIGIN') ?? '*';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [0, 500, 1500];
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Clients (module-level singletons) ───────────────────────────────────────

const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

let _db: ReturnType<typeof postgres> | null = null;
function db(): ReturnType<typeof postgres> {
  if (!_db) _db = postgres(DB_URL, { max: 1 });
  return _db;
}

// ─── Schema-summary cache ─────────────────────────────────────────────────────

interface SchemaCacheEntry {
  markdown: string;
  hash: string;
  expiresAt: number;
}
const schemaCache = new Map<string, SchemaCacheEntry>();

async function getSchemaOrThrow(
  forceRefresh: boolean,
): Promise<{ markdown: string; hash: string }> {
  if (!forceRefresh) {
    const cached = schemaCache.get('');
    if (cached && Date.now() < cached.expiresAt) {
      return { markdown: cached.markdown, hash: cached.hash };
    }
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/schema-summary`, {
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`schema_summary_failed: HTTP ${res.status}`);
  const data = (await res.json()) as { markdown?: string; hash?: string };
  if (!data.markdown || !data.hash) throw new Error('schema_summary_failed: invalid response');
  const entry: SchemaCacheEntry = {
    markdown: data.markdown,
    hash: data.hash,
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
  };
  schemaCache.set('', entry);
  return { markdown: data.markdown, hash: data.hash };
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(schemaMarkdown: string, hints: string): string {
  const rol = `\
Sos Orion Vox, un asistente que traduce frases en español del usuario
a operaciones estructuradas (Plan JSON) sobre su base de datos
Postgres en Supabase. El usuario habla en español rioplatense (con
voseo y léxico de Argentina) y vos respondés siempre en español.

Tu única salida válida es invocar una de las dos funciones
disponibles:

- \`execute_plan(plan)\` cuando entendés qué quiere hacer y podés
  construir un Plan JSON válido contra el schema dado.
- \`request_clarification(message)\` cuando la frase es ambigua,
  referencia una tabla o columna que no existe en el schema, o
  necesitás más información para construir un Plan JSON correcto.

NUNCA respondas con texto libre, prosa, markdown, código SQL, ni
ningún otro formato. SIEMPRE invocá una de las dos funciones.`;

  const reglas = `\
REGLAS ESTRICTAS — INVIOLABLES:

1. SIN SQL LIBRE. Nunca generes strings de SQL. Solo Plan JSON
   estructurado vía la función \`execute_plan\`.

2. SOLO LAS OPERACIONES PERMITIDAS:
   - select, insert, update, delete.
   - Nada de DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, COPY, DO.
   - Nada de funciones procedurales ni triggers.

3. SOLO TABLAS Y COLUMNAS DEL SCHEMA. Si el usuario menciona algo
   que no existe en el schema, invocá \`request_clarification\`.

4. UPDATE Y DELETE SIEMPRE CON FILTROS. Nunca generes un update o
   delete sin la propiedad \`filters\` con al menos un elemento. Si
   el usuario pide "borrá todo X" sin condición, invocá
   \`request_clarification\` para confirmar.

5. SIN SUBQUERIES ANIDADAS. Los \`value\` en filters deben ser
   escalares (string, number, boolean, null) o arrays de escalares
   (para \`in\`/\`not_in\`). Nada de objetos.

6. SIN FUNCIONES SQL EN VALORES. Si necesitás "fecha de hoy",
   calculá la fecha como literal ISO; no uses \`now()\`.

7. JOINS LIMITADOS. Solo INNER JOIN, máximo 1, sobre relaciones
   declaradas en el schema (FKs).

8. LIMIT EN SELECTS. Si no se especifica, usá \`limit: 100\`. Nunca
   más de 1000.

9. RESPONDÉ EN ESPAÑOL. Las descripciones, mensajes de
   clarificación, y cualquier texto que generes va en español
   rioplatense neutro.

10. SI DUDÁS, PEDÍ CLARIFICACIÓN. Es mejor preguntar de nuevo que
    ejecutar la operación equivocada.`;

  const schema = `\
SCHEMA DE LA BASE DEL USUARIO:

${schemaMarkdown}${hints ? `\n\nHINTS DEL USUARIO:\n${hints}` : ''}`;

  const ejemplos = `\
EJEMPLOS:

Usuario: "mostrame las tareas activas"
→ execute_plan({"version":"1.0","operation":"select","table":"tareas","columns":["id","titulo","estado","creado_en"],"filters":[{"column":"estado","op":"=","value":"activa"}],"order_by":[{"column":"creado_en","dir":"desc"}],"limit":100})

Usuario: "marcá como hecha la tarea con id abc-123"
→ execute_plan({"version":"1.0","operation":"update","table":"tareas","values":{"estado":"hecha"},"filters":[{"column":"id","op":"=","value":"abc-123"}]})

Usuario: "borrá todas las tareas viejas"
→ request_clarification({"message":"¿Qué considerás 'viejas'? ¿Las archivadas, las creadas hace más de N días, o las que ya están hechas?","candidates":["archivadas","más de 30 días","estado = hecha"]})

Usuario: "mostrame los pedidos pendientes" (si 'pedidos' no existe en schema)
→ request_clarification({"message":"No encuentro una tabla 'pedidos' en tu base. ¿Te referís a otra tabla?","candidates":["tareas","categorias"]})`;

  return [rol, reglas, schema, ejemplos].join('\n\n---\n\n');
}

// ─── Gemini tool declarations ─────────────────────────────────────────────────

const EXECUTE_PLAN_DECL = {
  name: 'execute_plan',
  description:
    'Ejecutá un Plan JSON contra la base del usuario. Usá esta función SIEMPRE que entiendas la intención y puedas construir un plan válido contra el schema dado.',
  parameters: {
    type: 'OBJECT',
    required: ['version', 'operation', 'table'],
    properties: {
      version: { type: 'STRING', enum: ['1.0'] },
      operation: { type: 'STRING', enum: ['select', 'insert', 'update', 'delete'] },
      table: { type: 'STRING' },
      columns: { type: 'ARRAY', items: { type: 'STRING' } },
      values: { type: 'OBJECT' },
      filters: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['column', 'op'],
          properties: {
            column: { type: 'STRING' },
            op: {
              type: 'STRING',
              enum: [
                '=',
                '!=',
                '<',
                '>',
                '<=',
                '>=',
                'in',
                'not_in',
                'like',
                'ilike',
                'is_null',
                'is_not_null',
              ],
            },
            value: {},
          },
        },
      },
      order_by: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['column', 'dir'],
          properties: {
            column: { type: 'STRING' },
            dir: { type: 'STRING', enum: ['asc', 'desc'] },
          },
        },
      },
      limit: { type: 'INTEGER', minimum: 1, maximum: 1000 },
      joins: {
        type: 'ARRAY',
        maxItems: 1,
        items: {
          type: 'OBJECT',
          required: ['type', 'table', 'on'],
          properties: {
            type: { type: 'STRING', enum: ['inner'] },
            table: { type: 'STRING' },
            on: {
              type: 'OBJECT',
              required: ['left', 'right'],
              properties: {
                left: { type: 'STRING' },
                right: { type: 'STRING' },
              },
            },
          },
        },
      },
    },
  },
};

const REQUEST_CLARIFICATION_DECL = {
  name: 'request_clarification',
  description:
    'Pedí más información al usuario cuando la frase es ambigua, hace referencia a algo que no existe en el schema, o necesitás confirmación antes de generar un plan destructivo amplio.',
  parameters: {
    type: 'OBJECT',
    required: ['message'],
    properties: {
      message: { type: 'STRING' },
      candidates: { type: 'ARRAY', items: { type: 'STRING' } },
    },
  },
};

// ─── Gemini call with retries ─────────────────────────────────────────────────

type GeminiResult =
  | { kind: 'plan'; args: Record<string, unknown> }
  | { kind: 'clarification'; message: string; reason?: string };

function isRetriableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  );
}

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<GeminiResult> {
  let lastError: unknown = new Error('gemini_unavailable');

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) await sleep(delay);

    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('gemini_timeout')), GEMINI_TIMEOUT_MS),
      );
      const call = genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 2048,
          tools: [{ functionDeclarations: [EXECUTE_PLAN_DECL, REQUEST_CLARIFICATION_DECL] }],
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY',
              allowedFunctionNames: ['execute_plan', 'request_clarification'],
            },
          },
        },
      });
      const response = await Promise.race([call, timeout]);

      const calls = response.functionCalls;
      const fc = calls?.[0];
      if (!fc?.name) throw new Error('invalid_plan_from_llm: no function call in response');

      if (fc.name === 'execute_plan') {
        return { kind: 'plan', args: (fc.args ?? {}) as Record<string, unknown> };
      }
      if (fc.name === 'request_clarification') {
        const args = (fc.args ?? {}) as Record<string, unknown>;
        return {
          kind: 'clarification',
          message: typeof args.message === 'string' ? args.message : '',
          reason: typeof args.reason === 'string' ? args.reason : undefined,
        };
      }
      throw new Error(`invalid_plan_from_llm: unknown function ${fc.name}`);
    } catch (e) {
      lastError = e;
      if (e instanceof Error && e.message === 'gemini_timeout') break;
      if (e instanceof Error && e.message.startsWith('invalid_plan_from_llm')) break;
      if (!isRetriableError(e)) break;
    }
  }

  throw lastError;
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

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS });
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

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function auditPlanIntent(
  userPrompt: string,
  planJson: unknown,
  resultSummary: unknown,
  schemaHash: string,
  clientVersion: string,
  errorCode: string | null,
): Promise<string> {
  const rows = (await db().unsafe(
    `INSERT INTO public.orion_audit
      (source, user_prompt, plan_json, result_summary, schema_hash,
       client_version, was_confirmed, was_dry_run, error)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      'plan-intent',
      userPrompt,
      planJson !== null ? JSON.stringify(planJson) : null,
      resultSummary !== null ? JSON.stringify(resultSummary) : null,
      schemaHash,
      clientVersion,
      false,
      true,
      errorCode,
    ],
  )) as Array<{ id: string }>;
  return rows[0].id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // 1+2. Auth
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
  let body: { user_prompt?: unknown; client_version?: unknown; hints?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return err(400, 'invalid_request', 'Body inválido.');
  }
  const userPrompt = typeof body.user_prompt === 'string' ? body.user_prompt.trim() : '';
  if (!userPrompt) {
    return err(400, 'invalid_request', 'user_prompt no puede estar vacío.');
  }
  const clientVersion = typeof body.client_version === 'string' ? body.client_version : '';
  const hints = typeof body.hints === 'string' ? body.hints : '';
  const forceRefresh = req.headers.get('x-refresh-schema') === '1';

  const t0 = Date.now();

  // 4. Schema-summary
  let schemaMarkdown: string;
  let schemaHash: string;
  try {
    const s = await getSchemaOrThrow(forceRefresh);
    schemaMarkdown = s.markdown;
    schemaHash = s.hash;
  } catch {
    return err(
      500,
      'schema_summary_failed',
      'No pude leer el schema de tu base. Revisá la conexión.',
    );
  }

  // 5. Build system prompt
  const systemPrompt = buildSystemPrompt(schemaMarkdown, hints);

  // 6. Gemini call with retries
  let geminiResult: GeminiResult;
  try {
    geminiResult = await callGemini(systemPrompt, userPrompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'gemini_timeout') {
      return err(504, 'gemini_timeout', 'El asistente tardó demasiado. Probá de nuevo.');
    }
    if (isQuotaError(e)) {
      try {
        await auditPlanIntent(
          userPrompt,
          null,
          null,
          schemaHash,
          clientVersion,
          'gemini_quota_exceeded',
        );
      } catch {}
      return err(429, 'gemini_quota_exceeded', 'Te quedaste sin cuota de Gemini. Probá más tarde.');
    }
    if (msg.startsWith('invalid_plan_from_llm')) {
      try {
        await auditPlanIntent(
          userPrompt,
          null,
          null,
          schemaHash,
          clientVersion,
          'invalid_plan_from_llm',
        );
      } catch {}
      return err(
        422,
        'invalid_plan_from_llm',
        'El asistente devolvió una respuesta que no entendí. Probá reformular.',
      );
    }
    return err(502, 'gemini_unavailable', 'El asistente no responde. Probá en unos minutos.');
  }

  // 7+8. Parse and validate plan
  let planJson: unknown = null;
  let resultSummary: unknown = null;
  const errorCode: string | null = null;

  if (geminiResult.kind === 'plan') {
    const parsed = PlanSchema.safeParse(geminiResult.args);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      try {
        await auditPlanIntent(
          userPrompt,
          geminiResult.args,
          null,
          schemaHash,
          clientVersion,
          'invalid_plan_from_llm',
        );
      } catch {}
      return err(
        422,
        'invalid_plan_from_llm',
        'El asistente devolvió una respuesta que no entendí. Probá reformular.',
        { details },
      );
    }
    planJson = parsed.data;
  } else {
    resultSummary = { type: 'clarification', question: geminiResult.message };
  }

  // 9. Audit INSERT
  let auditId: string;
  try {
    auditId = await auditPlanIntent(
      userPrompt,
      planJson,
      resultSummary,
      schemaHash,
      clientVersion,
      errorCode,
    );
  } catch (e) {
    console.error('audit_insert_failed', e);
    return err(500, 'audit_insert_failed', 'No pude registrar la auditoría. Operación abortada.');
  }

  const durationMs = Date.now() - t0;

  // 10. Return 200
  if (geminiResult.kind === 'plan') {
    return ok({
      ok: true,
      kind: 'plan',
      plan: planJson,
      schema_hash: schemaHash,
      plan_intent_audit_id: auditId,
      duration_ms: durationMs,
    });
  }
  return ok({
    ok: true,
    kind: 'clarification',
    clarification: {
      question: geminiResult.message,
      reason: geminiResult.reason,
    },
    plan_intent_audit_id: auditId,
    duration_ms: durationMs,
  });
});
