# Orion Vox — Contexto para Claude (próxima sesión)

## Descripción

PWA personal **single-user** (sideload, sin Play Store) que sirve de
puente entre Gemini Android (Cubot KingKong 9) y un proyecto Supabase
del usuario, usando voz natural en español. Plan F+ aprobado tras 5+
rounds de debate tribunal Claude↔Codex↔usuario y reformulado en
Wave 1 (post-auditoría Codex) para nacer ya defendible.

No es un producto, no escala usuarios, no tiene multi-tenant. Es una
herramienta operativa personal del director.

## Stack Tecnológico

- **PWA**: Svelte 5 + Vite + TypeScript (ADR-012). Tailwind 4 / CSS
  modules. Biome para lint. Vitest + Playwright para tests.
- **Backend**: Supabase Edge Functions (Deno) + Postgres + Supabase
  Auth.
- **LLM**: Gemini API (`gemini-2.5-flash` o `pro`) con function
  calling. Llamada **server-side** desde la Edge `plan-intent`.
- **Voz**: Web Speech API (`SpeechRecognition` + `SpeechSynthesis`)
  configurada en `es-MX`.
- **Storage cliente**: IndexedDB **sin cifrado** (no hay secretos en
  cliente; sólo cache de schema-summary, espejo de auditoría reciente
  y preferencias UX).
- **Hosting**: Vercel (estático, PWA instalable).

## Arquitectura

**Plan F+** — 3 capas:

1. **PWA Svelte 5 (cliente)**: Auth Client (Supabase Auth + magic link)
   + Voice Input + Plan-Intent Client + Confirmation Modal +
   Execute-Plan Client + TTS Output + IndexedDB cache (no secretos).
2. **3 Edge Functions Deno (server)**:
   - `plan-intent`: custodia `GEMINI_API_KEY`. Recibe
     `{user_prompt, client_version}` + Bearer JWT, valida `user.id ==
     ORION_ALLOWED_USER_ID`, llama `schema-summary` internamente, llama
     Gemini server-side y devuelve Plan JSON v1.0 o Clarification.
   - `execute-plan`: custodia `SUPABASE_SERVICE_ROLE_KEY`. Recibe Plan
     JSON + JWT, valida user + allowlist (`ORION_ALLOWED_TABLES`),
     traduce a SQL parametrizado, audita en `orion_audit` y ejecuta.
   - `schema-summary`: lee `pg_catalog` filtrado por
     `ORION_ALLOWED_TABLES` y redactado por `ORION_REDACTED_COLUMNS`,
     devuelve markdown estructurado. Llamada **interna** por
     `plan-intent`.
3. **Postgres (datos)**: tablas del usuario + `orion_audit` (14
   columnas en inglés con `was_dry_run` y `was_confirmed`,
   server-side desde día 1).

Mapas C4 ASCII y DDL canónico en `docs/02-architecture/OVERVIEW.md` y
`docs/02-architecture/AUDIT-MODEL.md`. Sequence diagrams en
`docs/02-architecture/DATA-FLOW.md`.

## Decisiones críticas (ADRs vigentes)

- **ADR-001**: Plan F+ como arquitectura base.
- **ADR-002**: Descarte de "OK Google" hands-free nativo en español
  (imposible en hardware no-Samsung sin Pixel a mayo 2026).
- **ADR-003**: Plan JSON v1.0 estructurado, **NUNCA SQL libre**.
- **ADR-004**: `service_role` server-side en M1 (env var de Edge), rol
  Postgres dedicado `orion_vox_executor` en M2.
- **ADR-005**: Gemini API key **server-side desde M1** (env var de
  Edge `plan-intent`). [Reescrito en Wave 1.]
- **ADR-006**: PWA pura, sin componente nativo Kotlin.
- **ADR-007**: Web Speech API como modo voz interno.
- **ADR-008**: Auditoría server-side desde día 1.
- **ADR-009**: Roadmap modular M1 (base segura) → M2 (hardening) → M3
  (features). [Reescrito en Wave 2.]
- **ADR-010**: Schema-summary autogenerado desde `pg_catalog`.
- **ADR-011**: Español como idioma primario.
- **ADR-012**: Svelte 5 + Vite + TypeScript como framework PWA.

Índice navegable: `docs/03-adr/ADR-INDEX.md`.

## Convenciones

- TypeScript estricto (`strict: true`), sin `any` implícito.
- Archivos código `kebab-case.ts` para módulos; `PascalCase.svelte`
  para componentes.
- Naming: español en UX, documentación, voz y mensajes de error
  visibles; inglés en código fuente, identificadores de tablas y
  columnas, y nombres técnicos (`orion_audit`, `execute-plan`, etc.).
- Edge Functions: una función por archivo, deploy con `supabase
  functions deploy` (sin `--no-verify-jwt` para `plan-intent` y
  `execute-plan`; JWT siempre verificado).
- Plan JSON v1.0 con validador compartido entre cliente y server
  (módulo `lib/plan-validator.ts`, "una operación por request",
  `operation` singular).
- Variables de entorno Edge:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `ORION_ALLOWED_USER_ID`, `ORION_ALLOWED_TABLES`,
  `ORION_REDACTED_COLUMNS`.
- Frontmatter YAML en todo `.md` bajo `docs/` con `title`, `status`,
  `milestone`, `owner`, `last-reviewed`, `supersedes`, `related`.

## Reglas Específicas (innegociables M1)

1. `service_role` **NUNCA** en cliente (ni cifrado, ni plaintext, ni
   en bundle, ni en header). Vive sólo en env var de Edge
   `execute-plan`.
2. `GEMINI_API_KEY` **NUNCA** en cliente. Vive sólo en env var de
   Edge `plan-intent`.
3. `anon_key` **NO es auth**. Es pública por diseño. Auth = JWT
   Supabase Auth + validación `user.id == ORION_ALLOWED_USER_ID`.
4. Allowlist de tablas en env var `ORION_ALLOWED_TABLES` server-side,
   **no configurable desde la PWA en M1** (M2 agrega UI admin).
5. Plan JSON v1.0 estructurado con `operation` singular, jamás SQL
   libre desde el LLM.
6. Operaciones bloqueadas hardcoded: `DROP`, `TRUNCATE`, `ALTER`,
   `CREATE`, `GRANT`, `COPY`, `DO`, multi-statement, funciones SQL.
7. Auditoría server-side de **toda** ejecución (incluye cancelaciones
   con `was_dry_run + rejected_by_user`). Tabla `orion_audit`, 14
   columnas en inglés.
8. Confirmación táctil obligatoria para todo write
   (`UPDATE`/`DELETE`/`INSERT`).
9. `LIMIT` obligatorio en SELECT (default 100, max 1000).
10. `statement_timeout` = 10s en la sesión de la Edge Function.
11. Política de redacción `ORION_REDACTED_COLUMNS` aplica a
    `sql_params`, `result_summary`, TTS y preview SQL.

Lista completa en `docs/00-constitution/CONSTITUTION.md` y checklist
ejecutable en `docs/00-constitution/PRINCIPLES-CHECKLIST.md`.

## Estado Actual

**Fase 0 (documentación) COMPLETA tras Wave 1, 2 y 3 de reformas.**
~80 archivos creados y reformados post-auditoría Codex. 12 ADRs, 14
specs (incluye los 2 nuevos: `spec-auth-flow.md` y
`spec-plan-intent-edge.md`), arquitectura completa con mapas C4,
roadmap M1/M2/M3 reformulado, change `m1-mvp` listo para
implementación.

**Próximo paso = arrancar Bloque 0 de implementación**:

- Archivo guía: `openspec/changes/m1-mvp/tasks.md` (9 bloques, B0
  → B8).
- ADR-012 (framework) ya aprobado: Svelte 5 + Vite + TypeScript.
- Sin bloqueos pendientes.
- Criterios de aceptación: `docs/05-implementation/M1-MVP.md`.

**Deuda técnica residual M1 → M2 (4 items reales)**:
- TD-001-bis — `service_role` con `BYPASSRLS` en `execute-plan` →
  M2 rol dedicado `orion_vox_executor`.
- TD-003 — preview de writes generado client-side → M2 firmado
  server-side con `preview_id` (HMAC).
- TD-004 — sin UI admin para allowlist/redacción → M2 UI admin.
- TD-005 — RLS deshabilitada en `orion_audit` → M2 RLS estricta.

Detalle: `docs/05-implementation/TECHNICAL-DEBT.md`.

## Tribunal de IAs

Decisiones arquitectónicas pasan por debate **Claude + Codex (vía
ChatGPT) + Usuario (director)**. Nunca avanzar sin ADR. El usuario
decide alcance y dirección; Claude y Codex debaten arquitectura y
validan tradeoffs.

- **Nunca avanzar sin ADR** en cambios arquitectónicos o
  constitucionales.
- **Nunca cambiar un innegociable** sin ADR explícito que lo suspenda.
- **Consenso > velocidad**.

Protocolo completo en `docs/00-constitution/GOVERNANCE.md` y
`docs/00-constitution/CHANGE-PROTOCOL.md`.

## Documentos clave para retomar contexto rápido

1. `docs/INDEX.md` — índice navegable de toda la documentación.
2. `docs/02-architecture/OVERVIEW.md` — vista C4 + capas + ADRs
   referenciados.
3. `docs/02-architecture/DATA-FLOW.md` — flujos READ/WRITE/CANCEL/ERROR.
4. `docs/02-architecture/SECURITY-MODEL.md` — modelo de seguridad
   por milestone (M1 base segura, M2 hardening).
5. `docs/03-adr/ADR-INDEX.md` — todas las decisiones.
6. `docs/05-implementation/M1-MVP.md` — scope y criterios M1.
7. `docs/05-implementation/M2-HARDENING.md` — scope M2 (4 items
   residuales).
8. `openspec/changes/m1-mvp/tasks.md` — checklist de implementación
   (B0 a B8).
9. `docs/05-implementation/TECHNICAL-DEBT.md` — deuda M1 → M2 (4
   items reales).
10. `docs/07-references/history/DEBATE-LOG.md` — bitácora honesta del
    debate y de las reformas.

## Engram (memoria persistente)

Para recovery total de contexto entre sesiones:

- `mem_search "consenso final arquitectura Orion Vox"`
- `mem_search "pivote arquitectónico Orion Vox single user"`
- `mem_search "wave 1 sub-agente alpha"` — reforma de seguridad
  (Gemini key y service_role server-side, JWT, allowlist server,
  redacción, separación de Edges).
- `mem_search "wave 2 sub-agente delta"` — roadmap M1/M2/M3
  reformulado.
- `mem_search "wave 3 auditoría final"` — esta wave (cleanup
  residual + CLAUDE.md actualizado).
- `mem_session_summary` más reciente del proyecto.

Si abrís sesión nueva, llamá primero a `mem_context` y luego a
`mem_search "skill-registry pwa-supabase-ia"` para recuperar
convenciones del workspace antes de tocar código o documentación.
