---
title: "ADR-010: Schema Summary autogenerado, no manual"
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
  - ADR-005-gemini-key-client-m1-server-m2.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-010: Schema Summary autogenerado, no manual

## Contexto

Para que Gemini devuelva Plan JSONs válidos contra el Postgres del
usuario, necesita conocer el **schema operativo**: qué tablas existen,
qué columnas tienen, qué tipos, qué relaciones, y qué hints semánticos
("la tabla `tareas` representa pendientes con fecha límite") ayudan al
modelo a desambiguar el lenguaje natural. Esta información se inyecta en
el system prompt como un **Schema Summary** estructurado en markdown.

Hay dos formas de mantener el Schema Summary:

1. **Manual**: el usuario (o el equipo) escribe a mano un markdown con
   las tablas y columnas relevantes, lo commitea al repo, lo embebe en
   el bundle de la PWA. Cada cambio de schema requiere actualizar el
   markdown.
2. **Autogenerado**: una Edge Function lee `pg_catalog` /
   `information_schema` del proyecto Supabase del usuario y devuelve un
   markdown estructurado calculado en runtime, con cache + invalidación
   por hash.

Codex argumentó en round 3 contra el manual: "un markdown manual es
frágil, se desactualiza al primer cambio de schema, y la única fuente
real de verdad es `pg_catalog`. Mantenerlo manual garantiza
desincronización a corto plazo, lo que envenena los Plan JSONs". Claude
y el usuario aceptaron — pero también aceptaron que en M1, mientras se
construye `execute-plan`, vivir con un dump filtrado a mano es razonable
para no inflar M1.

## Decisión

**M1 — dump manual filtrado, embebido en bundle (deuda explícita)**.

- El usuario produce un markdown del schema operativo (sólo las tablas
  que Orion Vox debe poder tocar, no las internas de Supabase) y lo
  commitea como parte del bundle de la PWA.
- Cada vez que el schema cambia, el markdown se actualiza a mano. Si no
  se actualiza, los Plan JSONs empiezan a fallar — fail loud.
- Esta deuda está **nombrada** en ADR-009 como ítem a cerrar en M2.

**M2 — Edge Function `schema-summary` autogenerada**.

- Se crea la Edge Function `schema-summary` (Deno) que:
  1. Conecta a Postgres con un rol con `SELECT` sobre `pg_catalog` /
     `information_schema` (rol read-only dedicado o el mismo
     `orion_vox_executor` con grant adicional).
  2. Lee tablas, columnas, tipos, foreign keys, índices del **schema
     operativo allowlisted** (no expone schemas internos).
  3. Genera un markdown estructurado con un formato fijo (versionado
     en código de la Edge Function).
  4. Calcula un hash SHA-256 del markdown y lo devuelve junto con el
     contenido.
- La PWA cachea el resultado en IndexedDB con TTL configurable (default
  24h) más invalidación por hash (la PWA llama `HEAD /schema-summary`
  para chequear si el hash cambió antes de re-pedir el body completo).
- El usuario puede agregar **hints semánticos** en una UI propia de la
  PWA (ej. "la tabla `tareas` es para pendientes; `vence` es la fecha
  límite, no la fecha de creación"). Esos hints se persisten en
  `orion_metadata` (tabla nueva, opcional) y se concatenan al schema
  autogenerado al armar el system prompt.
- La Edge Function `schema-summary` se vuelve **fuente única de
  verdad** del schema operativo en M2 en adelante.

## Alternativas consideradas

- **Markdown manual permanente**: rechazado. Argumentos de Codex son
  correctos: la entropía del schema es real (incluso single-user va a
  hacer migraciones), el mantenimiento manual se cae al tercer cambio,
  y un Schema Summary desactualizado envenena los prompts a Gemini de
  forma silenciosa (Plan JSONs sintácticamente válidos contra columnas
  que ya no existen).
- **Generación en build-time (script en CI/CD)**: rechazado. Genera el
  schema al momento del build, lo embebe estático en el bundle. Se
  desactualiza apenas el usuario hace un `ALTER TABLE` después del
  deploy. No mejora suficientemente sobre el manual; el costo de la
  Edge Function es bajo y resuelve el staleness.
- **Esquema Pull desde Supabase API REST (`postgrest meta` endpoint)**:
  considerado. Equivalente funcional a la Edge Function propia, pero
  acopla a un detalle de la API de Supabase y no permite curar el
  output al formato exacto que prefiere Gemini. La Edge Function propia
  da control total del formato.
- **Schema descripto en TypeScript types (Drizzle, Prisma, etc.)
  generado contra Postgres**: válido como técnica de cliente, pero no
  reemplaza al Schema Summary que Gemini necesita en lenguaje natural
  + estructurado en markdown. Complementario, no sustituto.

## Consecuencias

**Positivas**:

- En M2 hay **una sola fuente de verdad** (`pg_catalog`) para el schema
  que Gemini ve. Cero divergencia entre realidad y prompt.
- El hash + TTL hace el cache barato y consistente: la PWA no re-pide
  el schema en cada turno conversacional.
- Los hints semánticos del usuario se mantienen separados y editables
  desde la app, no requieren tocar código.
- Adding/dropping columns en Postgres se refleja automáticamente en el
  próximo turno conversacional (a más tardar TTL después).

**Negativas / deuda asumida**:

- En M1 hay riesgo real de schema desactualizado en bundle. Mitigación:
  Plan JSONs que apunten a columnas inexistentes fallan loud en
  `execute-plan` y el usuario detecta el desfase rápido.
- En M2, exponer la lectura de `pg_catalog` requiere otorgar
  `SELECT ON pg_catalog.*` (o subset) al rol que usa
  `schema-summary`. Es un rol distinto de `orion_vox_executor` para no
  ampliar la superficie del rol de ejecución.
- La Edge Function `schema-summary` es un componente más a mantener,
  versionar y testear.

**Neutrales**:

- El formato exacto del markdown autogenerado (qué columnas listar,
  qué orden, qué hints incluir) es objeto de iteración durante M2 con
  feedback de calidad de respuestas de Gemini.

## Aplicabilidad

- **M1**: deuda explícita (manual). **M2**: cierre obligatorio
  (autogenerado). **M3**: features sobre el schema autogenerado (ej.
  multi-proyecto, donde cada proyecto tiene su `schema-summary`).
- Es parte de los gates de salida de M2 (ver ADR-009).

## Referencias

- ADR-001 — Plan F+ donde Schema Summary es el contexto que recibe
  Gemini.
- ADR-003 — Plan JSON, validado contra el schema descripto por el
  Schema Summary.
- ADR-005 — Edge Function `plan-intent` en M2 consume `schema-summary`
  para armar el system prompt.
- ADR-009 — milestones donde se ubica esta migración.
- `docs/00-constitution/CONSTITUTION.md` § 6 (roadmap modular).
- Glosario: `Schema Summary`, `schema-summary (Edge Function)`.
