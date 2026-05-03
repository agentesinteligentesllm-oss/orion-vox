---
title: Handoff — Orion Vox para Codex 5.5
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-02
supersedes: []
related:
  - ./INDEX.md
  - ./05-implementation/B4-PENDING-DECISIONS.md
  - ../../openspec/changes/m1-mvp/tasks.md
  - ./05-implementation/M1-MVP.md
---

# Handoff — Orion Vox para Codex 5.5

Documento de traspaso del proyecto al agente Codex 5.5. Captura el
estado exacto al cierre de la Wave 4 (2026-05-02). El director es la
única fuente de verdad sobre el alcance y las decisiones de proceso.

---

## Resumen ejecutivo

**Bloques implementados**: B0, B1, B2, B3 (voice) — código completo
y mergeado con tests verdes (168/168 Vitest).

**Bloque actual**: B4 — Plan-Intent client. **PAUSADO**. Hay 4
decisiones pendientes que el director debe resolver antes de que
Codex empiece a codear. Ver
[`B4-PENDING-DECISIONS.md`](./05-implementation/B4-PENDING-DECISIONS.md).

**No tocar**: ningún archivo bajo `src/` o `supabase/` hasta que
el director resuelva las decisiones de B4.

---

## Estado de implementación al cierre Wave 4

| Bloque | Descripción | Estado | Commit cierre |
|--------|-------------|--------|---------------|
| B0 | Setup base (Svelte 5 + Vite 7 + TS + Tailwind 4 + Biome + PWA) | ✅ done | `45b0707` |
| B1 | Supabase backend (plan-intent, execute-plan, schema-summary edges, orion_audit DDL, plan-schema Zod, query-builder, tests) | ✅ done (código) ⚠️ requiere deploy | `c07b235` |
| B2 | PWA Auth & Config (auth store, routing, LoginWizard, Settings, IndexedDB, logout) | ✅ done | `138f4e3` |
| B3 | Voice screen (VoiceInputController, TtsOutputController, VoiceScreen, unit tests, E2E tests) | ✅ done | `5ebb458` |
| B4 | Plan-Intent client integration (HTTP client, PlanPreview, clarification flow) | 🔄 PAUSADO | — |
| B5–B8 | Confirmation, Execute, Atajos, Deploy | ⏳ pendiente | — |

> **Nota B1**: el código de las 3 Edge Functions existe y tiene
> tests, pero **no están desplegadas** en un proyecto Supabase real
> todavía (T1.1, T1.2, T1.7, T1.9 requieren setup manual).
> El riesgo de `deno test` local sin re-verificación está
> documentado — re-verificación obligatoria en B8 pre-deploy.

---

## Estructura del código fuente

```
src/
├── App.svelte                     — shell principal, routing por router.mode
├── components/
│   ├── VoiceScreen.svelte         — pantalla voz (B3) ← COMPLETO
│   ├── LoginWizard.svelte         — login magic link (B2)
│   ├── Settings.svelte            — pantalla config (B2)
│   └── ConfigWrapper.svelte       — wrapper config+settings (B2)
└── lib/
    ├── auth-store.svelte.ts       — sesión Supabase, Svelte 5 runes (B2)
    ├── router.svelte.ts           — routing reactivo (B2)
    ├── supabase.ts                — cliente Supabase anon (B2)
    ├── voice/
    │   ├── recognition.ts         — VoiceInputController (B3) ← COMPLETO
    │   └── synthesis.ts           — TtsOutputController (B3) ← COMPLETO
    ├── storage/
    │   ├── local-store.ts         — IndexedDB wrapper (B2)
    │   └── types.ts               — tipos storage/settings (B2)
    └── api/                       — VACÍO, a crear en B4
        └── (plan-intent-client.ts — NO EXISTE todavía)

supabase/
├── functions/
│   ├── _shared/
│   │   ├── plan-schema.ts         — Zod schema Plan JSON v1.0 (B1)
│   │   ├── query-builder.ts       — SQL builder (B1)
│   │   └── redact.ts              — redactSqlParams (B1)
│   ├── plan-intent/index.ts       — Edge Function (B1) ← código listo
│   ├── execute-plan/index.ts      — Edge Function (B1) ← código listo
│   └── schema-summary/index.ts   — Edge Function (B1) ← código listo
└── migrations/
    ├── 001_orion_audit.sql        — DDL inicial 14 cols (B1)
    └── 002_orion_audit_add_source_nullable_plan.sql — col 15 source (B1)

tests/
├── unit/
│   ├── recognition.test.ts        — 14 tests VoiceInputController (B3)
│   └── synthesis.test.ts          — 16 tests TtsOutputController (B3)
├── e2e/
│   ├── b2-auth-config.test.ts     — flows auth, config, logout (B2)
│   └── b3-voice-screen.test.ts    — 8 tests VoiceScreen UI (B3)
├── contracts/
│   ├── plan-schema.test.ts        — Vitest schema Zod (B1)
│   ├── import-guard.test.ts       — guard no-imports cross-layer (B1)
│   ├── redact.test.ts             — redactSqlParams cross-runtime (B1)
│   └── schema-summary-format.test.ts — markdown formatter (B1)
└── fixtures/plans/                — fixtures JSON válidos e inválidos (B1)
```

---

## Cómo verificar el estado

```bash
# Desde la raíz del proyecto
npm run test          # corre todos los Vitest (debe dar 168/168)
npm run check         # tsc --noEmit + biome check
npm run lint          # biome lint

# Solo un grupo
npx vitest run tests/unit/
npx vitest run tests/e2e/
npx vitest run tests/contracts/
```

Estado esperado: **168/168 verde, 0 errores TypeScript, 0 errores Biome**.

---

## Primera acción requerida de Codex

**No escribir código B4 todavía.** Primero:

1. Leer [`B4-PENDING-DECISIONS.md`](./05-implementation/B4-PENDING-DECISIONS.md).
2. Presentar las decisiones al director y esperar respuesta.
3. Una vez resueltas, leer estos specs antes de codear:
   - `docs/04-specs/spec-plan-intent-edge.md` — endpoint completo (11 error codes, shapes)
   - `docs/02-architecture/DATA-FLOW.md` — sequence diagrams
   - `docs/04-specs/spec-tts-output.md` — para integrar con TTS en B4
4. Codear B4 en 5 sub-bloques (B4.1–B4.5).

---

## Sub-bloques B4 planificados

| Sub-bloque | Descripción | Depende de |
|------------|-------------|------------|
| B4.1 | `src/lib/api/plan-intent-client.ts` — HTTP client, JWT Bearer, 11 error codes | decisiones resueltas |
| B4.2 | VoiceScreen → plan-intent integration, loading state, reemplazar placeholder TTS | B4.1 |
| B4.3 | PlanPreview component — formato human-readable, no raw JSON | B4.2 |
| B4.4 | Clarification flow — TTS pregunta + auto-restart recognition | B4.2 |
| B4.5 | E2E tests flujo B4 | B4.1–B4.4 |

---

## Reglas innegociables (no negociables en M1)

> Estas vienen de `docs/00-constitution/CONSTITUTION.md`. Si Codex
> propone violar alguna, el director bloquea y se documenta ADR.

1. `service_role` **NUNCA** en cliente. Solo en env var de Edge `execute-plan`.
2. `GEMINI_API_KEY` **NUNCA** en cliente. Solo en env var de Edge `plan-intent`.
3. JWT siempre en `Authorization: Bearer` header. Nunca en body ni query param.
4. Plan JSON v1.0 con `operation` singular — nunca SQL libre del LLM.
5. Toda ejecución auditada en `orion_audit` (100% cobertura innegociable).
6. `LIMIT` obligatorio en SELECT (default 100, max 1000).
7. DDL hardcoded bloqueado: `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`.
8. Confirmación táctil obligatoria para todo write.
9. `ORION_REDACTED_COLUMNS` aplica en sql_params, result_summary y TTS.
10. TypeScript estricto: sin `any` implícito, sin `@ts-ignore` sin justificación.

---

## ADRs relevantes para B4

| ADR | Decisión |
|-----|----------|
| ADR-001 | Arquitectura Plan F+ end-to-end |
| ADR-003 | Plan JSON estructurado, nunca SQL libre |
| ADR-005 | Gemini key server-side desde M1 (Edge plan-intent) |
| ADR-007 | Web Speech API como modo voz |
| ADR-011 | Español como idioma primario |
| ADR-012 | Svelte 5 + Vite + TypeScript (framework PWA) |
| ADR-013 | Shared plan-schema entre PWA y Deno sin monorepo |

---

## Deuda técnica activa (no nueva en B4)

| ID | Deuda | Paga en |
|----|-------|---------|
| TD-001-bis | service_role con BYPASSRLS en execute-plan | M2 |
| TD-003 | Confirmación táctil sin preview firmado | M2 |
| TD-004 | Allowlist via env var sin UI admin | M2 |
| TD-005 | RLS deshabilitada en orion_audit | M2 |
| TD-008 | Sin retry para Plan JSON inválido del LLM | M2 |

---

## Historial de Waves

| Wave | Descripción | Fecha |
|------|-------------|-------|
| Wave 1 | Reforma de seguridad (Gemini key + service_role → server-side, JWT, ADR-005 reescrito) | 2026-05-01 |
| Wave 2 | Roadmap M1/M2/M3 reformulado (ADR-009 reescrito) | 2026-05-01 |
| Wave 3 | Auditoría final + CLAUDE.md actualizado | 2026-05-01 |
| Wave 4 | Docs sync post B0-B3 para handoff a Codex 5.5 | 2026-05-02 |
