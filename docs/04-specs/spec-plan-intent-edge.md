---
title: Edge Function plan-intent — proxy server-side a Gemini
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-auth-flow.md
  - ./spec-execute-plan-edge.md
  - ./spec-schema-summary-edge.md
  - ./spec-plan-json-schema.md
  - ./spec-audit-table.md
  - ./spec-confirmation-flow.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../02-architecture/PROMPT-ENGINEERING.md
  - ../02-architecture/AUDIT-MODEL.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
---

# Spec — Edge Function `plan-intent`

## 1. Propósito

`plan-intent` es la **única** vía por la que la PWA obtiene un Plan JSON.
Custodia la **Gemini API key server-side** (env var, nunca en cliente),
construye el system prompt con el `schema-summary` (filtrado por
allowlist server-side), invoca a Gemini con function calling restringido
a dos tools (`execute_plan` y `request_clarification`), valida la
respuesta y la devuelve a la PWA.

La PWA, tras recibir el Plan JSON:

1. Si la operación es `read`, lo envía directo a `execute-plan`.
2. Si es `write`, dispara el modal de confirmación táctil y luego envía
   a `execute-plan`.

`plan-intent` **no toca Postgres** del usuario (sólo `orion_audit` para
auditar la intención).

## 2. Alcance

**Cubre:**

- Endpoint HTTP `POST /functions/v1/plan-intent`.
- Auth con JWT Supabase + validación `ORION_ALLOWED_USER_ID`.
- Llamada interna a `schema-summary` con cache server-side (TTL 5 min).
- Construcción del system prompt (schema + reglas + hints).
- Llamada a Gemini API con function calling.
- Validación server-side del Plan JSON devuelto (Zod).
- Auditoría del intento en `orion_audit` con `was_dry_run: true,
  was_confirmed: false`.
- Manejo de respuesta `request_clarification` (cuando Gemini necesita
  desambiguar).
- Reintentos con backoff para errores transient de Gemini.

**NO cubre:**

- Ejecución del Plan contra Postgres del usuario (eso es
  `execute-plan`).
- Cifrado de credenciales en cliente (ya no aplica: `plan-intent`
  custodia la key Gemini server-side).
- Schema discovery (lo hace `schema-summary` en una Edge separada).

## 3. Interfaces / API / Contratos

### 3.1 Endpoint

```
POST /functions/v1/plan-intent
Host: <project-ref>.supabase.co
Content-Type: application/json
Authorization: Bearer <SUPABASE_AUTH_JWT>
```

### 3.2 Request body

```ts
interface PlanIntentRequest {
  user_prompt: string;       // transcripción de voz, en español
  client_version: string;    // ej: '0.3.1'
  hints?: string;            // hints semánticos del usuario, opcional (M1: enviado por cliente; M2 puede moverse a server)
  // conversation_id: postergado a M2 — multi-turn conversation tracking fuera de alcance M1.
  // Ver §7 y §3.2 nota M1.
}
```

**Nota M1 (fuera de alcance)**: multi-turn conversation tracking (`conversation_id`)
postergado a M2 cuando se diseñe el flujo conversacional. En M1 el cliente
concatena el contexto en `user_prompt` si quiere hilar turnos.

### 3.3 Response — éxito (200), variante Plan

```ts
interface PlanIntentResponsePlan {
  ok: true;
  kind: 'plan';
  plan: PlanJSON;            // ver spec-plan-json-schema.md
  schema_hash: string;       // sha256 del schema-summary efectivamente inyectado
  plan_intent_audit_id: string; // UUID del registro orion_audit del intento
  duration_ms: number;       // latencia total del pipeline (sin red cliente↔Edge)
}
```

### 3.4 Response — éxito (200), variante Clarification

Cuando Gemini decide invocar la tool `request_clarification` en lugar
de `execute_plan` (porque el prompt es ambiguo, falta info, o la tabla
no está en la allowlist).

```ts
interface PlanIntentResponseClarification {
  ok: true;
  kind: 'clarification';
  clarification: {
    question: string;        // pregunta a hacerle al usuario, en español
    reason?: string;         // diagnóstico interno (opcional, para debug)
  };
  plan_intent_audit_id: string;
  duration_ms: number;
}
```

### 3.5 Response — errores

| HTTP | `error`                  | Detalle                                                          |
|------|--------------------------|------------------------------------------------------------------|
| 401  | `unauthorized`           | Sin header `Authorization`.                                      |
| 401  | `invalid_token`          | JWT inválido / expirado.                                         |
| 403  | `forbidden_user`         | `user.id != ORION_ALLOWED_USER_ID`.                              |
| 400  | `invalid_request`        | Body no parseable o `user_prompt` vacío.                         |
| 422  | `invalid_plan_from_llm`  | Gemini devolvió Plan JSON que falla la validación Zod.           |
| 502  | `gemini_unavailable`     | Gemini API down o 5xx tras reintentos.                           |
| 504  | `gemini_timeout`         | Gemini no respondió en 8s.                                       |
| 429  | `gemini_quota_exceeded`  | Cuota Gemini agotada (rate limit o billing).                     |
| 500  | `schema_summary_failed`  | No se pudo obtener schema-summary (down, pg_error, etc.).        |
| 500  | `audit_insert_failed`    | INSERT a `orion_audit` falló. **No se devuelve plan al cliente.**|
| 500  | `internal`               | Otros errores internos.                                          |

Body de error:

```ts
interface PlanIntentResponseError {
  ok: false;
  error: string;
  message: string;            // mensaje user-facing en español
  details?: object | string[];
  plan_intent_audit_id?: string;
}
```

### 3.6 Headers de seguridad

- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- CORS: `Access-Control-Allow-Origin: <PWA_ORIGIN>` (env var).

## 4. Comportamiento esperado

### 4.1 Pipeline canónico

```
1. Recibir POST → parsear body
2. authGuard(req) → 401/403 si falla (ver spec-auth-flow §4.2)
3. Validar request body → 400 si user_prompt vacío
4. Obtener schema-summary efectivo:
     - Cache server-side in-memory por instancia (TTL 5 min, key = schema_hash)
     - Si miss / expirado: invocar internamente schema-summary Edge
       (fetch interno con su propia auth)
     - Si schema-summary falla: 500 schema_summary_failed
5. Construir system prompt:
     - Schema markdown (filtrado por ORION_ALLOWED_TABLES allowlist)
     - Reglas: español es-MX, devolver SIEMPRE Plan JSON via tool
       execute_plan, jamás SQL libre, etc. (ver PROMPT-ENGINEERING.md)
     - Hints opcionales del request
6. Llamar Gemini API con function calling:
     - tools: [execute_plan(PlanJSON schema), request_clarification(question)]
     - tool_config: { mode: 'ANY', allowed_function_names: ['execute_plan', 'request_clarification'] }
     - Reintentos: 3 con backoff exponencial (500ms, 1s, 2s) sólo
       para 429 / 5xx / timeouts
     - Timeout total 8s
7. Parsear respuesta de Gemini:
     a. Si invocó execute_plan → extraer Plan JSON
     b. Si invocó request_clarification → extraer pregunta
     c. Si no invocó tool (devolvió texto libre) → 422 invalid_plan_from_llm
8. Si Plan JSON: validatePlan(plan) (mismo módulo que execute-plan)
     → si falla: 422 invalid_plan_from_llm con details[]
9. INSERT en orion_audit:
     {
       source: 'plan-intent',
       ts: now,
       user_prompt,
       plan_json: kind='plan'          → <plan validado>
                  kind='clarification' → NULL  (columna nullable desde migration 002)
       result_summary: kind='clarification' → { type: 'clarification', question }
                       kind='plan'          → NULL  (execute-plan lo actualiza post-ejecución)
       schema_hash,
       client_version,
       was_confirmed: false,    // plan-intent NO confirma
       was_dry_run: true,       // plan-intent NO ejecuta
       sql_executed: NULL,
       sql_params: NULL,
       error: NULL,             // 'clarification' NO es error — trazabilidad en result_summary
     }
   → si INSERT falla: 500 audit_insert_failed (NO devolver plan)

   **LIMIT default — defensa en 3 capas (intencional, no redundancia accidental):**
   1. El system prompt instruye a Gemini "incluí `limit: 100` si no se especifica".
   2. El schema Zod tiene `.default(100)` → si Gemini lo omite, Zod lo inyecta al parsear.
   3. `execute-plan` re-valida `plan.limit > 0 && plan.limit <= 1000` — defensa final server.
10. Return 200 con kind='plan' o kind='clarification'
```

### 4.2 Variante `request_clarification`

Gemini puede decidir que el prompt es ambiguo. Ejemplos:

- "borrá las tareas viejas" → ¿qué es "viejas"?
- "actualizá el estado" → ¿de qué tabla?
- "mostrame el cliente" → ¿qué columna identifica?

En esos casos invoca `request_clarification(question: string)`. La PWA
recibe `kind: 'clarification'`, lo emite por TTS y vuelve a llamar
`plan-intent` con el prompt enriquecido. Cada vuelta es una nueva
request a `plan-intent` (no hay state server-side; el cliente
concatena el contexto en `user_prompt`). `conversation_id` es
feature M2 — ver §3.2 nota M1.

### 4.3 Allowlist de tablas

`plan-intent` **no enforce la allowlist directamente** sobre el Plan
JSON: confía en que (a) el `schema-summary` que inyecta sólo contiene
tablas de la allowlist y (b) `execute-plan` re-valida la allowlist
antes de ejecutar (defensa en profundidad).

Si Gemini "alucina" una tabla fuera de la allowlist, el plan llegará
a `execute-plan` y será rechazado con 403 `table_not_allowed`. La
PWA traduce ese error a "Esa tabla no está autorizada".

### 4.4 Caché del schema-summary

- Key: `schema_hash` (o lookup por env var version si se usa).
- TTL: 5 minutos (compromiso entre frescura y costo de pg_catalog).
- Scope: por instancia de Edge Function. No hay caché distribuida en
  M1 (Supabase Edge instances son pocas y cortas).
- Invalidación manual: la PWA puede mandar header
  `X-Refresh-Schema: 1` para forzar re-fetch al schema-summary.

### 4.5 Reintentos a Gemini

| Intento | Delay antes |
|---------|-------------|
| 1       | 0           |
| 2       | 500ms       |
| 3       | 1500ms      |

Sólo para errores `429`, `500-599` o timeouts de red. Errores `4xx`
(401 invalid key, 400 bad request) **no** reintentan: bubble up al
cliente con el error apropiado.

### 4.6 No ejecuta nada en Postgres del usuario

`plan-intent` toca **únicamente** `orion_audit` (insert del intento).
No corre el Plan JSON. Esa es la razón por la que `was_dry_run: true`
y `was_confirmed: false` siempre. La ejecución real ocurre cuando la
PWA llama `execute-plan` con el Plan recibido (después de la
confirmación táctil si es write).

## 5. Estados / lifecycle

Stateless por request. La única "memoria" es:

- Cache in-memory del schema-summary (TTL 5 min, perdible).
- Registros en `orion_audit` (persistentes).

```
[POST] → [auth] → [schema-summary fetch/cache] → [build prompt]
                                                       │
                                                       ▼
                                             [Gemini call + retries]
                                                       │
                                       ┌───────────────┤
                                       │ tool=plan     │ tool=clarification
                                       ▼               ▼
                                  [validate Zod] [extract question]
                                       │               │
                                       ▼               ▼
                                  [audit INSERT]  [audit INSERT]
                                       │               │
                                       ▼               ▼
                                   [200 plan]    [200 clarification]
```

## 6. Errores y manejo

### 6.1 Errores que igualmente auditan

`invalid_plan_from_llm` (422) y `gemini_quota_exceeded` (429): ambos
auditan en `orion_audit` con `error = '<motivo>'`. Permite analizar
con qué frecuencia Gemini falla y por qué.

### 6.2 Errores que NO auditan

- `audit_insert_failed` (por definición, no se puede auditar lo que no
  se puede insertar).
- `unauthorized` / `invalid_token` / `forbidden_user` (errores de auth
  pre-pipeline; no hay user identificable).

### 6.3 Mensajes user-facing

| Error                    | Mensaje en español                                           |
|--------------------------|--------------------------------------------------------------|
| `invalid_plan_from_llm`  | "El asistente devolvió una respuesta que no entendí. Probá reformular." |
| `gemini_unavailable`     | "El asistente no responde. Probá en unos minutos."           |
| `gemini_timeout`         | "El asistente tardó demasiado. Probá de nuevo."              |
| `gemini_quota_exceeded`  | "Te quedaste sin cuota de Gemini. Probá más tarde."          |
| `schema_summary_failed`  | "No pude leer el schema de tu base. Revisá la conexión."     |
| `audit_insert_failed`    | "No pude registrar la auditoría. Operación abortada."        |
| `forbidden_user`         | "Tu cuenta no está autorizada en esta instancia."            |

## 7. Restricciones M1

- **Sin streaming de Gemini**. Respuesta completa o error. Streaming
  agregaría complejidad sin valor para el caso de uso (planes son
  cortos, no chat largo).
- **Sin memoria conversacional server-side**. Cada request es
  autónoma. La PWA puede mandar contexto en `user_prompt` si quiere
  hilar.
- **Sin conversation_id / multi-turn conversation tracking**. Postergado
  a M2 cuando se diseñe el flujo conversacional (requiere schema,
  ADR y diseño de state). Ver §3.2 nota M1.
- **Cache de schema-summary in-memory por instancia**. No hay caché
  distribuida. Aceptable: la mayoría de calls comparten instancia
  caliente.
- **Sin embeddings ni RAG**. Gemini recibe el schema-summary completo
  como system prompt. Si la base crece > 200 KB de schema, la PWA
  debe achicar la allowlist.
- **Sin métricas de uso ni rate-limit per-user**. Single-user — el
  límite efectivo es la cuota Gemini. M2 puede agregar un budget per
  día.

## 8. Criterios de aceptación verificables

- [ ] POST sin `Authorization` retorna 401 `unauthorized`.
- [ ] POST con JWT inválido retorna 401 `invalid_token`.
- [ ] POST con JWT de un user distinto al `ORION_ALLOWED_USER_ID`
      retorna 403 `forbidden_user`.
- [ ] POST con body válido y JWT correcto invoca a Gemini server-side
      y retorna 200 con `kind: 'plan'`.
- [ ] La Gemini API key **no** aparece en la respuesta ni en logs
      visibles desde el cliente (verificable inspeccionando Network +
      Edge logs).
- [ ] El bundle de la PWA **no** contiene la string `GEMINI_API_KEY`,
      `gemini_api_key`, ni el SDK `@google/genai` (verificable con
      grep sobre el bundle compilado).
- [ ] Si Gemini invoca `request_clarification`, la respuesta tiene
      `kind: 'clarification'` y la pregunta está en español.
- [ ] Si Gemini devuelve un Plan JSON malformado, retorna 422
      `invalid_plan_from_llm` con `details[]`.
- [ ] Si Gemini devuelve 429, se hacen 3 reintentos con backoff y
      luego se devuelve 429 `gemini_quota_exceeded`.
- [ ] Si Gemini timeout > 8s, se devuelve 504 `gemini_timeout`.
- [ ] Cada call exitosa deja un registro en `orion_audit` con
      `was_dry_run: true`, `was_confirmed: false`,
      `source: 'plan-intent'`.
- [ ] Si `orion_audit` está down, retorna 500 `audit_insert_failed`
      y NO devuelve el plan al cliente.
- [ ] El `schema_hash` devuelto matchea el schema-summary efectivamente
      inyectado en el system prompt.

## 9. Dependencias

- **Auth Flow** (`spec-auth-flow.md`) — middleware compartido.
- **Schema Summary Edge** (`spec-schema-summary-edge.md`) — invocada
  internamente.
- **Plan JSON Schema** (`spec-plan-json-schema.md`) — validador
  compartido con `execute-plan`.
- **Audit Table** (`spec-audit-table.md`) — destino del INSERT.
- **Execute Plan Edge** (`spec-execute-plan-edge.md`) — consumidor del
  Plan JSON tras la confirmación táctil.
- Gemini API (`generativelanguage.googleapis.com`) con function calling.
- Env vars Edge: `GEMINI_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ORION_ALLOWED_USER_ID`,
  `ORION_ALLOWED_TABLES`, `PWA_ORIGIN`.

## 10. Referencias

- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2)
- `../02-architecture/PROMPT-ENGINEERING.md` (system prompt completo)
- `../02-architecture/AUDIT-MODEL.md` (qué se loguea)
- `../03-adr/ADR-005-gemini-key-client-m1-server-m2.md` (decisión)
- `./spec-auth-flow.md`
- `./spec-execute-plan-edge.md`
- `./spec-schema-summary-edge.md`
