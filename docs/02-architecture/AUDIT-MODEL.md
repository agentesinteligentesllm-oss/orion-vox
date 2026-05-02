---
title: Modelo de auditoría — orion_audit
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - COMPONENTS.md
  - SECURITY-MODEL.md
  - PLAN-JSON-CONTRACT.md
  - ../00-constitution/CONSTITUTION.md
---

# Modelo de auditoría — `orion_audit`

La auditoría es **innegociable** desde el día 1 (principio
constitucional 3). Toda ejecución que pasa por `execute-plan` —
exitosa, fallida, o rechazada por validación — deja un registro en
`orion_audit`. Si la inserción en audit falla, la operación se aborta:
**sin audit, no hay ejecución**.

---

## 1. Propósito

`orion_audit` es la **única fuente de verdad de auditoría** del
sistema. Vive en Postgres (no en cliente, no en logs efímeros). Cumple:

- **Forense**: si M1 introduce una regresión de seguridad o el sistema
  hace algo inesperado, `orion_audit` es la única evidencia confiable
  de qué pasó y cuándo.
- **Estadística personal**: cuántas operaciones por día, qué tablas
  toca, cuánto tarda, qué falla.
- **Observabilidad**: latencias, errores recurrentes, patrones.
- **Reproducibilidad**: cada registro tiene Plan JSON + SQL + params,
  suficiente para reconstruir exactamente lo que se hizo.

---

## 2. DDL completo

```sql
create table public.orion_audit (
  -- Identidad y tiempo
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),

  -- Origen del usuario
  user_prompt     text not null,
    -- frase original transcripta, en español

  -- Plan que se intentó ejecutar
  plan_json       jsonb not null,
    -- Plan JSON tal como llegó a la Edge

  -- SQL realmente generado (parametrizado, sin valores)
  sql_executed    text,
    -- ej: 'SELECT id, titulo FROM tareas WHERE estado = $1 LIMIT $2'
  sql_params      jsonb,
    -- valores parametrizados ($1, $2, ...) como array JSON

  -- Resultado
  rows_affected   int,
    -- filas devueltas (select) o modificadas (insert/update/delete)
  result_summary  jsonb,
    -- resumen del resultado; NO los datos completos si son grandes
    -- (ej: { sample: [...3 filas...], total: 152, truncated: true })

  -- Estado
  error           text,
    -- mensaje de error si la ejecución falló o fue rechazada
  was_dry_run     boolean not null default false,
    -- true si fue ejecución simulada (M2: pre-flight estimate)
  was_confirmed   boolean not null default false,
    -- true si pasó por modal de confirmación (writes)

  -- Contexto
  schema_hash     text,
    -- hash sha256 del schema-summary que estaba activo al construir
    -- el plan; permite detectar drift entre plan y schema real
  duration_ms     int,
    -- latencia de la ejecución dentro de la Edge (no cuenta red)
  client_version  text
    -- versión de la PWA que disparó la operación (ej: '0.3.1')
);

-- Índices
create index idx_audit_ts on public.orion_audit (ts desc);
create index idx_audit_error on public.orion_audit (error)
  where error is not null;
create index idx_audit_op on public.orion_audit
  ((plan_json->>'operation'));

-- Append-only por convención: ningún UPDATE/DELETE manual.
-- En M2 se considera revoke de DELETE/UPDATE para
-- 'orion_vox_executor' sobre esta tabla.

comment on table public.orion_audit is
  'Auditoría server-side de toda ejecución pasada por execute-plan.';
```

**Notas sobre el DDL.**

- `id` UUID v4 (`gen_random_uuid` requiere extensión `pgcrypto`).
- `ts` con `timestamptz` (almacena con tz) — todos los timestamps
  internos son UTC.
- `plan_json` y `result_summary` y `sql_params` son `jsonb` (binario,
  indexable, queryable).
- `sql_executed` guarda el SQL **parametrizado** (`$1`, `$2`), nunca
  con valores interpolados. Los valores van en `sql_params`. Esto
  permite buscar patrones de query sin acoplarse a datos puntuales.
- Los índices están pensados para los queries de auditoría más
  frecuentes: por tiempo, por error, por tipo de operación.

---

## 3. Ciclo de vida de un registro

Cada operación atraviesa **dos escrituras** en `orion_audit`:

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   1. INSERT pre-ejecución (en cuanto la Edge valida el Plan)         │
│      - id generado                                                   │
│      - ts = now()                                                    │
│      - user_prompt, plan_json, schema_hash, was_confirmed,           │
│        client_version, sql_executed, sql_params  → completos         │
│      - rows_affected = NULL                                          │
│      - result_summary = NULL                                         │
│      - error = NULL                                                  │
│      - duration_ms = NULL                                            │
│                                                                      │
│   2. UPDATE post-ejecución (cuando termina, exitosa o no)            │
│      - rows_affected, result_summary, error, duration_ms  → set      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Casos especiales.**

- **Validación rechaza el plan** (DDL detectado, schema inválido, etc.):
  igual se inserta con `error = '<motivo>'` y `sql_executed = NULL` /
  `rows_affected = NULL`. El intento queda registrado, lo cual es
  importante para forense.
- **Postgres timeout / error en ejecución**: el INSERT inicial ya
  ocurrió; el UPDATE registra `error = '<mensaje pg>'` y
  `duration_ms` con la latencia hasta el timeout.
- **Edge falla antes de poder insertar audit**: la operación se
  aborta y se devuelve 500 al cliente con `audit_id = null`. Es la
  excepción operativa, pero por construcción jamás hay ejecución
  contra Postgres sin `orion_audit` previo.

---

## 4. Política de retención

**M1**: sin truncado automático. El volumen esperado es bajo (single
user, decenas a cientos de operaciones por día). El usuario puede
crecer la tabla a miles de registros sin impacto.

**M2**: política configurable por el usuario, ej:

- Sin retención (mantener todo).
- Retención por tiempo (90 días, 1 año).
- Retención por volumen (últimos N registros).

La política se implementa como cron job en Supabase o trigger AFTER
INSERT con DELETE condicional. Decisión y detalles vivirán en
`docs/04-specs/audit-retention-policy.md` cuando se implemente.

**Append-only por convención**: en M1 se confía en que el usuario no
hace UPDATE/DELETE manual sobre `orion_audit`. En M2 se considera
revocar permisos de `UPDATE` y `DELETE` sobre esta tabla incluso para
`orion_vox_executor` (solo `INSERT` y `SELECT`).

---

## 5. Espejo cliente (IndexedDB)

La PWA mantiene un **espejo local** en IndexedDB store `audit_mirror`
con los últimos N registros (default 200, configurable).

**Propósito.**

- Acceso offline al historial reciente.
- Render rápido del feed de actividad sin hit a Edge.
- Estadísticas locales (qué hago más, qué falla más).

**Sincronización.**

- Después de cada ejecución exitosa, la PWA recibe `audit_id` y guarda
  el registro en el espejo local.
- En arranque, la PWA pide los últimos 50 registros a un endpoint
  futuro (M2) `GET /functions/v1/audit?limit=50` para sincronizar.

**El espejo NO es fuente de verdad.** La fuente es Postgres. Si el
espejo y Postgres divergen, gana Postgres y el espejo se reconstruye.

---

## 6. Acceso al log

**M1.**

- Acceso directo desde el dashboard Supabase (SQL editor / Table
  editor).
- Queries útiles documentadas en `docs/06-operations/audit-queries.md`
  cuando se implemente. Ejemplos:

```sql
-- Últimas 20 operaciones
select ts, plan_json->>'operation' as op, plan_json->>'table' as tbl,
       rows_affected, error, duration_ms
from orion_audit
order by ts desc
limit 20;

-- Errores en las últimas 24h
select ts, plan_json->>'operation' as op, plan_json->>'table' as tbl,
       error, user_prompt
from orion_audit
where error is not null
  and ts > now() - interval '24 hours'
order by ts desc;

-- Operaciones más lentas
select ts, plan_json->>'operation' as op, duration_ms, user_prompt
from orion_audit
where error is null
order by duration_ms desc nulls last
limit 20;

-- Volumen por día
select date_trunc('day', ts) as day, count(*) as n,
       sum(case when error is not null then 1 else 0 end) as failed
from orion_audit
group by 1
order by 1 desc;
```

**M2.**

- UI dedicada de auditoría en la PWA: pantalla con filtros por fecha,
  operación, tabla, error, búsqueda en `user_prompt`.
- Endpoint `GET /functions/v1/audit?…` con paginación y filtros
  server-side.
- Vista detalle de un registro (Plan JSON pretty, SQL ejecutado,
  resultado).

---

## 7. Privacidad

Single user. **Todos** los registros son del único usuario; no hay
separación por `user_id`, no hay tabla de usuarios, no hay JWT por
sesión.

**Implicaciones.**

- `user_prompt` puede contener información personal del usuario (es
  literalmente lo que dijo). Vive solo en su Postgres y en su espejo
  local cifrado. No sale a terceros (excepto el envío original a
  Gemini, que ya pasó antes del audit).
- No hay obligaciones de cumplimiento tipo GDPR/CCPA porque no hay
  terceros cuyos datos se procesen. Si alguna vez Orion Vox se
  abriera a terceros, eso sería un proyecto distinto (ver principio
  constitucional 1).
- El usuario puede borrar su `orion_audit` cuando quiera (es **su**
  base). En M2 con retención automatizada, configurable.

---

## 8. Reglas de oro de la auditoría

1. **Sin audit, no hay ejecución.** Si el INSERT inicial en
   `orion_audit` falla, la Edge aborta y devuelve 500. Nunca se
   ejecuta nada contra Postgres sin haber dejado el rastro previo.
2. **Auditá el rechazo también.** Plans inválidos, operaciones
   bloqueadas, intentos de DDL: todos quedan en `orion_audit` con
   `error = '<motivo>'`. El forense necesita ver los intentos
   fallidos tanto como los éxitos.
3. **No guardes datos completos en `result_summary`.** Si un SELECT
   devuelve 500 filas, guardá una muestra (3-5 filas) + el total +
   `truncated: true`. El audit no es un mirror de datos, es un
   registro de operaciones.
4. **`sql_executed` es parametrizado, siempre.** Los valores van en
   `sql_params`. Esto permite agregar (cuántos `SELECT … WHERE
   estado = $1` se hicieron) sin acoplarse a valores puntuales.
5. **El cliente nunca escribe en `orion_audit`.** Solo la Edge
   escribe. Si en algún momento se necesita marcar algo desde la PWA
   (ej: cancelaciones), eso va al `audit_mirror` local, no a la tabla
   server.
