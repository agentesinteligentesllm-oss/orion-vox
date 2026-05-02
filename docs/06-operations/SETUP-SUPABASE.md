---
title: Setup Supabase — guía paso a paso
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/OVERVIEW.md
  - ../02-architecture/AUDIT-MODEL.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../04-specs/spec-execute-plan-edge.md
  - ../04-specs/spec-audit-table.md
  - SETUP-GEMINI-API.md
  - DEPLOY-PROCEDURE-PWA.md
---

# Setup Supabase — guía paso a paso

Setup completo de Supabase Cloud para Orion Vox M1: cuenta, proyecto,
tabla `orion_audit`, Edge Functions, variables de entorno, prueba con
curl.

> Tiempo estimado: 30-45 minutos la primera vez.

---

## 1. Crear cuenta Supabase

1. Ir a https://supabase.com
2. Sign up con GitHub o email.
3. Verificar email si fue requerido.

Plan: **Free tier**. Suficiente para M1 single user.

---

## 2. Crear proyecto

1. Dashboard → "New project".
2. Configurar:
   - **Organization**: la que se haya creado por default.
   - **Name**: `orion-vox` (o el que prefieras).
   - **Database password**: generar uno fuerte y **guardarlo en
     password manager**. Se necesitará para conexiones directas a
     Postgres (psql, dump, restore).
   - **Region**: la más cercana a tu ubicación física. Para LATAM
     típicamente `aws-us-east-1` o `aws-sa-east-1` si está disponible.
   - **Pricing plan**: Free.
3. "Create new project". Tarda ~2 minutos en aprovisionarse.

**Anotar al terminar**:

- **Project URL**: `https://<project-ref>.supabase.co`
- **Anon key** (pública por diseño; la PWA la usa para inicializar el SDK Supabase Auth).
- **Service role key**: Settings → API → `service_role` (secret).

> El `service_role` **bypasea RLS** y tiene acceso total. Tratalo como
> credencial crítica. Ver `SECURITY-MODEL.md §2`.

---

## 3. Habilitar `pgcrypto`

Necesario para `gen_random_uuid()` que usa `orion_audit`.

1. Dashboard → SQL Editor → New query.
2. Ejecutar:

```sql
create extension if not exists pgcrypto;
```

3. Run.

---

## 4. Crear tabla `orion_audit`

DDL completo (ver `AUDIT-MODEL.md §2`):

1. SQL Editor → New query.
2. Pegar:

```sql
-- Ejecutar las migrations en orden:
-- supabase/migrations/001_orion_audit.sql
-- supabase/migrations/002_orion_audit_add_source_nullable_plan.sql
--
-- O bien, DDL equivalente completo (15 columnas):

create table public.orion_audit (
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
  was_dry_run     boolean not null default false,
  was_confirmed   boolean not null default false,
  schema_hash     text,
  duration_ms     int,
  client_version  text
);

create index idx_audit_ts on public.orion_audit (ts desc);
create index idx_audit_source on public.orion_audit (source, ts desc);
create index idx_audit_error on public.orion_audit (error)
  where error is not null;
create index idx_audit_op on public.orion_audit
  ((plan_json->>'operation'))
  where plan_json is not null;

comment on table public.orion_audit is
  'Auditoría server-side de toda ejecución pasada por plan-intent y execute-plan.';
```

3. Run. Verificar en Table Editor que aparece `orion_audit`.

---

## 5. Crear (o usar) tablas del dominio

Si ya tenés tablas creadas en este proyecto Supabase, saltá este paso.

Si no, crear las que vas a usar. **Por ahora una de prueba** para
validar el flujo end-to-end:

```sql
create table public.tareas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  estado          text not null default 'activa',
  categoria       text,
  creado_en       timestamptz not null default now(),
  actualizada_en  timestamptz
);

insert into public.tareas (titulo, estado, categoria) values
  ('comprar pilas', 'activa', 'casa'),
  ('llamar al banco', 'activa', 'finanzas'),
  ('leer libro X', 'hecha', 'lectura');
```

---

## 6. RLS sobre `orion_audit` (M1)

En M1 todo pasa por `service_role` que bypasea RLS. La política sirve
solo como red de seguridad si en algún momento se accede con otro rol.

```sql
alter table public.orion_audit enable row level security;

-- Política permisiva al service_role (M1)
create policy orion_audit_service_role_all
  on public.orion_audit
  for all
  to service_role
  using (true)
  with check (true);

-- Bloquear cualquier otro rol
-- (sin política adicional, RLS niega por default)
```

> En M2, esta política se reemplaza por una estricta sobre el rol
> `orion_vox_executor` con permisos limitados. Ver
> `SECURITY-MODEL.md §3`.

---

## 7. Instalar Supabase CLI (local)

Necesario para deployar Edge Functions desde tu máquina.

**macOS / Linux:**

```bash
brew install supabase/tap/supabase
```

**Windows (PowerShell):**

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**O via npm:**

```bash
npm install -g supabase
```

Verificar:

```bash
supabase --version
```

Login:

```bash
supabase login
```

---

## 8. Linkear el proyecto local

En el directorio donde tendrás el código de las Edge Functions:

```bash
mkdir orion-vox-supabase
cd orion-vox-supabase
supabase init
supabase link --project-ref <project-ref>
```

`<project-ref>` es la parte antes de `.supabase.co` en tu URL del
proyecto (ej: `abcdef1234567890`).

---

## 9. Crear Edge Function `execute-plan`

```bash
supabase functions new execute-plan
```

Esto crea `supabase/functions/execute-plan/index.ts`. Reemplazar con la
implementación según `spec-execute-plan-edge.md`. Estructura mínima
esperada (pseudocódigo):

```typescript
import { serve } from 'https://deno.land/std/http/server.ts';
import { z } from 'https://deno.land/x/zod/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1. Definir schema Zod del Plan JSON (importado de módulo compartido)
// 2. Conectar a Postgres con service_role
// 3. Validar plan
// 4. Insertar audit pre-ejecución
// 5. Ejecutar query parametrizada
// 6. Update audit post-ejecución
// 7. Devolver { ok, result, audit_id }

serve(async (req) => {
  // ...
});
```

Deploy:

```bash
supabase functions deploy execute-plan
```

> **Sin `--no-verify-jwt`**: tras la reforma de seguridad M1 (Wave 1),
> `execute-plan` autentica con **JWT de Supabase Auth** en el header
> `Authorization: Bearer <jwt>` y valida que `user.id ==
> ORION_ALLOWED_USER_ID`. Ver `spec-auth-flow.md`.

---

## 10. Crear Edge Function `schema-summary`

```bash
supabase functions new schema-summary
```

Implementar según `spec-schema-summary-edge.md`. Devuelve markdown
estructurado del schema (ver `SCHEMA-SUMMARY.md`).

Deploy:

```bash
supabase functions deploy schema-summary
```

> `schema-summary` se invoca **internamente** desde `plan-intent` con
> el `service_role` (intra-Supabase). Si se invoca sólo
> internamente, considerar `--no-verify-jwt` para esa función puntual;
> si se expone vía HTTPS público, mantener JWT verify para no abrir
> introspección anónima.

---

## 11. Variables de entorno

Las Edge Functions necesitan acceso a Postgres. Supabase expone
automáticamente:

- `SUPABASE_URL` — la URL del proyecto.
- `SUPABASE_SERVICE_ROLE_KEY` — el service_role.
- `SUPABASE_ANON_KEY` — la `anon_key` pública (se usa en la PWA para
  inicializar el SDK Supabase Auth; **no autentica por sí sola**, la
  auth real es JWT de Supabase Auth).

Estas están disponibles dentro de las Edge Functions sin configuración
adicional. Si necesitás otras (ej: lista de tablas excluidas), agregalas
con:

```bash
supabase secrets set SCHEMA_SUMMARY_EXCLUDED_TABLES="auth_users,internal_logs"
```

Ver con:

```bash
supabase secrets list
```

---

## 12. Probar Edge Functions con curl

### 12.1 `schema-summary`

```bash
curl -X GET \
  "https://<project-ref>.supabase.co/functions/v1/schema-summary" \
  -H "Authorization: Bearer <service-role-key>"
```

Respuesta esperada (200):

```json
{
  "markdown": "# Schema...\n\n## tareas\n\n| Columna | ... |",
  "schema_hash": "sha256:abc123...",
  "generated_at": "2026-05-01T14:32:00Z",
  "summary_version": "1.0"
}
```

### 12.2 `execute-plan` — SELECT

```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/execute-plan" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_json": {
      "version": "1.0",
      "operation": "select",
      "table": "tareas",
      "columns": ["id", "titulo", "estado"],
      "filters": [{"column": "estado", "op": "=", "value": "activa"}],
      "limit": 10
    },
    "user_prompt": "lista las tareas activas",
    "schema_hash": "sha256:abc123..."
  }'
```

Respuesta esperada (200):

```json
{
  "ok": true,
  "result": {
    "rows": [...],
    "rows_affected": 2
  },
  "audit_id": "uuid-..."
}
```

### 12.3 `execute-plan` — operación bloqueada

```bash
curl -X POST \
  ".../functions/v1/execute-plan" \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_json": {
      "version": "1.0",
      "operation": "drop_table",
      "table": "tareas"
    },
    "user_prompt": "borrá la tabla tareas"
  }'
```

Respuesta esperada (422 o 403):

```json
{
  "ok": false,
  "error": "operation_not_allowed: drop_table",
  "audit_id": "uuid-..."
}
```

Verificar en Table Editor que `orion_audit` registró ambos intentos.

---

## 13. Datos a anotar para configurar la PWA

Al terminar este setup, anotar y guardar en password manager:

```
SUPABASE_URL:           https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE:  eyJhbGciOiJIUzI1NiIs... (largo)
SUPABASE_DB_PASSWORD:   <el que generaste en paso 2>
PROJECT_REF:            <project-ref>
```

Estos valores se ingresan en la PWA durante `INSTALLATION-CUBOT.md` —
paso "Setup inicial".

---

## 14. Checklist final

```
[ ] Cuenta Supabase creada
[ ] Proyecto creado, region elegida
[ ] DB password guardado en password manager
[ ] Project URL + service_role anotados
[ ] pgcrypto extension habilitada
[ ] Tabla orion_audit creada con índices
[ ] Tabla(s) de dominio creadas (al menos una de prueba)
[ ] RLS habilitada sobre orion_audit (M1 permisiva)
[ ] Supabase CLI instalada y logueada
[ ] Proyecto local linkeado
[ ] Edge Function execute-plan deployada
[ ] Edge Function schema-summary deployada
[ ] Variables de entorno verificadas (supabase secrets list)
[ ] Test curl schema-summary OK
[ ] Test curl execute-plan SELECT OK
[ ] Test curl execute-plan operación bloqueada → audit registra
```

---

## 15. Troubleshooting común

| Síntoma                                      | Causa probable                       | Solución                                              |
|----------------------------------------------|--------------------------------------|-------------------------------------------------------|
| `function not found`                         | Función no deployada                  | `supabase functions deploy <name>`                    |
| `permission denied for table orion_audit`    | Falta RLS o service_role no en header | Verificar Authorization header + política RLS         |
| `relation "tareas" does not exist`           | Tabla no creada en este proyecto      | Crear tabla o cambiar nombre en el plan               |
| `operation not allowed`                      | Plan con operación bloqueada           | Esperado: la Edge funciona correctamente              |
| Edge timeout                                 | Query muy pesada                      | Revisar índices + LIMIT                                |
| `pgcrypto.gen_random_uuid not found`         | Extensión no habilitada                | `create extension if not exists pgcrypto`              |

Detalle adicional: ver `TROUBLESHOOTING.md`.
