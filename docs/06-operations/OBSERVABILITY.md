---
title: Observabilidad — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/AUDIT-MODEL.md
  - ../02-architecture/DATA-FLOW.md
  - SETUP-SUPABASE.md
  - RUNBOOK.md
  - TROUBLESHOOTING.md
---

# Observabilidad — Orion Vox

Cómo observar el sistema en M1: logs, auditoría, métricas, health
checks. La auditoría server-side (`orion_audit`) hace el trabajo
pesado; los logs de Edge Functions complementan; métricas
client-side se posponen a M3.

---

## 1. Capas de observabilidad

| Capa                | Mecanismo                                | Retención   | Uso principal              |
|---------------------|------------------------------------------|-------------|----------------------------|
| Auditoría operativa | `orion_audit` en Postgres                | indefinida  | Forense + debug + estadística |
| Logs runtime Edge   | Supabase Functions logs                  | 7 días free | Debug de errores no logueados en audit |
| Métricas Gemini     | Google AI Studio dashboard               | depende     | Cuota + costo              |
| Métricas Postgres   | Supabase dashboard (queries lentas, etc.) | 7 días free | Performance tuning         |
| Métricas hosting    | Vercel/Netlify dashboard                 | varía       | Tráfico, errores 5xx       |
| Métricas PWA        | Ninguna en M1                            | -           | -                          |
| Espejo audit cliente | IndexedDB `audit_mirror`                | últimos 200 | Vista rápida sin red       |

---

## 2. `orion_audit` — la fuente principal

Toda operación pasa por `orion_audit`. Es el primer lugar donde mirar
**siempre** que algo no se entiende.

DDL completo: `AUDIT-MODEL.md §2`. Semántica de campos:
`AUDIT-MODEL.md §3`.

### 2.1 Queries útiles canónicas

**Últimas 20 operaciones**:

```sql
select ts,
       plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       rows_affected,
       coalesce(error, 'OK') as status,
       duration_ms,
       substring(user_prompt, 1, 50) as prompt
from orion_audit
order by ts desc
limit 20;
```

**Errores en las últimas 24h**:

```sql
select ts,
       plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       error,
       user_prompt
from orion_audit
where error is not null
  and ts > now() - interval '24 hours'
order by ts desc;
```

**Operaciones más lentas**:

```sql
select ts,
       plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       duration_ms,
       user_prompt
from orion_audit
where error is null
  and duration_ms is not null
order by duration_ms desc
limit 20;
```

**Volumen por día con tasa de error**:

```sql
select date_trunc('day', ts) as day,
       count(*) as total,
       sum(case when error is not null then 1 else 0 end) as failed,
       round(100.0 * sum(case when error is not null then 1 else 0 end) / count(*), 1) as fail_pct
from orion_audit
where ts > now() - interval '30 days'
group by 1
order by 1 desc;
```

**Operaciones destructivas (writes) últimas 7 días**:

```sql
select ts,
       plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       rows_affected,
       was_confirmed,
       user_prompt
from orion_audit
where plan_json->>'operation' in ('insert', 'update', 'delete')
  and ts > now() - interval '7 days'
order by ts desc;
```

**Top tablas más usadas**:

```sql
select plan_json->>'table' as tbl,
       count(*) as ops,
       sum(case when plan_json->>'operation' = 'select' then 1 else 0 end) as reads,
       sum(case when plan_json->>'operation' in ('insert','update','delete') then 1 else 0 end) as writes
from orion_audit
where ts > now() - interval '30 days'
group by 1
order by ops desc;
```

**Intentos rechazados (operaciones bloqueadas, plans inválidos)**:

```sql
select ts,
       error,
       plan_json,
       user_prompt
from orion_audit
where error like 'operation_not_allowed%'
   or error like 'multi-statement%'
   or error like 'invalid_plan%'
order by ts desc
limit 50;
```

### 2.2 Queries de calidad del prompt

**Frases del usuario que más fallaron**:

```sql
select substring(user_prompt, 1, 80) as prompt,
       count(*) as failures,
       array_agg(distinct error) as errors
from orion_audit
where error is not null
  and ts > now() - interval '30 days'
group by 1
having count(*) > 1
order by failures desc;
```

Usar este resultado para mejorar el prompt o agregar hints semánticos.

---

## 3. Logs de Edge Functions

### 3.1 Acceder

Dashboard Supabase → **Edge Functions** → seleccionar función
(`execute-plan` o `schema-summary`) → tab **Logs**.

**Retención**: 7 días en free tier.

### 3.2 Qué se loguea

Por convención (a implementar en `spec-execute-plan-edge.md`):

- **Inicio de request**: timestamp, headers (sin secrets), body size.
- **Validación**: pasó/falló + motivo.
- **SQL generado** (parametrizado, sin valores).
- **Resultado de ejecución**: rows count o error.
- **`audit_id` insertado**.
- **Total duration_ms**.

> **NO loguear**: valores del usuario, contenido sensible, secrets.

### 3.3 Cuándo mirar logs vs `orion_audit`

| Caso                                        | Mirar primero          |
|---------------------------------------------|------------------------|
| Operación que aparece en audit con error    | `orion_audit.error`    |
| Operación que NO aparece en audit (Edge cayó antes del INSERT inicial) | Logs Edge |
| Performance: por qué tardó X ms              | Logs (más detalle de timing) |
| Stack trace de excepción Deno                | Logs Edge              |
| Patrón de uso del usuario                    | `orion_audit`          |

---

## 4. Métricas Gemini

### 4.1 Dashboard

https://console.cloud.google.com/apis/dashboard → seleccionar
"Generative Language API".

Métricas disponibles:

- Requests por hora/día.
- Errores por código.
- Latencia p50/p95/p99.
- Cuota usada vs límite.

### 4.2 Cuándo revisar

- **Semanal**: chequeo de tendencia (estoy cerca del límite del free
  tier?).
- **Cuando algo falla**: ver si fue 429 (cuota) o 5xx (servicio).
- **Antes de release de prompt nuevo**: baseline de latencia.

---

## 5. Métricas Postgres / Supabase

### 5.1 Dashboard

Supabase → **Reports** → varias vistas.

Útiles para Orion Vox:

- **Database** → CPU, memoria, conexiones activas.
- **API** → requests por endpoint (incluye Edge Functions).
- **Logs** → query log (queries lentas).

### 5.2 Queries lentas

Supabase expone `pg_stat_statements`. Query directa:

```sql
select substring(query, 1, 100) as q,
       calls,
       total_exec_time::int as total_ms,
       (total_exec_time / calls)::int as avg_ms
from pg_stat_statements
where query not like '%pg_stat_statements%'
order by total_exec_time desc
limit 20;
```

**Acción**: si una query del builder de Orion Vox aparece consistentemente
lenta, agregar índice o revisar el plan.

---

## 6. Health checks

### 6.1 Health check rápido — desde la PWA

La PWA debería exponer un botón "Diagnóstico" en Configuración que:

1. Ping a `${SUPABASE_URL}/rest/v1/` → debe devolver 200/401 (alive).
2. POST a `/functions/v1/execute-plan` con `{ dry_run: true, plan_json: { version: "1.0", operation: "select", table: "orion_audit", limit: 1 } }` → ver si la Edge responde (M2 implementa dry_run formal).
3. POST a Gemini con prompt mínimo → ver si responde.
4. Mostrar 3 indicadores: Supabase OK / Gemini OK / Edge OK.

### 6.2 Health check rápido — desde curl

```bash
# Supabase API alive
curl -I "https://<project-ref>.supabase.co/rest/v1/" \
  -H "apikey: <anon-key>"
# → HTTP/2 200

# Edge Function alive
curl -X POST "https://<project-ref>.supabase.co/functions/v1/execute-plan" \
  -H "Authorization: Bearer <service-role>" \
  -H "Content-Type: application/json" \
  -d '{"plan_json":{"version":"1.0","operation":"select","table":"tareas","limit":1}}'
# → 200 con result.rows

# Gemini API alive
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"hola"}]}]}'
# → 200 con candidates
```

---

## 7. Cómo debuggear "el Plan JSON viene mal"

Flujo paso a paso:

1. **Mirar `orion_audit`** del último intento:
   ```sql
   select user_prompt, plan_json, error
   from orion_audit
   order by ts desc limit 1;
   ```
2. **Ver el `plan_json`**: ¿es lo que esperabas? Si no, el problema es
   Gemini/prompt.
3. **Ver el `user_prompt`**: ¿la voz transcribió bien? Si no, el
   problema es STT.
4. **Ver el `error`**: ¿es semántico (column no existe), validación
   (multi-statement), permiso, timeout?
5. Según diagnóstico:
   - Schema stale → refrescar (`DAILY-USAGE.md §4`).
   - Prompt débil → mejorar/agregar hint (`PROMPT-ENGINEERING.md`).
   - Operación bloqueada → esperado, no es bug.
   - SQL injection detectado → bug serio, abrir investigación
     (`RUNBOOK.md`).

---

## 8. Métricas de costo — proxy

`orion_audit` permite estimar costo Gemini sin tocar el dashboard
externo:

```sql
-- Operaciones por mes (proxy de calls a Gemini)
select date_trunc('month', ts) as mes,
       count(*) as gemini_calls
from orion_audit
group by 1
order by 1 desc;
```

Multiplicado por costo unitario aproximado (`COST-MODEL.md`) da
estimación.

---

## 9. M1 vs M2 — qué cambia

| Capa observabilidad         | M1                              | M2                                          |
|-----------------------------|---------------------------------|---------------------------------------------|
| `orion_audit`               | Idem                            | + UI de auditoría en PWA                    |
| Logs Edge                   | Idem                            | Idem (con más eventos por `plan-intent`)    |
| Métricas client-side        | Ninguna                         | Opcional Sentry / PostHog (ver §10)         |
| Health check                | Manual desde PWA / curl         | Endpoint dedicado `/functions/v1/health`    |
| Alertas                     | Ninguna                         | Email si error rate > X%                    |

---

## 10. Métricas client-side — postergado a M3

**M1**: cero telemetría. Razón: single user, no hay agregado útil.

**M3 (opcional)**: si el usuario quiere tracking detallado de su uso
(no para terceros), puede agregar:

- **Sentry**: errores JS no manejados, performance de la PWA.
- **PostHog self-hosted**: eventos personalizados, funnels.

> Ambos son **opcionales** y solo si el usuario lo decide
> conscientemente. M1 no los necesita.

---

## 11. Dashboards recomendados (M2+)

Cuando se justifique la inversión:

- **Notion / Obsidian** página personal con:
  - Gráfico de operaciones/día (export semanal de query del §2.1).
  - Top errores recurrentes.
  - Top tablas usadas.
  - Tiempo total ahorrado vs hacerlo manual (estimación).

- **Supabase Vault Reports** (si Pro): dashboard nativo con métricas
  de DB.

---

## 12. Reglas de oro de observabilidad

1. **`orion_audit` es la fuente de verdad operativa.** Si no está ahí,
   no pasó (o el sistema está roto).
2. **Logs son ephemerales** (7d). No dependas de ellos para forense
   largo plazo.
3. **Sin métricas anonimizadas a terceros**: single user, todo queda
   en sistemas del usuario.
4. **Health check antes de cada deploy importante**: tarda 30s y
   evita despliegues a un sistema roto.
