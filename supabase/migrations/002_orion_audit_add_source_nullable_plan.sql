-- Migration: 002_orion_audit_add_source_nullable_plan
-- Razón: source distingue audit de plan-intent vs execute-plan;
-- plan_json NULL permite logear clarifications y errores pre-validación.
-- Detectado durante reconciliación de specs (pre-T1.4).
-- Ver docs/02-architecture/AUDIT-MODEL.md §3 para combinaciones canónicas.

alter table public.orion_audit
  add column source text not null
    check (source in ('plan-intent', 'execute-plan'));

alter table public.orion_audit
  alter column plan_json drop not null;

create index idx_audit_source on public.orion_audit (source, ts desc);

-- idx_audit_op: recrear con WHERE plan_json IS NOT NULL
-- (plan_json ahora es nullable; no tiene sentido indexar NULLs de clarifications)
drop index if exists idx_audit_op;
create index idx_audit_op on public.orion_audit
  ((plan_json->>'operation'))
  where plan_json is not null;

comment on column public.orion_audit.source is
  'Edge Function que disparó el audit entry: plan-intent (planning) o execute-plan (execution)';

comment on column public.orion_audit.plan_json is
  'Plan JSON validado. NULL cuando source=plan-intent y outcome=clarification, '
  'o cuando hubo error antes de parsear el plan';
