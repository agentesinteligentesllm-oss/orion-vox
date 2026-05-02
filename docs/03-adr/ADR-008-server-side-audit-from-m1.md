---
title: "ADR-008: Auditoría server-side desde el día 1 (M1)"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-003-plan-json-not-sql.md
  - ADR-004-service-role-m1-dedicated-role-m2.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-008: Auditoría server-side desde el día 1 (M1)

## Contexto

Orion Vox cae deliberadamente en el patrón de la **lethal trifecta** (LLM
con herramientas + entrada de usuario + acceso a datos sensibles). Las
mitigaciones primarias son el Plan JSON (ADR-003), el rol Postgres
acotado (ADR-004) y la confirmación táctil (Constitución § 5). Pero
ninguna de esas previene un bug de implementación: si la Edge Function
`execute-plan` acepta por error un Plan JSON malformado, o si el query
builder genera SQL incorrecto, o si Gemini convence al usuario de
confirmar algo que no debía, **necesitamos saber qué pasó**.

La pregunta de tribunal fue: **¿la auditoría puede vivir sólo en el
cliente (IndexedDB) en M1 y migrarse a server en M2, o tiene que ser
server-side desde día 1?**

Codex argumentó por server-side desde día 1 con dos puntos contundentes:

1. Si la Edge Function tiene un bug que abre la puerta a operaciones
   destructivas, ese mismo bug puede haber corrompido o borrado los
   logs si vivieran en el cliente o si dependieran del cliente para
   subirlos.
2. Si el dispositivo se rompe, se pierde, o se desinstala la PWA, los
   logs del cliente desaparecen — y con ellos la única evidencia de qué
   le pasó al Postgres del usuario.

El usuario aceptó porque el costo es bajo: una tabla, un INSERT por
operación, mantenido por la misma Edge Function que ya existe.

## Decisión

Toda ejecución que pase por la Edge Function `execute-plan` se registra
en una tabla Postgres llamada **`orion_audit`**, server-side, desde el
día 1 de M1. Sin excepciones.

**Schema mínimo de `orion_audit`** (DDL canónico, idéntico a
`docs/02-architecture/AUDIT-MODEL.md` §2):

```sql
create table orion_audit (
  id              uuid primary key default gen_random_uuid(),
  ts              timestamptz not null default now(),
  source          text not null
    check (source in ('plan-intent', 'execute-plan')),
  user_prompt     text not null,
  plan_json       jsonb,
  sql_executed    text,
  sql_params      jsonb,
  rows_affected   int,
  result_summary  jsonb,
  error           text,
  was_dry_run     boolean default false,
  was_confirmed   boolean default false,
  schema_hash     text,
  duration_ms     int,
  client_version  text
);

create index idx_audit_ts on orion_audit (ts desc);
create index idx_audit_source on orion_audit (source, ts desc);
```

Las 15 columnas (más `id`) cubren identidad/tiempo (`id`, `ts`),
origen de la Edge (`source`), input del usuario (`user_prompt`,
`client_version`, `schema_hash`), plan + SQL
(`plan_json`, `sql_executed`, `sql_params`), resultado (`rows_affected`,
`result_summary`, `error`), y modo de ejecución (`was_dry_run`,
`was_confirmed`, `duration_ms`).

> **Nota de autoridad.** El DDL canónico de `orion_audit` vive en
> `docs/02-architecture/AUDIT-MODEL.md`. Este ADR cita la versión a la
> fecha de aprobación; en caso de divergencia, **AUDIT-MODEL.md es
> autoritativo** y este ADR se actualiza para reflejarlo. No existen
> columnas `outcome`, `sql_ejecutado`, `params`, `filas_afectadas` ni
> `latencia_ms` — son nombres de versiones previas eliminadas en
> consenso del tribunal.

Toda ejecución, **exitosa, fallida, o rechazada por validación**, escribe
una fila. La inserción al `orion_audit` se hace **dentro de la misma
transacción** que la operación principal cuando es posible; cuando la
operación es un read-only `SELECT`, se hace en una transacción separada
post-respuesta para no bloquear el response al cliente.

**Espejo client-side opcional**: la PWA puede mantener una copia
liviana en IndexedDB para acceso offline al historial reciente. Esa
copia es **secundaria** y no autoritativa. La fuente de verdad es
`orion_audit` server-side.

**Retención**: indefinida en M1. En M2 se evalúa política de retención
(ej. archivar > 90 días a tabla particionada o a Storage). No es bloqueo
de M1.

## Alternativas consideradas

- **Solo audit client-side (IndexedDB)** en M1, migrar a server en M2:
  rechazado. Pierde trazabilidad si:
  - se rompe el dispositivo,
  - el usuario desinstala/reinstala la PWA,
  - hay un bug que corrompe IndexedDB,
  - el cliente nunca llega a sincronizar (latencia de red, batch
    fallido, etc.).
  El costo de implementar server-side desde día 1 es bajo (tabla + un
  INSERT en la Edge Function); la pérdida de trazabilidad es
  estructuralmente irreversible.
- **Sin audit en M1, sólo logs de Edge Function**: rechazado. Los logs de
  Supabase Edge Functions son ephemerales (rotación corta, sin búsqueda
  estructurada, sin retención garantizada). No sustituyen una tabla
  consultable con SQL.
- **Audit en archivo de Storage** (JSON Lines a un bucket): considerado.
  Rechazado por dificultad de query (no se puede `WHERE` con SQL sobre
  Storage directamente) y por overhead de buffer/flush. Una tabla
  Postgres es la herramienta correcta para registros consultables.
- **Audit en otra base externa** (ej. ClickHouse, Loki): rechazado por
  agregar proveedor sin necesidad. Postgres del usuario es suficiente
  hasta que demuestre lo contrario.

## Consecuencias

**Positivas**:

- Trazabilidad completa desde día 1: ante cualquier comportamiento raro
  ("¿por qué desapareció esa fila?"), `SELECT * FROM orion_audit ORDER
  BY created_at DESC` responde.
- Permite construir features de M3 sin trabajo adicional: "deshacé la
  última operación", "mostrame qué hice ayer", "¿cuántas tareas creé
  esta semana?", "exportar historial", todo se puede leer de
  `orion_audit`.
- Si en M1 hay un bug en `execute-plan`, la evidencia para diagnosticar
  vive server-side, accesible aún si el dispositivo se pierde.
- Costo cero o casi cero: un INSERT por operación, indexable, barato.

**Negativas / deuda asumida**:

- La tabla `orion_audit` crecerá indefinidamente en M1. Con uso single-
  user es despreciable (cientos de filas/día como mucho), pero requiere
  política de retención formal en M2.
- El INSERT a `orion_audit` agrega latencia mínima (1-2ms estimado) a
  cada operación. Aceptable.
- Si `orion_audit` se cae (espacio, locks, etc.), la decisión es
  **fail-closed**: la operación principal se rechaza también. La
  auditabilidad es prerrequisito de ejecución; sin audit, no se ejecuta.

**Neutrales**:

- En M2 se puede agregar columnas adicionales (ej. `user_agent`,
  `ip_origen`, `confirmacion_user_id`) sin breaking change.

## Aplicabilidad

- Aplica a **M1, M2 y M3**.
- Es uno de los **innegociables** de la Constitución (§ 3 — Auditoría
  server-side desde el día 1).

## Referencias

- ADR-001 — Plan F+ donde la Edge Function `execute-plan` es el
  componente que escribe `orion_audit`.
- ADR-003 — Plan JSON, contenido principal de la columna `plan_json`.
- ADR-004 — rol Postgres que ejecuta los INSERT a `orion_audit`.
- `docs/00-constitution/CONSTITUTION.md` § 3 (Auditoría server-side
  desde el día 1).
- Glosario: `orion_audit`.
