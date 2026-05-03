---
title: Changelog de la documentación
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../INDEX.md
  - ../00-constitution/CHANGE-PROTOCOL.md
  - ./EXTERNAL-LINKS.md
  - ./history/RESEARCH-LOG.md
  - ./history/DEBATE-LOG.md
---

# Changelog — Orion Vox (documentación)

Bitácora de cambios **mayores** a la documentación del proyecto. No
incluye correcciones tipográficas, ajustes de links rotos o reformatos sin
cambio de contenido (esos cambios viven en el historial de commits).

> **Convención**: formato basado en [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
> El versionado semántico de la documentación es independiente del
> versionado del código (cuando exista). Hoy la doc va por su cuenta:
> `0.x` = pre-M1, `1.x` = a partir de la primera release del MVP.

---

## [Unreleased]

> Cambios de documentación en vuelo que aún no cierran un bloque de implementación.

---

## [0.3.0] — 2026-05-02 — B3: Voice screen completo

Cierre del bloque B3 de implementación. Módulos de voz completos con
tests exhaustivos y VoiceScreen integrada.

### Added

#### Voice modules (`src/lib/voice/`)
- `recognition.ts` — `VoiceInputController`: wraps Web Speech API
  (`SpeechRecognition` / `webkitSpeechRecognition`), configurado `es-MX`,
  `continuous:false`, `interimResults:true`, `maxAlternatives:1`. 4 estados
  (`idle | listening | processing | error`), 7 códigos de error con mensajes
  en español, EventEmitter tipado.
- `synthesis.ts` — `TtsOutputController`: wraps `SpeechSynthesis`, selección
  de voz (exact `es-MX` → prefix `es-*` → default), truncación a 300 chars con
  `"…más en pantalla"`, cancel-before-speak, opciones configurables
  (rate/pitch/volume).

#### Componente (`src/components/`)
- `VoiceScreen.svelte` — pantalla voz completa: 4 estados visuales
  (idle/listening/processing/error), auto-listen cuando `navigator.permissions`
  reporta `'granted'`, educación sobre permisos en estado `'prompt'`, keyboard
  fallback auto-habilitado en estado `'denied'`, botón cancelar, gear → settings.
- `App.svelte` — integrado `VoiceScreen` en routing (mode=voice).

#### Tests
- `tests/unit/recognition.test.ts` — 14 tests: config M1, start/stop/cancel,
  eventos, 7 códigos de error, caso `unavailable`.
- `tests/unit/synthesis.test.ts` — 16 tests: isAvailable, speak con texto/
  truncación/cancel-before/opciones/eventos, selectVoiceForLang, unavailable.
- `tests/e2e/b3-voice-screen.test.ts` — 8 tests: idle UI, keyboard fallback,
  keyboard submit, gear navigation, no-permissions path, permission
  prompt/denied/granted.

### Fixed
- Guard `!navigator.permissions` (truthy) en lugar de
  `!('permissions' in navigator)` — jsdom define la propiedad como `undefined`,
  haciendo que `in` devuelva `true` incorrectamente.
- Svelte 5 jsdom state updates requieren `waitFor` post-`fireEvent.click`.

### Notes
- 168/168 Vitest verde al cierre de B3.
- Commits: `78c9b41` (B3.1-B3.3) + `d7f56bf` (B3.4) + `5ebb458` (B3.6).

---

## [0.2.0] — 2026-05-02 — B2: Auth, Config e IndexedDB completo

Cierre del bloque B2 de implementación. PWA con autenticación Supabase
funcional, routing reactivo, settings persistidos en IndexedDB y tests E2E.

### Added

#### Auth & routing (`src/lib/`)
- `auth-store.svelte.ts` — sesión Supabase reactiva con Svelte 5 `$state`,
  PKCE-safe: `onAuthStateChange` + `getSession()` al init.
- `router.svelte.ts` — routing por `mode: 'voice' | 'config'` + `firstTime`
  flag + `URLSearchParams` sync.
- `supabase.ts` — cliente Supabase con `anon_key` (pública por diseño).

#### Componentes (`src/components/`)
- `LoginWizard.svelte` — login magic link con input email + estado
  (idle/sending/sent/error).
- `ConfigWrapper.svelte` — wrapper routing config/settings.
- `Settings.svelte` — config completa: idioma TTS, voz preferida, read-only
  global, dry-run global. Persistida en IndexedDB.

#### Storage (`src/lib/storage/`)
- `local-store.ts` — IndexedDB wrapper con `idb@8`, `getSetting`/`setSetting`/
  `wipeAll`. Compatible con `fake-indexeddb` en tests.
- `types.ts` — tipos `Idioma`, `Settings`, `AuditEntry`.

#### Logout
- Flujo logout: `supabase.auth.signOut()` + `localStore.wipeAll()` + reset
  router → pantalla login.

#### Tests
- `tests/e2e/b2-auth-config.test.ts` — flujos auth + config + logout + guards.

### Notes
- 128/128 Vitest verde al cierre de B2.
- Commits: `bfe8b69`→`ded96d1` (B2.1-B2.prep) + `bfe8b69`, `8fbff8a`,
  `79cd318`, `43aa943`, `43a0db7`, `28ad509`, `c466a86`, `138f4e3`.

---

### Added
- `supabase/functions/_shared/redact.ts` — `redactSqlParams` extraída a shared; cubre ahora `filters[].value` además de `plan.values` (INSERT/UPDATE). Param ordering documentado por operación.
- `tests/fixtures/plans/valid/12-update-with-redacted-filter.json` y `13-select-with-redacted-filter.json` — fixtures para cobertura de redacción en filtros.
- `tests/contracts/redact.test.ts` + `supabase/functions/tests/redact_test.ts` — tests cross-runtime (3 casos): UPDATE filter redacted, SELECT filter redacted + LIMIT intacto, empty set no-op.
- `docs/05-implementation/TECHNICAL-DEBT.md` TD-008 — retry inteligente para Plan JSON inválido del LLM (M2).
- `tests/smoke/border.test.ts` — guard ADR-013: `$shared/*` solo permite `plan-schema`; cualquier otro path falla.
- `docs/03-adr/ADR-013-shared-plan-schema-strategy.md` — estrategia de validador compartido entre PWA y Deno sin monorepo.
- `supabase/functions/_shared/plan-schema.ts` — schema Zod 4 canónico (ops SQL, NULL discriminated union, patrones de identificador).
- `supabase/migrations/001_orion_audit.sql` — DDL inicial de `orion_audit`, 14 columnas, 3 índices (migration 002 agrega la columna 15: `source`).
- `supabase/migrations/002_orion_audit_add_source_nullable_plan.sql` — columna `source` NOT NULL (plan-intent | execute-plan) + `plan_json` nullable para clarifications y errores pre-parse.
- `tests/contracts/plan-schema.test.ts` — validación Vitest de todos los fixtures contra `PlanSchema` con assert 12/12 ops.
- `supabase/functions/tests/plan-schema_test.ts` — parity test Deno nativo, mismos fixtures y misma cobertura.
- `tests/contracts/import-guard.test.ts` — guard que impide imports directos de `supabase/functions/` desde `src/`.
- Fixtures válidos 09/10/11 — cobertura completa de los 12 ops del spec (`!=`, `<`, `>`, `<=`, `>=`, `like`, `not_in`, `is_null`, `is_not_null`).
- `tests/fixtures/plans/invalid/01-multi-statement-in-value.json` (renombrado de `01-sql-injection-in-value.json`).

### Fixed (B1.fix — redact + Gemini SDK)
- `execute-plan/index.ts`: `redactSqlParams` ahora cubre `filters[].value`; columnas redactadas
  en cláusulas WHERE ya no se filtran del log de auditoría. Extraída a `_shared/redact.ts`
  para testabilidad cross-runtime.
- `plan-intent/index.ts`: `response.functionCalls` era invocado como método (`?.()`) — es un
  getter (`get functionCalls(): FunctionCall[] | undefined`) en `@google/genai@1.51.0`.
  Habría lanzado `TypeError` en deploy real.
- `execute-plan/index.ts`: `tryAuditError` documentada explícitamente como best-effort SOLO
  para error-paths pre-ejecución. El INSERT pre-flight (paso 7) aborta con 500 y no usa
  esta función — invariante "sin audit no hay ejecución" confirmado y comentado.

### Fixed (B1.partial — specs reconciliados)
- `spec-plan-intent-edge.md`: `conversation_id` removido de M1; `allowed_function_names`
  en tool_config; INSERT siempre `error: NULL` (clarification en `result_summary`);
  placeholder `{ operation: 'clarification' }` para columna `plan_json NOT NULL`.
- `spec-execute-plan-edge.md`: `schema_hash` requerido (sin `?`); nuevo error 409
  `schema_stale`; `was_confirmed` enviado explícito por cliente; `dry_run` del request
  gana sobre plan (`request.dry_run ?? plan.dry_run ?? false`); `rejected_by_user`
  INSERT directo con `error` sin UPDATE posterior; paso 11b para SQL preview en dry_run;
  LIMIT en 3 capas documentado; `schema_stale` en pipeline §4.1 paso 5b.

### Fixed (B1.partial — migration 002: source + plan_json nullable)
- `AUDIT-MODEL.md`: DDL actualizado a 15 columnas; `idx_audit_source` (source, ts desc) agregado;
  `idx_audit_op` con `WHERE plan_json IS NOT NULL`; §3 reescrito con 3 combinaciones canónicas
  (plan-intent clarification, plan-intent plan, execute-plan).
- `spec-audit-table.md`: DDL, índices, constraints e INSERT alineados con migration 002;
  `source` en INSERT, `plan_json` nullable documentada con razonamiento.
- `spec-plan-intent-edge.md` §4.1 paso 9: `source: 'plan-intent'`; `plan_json: NULL` para
  clarification (reemplaza placeholder `{ operation: 'clarification' }` que violaba Zod schema).
- `spec-execute-plan-edge.md` §4.1 paso 7: `source: 'execute-plan'` en INSERT pre-ejecución.
- `SETUP-SUPABASE.md` §4 y `ADR-008`: DDL actualizados a 15 columnas; referencia a migrations.
- Causa: divergencias detectadas durante reconciliación de specs (pre-T1.4). `source` necesario
  para distinguir entries de plan-intent de execute-plan. `plan_json` nullable requerido porque
  `{ operation: 'clarification' }` no pertenece al discriminatedUnion del Zod schema.

### Fixed (B1.partial — schema alineado)
- `_shared/plan-schema.ts`: alineado con PLAN-JSON-CONTRACT.md §5.
  Ops de filtro corregidos a SQL (`=`, `!=`, `<`, etc.) en lugar de
  nombrados (`eq`, `neq`). NULL ops como discriminated union sin `value`.
  Campo `order_by` (no `order`), propiedad `dir` (no `direction`).
  Joins restringidos a `inner` en M1. Sin `offset` (es M2).
  Patrones de identificador `TABLE_RE`/`COL_RE` para defensa en profundidad.
  Causa: schema escrito sin consultar spec autoritativo. Detectado
  pre-implementación de Edge Functions, sin impacto en deploy.

### Constraints
- Vite pinned to `^7` (vite-plugin-pwa pendiente de soporte Vite 8). `@sveltejs/vite-plugin-svelte` en v6 en consecuencia.

### Planificado
- ADR-012 — selección de framework de la PWA (Vite + React vs SvelteKit
  vs vanilla). Se crea al arrancar M1.
- ADR-013 — preview firmado server-side (mecanismo `preview_id`). Se crea
  al arrancar M2.
- ADR-014 — emisión y validación del JWT del usuario para `execute-plan`.
  Se crea al arrancar M2.
- `openspec/changes/m2-hardening/` — cambio OpenSpec con proposal/spec/
  design/tasks. Se crea al promover M1 a `completed`.
- `openspec/changes/m3-features/` — cambio OpenSpec con proposal/spec/
  design/tasks. Se crea al promover M2 a `completed`.

---

## [0.1.0] — 2026-05-01 — Documentación Fase 0 inicial

Primera entrega completa del corpus documental del proyecto Orion Vox,
producto del consenso del tribunal Claude↔Codex↔usuario tras 4 rounds de
debate. Toda la base constitucional, arquitectónica y operativa queda
fijada antes de escribir la primera línea de código.

### Added

#### Constitución y gobernanza (`docs/00-constitution/`)
- `CONSTITUTION.md` — 12 principios innegociables del proyecto.
- `GOVERNANCE.md` — modelo de tribunal de IAs, roles y poderes.
- `GLOSSARY.md` — términos canónicos (Plan JSON, Edge, lethal trifecta,
  etc.).
- `NON-GOALS.md` — lo que el proyecto explícitamente **no** hace.
- `PRINCIPLES-CHECKLIST.md` — checklist de validación por PR / change.
- `CHANGE-PROTOCOL.md` — flujo formal para proponer y aceptar cambios.

#### Producto (`docs/01-product/`)
- `PRD.md` — Product Requirements Document.
- `PERSONAS.md` — único usuario (vos) y contextos de uso.
- `USE-CASES.md` — casos de uso por voz priorizados.
- `USER-STORIES.md` — historias de usuario para M1 / M2 / M3.

#### Arquitectura (`docs/02-architecture/`)
- `OVERVIEW.md` — visión Plan F+ end-to-end.
- `COMPONENTS.md` — descripción de PWA shell, edge functions y Postgres.
- `DATA-FLOW.md` — flujo runtime voz→DB→voz.
- `SECURITY-MODEL.md` — modelo de seguridad por milestone.
- `THREAT-MODEL.md` — riesgos M1 y mitigaciones M2 (lethal trifecta).
- `PLAN-JSON-CONTRACT.md` — contrato técnico del Plan JSON v1.0.
- `SCHEMA-SUMMARY.md` — diseño del summary filtrado.
- `PROMPT-ENGINEERING.md` — system prompt y patrones para Gemini.
- `AUDIT-MODEL.md` — DDL de `orion_audit` y ciclo de vida.
- `TESTING-STRATEGY.md` — capas de test (unit, integración, manual).
- `DEPLOYMENT-TOPOLOGY.md` — topología de despliegue.

#### Decisiones arquitectónicas (`docs/03-adr/`)
- `ADR-INDEX.md` — índice navegable.
- `ADR-001` — Adopción de Plan F+ como arquitectura base.
- `ADR-002` — Descarte de "OK Google" nativo hands-free en español.
- `ADR-003` — Plan JSON estructurado, NUNCA SQL libre.
- `ADR-004` — `service_role` en M1, rol dedicado en M2.
- `ADR-005` — Gemini API key server-side desde M1 (env var de Edge `plan-intent`). Reescrito en Wave 1 post-auditoría Codex.
- `ADR-006` — PWA pura, sin componente nativo Kotlin.
- `ADR-007` — Web Speech API como modo voz interno.
- `ADR-008` — Auditoría server-side desde M1.
- `ADR-009` — Roadmap modular M1 → M2 → M3.
- `ADR-010` — Schema Summary autogenerado, no manual.
- `ADR-011` — Español como idioma primario.

#### Specs técnicas (`docs/04-specs/`)
- `SPEC-INDEX.md` — índice de specs.
- `pwa-shell.md`, `voice-input.md`, `gemini-client.md`,
  `plan-json-schema.md`, `execute-plan-edge.md`,
  `schema-summary-edge.md`, `audit-table.md`, `config-ui.md`,
  `confirmation-flow.md`, `tts-output.md`, `credentials-storage.md`,
  `error-taxonomy.md`.

#### Implementación (`docs/05-implementation/`)
- `ROADMAP-M1.md`, `ROADMAP-M2.md`, `ROADMAP-M3.md`.
- `TECHNICAL-DEBT.md` — registro vivo de deuda asumida con plan de pago.

#### Operaciones (`docs/06-operations/`)
- `SETUP-SUPABASE.md`, `SETUP-GEMINI-API.md`, `DEPLOY-PROCEDURE-PWA.md`,
  `INSTALLATION-CUBOT.md`, `DAILY-USAGE.md`, `BACKUP-RECOVERY.md`,
  `KEY-ROTATION.md`, `MONITORING.md`, `INCIDENT-RESPONSE.md`,
  `COST-TRACKING.md`.

#### Referencias e historia (`docs/07-references/`)
- `EXTERNAL-LINKS.md` — curaduría de docs oficiales.
- `CHANGELOG.md` — este archivo.
- `history/RESEARCH-LOG.md` — síntesis de los rounds de investigación.
- `history/DEBATE-LOG.md` — síntesis del debate Claude↔Codex↔usuario.

#### OpenSpec (`openspec/`)
- `openspec/changes/m1-mvp/` — `proposal.md`, `spec.md`, `design.md`,
  `tasks.md`, `state.yaml` para el primer milestone funcional.

### Decided (decisiones de consenso del tribunal)

- Adopción definitiva de **Plan F+** (PWA pura sideloaded + Gemini API +
  Edge Functions + Plan JSON). Documentada en ADR-001.
- Descarte definitivo de la integración "OK Google" hands-free completo
  en español. Documentada en ADR-002.
- Adopción del modelo **Plan JSON v1.0** como único contrato Gemini ↔
  ejecución. Documentada en ADR-003.
- Postura inicial de deuda técnica para M1 (service_role + Gemini key
  cifrados en cliente, schema-summary embebido) **descartada** en Wave 1
  tras la auditoría Codex. La nueva M1 es ya "base segura" con secretos
  server-side desde día 1. Deuda residual M1→M2 documentada en
  `TECHNICAL-DEBT.md` (TD-001-bis BYPASSRLS, TD-003 preview firmado,
  TD-004 UI admin allowlist, TD-005 RLS estricta). Ver ADRs 004, 005,
  009, 010.
- Confirmación del modelo **tribunal de IAs** como gobernanza permanente.
  Documentada en `GOVERNANCE.md`.

### Reservado para futuro

- ADR-012 (framework PWA): se crea al arrancar M1.
- ADR-013 (preview firmado server-side): se crea al arrancar M2.
- ADR-014 (JWT del usuario): se crea al arrancar M2.
- `openspec/changes/m2-hardening/`: se crea al promover M1 a `completed`.
- `openspec/changes/m3-features/`: se crea al promover M2 a `completed`.

---

## Política de versionado del changelog

- **MAJOR (`X.0.0`)**: cambio incompatible en la arquitectura base
  (ej: superseder Plan F+ por otra arquitectura).
- **MINOR (`0.X.0`)**: nuevo milestone completado, nuevos ADRs aceptados,
  nueva familia de docs incorporada.
- **PATCH (`0.0.X`)**: actualización sustantiva de un doc existente sin
  cambiar la decisión que documenta.

Los cambios menores (typos, links, formato) no entran al changelog: viven
en el historial de commits.
