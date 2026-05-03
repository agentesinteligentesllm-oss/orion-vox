---
title: Índice general de documentación
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ../README.md
  - ../openspec/README.md
---

# Índice de documentación — Orion Vox

Mapa navegable de toda la documentación del proyecto. Todos los archivos
listados existen físicamente; los links son relativos y deben funcionar
desde este archivo.

## Regla de autoridad `docs/` ↔ `openspec/`

> `docs/` describe el sistema en su estado deseado estable.
> `openspec/changes/<id>/` describe los cambios en vuelo.
> Cuando un change se completa, su delta se promueve a `docs/04-specs/`
> y la carpeta se mueve a `openspec/archive/`.
> **NO duplicar.**

Detalle del workflow en [`../openspec/README.md`](../openspec/README.md).

## Leyenda

**Status**:

- `stub` — placeholder, contenido mínimo, requiere desarrollo.
- `draft` — borrador en revisión, no fuente de verdad todavía.
- `stable` — aprobado, fuente de verdad operativa.
- `deprecated` — superado por otro doc; mantener por trazabilidad.

**Milestone**:

- `constitutional` — fundacional, transversal a todos los milestones.
- `M1` — MVP funcional (Plan F+ con deuda aceptada).
- `M2` — Hardening (rol dedicado, secrets server-side, RLS estricta).
- `M3` — Features (multi-modelo, multi-proyecto, exports, gráficos).

## Árbol de documentación

```
docs/
├── INDEX.md ............................. (este archivo)
├── HANDOFF.md ........................... Traspaso Wave 4 → Codex 5.5 (estado B0-B3)
│
├── 00-constitution/ ..................... [constitutional]
│   ├── CONSTITUTION.md .................. 12 principios innegociables
│   ├── GOVERNANCE.md .................... Tribunal de IAs y toma de decisiones
│   ├── GLOSSARY.md ...................... Términos canónicos del proyecto
│   ├── NON-GOALS.md ..................... Lo que el proyecto NO hace
│   ├── PRINCIPLES-CHECKLIST.md .......... Checklist por PR/change
│   └── CHANGE-PROTOCOL.md ............... Cómo proponer cambios
│
├── 01-product/ .......................... [M1]
│   ├── PRD.md ........................... Product Requirements Document
│   ├── PERSONAS.md ...................... Único usuario (vos) y contextos
│   ├── USE-CASES.md ..................... Casos de uso por voz
│   └── USER-STORIES.md .................. Historias de usuario priorizadas
│
├── 02-architecture/ ..................... [M1]
│   ├── OVERVIEW.md ...................... Plan F+ end-to-end
│   ├── COMPONENTS.md .................... PWA, Edge Functions, Postgres
│   ├── DATA-FLOW.md ..................... Flujo de datos voz→DB→voz
│   ├── SECURITY-MODEL.md ................ Capas, allowlists, statement_timeout
│   ├── THREAT-MODEL.md .................. Riesgos M1 y mitigaciones M2
│   ├── PLAN-JSON-CONTRACT.md ............ Contrato del Plan JSON
│   ├── SCHEMA-SUMMARY.md ................ Diseño del summary filtrado
│   ├── PROMPT-ENGINEERING.md ............ Prompts a Gemini y guardrails
│   ├── AUDIT-MODEL.md ................... Tabla orion_audit y queries
│   ├── TESTING-STRATEGY.md .............. Unit, integración, manual
│   └── DEPLOYMENT-TOPOLOGY.md ........... Topología de despliegue PWA + Supabase
│
├── 03-adr/ .............................. [constitutional + por milestone]
│   ├── ADR-INDEX.md ..................... Índice de decisiones
│   ├── ADR-001-plan-f-plus-architecture.md
│   ├── ADR-002-discard-ok-google-native.md
│   ├── ADR-003-plan-json-not-sql.md
│   ├── ADR-004-service-role-m1-dedicated-role-m2.md
│   ├── ADR-005-gemini-key-client-m1-server-m2.md
│   ├── ADR-006-pure-pwa-no-kotlin.md
│   ├── ADR-007-web-speech-api-internal-voice-mode.md
│   ├── ADR-008-server-side-audit-from-m1.md
│   ├── ADR-009-modular-roadmap-m1-m2-m3.md
│   ├── ADR-010-schema-autogeneration.md
│   ├── ADR-011-spanish-as-primary-language.md
│   └── ADR-012-framework-pwa.md ......... Framework PWA: Svelte 5 + Vite + TypeScript
│
├── 04-specs/ ............................ [específico por milestone]
│   ├── SPEC-INDEX.md .................... Índice de specs
│   ├── spec-pwa-shell.md ................ Shell de la PWA (instalable, offline-first)
│   ├── spec-voice-input.md .............. Captura de voz (Web Speech API)
│   ├── spec-auth-flow.md ................ Modelo de auth Supabase Auth + JWT (M1+)
│   ├── spec-plan-intent-edge.md ......... Edge Function plan-intent (Gemini server-side)
│   ├── spec-gemini-client.md ............ [SUPERSEDED por spec-plan-intent-edge.md]
│   ├── spec-plan-json-schema.md ......... Esquema JSON del Plan
│   ├── spec-execute-plan-edge.md ........ Edge Function execute-plan
│   ├── spec-schema-summary-edge.md ...... Edge Function schema-summary
│   ├── spec-audit-table.md .............. Tabla orion_audit y triggers
│   ├── spec-config-ui.md ................ UI de configuración
│   ├── spec-confirmation-flow.md ........ Flujo de confirmación táctil de writes
│   ├── spec-tts-output.md ............... Salida TTS (Web Speech Synthesis)
│   ├── spec-credentials-storage.md ...... Almacenamiento local (IndexedDB sin cifrado, sesión Supabase Auth)
│   └── spec-error-handling.md ........... Taxonomía y manejo de errores
│
├── 05-implementation/ ................... [M1+]
│   ├── ROADMAP.md ....................... Roadmap M1 → M2 → M3
│   ├── M1-MVP.md ........................ Implementación detallada del MVP + progreso B0-B3
│   ├── M2-HARDENING.md .................. Plan de hardening
│   ├── M3-FEATURES.md ................... Features post-hardening
│   ├── TECHNICAL-DEBT.md ................ Deuda técnica registrada y plan de pago
│   └── B4-PENDING-DECISIONS.md .......... 4 decisiones bloqueantes para arrancar B4
│
├── 06-operations/ ....................... [M1+]
│   ├── SETUP-SUPABASE.md ................ Setup inicial del proyecto Supabase
│   ├── SETUP-GEMINI-API.md .............. Setup API key de Gemini
│   ├── DEPLOY-PROCEDURE-PWA.md .......... Procedimiento de deploy de la PWA
│   ├── INSTALLATION-CUBOT.md ............ Instalación de la PWA en el Cubot
│   ├── DAILY-USAGE.md ................... Operación diaria del usuario
│   ├── BACKUP-RECOVERY.md ............... Backups Supabase y recuperación
│   ├── OBSERVABILITY.md ................. Logs, métricas y auditoría
│   ├── RUNBOOK.md ....................... Runbook operativo
│   ├── COST-MODEL.md .................... Modelo de costos Gemini + Supabase
│   └── TROUBLESHOOTING.md ............... Diagnóstico de incidentes comunes
│
├── 07-references/ ....................... [constitutional + histórico]
│   ├── EXTERNAL-LINKS.md ................ Links a docs externas (Web Speech, Supabase, Gemini)
│   ├── CHANGELOG.md ..................... Cambios significativos del proyecto
│   └── history/
│       ├── RESEARCH-LOG.md .............. Log de investigaciones realizadas
│       └── DEBATE-LOG.md ................ Síntesis de debates Claude↔Codex
```

## OpenSpec — cambios en vuelo

```
openspec/
├── README.md ............................ Workflow OpenSpec y convenciones
└── changes/
    └── m1-mvp/
        ├── proposal.md .................. Propuesta del change M1-MVP
        ├── spec.md ...................... Delta specs del change
        ├── design.md .................... Diseño técnico del change
        ├── tasks.md ..................... Checklist de implementación
        └── state.yaml ................... Estado del DAG del change
```

## Estructura de código — módulos creados en B0-B3

> Esta sección refleja el estado post-Wave 4 (2026-05-02).
> B0–B3 completos; B4 pausado pendiente de decisiones.

```
src/
├── App.svelte                          — shell, routing por router.mode
├── components/
│   ├── VoiceScreen.svelte              — pantalla voz (B3: estados idle/listening/processing/error)
│   ├── LoginWizard.svelte              — login magic link (B2)
│   ├── Settings.svelte                 — config IndexedDB (B2: idioma, dry-run, read-only)
│   └── ConfigWrapper.svelte            — wrapper config + settings (B2)
└── lib/
    ├── auth-store.svelte.ts            — sesión Supabase, Svelte 5 $state (B2)
    ├── router.svelte.ts                — routing reactivo mode+firstTime (B2)
    ├── supabase.ts                     — cliente Supabase anon (B2)
    ├── voice/
    │   ├── recognition.ts              — VoiceInputController: Web Speech API, es-MX (B3)
    │   └── synthesis.ts                — TtsOutputController: Web Speech Synthesis, es-MX (B3)
    └── storage/
        ├── local-store.ts              — IndexedDB wrapper con fake-indexeddb en test (B2)
        └── types.ts                    — tipos Idioma, Settings, AuditEntry (B2)

supabase/
├── functions/
│   ├── _shared/
│   │   ├── plan-schema.ts              — Zod schema Plan JSON v1.0, shared PWA↔Deno (B1/ADR-013)
│   │   ├── query-builder.ts            — SQL builder parametrizado con allowlist (B1)
│   │   └── redact.ts                   — redactSqlParams para filters + values (B1)
│   ├── plan-intent/index.ts            — Edge: JWT → schema-summary → Gemini → Plan JSON (B1)
│   ├── execute-plan/index.ts           — Edge: JWT → allowlist → SQL → audit → result (B1)
│   └── schema-summary/index.ts        — Edge interna: pg_catalog filtrado + markdown (B1)
└── migrations/
    ├── 001_orion_audit.sql             — DDL orion_audit 14 cols + índices (B1)
    └── 002_orion_audit_add_source_nullable_plan.sql — col 15: source + plan_json nullable (B1)

tests/
├── unit/
│   ├── recognition.test.ts             — 14 tests VoiceInputController (B3)
│   └── synthesis.test.ts               — 16 tests TtsOutputController (B3)
├── e2e/
│   ├── b2-auth-config.test.ts          — flows auth, config, logout, guards (B2)
│   └── b3-voice-screen.test.ts         — 8 tests VoiceScreen + permisos (B3)
└── contracts/
    ├── plan-schema.test.ts             — Zod schema, 12 ops, 11 fixtures (B1)
    ├── import-guard.test.ts            — guard no-cross-imports src/ ↔ supabase/ (B1)
    ├── redact.test.ts                  — redactSqlParams cross-runtime (B1)
    └── schema-summary-format.test.ts  — markdown formatter (B1)
```

> **Módulos pendientes** (a crear en B4+):
> - `src/lib/api/plan-intent-client.ts` — HTTP client con JWT (B4.1)
> - `src/components/PlanPreview.svelte` — human-readable plan display (B4.3)

## Próximos pasos sugeridos

1. Resolver decisiones en `docs/05-implementation/B4-PENDING-DECISIONS.md`.
2. Revisar `docs/HANDOFF.md` como puerta de entrada para Codex.
3. Avanzar el change `openspec/changes/m1-mvp/` hasta `apply` y luego `archive`.
4. Mantener `CHANGELOG.md` y `TECHNICAL-DEBT.md` actualizados con cada PR.
