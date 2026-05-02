-- Migration: 001_orion_audit
-- Creates the orion_audit table — append-only audit log for all execute-plan operations.
-- See docs/02-architecture/AUDIT-MODEL.md for full spec and query examples.

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
