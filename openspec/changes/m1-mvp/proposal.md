---
title: "Proposal — M1 MVP funcional Plan F+"
change-id: m1-mvp
change-status: in-progress
target-milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./spec.md
  - ./design.md
  - ./tasks.md
  - ./state.yaml
  - ../../../docs/01-product/PRD.md
  - ../../../docs/03-adr/ADR-001-plan-f-plus-architecture.md
  - ../../../docs/03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../../../docs/05-implementation/M1-MVP.md
---

# Proposal — M1 MVP funcional Plan F+

> **Change paraguas del milestone M1**. Empaqueta la entrega del MVP
> funcional de Orion Vox con la deuda técnica documentada y aceptada
> según ADR-009.

---

## Contexto

Orion Vox arranca su primer milestone (M1) tras una serie de rounds
del tribunal de IAs (Claude + Codex + director) que dejaron como
síntesis los siguientes documentos:

- [`docs/00-constitution/CONSTITUTION.md`](../../../docs/00-constitution/CONSTITUTION.md)
  — principios innegociables.
- [`docs/01-product/PRD.md`](../../../docs/01-product/PRD.md) —
  qué hace el producto, para quién, con qué métricas de éxito.
- [`docs/02-architecture/OVERVIEW.md`](../../../docs/02-architecture/OVERVIEW.md)
  — arquitectura Plan F+.
- [`docs/03-adr/`](../../../docs/03-adr/) — ADR-001 a ADR-011 con las
  decisiones arquitectónicas fundacionales.
- [`docs/04-specs/`](../../../docs/04-specs/) — 12 specs técnicos
  estables que describen el sistema deseado de M1.

Las hipótesis fundacionales del proyecto (Gemini sigue Plan JSON
consistentemente, Web Speech `es-MX` es usable en Cubot KK9, la UX
voz + táctil fluye sin fricción) **sólo se validan con la app real**.
M1 es el milestone que las pone a prueba.

---

## ¿Qué cambia?

Este change introduce el **MVP funcional Plan F+** end-to-end:

1. PWA pura instalable en Cubot KK9 (manifest + service worker).
2. Login Supabase Auth (magic link) + persistencia de JWT por el SDK
   (sin secretos en cliente: `anon_key` es pública).
3. Pantalla de configuración (Supabase URL + `anon_key` pública,
   locale de voz). **Sin Gemini key ni `service_role` en el cliente:
   viven en env vars de las Edge Functions.**
4. Captura de voz `es-MX` con Web Speech Recognition + indicador de
   estado.
5. Edge Function `plan-intent` (Deno) que custodia la Gemini API key,
   recibe `{user_prompt, client_version}` + JWT, llama Gemini
   server-side con function calling y devuelve Plan JSON v1.0 o
   Clarification.
6. Validador Plan JSON compartido (cliente preflight + server
   autoritativo).
7. Edge Function `execute-plan` (Deno) ejecutando con `service_role`
   server-side, valida JWT + allowlist + redacción, audita y devuelve
   resultado.
8. Edge Function `schema-summary` (Deno) autogenerada desde
   `pg_catalog`, filtrada por `ORION_ALLOWED_TABLES` y redactada por
   `ORION_REDACTED_COLUMNS`. Llamada interna por `plan-intent`.
9. Tabla `orion_audit` con DDL versionada y auditoría de toda
   ejecución.
10. Modal de confirmación táctil con preview SQL legible y
    cancelación auditada.
11. Respuesta verbal por TTS `es-MX` con interrupción.
12. Vista de auditoría client-side (espejo de `orion_audit`).
13. Manejo de errores cross-cutting (códigos, render, TTS, audit).
14. Deploy a Vercel + smoke E2E sobre Cubot KK9.

---

## ¿Por qué ahora?

- El director quiere arrancar con un MVP exploratorio y validar las
  hipótesis del proyecto con uso real.
- La documentación fundacional está cerrada (constitución, PRD,
  arquitectura, ADRs M1, specs).
- Cada deuda M1 está nombrada, aceptada y tiene plan de pago en M2
  (ver [`docs/05-implementation/TECHNICAL-DEBT.md`](../../../docs/05-implementation/TECHNICAL-DEBT.md)).
- Postergar M1 no agrega información que no obtengamos antes con la
  app andando.

---

## Alcance del change (lo que SÍ incluye)

| # | Componente | Spec autoritativa |
|---|------------|-------------------|
| 1 | PWA shell (manifest, SW, atajos) | `spec-pwa-shell` |
| 2 | Almacenamiento cifrado de credenciales | `spec-credentials-storage` |
| 3 | Pantallas de configuración | `spec-config-ui` |
| 4 | Web Speech Recognition `es-MX` | `spec-voice-input` |
| 5 | Web Speech Synthesis `es-MX` | `spec-tts-output` |
| 6 | Cliente Gemini + function calling | `spec-gemini-client` |
| 7 | Plan JSON v1.0 + validador | `spec-plan-json-schema` |
| 8 | Edge Function `execute-plan` | `spec-execute-plan-edge` |
| 9 | Edge Function `schema-summary` (mínima) | `spec-schema-summary-edge` |
| 10 | Tabla `orion_audit` + contratos | `spec-audit-table` |
| 11 | Modal de confirmación táctil | `spec-confirmation-flow` |
| 12 | Manejo de errores cross-cutting | `spec-error-handling` |

Todas estas specs viven en `docs/04-specs/` por la regla de autoridad
del [`openspec/README.md`](../../README.md): este change las introduce
y promueve, no las duplica.

---

## NO incluye (queda explícitamente fuera)

- **Hardening (M2)**: cualquier item de
  [`TECHNICAL-DEBT.md`](../../../docs/05-implementation/TECHNICAL-DEBT.md)
  TD-001 a TD-007. Se cierran en el change `m2-hardening` cuando
  arranque M2.
- **Features (M3)**: multi-modelo LLM, multi-proyecto Supabase,
  exports, gráficos, voice tuning. Se abordan en `m3-features`
  cuando arranque M3.
- **US M2/M3**: cualquier user story marcada con prioridad M2 o M3
  en [`USER-STORIES.md`](../../../docs/01-product/USER-STORIES.md)
  (ej. US-SEC-06, US-AUD-02, US-AUD-03, US-AUD-04, US-AUD-05,
  US-MNT-02, US-MNT-03 visible en app).

---

## Stakeholders

- **Director del proyecto**: usuario único, decide alcance final,
  valida criterios de aceptación, opera el sistema en uso real.
- **Claude** (tribunal): rol de Ingeniero senior fullstack y
  Arquitecto. Implementa, revisa, debate.
- **Codex** (tribunal): rol crítico de hardening. Tensiona el
  scope, propone cierres mínimos seguros, audita la deuda.

Decisiones por consenso (Constitución § "Tribunal de IAs").

---

## Decisión de tribunal

**Aprobado** tras 4 rounds de debate documentados en el proceso
constitucional. Los puntos clave del consenso:

1. M1 lleva la arquitectura **Plan F+** completa, con la deuda
   identificada en ADR-004, ADR-005, ADR-008 y ADR-010.
2. La auditoría es **server-side desde día 1** (no es deuda).
3. El roadmap es **modular y secuencial** sin saltos (ADR-009).
4. La PWA es **pura, sin Kotlin/TWA** (ADR-006).
5. La voz usa **Web Speech API interno**, no se interactúa con
   Gemini sistema más allá del lanzamiento (ADR-007).

> Cuando exista, el log completo del debate se referenciará desde
> `docs/03-adr/DEBATE-LOG.md` (artefacto opcional, no bloqueante para
> este change).

---

## ADRs derivados / aplicables

Todos los ADRs M1 están vinculados a este change:

- [ADR-001](../../../docs/03-adr/ADR-001-plan-f-plus-architecture.md) — arquitectura Plan F+.
- [ADR-002](../../../docs/03-adr/ADR-002-discard-ok-google-native.md) — descarte de OK Google nativo.
- [ADR-003](../../../docs/03-adr/ADR-003-plan-json-not-sql.md) — Plan JSON, no SQL libre.
- [ADR-004](../../../docs/03-adr/ADR-004-service-role-m1-dedicated-role-m2.md) — service_role M1, rol dedicado M2.
- [ADR-005](../../../docs/03-adr/ADR-005-gemini-key-client-m1-server-m2.md) — Gemini API key server-side desde M1 (env var de Edge `plan-intent`).
- [ADR-006](../../../docs/03-adr/ADR-006-pure-pwa-no-kotlin.md) — PWA pura sin Kotlin.
- [ADR-007](../../../docs/03-adr/ADR-007-web-speech-api-internal-voice-mode.md) — Web Speech API interno.
- [ADR-008](../../../docs/03-adr/ADR-008-server-side-audit-from-m1.md) — auditoría server-side desde M1.
- [ADR-009](../../../docs/03-adr/ADR-009-modular-roadmap-m1-m2-m3.md) — roadmap modular M1 → M2 → M3.
- [ADR-010](../../../docs/03-adr/ADR-010-schema-autogeneration.md) — schema autogenerado (M2).
- [ADR-011](../../../docs/03-adr/ADR-011-spanish-as-primary-language.md) — español primario.

ADR pendiente, **bloqueante para iniciar implementación**:

- **ADR-012 (framework PWA)** — recomendación inicial Claude+Codex:
  TypeScript + Vite + framework liviano (Svelte / Solid / React).
  Decisión final pendiente del tribunal.

---

## Riesgos identificados

- **Gemini no sigue Plan JSON consistentemente**: si la tasa de
  Plan JSON válido en queries comunes baja del 90 % (métrica PRD § 5),
  hay que iterar el system prompt o cambiar de modelo. Mitigación:
  validador client-side + tool `request_clarification`.
- **Web Speech `es-MX` malo en Cubot KK9**: si el reconocimiento es
  pobre, US-VOZ-06 (fallback a teclado) cubre el caso pero degrada
  la propuesta de valor. Smoke test temprano sobre el dispositivo
  real obligatorio.
- **Latencia end-to-end > 6 s**: si Gemini + Edge Function + Postgres
  + TTS no caben en 6 s para queries simples, hay que optimizar
  (caché de schema, modelo más chico, Edge más cerca). Métrica PRD § 5.
- **Deuda M1 que no se cierra en M2**: el riesgo clásico del ADR-009.
  Mitigación: `TECHNICAL-DEBT.md` autoritativo + gates de cierre
  M2 estrictos.
- **Framework PWA mal elegido**: bloquea o ralentiza la
  implementación. Mitigación: ADR-012 con tribunal antes del
  Bloque 1 de tasks.

---

## Próximos pasos inmediatos

1. Tribunal escribe y aprueba **ADR-012 (framework PWA)**.
2. Director da go al inicio del Bloque 1 de
   [`tasks.md`](./tasks.md).
3. Sub-agentes implementan Bloque 1 → Bloque 2 → ... → Bloque 8.
4. Smoke E2E sobre Cubot KK9.
5. Periodo de uso real (≥ 2 semanas) del director.
6. Tribunal evalúa cierre de M1 contra el checklist de
   [`M1-MVP.md`](../../../docs/05-implementation/M1-MVP.md).
