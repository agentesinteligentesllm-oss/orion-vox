---
title: Edge Function schema-summary — generación del resumen del schema
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-auth-flow.md
  - ./spec-execute-plan-edge.md
  - ./spec-plan-intent-edge.md
  - ./spec-config-ui.md
  - ../02-architecture/COMPONENTS.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../02-architecture/SCHEMA-SUMMARY.md
  - ../03-adr/ADR-010-schema-autogeneration.md
---

# Spec — Edge Function `schema-summary`

## 1. Propósito

Generar el **resumen estructurado del schema** de Postgres que se
inyecta como `system instruction` en cada llamada a Gemini. Sin este
resumen, Gemini no sabe qué tablas/columnas existen y aluciná. Con
este resumen acotado, Gemini opera con conocimiento del dominio real.

## 2. Alcance

**Cubre:**

- Endpoint HTTP `GET /functions/v1/schema-summary`.
- Auth con JWT Supabase + validación `ORION_ALLOWED_USER_ID`.
- Lectura de `pg_catalog` / `information_schema` para reconstruir
  tablas, columnas, tipos, PKs, FKs, comments.
- Filtrado por **allowlist server-side** vía env var
  `ORION_ALLOWED_TABLES` (M1 y M2).
- Generación de markdown estructurado.
- Hash SHA-256 del markdown para invalidación de caché en cliente.

**NO cubre:**

- Ejecución de queries del usuario → `spec-execute-plan-edge.md`.
- Cifrado de la respuesta (es markdown, no contiene secretos).
- Caché server-side (M1 sin caché propia; `plan-intent` cachea
  in-memory por 5 min al consumirla, ver `spec-plan-intent-edge.md`).

## 3. Interfaces / API / Contratos

### 3.1 Endpoint

```
GET /functions/v1/schema-summary?schema=public
Host: <project-ref>.supabase.co
Authorization: Bearer <SUPABASE_AUTH_JWT>     // M1 y M2 (sesión Supabase Auth)
```

La Edge valida el JWT y `ORION_ALLOWED_USER_ID` (ver
`spec-auth-flow.md`). Internamente usa
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` para leer `pg_catalog` /
`information_schema`. Ese secreto **no** sale al cliente.

### 3.2 Query parameters

| Param      | Tipo            | Default     | Descripción                                              |
|------------|-----------------|-------------|----------------------------------------------------------|
| `schema`   | string          | `'public'`  | Schema Postgres a leer.                                  |
| `format`   | `markdown` \| `json` | `markdown` | Formato de salida. M1 solo markdown.              |

**Nota.** El query param `excluded` que existía en versiones previas
de esta spec **ya no existe**. La filtración es 100% server-side via
env var `ORION_ALLOWED_TABLES`. Un cliente comprometido no puede
ampliar el alcance de tablas visibles a Gemini.

### 3.3 Response — éxito (200)

```ts
interface SchemaSummaryResponse {
  markdown: string;          // markdown estructurado, ver §3.5
  schema_hash: string;       // sha256 hex del markdown
  generated_at: string;      // ISO 8601 timestamptz
  tables_count: number;      // cuántas tablas incluidas (= |allowed ∩ existing|)
  allowed_count: number;     // cuántas tablas en ORION_ALLOWED_TABLES
  schema: string;            // schema leído
}
```

### 3.4 Response — errores

| HTTP | `error`              | Detalle                                       |
|------|----------------------|-----------------------------------------------|
| 401  | `unauthorized`       | Sin header `Authorization`.                   |
| 401  | `invalid_token`      | JWT inválido / expirado.                      |
| 403  | `forbidden_user`     | `user.id != ORION_ALLOWED_USER_ID`.           |
| 400  | `invalid_schema`     | `schema` con caracteres no válidos.           |
| 500  | `allowlist_misconfigured` | `ORION_ALLOWED_TABLES` no está definida o vacía. |
| 500  | `pg_error`           | Falla al leer `pg_catalog`.                   |
| 500  | `internal`           | Otro error interno.                           |

### 3.5 Formato del markdown

```markdown
# Schema summary — public — generado 2026-05-01T14:32:00Z

## tareas
Comentario: Lista personal de tareas.
- id (uuid, pk, not null, default gen_random_uuid())
- titulo (text, not null) — Texto corto del item.
- estado (text) — 'activa' | 'hecha' | 'archivada'.
- categoria_id (uuid) — FK → categorias.id
- creado_en (timestamptz, not null, default now())
- actualizada_en (timestamptz)
FKs: categoria_id → categorias.id
Indexes: idx_tareas_estado, idx_tareas_creado_en

## categorias
- id (uuid, pk, not null)
- nombre (text, not null, unique)
- color (text)
FKs: ninguna
```

**Reglas del formato.**

- Una sección `## <tabla>` por tabla.
- Si la tabla tiene comment, segunda línea `Comentario: <comment>`.
- Bullet por columna: `- <nombre> (<tipo>[, <pk>][, <not null>][, default <expr>])` + opcional ` — <anotación>`.
  - El `<tipo>` usa `udt_name` de `information_schema.columns` (no `data_type`). Produce alias compactos
    (`timestamptz` en lugar de `timestamp with time zone`) que reducen tokens en el system prompt de
    Gemini sin perder información semántica.
  - La `<anotación>` usa `column_comment` (de `col_description`) si existe. Si no, y la columna
    es FK, muestra `FK → <ref_tabla>.<ref_col>`. Cuando ambos están presentes, **gana el comment**
    (el usuario sabe mejor que la inferencia automática qué documentar; FK se omite del rendering).
- Línea `FKs: <lista>` o `FKs: ninguna` al final de la tabla.
- Línea `Indexes: <lista>` solo si hay índices no triviales (no PK).
- Sin secciones para tablas excluidas.
- Header H1 con timestamp para que Gemini sepa cuándo se generó.

### 3.6 Lógica de filtrado (allowlist)

La Edge devuelve **solo** las tablas que cumplen ambos:

1. Existen en el schema solicitado (`pg_catalog.pg_class`).
2. Están listadas en `Deno.env.get('ORION_ALLOWED_TABLES')` (env var
   server-side, comma-separated, case-sensitive).

Adicionalmente, **siempre** se excluyen (defensa en profundidad por si
alguien las pone en la allowlist por error):

- `orion_audit`
- Tablas con prefijo `_` (convención: tabla interna).
- Tablas de schemas Supabase internos (`auth`, `storage`, `realtime`,
  `extensions`, `graphql`, `vault`, `supabase_*`).

**No hay parámetro de exclusión desde el cliente.** Es deliberado: el
cliente no puede ampliar ni reducir el alcance de Gemini sobre la base.

## 4. Comportamiento esperado

### 4.1 Golden path

1. Cliente PWA o Edge `plan-intent` llama `GET /functions/v1/schema-summary`.
2. Edge valida JWT + `ORION_ALLOWED_USER_ID` (ver `spec-auth-flow.md`).
3. Edge lee `ORION_ALLOWED_TABLES` de env. Si está vacía o ausente,
   devuelve 500 `allowlist_misconfigured` (no es razonable correr el
   sistema sin ninguna tabla allowlisted).
4. Edge ejecuta queries:
   - `pg_catalog.pg_class` + `pg_catalog.pg_namespace` para tablas del
     schema solicitado.
   - `information_schema.columns` para columnas y tipos.
   - `information_schema.table_constraints` + `key_column_usage` para
     PKs y FKs.
   - `pg_description` para comments de tablas y columnas.
   - `pg_indexes` para índices.
5. Filtra por denylist hardcoded + intersección con allowlist.
6. Genera markdown según formato §3.5.
7. Calcula `sha256(markdown)`.
8. Retorna response 200.

### 4.2 Caché en cliente

- La PWA guarda el último response (`markdown` + `schema_hash`) en
  IndexedDB store `schema_cache` con TTL 24h.
- Antes de cada llamada a Gemini, la PWA puede:
  a. Usar el markdown cacheado si TTL no venció.
  b. Llamar a `schema-summary` y comparar `schema_hash`. Si cambió,
     refrescar el cache.
- En M1 la cache puede ser conservadora (refresh manual desde Config
  UI cuando el usuario modifica el schema).

### 4.3 Sin fallback embebido en bundle (cambio M1)

Tras la reforma de seguridad de M1, **no hay fallback de
schema-summary embebido en el bundle**. El cliente siempre obtiene
el schema vía esta Edge (directamente o a través de `plan-intent`).
Esto garantiza que la allowlist server-side sea la única fuente de
verdad sobre qué tablas son visibles para Gemini.

## 5. Estados / lifecycle

Stateless por request. No hay caché server-side en M1.

## 6. Errores y manejo

| Situación                                  | Comportamiento                                                |
|--------------------------------------------|---------------------------------------------------------------|
| Postgres timeout (10s)                     | 500 `pg_error` con detalle.                                   |
| `pg_catalog` no accesible                  | 500 `pg_error`. Indica problema con `service_role` o conexión.|
| Schema solicitado no existe                | 200 con `tables_count: 0`, `markdown: '# Schema summary — vacío'`. |
| `ORION_ALLOWED_TABLES` vacía / ausente     | 500 `allowlist_misconfigured` (deploy mal configurado).       |
| Allowlist contiene tablas que no existen   | Se ignoran silenciosamente; `tables_count` refleja la intersección. |

## 7. Restricciones M1

- **Allowlist server-side via env var** (sin UI admin todavía). M2
  agrega UI admin con audit. La env var sigue siendo fallback.
- **Sin caché server-side propia**. Cada call hace queries a
  `pg_catalog`. `plan-intent` cachea el resultado in-memory por 5 min
  (ver `spec-plan-intent-edge.md`).
- **Solo `markdown`** como formato. M2 podría agregar `json` para
  consumo programático.
- **Solo schema `public`** por default. Otros schemas vía query param,
  pero sin garantías de calidad para schemas Supabase internos.
- **Edge obligatoria desde M1** (sin fallback embebido en bundle).
  Si la Edge no responde, el sistema no puede construir el system
  prompt y `plan-intent` retorna 500 `schema_summary_failed`.

## 8. Criterios de aceptación verificables

- [ ] GET sin `Authorization` retorna 401 `unauthorized`.
- [ ] GET con JWT inválido retorna 401 `invalid_token`.
- [ ] GET con JWT de un user distinto al `ORION_ALLOWED_USER_ID`
      retorna 403 `forbidden_user`.
- [ ] GET con auth válido y schema con tablas allowlisted retorna 200
      con `markdown` no vacío y `schema_hash` de 64 hex chars.
- [ ] El markdown sigue exactamente el formato §3.5 (verificable con
      regex / parseo).
- [ ] El markdown contiene **solo** tablas listadas en
      `ORION_ALLOWED_TABLES`, intersectadas con las que existen en el
      schema.
- [ ] `orion_audit` NUNCA aparece en el markdown, incluso si está en
      `ORION_ALLOWED_TABLES` por error (denylist hardcoded gana).
- [ ] Tablas con comment incluyen línea `Comentario: ...`.
- [ ] Columnas con comment incluyen ` — <comment>` al final del
      bullet.
- [ ] FKs se listan correctamente (verificable con DB de prueba que
      tenga relaciones).
- [ ] `ORION_ALLOWED_TABLES` ausente o vacía retorna 500
      `allowlist_misconfigured`.
- [ ] Allowlist con tablas inexistentes: la Edge las omite
      silenciosamente; `tables_count` solo cuenta las existentes.
- [ ] Hash es determinista: dos llamadas seguidas con mismos params y
      sin cambios en DB ni en allowlist retornan el mismo `schema_hash`.
- [ ] No hay parámetro `excluded` en la URL (verificable: si llega,
      se ignora).

## 9. Dependencias

- Postgres driver compatible con Deno.
- Función SHA-256 (Deno `crypto.subtle`).
- Acceso a `pg_catalog` y `information_schema` con el rol que ejecuta
  la Edge (`service_role` server-side en M1, leído de
  `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`).
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ORION_ALLOWED_USER_ID`, `ORION_ALLOWED_TABLES`.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §10
- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2) y §2
- `../02-architecture/SCHEMA-SUMMARY.md`
- `../03-adr/ADR-010-schema-autogeneration.md`
- `./spec-auth-flow.md`
- `./spec-plan-intent-edge.md` (consumidor principal)
- `./spec-config-ui.md` (refresh manual)
