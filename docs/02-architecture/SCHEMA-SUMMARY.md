---
title: Componente schema-summary — generación, formato y lifecycle
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - COMPONENTS.md
  - OVERVIEW.md
  - SECURITY-MODEL.md
  - PROMPT-ENGINEERING.md
  - ../04-specs/spec-schema-summary-edge.md
---

# Componente `schema-summary`

Este documento describe en detalle el componente `schema-summary`: cómo
se construye el resumen del schema de Postgres que viaja a Gemini como
contexto, cómo se cachea en cliente, cómo se versiona, y cómo el usuario
agrega hints semánticos.

`COMPONENTS.md §10` ya describe la Edge Function a nivel resumen. Acá
está el detalle de implementación y lifecycle.

---

## 1. Propósito

El schema-summary es el **system prompt** que recibe Gemini para poder
construir un Plan JSON correcto. Sin él, Gemini no sabe qué tablas
existen, qué columnas tienen, qué FKs las relacionan, ni qué semántica
tiene cada tabla.

Es **el primer eslabón de la cadena de calidad**: si el schema-summary
es incompleto o stale, Gemini producirá Plans JSON incorrectos por
buenas razones (no por hallucination, sino por falta de contexto).

---

## 2. Origen del schema (server-side)

La Edge Function `schema-summary` consulta el catálogo de Postgres:

```sql
-- Tablas del schema 'public' (excluye schemas internos)
select c.relname as table_name,
       obj_description(c.oid, 'pg_class') as table_comment
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname = 'public'
  and c.relname not in (...excluded_tables...);

-- Columnas + tipos + nullable + default + comentario
select column_name, data_type, is_nullable, column_default,
       col_description(
         (table_schema||'.'||table_name)::regclass::oid,
         ordinal_position
       ) as column_comment
from information_schema.columns
where table_schema = 'public'
  and table_name = $1
order by ordinal_position;

-- Primary keys
select kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name = $1
  and tc.constraint_type = 'PRIMARY KEY';

-- Foreign keys
select kcu.column_name as fk_column,
       ccu.table_name as ref_table,
       ccu.column_name as ref_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
  and tc.table_name = $1
  and tc.constraint_type = 'FOREIGN KEY';
```

**Tablas excluidas siempre (denylist hardcoded).** `orion_audit` (no se
expone a Gemini bajo ningún concepto, ver `PLAN-JSON-CONTRACT.md §4`).
Schemas internos de Supabase (`auth`, `storage`, `realtime`,
`pgsodium`, `vault`, `extensions`) también.

**Allowlist server-side desde M1.** Variable de entorno **server-side**
`ORION_ALLOWED_TABLES` (comma-separated) define qué tablas son visibles
para Gemini. La Edge `schema-summary` devuelve únicamente la
intersección `allowlist ∩ tablas_existentes`. **No hay parámetro de
exclusión desde el cliente**: un cliente comprometido no puede ampliar
el alcance del LLM sobre la base. Detalles en
`spec-schema-summary-edge.md`. M2 agrega UI admin protegida para
editar la allowlist (la env var sigue como fallback).

---

## 3. Formato del markdown generado

El output es markdown estructurado, optimizado para que Gemini lo parsee
sin ambigüedad. Estructura canónica:

```markdown
# Schema summary — public — generado 2026-05-01T14:32:00.000Z

## tareas
Comentario: Tareas personales del usuario.
- id (uuid, pk, not null, default gen_random_uuid())
- titulo (text, not null)
- estado (text)
- categoria_id (uuid) — FK → categorias.id
- creado_en (timestamptz, not null, default now())
- actualizada_en (timestamptz)
FKs: categoria_id → categorias.id
Indexes: idx_tareas_estado, idx_tareas_creado_en

## categorias
- id (uuid, pk, not null, default gen_random_uuid())
- nombre (text, not null)
- color (text)
FKs: ninguna
```

**Reglas del formato.** (Formato autoritativo: `spec-schema-summary-edge.md §3.5`.)

- Header H1: `# Schema summary — <schema> — generado <ISO 8601>`.
- Una sección `## <tabla>` por tabla, orden alfabético.
- Si la tabla tiene comment de Postgres: segunda línea `Comentario: <comment>`.
- Bullet por columna: `- <nombre> (<tipo>[, pk][, not null][, default <expr>])[ — <anotación>]`.
  - `<tipo>` usa `udt_name` de `information_schema` (e.g. `timestamptz`, no `timestamp with time zone`).
  - Anotación: `column_comment` de Postgres tiene prioridad; si no hay, se muestra `FK → <tabla>.<col>` para columnas FK.
- Línea `FKs: <lista>` (o `FKs: ninguna`) al final de cada tabla.
- Línea `Indexes: <lista>` solo si hay índices no PK. Omitida si no hay.
- Tablas `orion_audit` y con prefijo `_` excluidas siempre (denylist hardcoded).
- Sin duplicación: cada tabla aparece una sola vez.

---

## 4. Lifecycle: cuándo se pide, cuándo se cachea, cuándo se refresca

### 4.1 Primera carga (instalación de la PWA)

1. Usuario hace login con magic link (Supabase Auth).
2. PWA o `plan-intent` server-side llama
   `GET /functions/v1/schema-summary` con header
   `Authorization: Bearer <supabase_jwt>`.
3. Recibe `{ markdown, schema_hash, generated_at, summary_version }`.
4. PWA guarda en IndexedDB store `schema_cache` con `key =
   sha256(supabase_url)`. (Ya no hay `excluded_tables_list` client-side
   porque la allowlist vive server-side.)

### 4.2 Cada arranque de sesión

1. PWA lee schema_cache local.
2. Si TTL no expiró (default 24h), usa el cacheado.
3. Si expiró, dispara refresh en background y usa el cacheado mientras
   tanto (estrategia stale-while-revalidate).

### 4.3 Refresh manual (botón en config UI)

1. Usuario presiona "Refrescar schema" (típicamente después de migrar
   Supabase).
2. PWA fuerza llamada a Edge ignorando cache.
3. Si el `schema_hash` cambió, sobrescribe cache y notifica al usuario.
4. Si no cambió, solo actualiza `generated_at`.

### 4.4 Refresh inducido por la Edge

1. PWA llama a `/execute-plan` con un Plan JSON.
2. Edge nota que el `schema_hash` enviado por la PWA difiere del schema
   real actual.
3. Edge ejecuta el plan (si pasa validación) y devuelve respuesta con
   campo extra `schema_changed: true` + `new_schema_hash`.
4. PWA dispara refresh inmediato del schema-summary.
5. Próxima llamada a Gemini ya usa el schema fresco.

---

## 5. Cache cliente (IndexedDB store `schema_cache`)

```javascript
{
  key: 'sha256(supabase_url)',
  markdown: '# Schema...',
  schema_hash: 'sha256:a3f9...',
  summary_version: '1.0',
  generated_at: '2026-05-01T14:32:00Z',
  cached_at: '2026-05-01T14:32:05Z',
  ttl_seconds: 86400  // 24h por default, configurable
}
```

**Invalidación.** Se invalida cuando:

- Cambia `supabase_url` (otra base).
- TTL expira.
- `schema_hash` recibido en respuesta de execute-plan o plan-intent no
  matchea (típicamente porque el director cambió `ORION_ALLOWED_TABLES`
  server-side, o porque cambió el schema en Postgres).
- El usuario presiona "Refrescar schema".

---

## 6. Hints semánticos del usuario

El usuario puede agregar **bloques manuales** en una UI de configuración
que se concatenan al markdown autogenerado **antes** de enviar a Gemini.
Esto cubre semántica que el catálogo no tiene:

```markdown
## Hints semánticos del usuario

> Estos hints son contexto adicional que el usuario provee. No reemplazan
> el schema; lo enriquecen.

- La tabla `pedidos` representa órdenes de compra del cliente.
  `cliente_id` referencia `clientes.id`.
- Cuando el usuario dice "tareas pendientes" se refiere a `tareas`
  con `estado = 'activa'`.
- "Categorías" y "tags" son sinónimos para esta base; ambos refieren
  a `categorias`.
- Las fechas se interpretan en zona `America/Argentina/Buenos_Aires`
  salvo indicación explícita.
```

**Reglas de los hints.**

- Se almacenan en IndexedDB store `settings.schema_hints` (texto plano
  markdown).
- Se concatenan al final del schema-summary autogenerado, después de un
  separador `---`.
- Cuentan para el cálculo de tamaño total (ver §7).
- Se versionan implícitamente con el schema_hash (cambian juntos).
- M2 puede mover los hints a una tabla server-side para sincronizar
  entre devices (irrelevante para single user con un solo device).

---

## 7. Tamaño y warnings

| Tamaño total (autogenerado + hints) | Comportamiento                                    |
|-------------------------------------|---------------------------------------------------|
| < 5 KB                              | OK                                                |
| 5–20 KB                             | OK típico                                         |
| 20–50 KB                            | OK con nota "schema grande, considerá excluir tablas" |
| > 50 KB                             | Warning visible: "Schema muy grande, Gemini puede tener menor calidad. Excluí tablas no usadas." |
| > 200 KB                            | Error duro: "Schema excede límite seguro"; PWA pide al usuario reducir antes de continuar |

El límite duro existe porque el schema-summary entra como **system
prompt** y compite por tokens con el `user_prompt` y la respuesta. Un
schema gigantesco degrada la calidad del Plan JSON producido por Gemini.

---

## 8. Versionado (`summary_version`)

El campo `summary_version` permite que cliente y server negocien
formato:

- **`1.0`** — formato descripto en este documento (markdown estructurado
  con tablas).
- **`1.x`** — agregados compatibles (campos extra, comentarios, hints
  estructurados).
- **`2.0`** — cambio mayor (ej: JSON estructurado en vez de markdown).
  Requiere ADR.

La PWA envía en cada request a `schema-summary` un header
`X-OrionVox-Summary-Version: 1.0` indicando qué versión espera. La Edge
puede degradar elegantemente o devolver 406 si no soporta.

Si el cliente recibe un `summary_version` distinto al esperado, dispara
refresh y/o actualiza su parser.

---

## 9. Diagrama del flujo

```
┌──────────────────────────────────────────────────────────────────┐
│                        PWA Orion Vox                             │
│                                                                  │
│  ┌────────────────┐      ┌──────────────────────────────────┐    │
│  │ schema_cache   │◀───▶│  Schema Summary Manager           │    │
│  │ (IndexedDB)    │      │  - check TTL                     │    │
│  └────────────────┘      │  - fetch from Edge               │    │
│                          │  - merge user hints              │    │
│  ┌────────────────┐      │  - serve to Gemini Client        │    │
│  │ user hints     │─────▶│                                  │    │
│  │ (settings)     │      └────────────────┬─────────────────┘    │
│  └────────────────┘                       │                      │
│                                           ▼                      │
│                          ┌──────────────────────────────────┐    │
│                          │ Gemini API Client                │    │
│                          │ system = schema_summary + hints  │    │
│                          └──────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                            │ GET /functions/v1/schema-summary (refresh)
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Edge Function: schema-summary                  │
│                                                                  │
│  - lee pg_catalog + information_schema                           │
│  - filtra excluded_tables                                        │
│  - construye markdown                                            │
│  - calcula sha256                                                │
│  - devuelve { markdown, schema_hash, generated_at, version }     │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                       Postgres
```

---

## 10. Errores y casos borde

| Caso                                   | Comportamiento                                                  |
|----------------------------------------|-----------------------------------------------------------------|
| Edge no responde (timeout, 5xx)        | PWA usa cache aunque expiró, advierte al usuario                |
| Cache vacío + Edge caída               | PWA bloquea uso de Gemini con mensaje "no puedo cargar schema"  |
| Schema vacío (sin tablas en allowlist) | Edge devuelve markdown con `## (sin tablas)`, PWA advierte      |
| Tabla con 0 columnas (raro)            | Se omite del markdown                                           |
| Tabla referencia FK a tabla excluida   | Se lista la FK pero con nota "→ tabla excluida"                 |
| Comentarios con caracteres unicode     | Se preservan; markdown soporta UTF-8                            |
| Comentarios con caracteres de control  | Se sanean (replace por espacio)                                 |

---

## 11. Roadmap

- **M1**: Edge `schema-summary` obligatoria desde día 1. Allowlist
  server-side estricta via `ORION_ALLOWED_TABLES` env var. Sin
  fallback embebido en bundle. Sin parámetro `excluded` desde cliente.
- **M2**: UI admin protegida en la PWA para editar la allowlist con
  audit (`orion_audit`). La env var sigue como fallback inicial.
  `summary_version` 1.x con hints estructurados (no solo texto libre).
- **M3**: posible mover hints a `pg_description` (comentarios nativos
  de Postgres) para que sean parte del schema mismo.

Ver también `PROMPT-ENGINEERING.md` para cómo el schema-summary se
combina con el resto del prompt antes de Gemini.
