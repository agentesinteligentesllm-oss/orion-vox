---
title: Tabla orion_audit — DDL, índices, contratos
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-execute-plan-edge.md
  - ../02-architecture/AUDIT-MODEL.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../03-adr/ADR-008-server-side-audit-from-m1.md
---

# Spec — Tabla `orion_audit`

> **Fuente de verdad:** `../02-architecture/AUDIT-MODEL.md`. Esta spec
> es la bajada operativa con DDL ejecutable, política de índices,
> RLS y backup. Si diverge del modelo, gana el modelo.

## 1. Propósito

Definir el DDL ejecutable de `orion_audit`, sus índices, constraints,
política de RLS, retención y backup. Es la única fuente de verdad de
auditoría server-side (regla constitucional 3 + AUDIT-MODEL §8).

## 2. Alcance

**Cubre:**

- DDL ejecutable de la tabla.
- Índices recomendados.
- Constraints `NOT NULL` y `DEFAULT`.
- Decisión sobre particionado.
- Decisión sobre RLS.
- Backup.
- Permisos en M1 vs M2.

**NO cubre:**

- Lógica de inserción / update (→ `spec-execute-plan-edge.md`).
- Espejo cliente IndexedDB (→ `spec-credentials-storage.md` /
  `spec-config-ui.md`).
- Queries de consulta (→ AUDIT-MODEL §6).

## 3. Interfaces / API / Contratos

### 3.1 DDL ejecutable

```sql
-- Pre-requisito: extensión pgcrypto para gen_random_uuid()
create extension if not exists "pgcrypto";

-- DDL base: ver migration 001_orion_audit.sql
-- Columnas source + plan_json nullable: ver migration 002_orion_audit_add_source_nullable_plan.sql

create table if not exists public.orion_audit (
  -- Identidad y tiempo
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),

  -- Origen del registro
  source          text not null
    check (source in ('plan-intent', 'execute-plan')),

  -- Origen del usuario
  user_prompt     text not null,

  -- Plan que se intentó ejecutar
  plan_json       jsonb,
    -- nullable: NULL cuando source='plan-intent' y outcome=clarification,
    -- o cuando hubo error antes de parsear el plan

  -- SQL realmente generado (parametrizado, sin valores)
  sql_executed    text,
  sql_params      jsonb,

  -- Resultado
  rows_affected   int,
  result_summary  jsonb,

  -- Estado
  error           text,
  was_dry_run     boolean not null default false,
  was_confirmed   boolean not null default false,

  -- Contexto
  schema_hash     text,
  duration_ms     int,
  client_version  text
);

comment on table public.orion_audit is
  'Auditoría server-side de toda ejecución pasada por plan-intent y execute-plan. Append-only por convención M1; revoke de UPDATE/DELETE en M2.';
comment on column public.orion_audit.source is
  'Edge Function que creó el registro: plan-intent (planning) o execute-plan (execution)';
comment on column public.orion_audit.user_prompt is
  'Frase original transcripta del usuario.';
comment on column public.orion_audit.plan_json is
  'Plan JSON validado. NULL cuando source=plan-intent y outcome=clarification, o error pre-parse.';
comment on column public.orion_audit.sql_executed is
  'SQL parametrizado ejecutado. Valores van en sql_params.';
comment on column public.orion_audit.error is
  'Mensaje de error si la ejecución falló o fue rechazada (incluye rejected_by_user).';
comment on column public.orion_audit.was_dry_run is
  'true si la ejecución fue simulada (dry_run) o cancelada por el usuario.';
comment on column public.orion_audit.was_confirmed is
  'true si pasó por el modal de confirmación (writes).';
```

### 3.2 Índices

```sql
-- Tiempo descendente (queries recientes)
create index if not exists idx_audit_ts
  on public.orion_audit (ts desc);

-- Por source y tiempo (operacional: filtrar por Edge Function)
create index if not exists idx_audit_source
  on public.orion_audit (source, ts desc);

-- Solo errores (parcial, ahorra espacio)
create index if not exists idx_audit_error
  on public.orion_audit (ts desc)
  where error is not null;

-- Por operación (extraído de jsonb, solo registros con plan)
create index if not exists idx_audit_op
  on public.orion_audit ((plan_json->>'operation'))
  where plan_json is not null;

-- Por hash de schema (detectar drift)
create index if not exists idx_audit_schema_hash
  on public.orion_audit (schema_hash)
  where schema_hash is not null;
```

### 3.3 Constraints

| Constraint                          | Razón                                                |
|-------------------------------------|------------------------------------------------------|
| `id PRIMARY KEY`                    | UUID único por registro.                              |
| `ts NOT NULL DEFAULT now()`         | Todo registro tiene tiempo.                          |
| `source NOT NULL CHECK (...)`       | Distingue plan-intent de execute-plan; valor siempre conocido. |
| `user_prompt NOT NULL`              | Aún rechazos tienen el prompt original (puede ser ''). |
| `plan_json` nullable                | NULL para clarifications y errores pre-validación (migration 002). |
| `was_dry_run NOT NULL DEFAULT false` | Bool tri-estado prohibido.                          |
| `was_confirmed NOT NULL DEFAULT false` | idem.                                              |

**No hay FKs.** `orion_audit` es estándalone.

### 3.4 RLS

**M1: RLS deshabilitada.**

```sql
alter table public.orion_audit disable row level security;
```

Razón: single-user, `service_role` ejecuta y bypasea RLS. Habilitar RLS
con políticas en M1 sería ceremonia sin valor.

**M2: RLS habilitada con políticas para `orion_vox_executor`.**

```sql
-- Pendiente M2:
alter table public.orion_audit enable row level security;
create policy audit_insert_executor on public.orion_audit
  for insert to orion_vox_executor with check (true);
create policy audit_select_executor on public.orion_audit
  for select to orion_vox_executor using (true);
-- NO se crea policy de update/delete: executor no puede modificar audit.
```

### 3.5 Permisos

**M1:**

```sql
-- service_role tiene todo por default; sin grants explícitos.
```

**M2:**

```sql
-- Pendiente M2:
revoke all on public.orion_audit from public;
grant insert, select on public.orion_audit to orion_vox_executor;
grant update on public.orion_audit (rows_affected, result_summary, error, duration_ms)
  to orion_vox_executor;
-- DELETE deliberadamente NO concedido a executor.
```

El UPDATE granular en M2 permite el patrón de dos escrituras
(INSERT pre-ejecución + UPDATE post-ejecución) sin abrir DELETE.

### 3.6 Particionado

**M1: NO particionar.** Volumen esperado bajo (cientos a miles de
registros total por single user). Particionar agregaría complejidad sin
beneficio.

**M2/M3: revaluar** si volumen pasa decenas de miles. Posible
particionado por `range(ts)` mensual.

## 4. Comportamiento esperado

### 4.1 Inserción inicial (pre-ejecución)

`execute-plan` inserta antes de ejecutar contra Postgres:

```sql
insert into orion_audit
  (source, user_prompt, plan_json, sql_executed, sql_params, schema_hash,
   client_version, was_confirmed, was_dry_run, error)
values
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning id;
```

Si este insert falla, la Edge aborta con 500 (regla "sin audit, no hay
ejecución").

### 4.2 Update post-ejecución

```sql
update orion_audit
set rows_affected = $1,
    result_summary = $2,
    error = coalesce(error, $3),  -- preserva error si ya estaba (validación)
    duration_ms = $4
where id = $5;
```

### 4.3 Casos edge

- **Validación rechaza el plan**: insert con `error = '<motivo>'`,
  `sql_executed = NULL`. Sin update posterior.
- **Cancelación del modal (`rejected_by_user`)**: insert con
  `was_confirmed: false`, `was_dry_run: true`, `error:
  'rejected_by_user'`, `sql_executed = '<preview>'`,
  `rows_affected: 0`. Sin update posterior (todo va en el insert).
- **Postgres timeout**: insert ya ocurrió; update con `error =
  '<msg pg>'`, `rows_affected: NULL`, `duration_ms = <hasta timeout>`.

## 5. Estados / lifecycle

Por registro:

```
[pre-ejecución INSERT]
        │
   ┌────┴────┐
   │         │
   ▼         ▼
[ejecuta]  [rechazo / dry_run / cancel]
   │              (sin update)
   ▼
[post-ejecución UPDATE
  con result o error]
```

Append-only por convención M1: ningún `UPDATE` ni `DELETE` manual.
M2 lo refuerza con permisos.

## 6. Errores y manejo

| Situación                                  | Comportamiento                                                  |
|--------------------------------------------|-----------------------------------------------------------------|
| Insert pre-ejecución falla                 | Edge aborta con 500. NO se ejecuta nada. (regla innegociable)   |
| Update post-ejecución falla                | Log server-side; el INSERT ya ocurrió. La Edge devuelve éxito o error según el resultado real de la query. El audit queda con campos NULL en post-fields. |
| Tabla no existe / schema corrupto          | 500 al cliente. El operador debe restaurar o crear la tabla.    |

## 7. Restricciones M1

- **Sin retención automatizada**. Crece sin límite. Aceptado por bajo
  volumen.
- **Sin RLS habilitada**. M2 paga.
- **Sin permisos granulares**. `service_role` hace todo.
- **Append-only por convención** (no enforced). M2 lo refuerza con
  revoke de DELETE/UPDATE para `orion_vox_executor`.
- **Sin secret scrubbing**. `user_prompt`, `values` en `plan_json`,
  `sql_params` pueden contener datos sensibles del usuario. Es **su**
  base; no hay terceros. Si en algún momento se abre a terceros, esto
  cambia (proyecto distinto).

## 8. Criterios de aceptación verificables

- [ ] DDL del §3.1 se ejecuta sin error en una Postgres limpia con
      `pgcrypto` instalada.
- [ ] Los 4 índices del §3.2 existen y son usados (verificable con
      `EXPLAIN` para queries típicas).
- [ ] `INSERT` con campos mínimos requeridos (`source`, `user_prompt`)
      funciona y autopopulates `id`, `ts`, `was_dry_run`, `was_confirmed`.
      `plan_json` puede ser NULL (nullable desde migration 002).
- [ ] `INSERT` sin `user_prompt` falla por `NOT NULL`.
- [ ] `INSERT` sin `source` falla por `NOT NULL`.
- [ ] `INSERT` con `source` fuera de `('plan-intent','execute-plan')` falla
      por CHECK constraint.
- [ ] `select count(*) from orion_audit` no incluye datos de tablas
      del usuario.
- [ ] `comment on table` y `comment on column` están aplicados
      (verificable en `\d+ orion_audit`).
- [ ] La query `select ts, plan_json->>'operation', error, rows_affected
      from orion_audit order by ts desc limit 20` retorna registros
      legibles.
- [ ] Política de no-particionado documentada.
- [ ] M2: revoke de DELETE/UPDATE para `orion_vox_executor`
      verificable (test que intenta delete falla).

## 9. Dependencias

- Postgres con extensión `pgcrypto`.
- Rol con permisos suficientes para crear tabla en `public` (en M1:
  `service_role` o usuario admin).

## 10. Referencias

- `../02-architecture/AUDIT-MODEL.md` (autoritativo)
- `../02-architecture/SECURITY-MODEL.md`
- `../03-adr/ADR-008-server-side-audit-from-m1.md`
- `./spec-execute-plan-edge.md`
