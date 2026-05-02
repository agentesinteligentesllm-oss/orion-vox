---
title: Gemini API Client — function calling para Plan JSON (DEPRECATED — superseded por spec-plan-intent-edge)
status: superseded
superseded-by: ./spec-plan-intent-edge.md
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-plan-intent-edge.md
  - ./spec-voice-input.md
  - ./spec-plan-json-schema.md
  - ./spec-execute-plan-edge.md
  - ./spec-confirmation-flow.md
  - ./spec-credentials-storage.md
  - ./spec-error-handling.md
  - ../02-architecture/COMPONENTS.md
  - ../02-architecture/PLAN-JSON-CONTRACT.md
  - ../03-adr/ADR-003-plan-json-not-sql.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
---

> **AVISO — SPEC SUPERSEDED (Wave 1 reforma seguridad).** Tras la
> reforma de seguridad post-auditoría Codex (ver ADR-005 reescrito),
> la PWA **no llama directamente a Gemini API**. Ese rol pasó al Edge
> Function `plan-intent`. La Gemini API key vive **server-side** en
> env var (`GEMINI_API_KEY`). Esta spec se conserva por trazabilidad
> histórica del diseño previo. Para el contrato vigente leer
> [`spec-plan-intent-edge.md`](./spec-plan-intent-edge.md).

# Spec — Gemini API Client (HISTÓRICO — superseded)

## 1. Propósito

Interactuar con Gemini API mediante **function calling** para obtener
un Plan JSON garantizado en forma. Este módulo es la única vía de
traducción "lenguaje natural → estructura ejecutable". Si el LLM no
puede traducir limpiamente, debe pedir aclaración al usuario en lugar
de inventar; nunca devuelve SQL libre.

## 2. Alcance

**Cubre:**

- Construcción de la llamada a Gemini API (REST o SDK).
- Inyección del schema-summary como `system instruction`.
- Declaración de las dos tools: `execute_plan` y `request_clarification`.
- Lectura de la API key desde IndexedDB cifrado.
- Reintentos con backoff exponencial.
- Timeout total y normalización de la respuesta.
- Distinción entre Plan JSON ejecutable y aclaración solicitada.

**NO cubre:**

- Validación profunda del Plan JSON (sólo que sea parseable como objeto)
  → `spec-plan-json-schema.md`.
- Ejecución del Plan → `spec-execute-plan-edge.md`.
- UI para mostrar la aclaración solicitada al usuario → consume el
  resultado y delega a la capa UI de la PWA (Voice Input + TTS).
- Cifrado / descifrado de credenciales → `spec-credentials-storage.md`.

## 3. Interfaces / API / Contratos

### 3.1 API expuesta por el módulo

```ts
interface GeminiClientAPI {
  callPlan(input: GeminiCallInput): Promise<GeminiCallResult>;
}

interface GeminiCallInput {
  userPrompt: string;          // texto desde Voice Input o teclado
  schemaSummary: string;       // markdown del schema (cacheado)
  schemaHash: string;          // sha256 del schema para audit
  abortSignal?: AbortSignal;   // permite cancel desde UI
}

type GeminiCallResult =
  | { kind: 'plan'; plan: PlanJSON; rawResponse: object }
  | { kind: 'clarification'; question: string; rawResponse: object }
  | { kind: 'error'; error: GeminiError };

interface GeminiError {
  code: 'auth' | 'quota' | 'rate_limit' | 'server' | 'timeout'
      | 'malformed' | 'no_tool_call' | 'unknown';
  message: string;
  retryable: boolean;
  attempts: number;
}
```

### 3.2 Modelo y endpoint

| Aspecto       | Valor                                                        |
|---------------|--------------------------------------------------------------|
| Modelo default| `gemini-2.5-flash`                                           |
| Modelo opcional| `gemini-2.5-pro` (configurable, costo mayor)                |
| Endpoint REST | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| Auth          | `?key={GEMINI_API_KEY}` o header `x-goog-api-key`            |
| SDK opcional  | `@google/generative-ai` (M1 acepta REST directo)             |

### 3.3 Construcción del request

```ts
const body = {
  systemInstruction: {
    parts: [{ text: buildSystemPrompt(schemaSummary) }]
  },
  contents: [
    { role: 'user', parts: [{ text: userPrompt }] }
  ],
  tools: [{ functionDeclarations: [executePlanTool, requestClarificationTool] }],
  toolConfig: { functionCallingConfig: { mode: 'ANY' } },
  generationConfig: {
    temperature: 0.1,
    candidateCount: 1,
    maxOutputTokens: 1024
  }
};
```

`mode: 'ANY'` fuerza a Gemini a invocar **siempre** una tool (jamás
respuesta libre en texto). Si Gemini no puede ejecutar el plan, debe
recurrir a `request_clarification`.

### 3.4 System prompt

```
Eres Orion Vox, un puente entre el usuario y su base Postgres en Supabase.

Reglas innegociables:
1. Respondé SIEMPRE invocando una de las dos funciones disponibles. Nunca
   en texto libre.
2. Tu único output ejecutable es un Plan JSON v1.0 válido vía la función
   execute_plan. Nunca generes SQL crudo.
3. Si la pedida del usuario es ambigua (falta tabla, filtro, valor, o no
   sabés a qué se refiere), invocá request_clarification con una pregunta
   corta en español. NO inventes.
4. Para operaciones destructivas (delete, update masivo) sin filtros
   claros, también pedí aclaración antes de proponer el plan.
5. Idioma de toda interacción con el usuario: español neutro.
6. Solo podés usar las tablas y columnas declaradas en el schema.

Schema disponible:
{{schemaSummary}}
```

### 3.5 Tool `execute_plan`

```ts
const executePlanTool = {
  name: 'execute_plan',
  description: 'Ejecuta un Plan JSON v1.0 contra la base del usuario. Usá esta función cuando estés seguro de la operación.',
  parameters: {
    type: 'object',
    required: ['version', 'operation', 'table'],
    properties: {
      version: { type: 'string', enum: ['1.0'] },
      operation: { type: 'string', enum: ['select', 'insert', 'update', 'delete'] },
      table: { type: 'string' },
      columns: { type: 'array', items: { type: 'string' } },
      values: { type: 'object' },
      filters: {
        type: 'array',
        items: {
          type: 'object',
          required: ['column', 'op'],
          properties: {
            column: { type: 'string' },
            op: { type: 'string', enum: ['=', '!=', '<', '>', '<=', '>=', 'in', 'not_in', 'like', 'ilike', 'is_null', 'is_not_null'] },
            value: {}
          }
        }
      },
      order_by: { type: 'array' },
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
      joins: { type: 'array', maxItems: 1 }
    }
  }
};
```

El schema completo del Plan JSON es autoritativo en
`../02-architecture/PLAN-JSON-CONTRACT.md` y se duplica acá únicamente
para el binding de function calling. Si divergen, gana el contrato.

### 3.6 Tool `request_clarification`

```ts
const requestClarificationTool = {
  name: 'request_clarification',
  description: 'Pedí una aclaración cuando la consulta del usuario sea ambigua, falte información crítica, o querés confirmar algo destructivo.',
  parameters: {
    type: 'object',
    required: ['question'],
    properties: {
      question: {
        type: 'string',
        description: 'Pregunta corta en español, máximo 200 caracteres, directa.'
      },
      reason: {
        type: 'string',
        enum: ['ambiguous_table', 'ambiguous_filter', 'missing_value', 'destructive_unfiltered', 'unknown_term', 'other']
      }
    }
  }
};
```

Esta tool fue agregada explícitamente por hallazgo de Track A
(USE-CASES). Sin ella, Gemini termina inventando filtros cuando la
consulta es ambigua, lo cual produce ejecuciones incorrectas que el
usuario sólo detecta al ver el preview (o peor, después).

## 4. Comportamiento esperado

### 4.1 Golden path — plan ejecutable

1. `callPlan({ userPrompt: 'mostrame las tareas activas', schemaSummary, schemaHash })`.
2. Construye request con system + user + tools.
3. POST a Gemini.
4. Respuesta tiene `candidates[0].content.parts[0].functionCall.name = 'execute_plan'`.
5. Args se parsean a Plan JSON.
6. Retorna `{ kind: 'plan', plan, rawResponse }`.

### 4.2 Golden path — aclaración

1. `callPlan({ userPrompt: 'borrá lo viejo', schemaSummary, schemaHash })`.
2. Gemini detecta ambigüedad ("lo viejo" sobre qué tabla, qué umbral).
3. Respuesta tiene `functionCall.name = 'request_clarification'` con
   `args.question = '¿De qué tabla y desde cuándo considerás "viejo"?'`.
4. Retorna `{ kind: 'clarification', question, rawResponse }`.
5. La PWA muestra el `question` en pantalla y vía TTS, vuelve a Voice
   Input para capturar la respuesta del usuario, y dispara `callPlan`
   de nuevo con el contexto reciente (en M1: como nuevo `userPrompt`
   plano; en M3 considerar mantener historial conversacional).

### 4.3 Reintentos

Política: 3 intentos máximo, base 500ms, factor 2 (delays: 0ms, 500ms,
1000ms entre intentos). Sólo se reintenta para:

| Código HTTP   | Reintentar |
|---------------|------------|
| 429           | sí (backoff)|
| 500, 502, 503, 504 | sí    |
| Network error / fetch failure | sí |
| 408 timeout   | sí         |
| 400, 401, 403 | **no** (4xx semánticos)|
| 200 con respuesta malformada  | **no** (es bug de modelo, retry no ayuda)|

### 4.4 Timeout

Timeout total por llamada: **15s** (incluye los retries). Implementado
con `AbortController` interno + `setTimeout`. Si se excede, retorna
`{ kind: 'error', error: { code: 'timeout', retryable: true, attempts } }`.

### 4.5 Parseo y normalización

- Si la respuesta no contiene `functionCall`, retorna error
  `code: 'no_tool_call'` (configuración de `mode: 'ANY'` debería
  prevenirlo; si pasa, es bug de modelo).
- Si `args` no parsean como objeto JSON válido, error `code: 'malformed'`.
- Campos extra inesperados en `args` se loguean (`console.warn`) pero
  no se descartan; el siguiente paso (validador de Plan JSON) decide.

## 5. Estados / lifecycle

Stateless por llamada. Cada `callPlan` es independiente. La sesión de
descifrado de la API key vive en el módulo `credentials-storage`,
no acá.

## 6. Errores y manejo

| Código          | Origen                                | Mensaje en español (sugerido)                        | Reintentable |
|-----------------|---------------------------------------|------------------------------------------------------|--------------|
| `auth`          | 401 / 403 con detalle de API key      | "La API key de Gemini no es válida. Revisala en configuración." | no |
| `quota`         | 429 con detalle de quota              | "Te quedaste sin cuota de Gemini por hoy."            | no |
| `rate_limit`    | 429 transitorio                       | "Gemini está saturado, probá en unos segundos."       | sí (backoff)|
| `server`        | 5xx                                    | "Gemini falló temporalmente. Reintenté sin éxito."    | sí (backoff)|
| `timeout`       | abort por timeout                      | "Gemini tardó demasiado. Probá de nuevo."             | sí          |
| `malformed`     | response sin functionCall o args inválidos | "No entendí la respuesta del modelo. Reformulá."  | no          |
| `no_tool_call`  | response en texto libre (no debería)   | "El modelo no respondió en formato esperado. Reformulá." | no       |
| `unknown`       | otros                                  | "Falló la llamada al modelo."                          | depende     |

Errores en este módulo NO escriben en `orion_audit` (la auditoría
server-side cubre lo que llega a Edge). Sí pueden loguearse en
`audit_mirror` local en M2 si el usuario quiere ver historial de
fallos client-side.

## 7. Restricciones M1

- **Sin streaming.** Llamada sincrónica, response completo. Streaming
  agrega complejidad de UI (cancelación parcial, render incremental)
  innecesaria para un Plan JSON corto. Re-evaluar en M3.
- **API key en cliente.** ADR-005: cifrada en IndexedDB. M2 mueve la
  key a Edge Function `plan-intent`.
- **Sin contexto multi-turno.** Cada `callPlan` es independiente. Si el
  usuario responde a una aclaración, la PWA construye el nuevo prompt
  concatenando contexto si es necesario, pero Gemini no recibe un
  array `contents` con turnos previos. M3 puede agregar.
- **`mode: 'ANY'` para forzar tool call.** Si Gemini ignora el config
  (regresión del modelo), retornamos `no_tool_call` y el usuario
  reformula. No hay fallback a parseo de texto libre.
- **Modelo default flash** por costo. El usuario puede cambiar a pro
  desde Config UI.

## 8. Criterios de aceptación verificables

- [ ] Llamada con prompt claro ("mostrame las tareas activas") retorna
      `{ kind: 'plan', plan: {...} }` con `operation: 'select'` y
      `table: 'tareas'`.
- [ ] Llamada con prompt ambiguo ("borrá lo viejo") retorna
      `{ kind: 'clarification', question: '...' }` con question no
      vacío y < 200 chars.
- [ ] 429 simulado dispara hasta 3 intentos con backoff exponencial,
      visible en logs / mock.
- [ ] 401 simulado retorna `{ kind: 'error', error: { code: 'auth',
      retryable: false } }` sin reintentar.
- [ ] Timeout simulado a 16s retorna `code: 'timeout'`.
- [ ] Cancel vía `abortSignal` aborta la llamada y retorna `code:
      'unknown'` con `retryable: false` (o tipo dedicado `aborted`,
      decisión del implementador).
- [ ] Respuesta sin `functionCall` retorna `code: 'no_tool_call'`.
- [ ] El system prompt incluye el `schemaSummary` provisto y las 6
      reglas innegociables del §3.4.
- [ ] La API key se lee descifrada y nunca se loguea (verificar que no
      aparezca en `console.log` del módulo).

## 9. Dependencias

- **Voice Input** (`spec-voice-input.md`) — provee el `userPrompt`.
- **Plan JSON Schema** (`spec-plan-json-schema.md`) — define qué es un
  plan válido (este módulo solo asegura forma de objeto).
- **Credentials Storage** (`spec-credentials-storage.md`) — provee la
  Gemini API key descifrada.
- **Error Handling** (`spec-error-handling.md`) — convenciones de
  mensajes UX.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §3
- `../02-architecture/PLAN-JSON-CONTRACT.md`
- `../03-adr/ADR-003-plan-json-not-sql.md`
- `../03-adr/ADR-005-gemini-key-client-m1-server-m2.md`
- Gemini API docs (function calling)
- USE-CASES.md (Track A) — origen de `request_clarification`
