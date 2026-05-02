---
title: Edge Function execute-plan — autoridad de validación y ejecución
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-plan-json-schema.md
  - ./spec-audit-table.md
  - ./spec-confirmation-flow.md
  - ./spec-error-handling.md
  - ./spec-auth-flow.md
  - ./spec-plan-intent-edge.md
  - ../02-architecture/COMPONENTS.md
  - ../02-architecture/DATA-FLOW.md
  - ../02-architecture/PLAN-JSON-CONTRACT.md
  - ../02-architecture/AUDIT-MODEL.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md
  - ../03-adr/ADR-008-server-side-audit-from-m1.md
---

# Spec — Edge Function `execute-plan`

## 1. Propósito

`execute-plan` es la **autoridad** del sistema. Recibe un Plan JSON,
**re-valida** (la validación cliente es solo UX), traduce a SQL
parametrizado mediante un query builder seguro, ejecuta contra Postgres,
y deja registro server-side en `orion_audit`. Aplica la regla
innegociable: **sin audit, no hay ejecución**.

## 2. Alcance

**Cubre:**

- Endpoint HTTP `POST /functions/v1/execute-plan`.
- Auth con JWT Supabase + validación `ORION_ALLOWED_USER_ID`.
- Validación de allowlist de tablas server-side (`ORION_ALLOWED_TABLES`).
- Re-validación del Plan JSON (mismo módulo que cliente).
- Traducción Plan → SQL parametrizado (query builder).
- Hardcoded denylist de operaciones bloqueadas.
- Redacción de columnas sensibles (`ORION_REDACTED_COLUMNS`) en
  `result` y `result_summary`.
- Auditoría pre-ejecución (INSERT en `orion_audit` antes de tocar
  Postgres) y post-ejecución (UPDATE con resultado/error).
- Manejo de `dry_run` y de cancelaciones del modal (`rejected_by_user`).
- `statement_timeout` por sesión.
- Inyección de `LIMIT` default en `select`.

**NO cubre:**

- Llamada a Gemini (eso vive server-side en `plan-intent` desde M1;
  ver `spec-plan-intent-edge.md`).
- Schema-summary (Edge separada → `spec-schema-summary-edge.md`).
- DDL de `orion_audit` (→ `spec-audit-table.md`).

## 3. Interfaces / API / Contratos

### 3.1 Endpoint

```
POST /functions/v1/execute-plan
Host: <project-ref>.supabase.co
Content-Type: application/json
Authorization: Bearer <SUPABASE_AUTH_JWT>     // M1 y M2 (sesión Supabase Auth)
```

La Edge valida el JWT con `auth.getUser(token)` y verifica
`user.id == Deno.env.get('ORION_ALLOWED_USER_ID')`. El
`SUPABASE_SERVICE_ROLE_KEY` se usa **internamente** por la Edge para
ejecutar el SQL contra Postgres con privilegios (M1) o se reemplaza
por `orion_vox_executor` (M2). Nunca viaja en el header del cliente.
Detalles en `spec-auth-flow.md`.

### 3.2 Request body

```ts
interface ExecutePlanRequest {
  plan: PlanJSON;            // ver spec-plan-json-schema.md
  user_prompt: string;       // frase original del usuario (para audit)
  client_version: string;    // ej: '0.3.1'
  schema_hash: string;       // sha256 del schema-summary que vio Gemini (requerido)
                             // 409 schema_stale si no coincide con hash actual
  dry_run?: boolean;         // override del plan; gana sobre plan.dry_run si ambos presentes
  was_confirmed?: boolean;   // true si el usuario confirmó en modal táctil (solo writes);
                             // false o ausente para reads (default: false)
  rejected_by_user?: boolean; // true cuando se llama solo para auditar
                              // una cancelación del modal
}
```

**Notas.**

- `rejected_by_user: true`: la Edge inserta en `orion_audit` con
  `error: 'rejected_by_user'` directamente en el INSERT y retorna 200
  de inmediato. No ejecuta SQL ni hace UPDATE posterior.
- `dry_run_final = request.dry_run ?? plan.dry_run ?? false`. El
  request body tiene precedencia sobre el plan. Si ambos están
  presentes, `request.dry_run` gana.

### 3.3 Response — éxito (200)

```ts
interface ExecutePlanResponse200 {
  ok: true;
  result: unknown;           // rows del select | { id } del insert | etc.
  rows_affected: number;     // 0..N
  audit_id: string;          // UUID del registro en orion_audit
  sql_preview: string;       // SQL parametrizado (ej: 'SELECT id FROM tareas WHERE estado = $1')
  duration_ms: number;       // latencia de ejecución (sin red)
}
```

### 3.4 Response — errores

| HTTP | `error` (code)             | Detalle                                                       |
|------|----------------------------|---------------------------------------------------------------|
| 401  | `unauthorized`             | Sin header `Authorization`.                                   |
| 401  | `invalid_token`            | JWT inválido / expirado.                                      |
| 403  | `forbidden_user`           | `user.id != ORION_ALLOWED_USER_ID`.                           |
| 400  | `invalid_plan`             | Plan no parseable o tipo incorrecto. `details: string[]`.     |
| 422  | `validation_failed`        | Validación Zod / `validatePlan` falló. `details: string[]`.   |
| 409  | `schema_stale`             | `schema_hash` del request no coincide con hash actual de schema-summary; cliente debe re-llamar `plan-intent`. |
| 403  | `table_not_allowed`        | `plan.table` o un join a una tabla no listada en `ORION_ALLOWED_TABLES`. `details.table`. |
| 403  | `operation_blocked`        | DDL, multi-statement, denylist. `details.operation`.          |
| 403  | `missing_filters`          | `update` o `delete` sin filtros.                              |
| 403  | `audit_table_protected`    | Plan intentó tocar `orion_audit`.                             |
| 504  | `query_timeout`            | `statement_timeout` excedido (10s).                           |
| 400  | `pg_error`                 | Error semántico Postgres (col no existe, FK, etc.). `details.pg_message`. |
| 500  | `audit_insert_failed`      | INSERT pre-ejecución a `orion_audit` falló. **NO se ejecutó nada.** |
| 500  | `internal`                 | Otros errores internos.                                       |

Body de error:

```ts
interface ExecutePlanResponseError {
  ok: false;
  error: string;             // code de la tabla
  message: string;           // mensaje human-readable en español
  details?: object | string[];
  audit_id?: string;         // si se alcanzó a auditar
}
```

### 3.5 Headers de seguridad

- `Cache-Control: no-store`
- `X-Content-Type-Options: nosniff`
- CORS: M1 abierto al origen de la PWA del usuario (configurable por
  env var `PWA_ORIGIN`).

## 4. Comportamiento esperado

### 4.1 Pipeline canónico (golden path)

```
1. Recibir POST → parsear body
2. Auth check:
     - Extraer JWT de Authorization: Bearer <jwt>
     - supabase.auth.getUser(jwt) → si falla, 401 invalid_token
     - Si user.id != Deno.env.get('ORION_ALLOWED_USER_ID'),
       403 forbidden_user
3. Parse body → si falla, 400 invalid_plan
4. validatePlan(body.plan) → si falla, 422 validation_failed
   (igualmente intentar auditar el rechazo en paso 7)
5. Verificar allowlist de tablas:
     - allowed = Deno.env.get('ORION_ALLOWED_TABLES').split(',').map(t => t.trim())
     - Si plan.table no está en allowed → 403 table_not_allowed
       con { table: plan.table }
     - Para cada j de plan.joins ?? []: si j.table no en allowed
       → 403 table_not_allowed con { table: j.table }
     - (igualmente intentar auditar el rechazo en paso 7)
5b. Verificar schema_hash:
     - current_hash = obtener hash de schema-summary (llamada interna, mismo cache TTL)
     - Si body.schema_hash != current_hash → 409 schema_stale
       (el schema cambió entre cuando Gemini generó el plan y ahora;
       el cliente debe re-llamar plan-intent para obtener un plan fresco)
6. Aplicar reglas hardcoded de bloqueo (DDL, multi-stmt, denylist)
   → si bloquea, 403 (igualmente intentar auditar)
7. INSERT pre-ejecución en orion_audit:
     { ts: now,
       user_prompt, plan_json, schema_hash, client_version,
       was_confirmed: body.was_confirmed ?? false,
       was_dry_run: (body.dry_run ?? plan.dry_run ?? false) || (body.rejected_by_user ?? false),
       sql_executed: NULL, sql_params: NULL,
       error: body.rejected_by_user ? 'rejected_by_user' : NULL }
   → si INSERT falla, 500 audit_insert_failed (NO continuar)
8. Si rejected_by_user=true:
     → el error ya está en el INSERT; retornar 200 de inmediato
     → return 200 con { ok: true, rows_affected: 0, audit_id, sql_preview: null, duration_ms }
     (NO continuar al paso 9 — no ejecutar SQL)
   Si dry_run=true:
     → continuar a paso 10 para construir SQL (NO ejecutar en paso 11)
     → ver paso 11b
9. Forzar statement_timeout 10s en la sesión:
     SET LOCAL statement_timeout = '10s'
10. Construir SQL parametrizado vía query builder
11b. Si dry_run=true (solo llega aquí si NO es rejected_by_user):
     → UPDATE audit con result_summary: { dry_run: true, sql_preview }
     → return 200 con { ok: true, rows_affected: 0, audit_id, sql_preview, duration_ms }
     (NO continuar al paso 11)
11. Ejecutar query contra Postgres con cliente que usa
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') (M1) o credenciales del
    rol orion_vox_executor (M2)
12. Aplicar redacción de columnas sensibles:
     - reds = Deno.env.get('ORION_REDACTED_COLUMNS').split(',')
     - Reemplazar valores de columnas que matcheen reds (case-insensitive)
       en `result` (devuelto al cliente) y en `result_summary` (audit).
     - Si plan es UPDATE/INSERT y los `params` corresponden a una
       columna sensible, reemplazar en `sql_params` también.
13. UPDATE orion_audit con rows_affected, result_summary (redactado),
    duration_ms
14. Return 200 con result (redactado) + audit_id
```

### 4.2 Comportamiento de `dry_run`

- `dry_run_final = request.dry_run ?? plan.dry_run ?? false`. El
  request body tiene precedencia sobre el plan.
- Si `dry_run_final = true`: se ejecuta el query builder (paso 10)
  para generar el SQL preview, pero se salta la ejecución contra
  Postgres (paso 11). El audit se actualiza con `was_dry_run: true`,
  `rows_affected: null`, `result_summary: { dry_run: true, sql_preview }`.
- Usado por la PWA en M1 para previsualizar SQL antes de confirmar
  (alternativa al modal puro client-side).

### 4.3 Comportamiento de `rejected_by_user: true`

- Origen: el modal de confirmación de la PWA. Cuando el usuario tap
  "Cancelar", la PWA llama a este endpoint con
  `rejected_by_user: true` para auditar la intención.
- La Edge hace **INSERT directo** en `orion_audit` con:
  - `was_confirmed: false`
  - `was_dry_run: true`
  - `error: 'rejected_by_user'`
- Retorna 200 con `rows_affected: 0` **inmediatamente** tras el INSERT.
  No se construye SQL, no se ejecuta nada en Postgres, no hay UPDATE
  posterior.
- Decisión sustantiva (origen Track A): cancelaciones se auditan para
  preservar la traza completa de intenciones, no sólo de ejecuciones.

### 4.4 Regla "sin audit, no hay ejecución"

Si el INSERT a `orion_audit` falla (paso 7), la Edge:

1. **Aborta**. NO ejecuta ningún SQL contra las tablas del usuario.
2. Retorna 500 con `error: 'audit_insert_failed'`.
3. Loguea internamente (`console.error`) con stack para debug.

Esto es innegociable (AUDIT-MODEL.md §8 regla 1).

### 4.5 Construcción del SQL parametrizado

**Query builder propio** o librería conservadora. **Prohibido**
concatenar valores del usuario al SQL string.

Ejemplos:

```
PlanJSON select:
{ operation: 'select', table: 'tareas',
  columns: ['id', 'titulo'],
  filters: [{ column: 'estado', op: '=', value: 'activa' }],
  limit: 100 }

→ SQL: 'SELECT "id", "titulo" FROM "tareas" WHERE "estado" = $1 LIMIT $2'
→ params: ['activa', 100]
```

```
PlanJSON update:
{ operation: 'update', table: 'tareas',
  values: { estado: 'hecha' },
  filters: [{ column: 'id', op: '=', value: 'abc-123' }] }

→ SQL: 'UPDATE "tareas" SET "estado" = $1 WHERE "id" = $2'
→ params: ['hecha', 'abc-123']
```

**Reglas:**

- Identificadores siempre quoted con doble comilla y validados con
  regex.
- Valores siempre como `$1, $2, ...` parametrizados.
- `LIMIT` en select: si no viene, default 100; si > 1000, rechazo en
  validador (ya bloqueado por Zod). **LIMIT default — defensa en 3
  capas (intencional)**: (1) el system prompt instruye a Gemini, (2)
  Zod `.default(100)` lo inyecta si Gemini lo omite, (3) el query
  builder re-valida el rango final. Las 3 capas son independientes y
  se refuerzan mutuamente.
- `JOIN`: solo `INNER JOIN`, máximo 1.

### 4.6 Operaciones bloqueadas hardcoded

Lista en código (NO configurable). Cubierta por tests obligatorios:

| Bloqueo                         | Cómo se detecta                                                  |
|---------------------------------|------------------------------------------------------------------|
| `operation` no en enum          | validador retorna error → 422                                    |
| Multi-statement en `value`      | regex en validador → 422                                         |
| `table === 'orion_audit'`       | denylist en validador → 403 audit_table_protected                |
| `table` o `joins[].table` fuera de `ORION_ALLOWED_TABLES` | check env var → 403 table_not_allowed |
| DDL implícito (intento via SQL crudo en value) | regex en validador → 422                          |
| `update`/`delete` sin filters   | regla de negocio → 403 missing_filters                           |

### 4.7 Allowlist de tablas server-side

La env var `ORION_ALLOWED_TABLES` lista las tablas que esta Edge puede
tocar. Formato: comma-separated, case-sensitive (matchea exactamente
el nombre de la tabla en Postgres).

Ejemplo:

```
ORION_ALLOWED_TABLES=tareas,categorias,pedidos,clientes
```

Esto es **defensa en profundidad** sobre el filtrado que ya hace
`schema-summary` (que sólo expone esas tablas a Gemini). Si Gemini
"alucina" una tabla fuera de la lista (porque viene en el prompt del
usuario, por ejemplo), `execute-plan` la rechaza con 403
`table_not_allowed`.

**No** es editable desde la PWA en M1 — vive solo en el environment
del Edge. M2 puede agregar UI admin protegida con audit.

### 4.8 Redacción de columnas sensibles

La env var `ORION_REDACTED_COLUMNS` lista nombres de columnas cuyos
valores deben ser reemplazados por `"[REDACTED]"` antes de devolver al
cliente y antes de loguear en `orion_audit`. Match case-insensitive,
exact-match por nombre de columna.

Ejemplo:

```
ORION_REDACTED_COLUMNS=password,password_hash,token,api_key,secret,refresh_token,access_token
```

Aplicación detallada en `SECURITY-MODEL.md §7`.

## 5. Estados / lifecycle

Por request:

```
[parse] → [auth jwt + ALLOWED_USER_ID] → [validate] → [allowlist tables] → [bloqueos] → [audit INSERT pre]
                                                  │
                              ┌───────────────────┤
                              │ fail              │ ok
                              ▼                   ▼
                         [500 abort]      [dry_run? OR rejected?]
                                          │           │
                                       sí │           │ no
                                          ▼           ▼
                                  [audit UPDATE]  [SET timeout]
                                  [200 dry/cancel]    │
                                                      ▼
                                                  [build SQL]
                                                      │
                                                      ▼
                                                  [execute pg]
                                                      │
                                       ┌──────────────┤
                                       │ ok           │ error
                                       ▼              ▼
                                  [audit UPDATE  [audit UPDATE
                                   con result]   con error]
                                       │              │
                                       ▼              ▼
                                    [200]      [4xx/5xx según]
```

## 6. Errores y manejo

### 6.1 Errores que igualmente auditan

Todos los errores de validación / bloqueo (422, 403) **deben dejar
registro en `orion_audit`** con `error = '<motivo>'` y `sql_executed
= NULL`. La auditoría del intento es tan importante como la del éxito.

### 6.2 Errores que NO auditan

Sólo `audit_insert_failed` (500). Por definición, si el audit falla, no
hay manera de loguear en audit.

### 6.3 Mensajes user-facing

`message` en la respuesta debe estar en español y ser interpretable
sin contexto técnico:

- `unauthorized` → "Falta autenticación."
- `invalid_token` → "Tu sesión expiró. Iniciá sesión de nuevo."
- `forbidden_user` → "Tu cuenta no está autorizada en esta instancia."
- `invalid_plan` → "El plan recibido no es válido."
- `validation_failed` → "El plan tiene errores: <lista>."
- `table_not_allowed` → "La tabla <name> no está autorizada en esta instancia."
- `operation_blocked` → "Operación no permitida: <op>."
- `missing_filters` → "Operación destructiva sin filtros: rechazada."
- `audit_table_protected` → "No se puede operar sobre la tabla de
  auditoría."
- `query_timeout` → "La consulta tardó demasiado y se canceló."
- `pg_error` → "Error de base de datos: <mensaje pg en español si
  posible>."
- `audit_insert_failed` → "No se pudo registrar la auditoría. Operación
  abortada por seguridad."

## 7. Restricciones M1

- **`service_role` server-side** para ejecutar SQL. Vive en env var
  de la Edge, **nunca** en cliente. M2 reemplaza por
  `orion_vox_executor` (ADR-004).
- **Sin RLS efectiva** sobre las tablas del usuario (bypass por
  `service_role`). M2 endurece con grants en rol dedicado.
- **Sin `preview_id` firmado**. La PWA puede mandar `confirmed: true`
  sin cross-check. SECURITY-MODEL §4 lo documenta como deuda M2 (TD-003).
- **Sin transacciones explícitas**. Cada Plan = 1 statement. Update y
  delete son auto-commit Postgres por default.
- **`statement_timeout` 10s** forzado por sesión vía `SET LOCAL`.
- **`LIMIT` 1000 max**, default 100 en select.
- **Sin batch**. Un Plan = una operación.
- **Sin retries server-side** ante errores transient de Postgres.
  Cliente decide.
- **Sin paginación nativa**. Si el usuario quiere "siguientes 100",
  manda nuevo Plan con `offset` (M2; M1 no soporta `offset`).
- **Allowlist via env var** (no UI admin). M2 puede agregar UI con
  audit.
- **Redacción por nombre de columna** (no por contenido). Detecta
  `password` pero no un JWT en una columna `notas`.

## 8. Criterios de aceptación verificables

- [ ] POST sin `Authorization` retorna 401 `unauthorized`.
- [ ] POST con JWT inválido retorna 401 `invalid_token`.
- [ ] POST con JWT de un user distinto al `ORION_ALLOWED_USER_ID`
      retorna 403 `forbidden_user`.
- [ ] POST con Plan JSON válido SELECT sobre tabla en `ORION_ALLOWED_TABLES`
      retorna 200 con `result` array.
- [ ] POST con Plan sobre tabla NO incluida en `ORION_ALLOWED_TABLES`
      retorna 403 `table_not_allowed` con `details.table`.
- [ ] POST con Plan que joinea contra una tabla no allowlisted retorna
      403 `table_not_allowed` indicando la tabla del join.
- [ ] POST con Plan inválido retorna 422 con `details`.
- [ ] POST con `operation: 'drop_table'` retorna 422
      (validador rechaza).
- [ ] POST con `value` que contenga `;DROP TABLE x;` retorna 422.
- [ ] POST con `table: 'orion_audit'` retorna 403
      `audit_table_protected`.
- [ ] POST con `operation: 'delete'` sin `filters` retorna 403
      `missing_filters`.
- [ ] POST con consulta que tarde > 10s retorna 504 `query_timeout`.
- [ ] POST con `rejected_by_user: true` retorna 200, no ejecuta SQL,
      registra audit con `was_confirmed: false`, `error:
      'rejected_by_user'`.
- [ ] POST con `dry_run: true` retorna 200, no ejecuta SQL, registra
      audit con `was_dry_run: true`.
- [ ] Si `orion_audit` está down (simulado), retorna 500
      `audit_insert_failed` y NO ejecuta nada (verificable: la tabla
      destino no se modifica).
- [ ] El SQL ejecutado nunca contiene valores del usuario interpolados
      (verificable inspeccionando `sql_executed` + `sql_params` en
      `orion_audit`).
- [ ] SELECT sobre tabla con columna `password` (u otra en
      `ORION_REDACTED_COLUMNS`) devuelve `[REDACTED]` en `result` y
      `result_summary` (no el valor real).
- [ ] UPDATE con `set password = $1` deja `[REDACTED]` en
      `sql_params[0]` del audit (no el valor real).
- [ ] CORS rechaza requests desde origins no listados en `PWA_ORIGIN`.
- [ ] Tests unitarios para los bloqueos (uno por línea de denylist).

## 9. Dependencias

- **Plan JSON Schema** (`spec-plan-json-schema.md`) — módulo
  `validatePlan` compartido.
- **Audit Table** (`spec-audit-table.md`) — DDL de `orion_audit`.
- **Confirmation Flow** (`spec-confirmation-flow.md`) — orquesta
  cuándo se llama con `rejected_by_user`.
- Postgres driver compatible con Deno (ej: `postgres` deno-postgres).
- Deno runtime (Supabase Edge Functions).

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §9
- `../02-architecture/DATA-FLOW.md`
- `../02-architecture/PLAN-JSON-CONTRACT.md`
- `../02-architecture/AUDIT-MODEL.md` §8 (reglas de oro)
- `../02-architecture/SECURITY-MODEL.md`
- `../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md`
- `../03-adr/ADR-008-server-side-audit-from-m1.md`
- USE-CASES.md (Track A) — origen de `rejected_by_user`
