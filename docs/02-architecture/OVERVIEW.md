---
title: Overview de arquitectura — Plan F+
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - COMPONENTS.md
  - DATA-FLOW.md
  - SECURITY-MODEL.md
  - PLAN-JSON-CONTRACT.md
  - AUDIT-MODEL.md
  - ../00-constitution/CONSTITUTION.md
---

# Overview de arquitectura — Orion Vox

## Visión arquitectónica

Orion Vox implementa el **Plan F+**, un sistema de tres capas que actúa
como puente entre la voz natural del usuario (capturada en el Cubot
KingKong 9) y la base de datos Supabase del usuario. La capa cliente es
una **PWA pura sideloaded** que captura voz, conversa con Gemini API
mediante function calling, valida el Plan JSON resultante y dispara la
ejecución; la capa intermedia son **Edge Functions Deno en Supabase**
(`execute-plan`, `schema-summary`) que validan el plan, traducen a SQL
parametrizado, ejecutan y auditan; la capa de datos es **Postgres**, con
la tabla `orion_audit` como única fuente de verdad de auditoría y las
tablas reales del usuario como destino de las operaciones. La separación
de capas no es estética: es la línea dura que evita SQL libre, asegura
auditoría server-side y deja el toque humano como último gate para
writes.

## Mapa C4 del sistema completo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CUBOT KINGKONG 9 (Android)                           │
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ Gemini sistema      │   "OK Google, abrí Orion Vox"                       │
│  │ (asistente nativo)  │ ───────────────────────────────────┐                │
│  └─────────────────────┘                                    │                │
│                                                             ▼                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                       PWA  ORION  VOX  (sideload)                      │  │
│  │                                                                        │  │
│  │  ┌──────────────┐   ┌─────────────────┐   ┌──────────────────────┐     │  │
│  │  │ Voice Input  │──▶│ Gemini API      │──▶│ Plan JSON Validator  │     │  │
│  │  │ (es-MX STT)  │   │ Client (FC)     │   │ (cliente, pre-flight)│     │  │
│  │  └──────────────┘   └─────────────────┘   └──────────┬───────────┘     │  │
│  │                                                      │                 │  │
│  │  ┌──────────────┐   ┌─────────────────┐   ┌──────────▼───────────┐     │  │
│  │  │ TTS Output   │◀──│ Result renderer │◀──│ Confirmation Modal   │     │  │
│  │  │ (es-MX TTS)  │   │ (UI + voz)      │   │ (sólo writes)        │     │  │
│  │  └──────────────┘   └─────────────────┘   └──────────┬───────────┘     │  │
│  │                                                      │                 │  │
│  │  ┌────────────────────────────────┐    ┌─────────────▼─────────────┐   │  │
│  │  │ IndexedDB sin cifrado          │    │ HTTP Client → Edge        │   │  │
│  │  │ (cache: schema, audit espejo,  │◀──▶│ (Bearer JWT Supabase Auth)│   │  │
│  │  │  prefs UX — sin secretos)      │    │                           │   │  │
│  │  └────────────────────────────────┘    └─────────────┬─────────────┘   │  │
│  └──────────────────────────────────────────────────────┼─────────────────┘  │
└─────────────────────────────────────────────────────────┼────────────────────┘
                                                          │ HTTPS
                                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE  CLOUD                                    │
│                                                                              │
│  ┌──────────────────────────────┐    ┌──────────────────────────────────┐    │
│  │ Edge Function: execute-plan  │    │ Edge Function: schema-summary    │    │
│  │ - valida Plan JSON (Zod)     │    │ - lee pg_catalog                 │    │
│  │ - bloquea DDL/multi-stmt     │    │ - filtra (M1 manual / M2 srv)    │    │
│  │ - traduce a SQL param.       │    │ - devuelve markdown estructurado │    │
│  │ - ejecuta (service_role M1)  │    └──────────────────────────────────┘    │
│  │ - inserta orion_audit        │                                            │
│  └──────────────┬───────────────┘                                            │
│                 │                                                            │
│                 ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                          POSTGRES                                    │    │
│  │  ┌──────────────────────┐     ┌────────────────────────────────────┐ │    │
│  │  │ orion_audit          │     │ Tablas del usuario                 │ │    │
│  │  │ (append-only, src    │     │ (tareas, notas, libros, etc.)      │ │    │
│  │  │  de verdad auditor.) │     │  destino real de operaciones       │ │    │
│  │  └──────────────────────┘     └────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Capas y responsabilidades

**Capa cliente (PWA Orion Vox).** Corre en Chromium del Cubot KK9.
Captura voz vía Web Speech API en `es-MX`, autentica al usuario contra
Supabase Auth (magic link, JWT persistido por el SDK), llama al Edge
Function `plan-intent` con `{user_prompt, client_version}` + Bearer JWT
y recibe el Plan JSON estructurado (la PWA NO conoce la Gemini API key:
vive server-side en `plan-intent`). Valida el Plan localmente para
feedback inmediato, y para operaciones de escritura muestra un modal de
confirmación táctil con preview SQL antes de invocar `execute-plan`.
Mantiene en IndexedDB **sin cifrar** únicamente cache no sensible
(schema-summary, espejo de auditoría reciente, preferencias UX): no hay
secretos en cliente. Sintetiza las respuestas con Web Speech Synthesis.

**Capa intermedia (Edge Functions Deno).** `execute-plan` es la
**autoridad** del sistema: re-valida el Plan JSON contra Zod (la
validación cliente es solo UX), rechaza incondicionalmente operaciones
bloqueadas, traduce el plan a SQL parametrizado mediante un query
builder seguro, ejecuta contra Postgres con `service_role` (M1) o con
`orion_vox_executor` (M2), inserta el registro completo en `orion_audit`
y devuelve el resultado a la PWA. `schema-summary` lee `pg_catalog` /
`information_schema` y devuelve el resumen del schema (en M1 puede no
existir y el summary viajar embebido en el bundle de la PWA como deuda
documentada).

**Capa de datos (Postgres).** Aloja las tablas reales del usuario y la
tabla `orion_audit` como única fuente de verdad de auditoría. En M1
todas las operaciones pasan por `service_role` (bypass de RLS); en M2
existe un rol Postgres dedicado `orion_vox_executor` con grants mínimos
sobre las tablas allowlisted, sin DDL, sin bypass de RLS, con
`statement_timeout` forzado.

## Decisiones arquitectónicas clave

Toda decisión arquitectónica vive en un ADR bajo `docs/03-adr/`. Las que
sostienen este overview son:

- **Plan F+ vs alternativas descartadas (F puro, TWA, AppFunctions, app
  nativa Kotlin)** — ver
  [`ADR-001`](../03-adr/ADR-001-plan-f-plus-architecture.md),
  [`ADR-002`](../03-adr/ADR-002-discard-ok-google-native.md),
  [`ADR-006`](../03-adr/ADR-006-pure-pwa-no-kotlin.md).
- **Plan JSON estructurado en vez de SQL libre desde Gemini** — ver
  [`ADR-003`](../03-adr/ADR-003-plan-json-not-sql.md). Es la barrera dura
  entre lenguaje natural y ejecución; sin ella el sistema sería un
  agujero de inyección.
- **service_role en Edge Function (M1) vs rol Postgres dedicado (M2)** —
  ver [`ADR-004`](../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md).
  Decisión consciente de deuda para M1; el plan de pago es M2 con
  `orion_vox_executor`.
- **Gemini API key server-side desde M1 (Edge `plan-intent`)** — ver
  [`ADR-005`](../03-adr/ADR-005-gemini-key-client-m1-server-m2.md).
  Reescrito post-auditoría Codex: la key vive en env var de la Edge,
  jamás en cliente.
- **PWA pura sideloaded vs TWA / app nativa** — ver
  [`ADR-006`](../03-adr/ADR-006-pure-pwa-no-kotlin.md).
- **Web Speech API vs SDK de Google Speech-to-Text** — ver
  [`ADR-007`](../03-adr/ADR-007-web-speech-api-internal-voice-mode.md).
  Cero costo, cero claves adicionales, a cambio de dependencia online y
  calidad variable.
- **Auditoría server-side desde el día 1** — ver
  [`ADR-008`](../03-adr/ADR-008-server-side-audit-from-m1.md).
- **Roadmap modular M1 → M2 → M3** — ver
  [`ADR-009`](../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md).
- **Schema-summary autogenerado desde `pg_catalog`** — ver
  [`ADR-010`](../03-adr/ADR-010-schema-autogeneration.md).
- **Español como idioma primario** — ver
  [`ADR-011`](../03-adr/ADR-011-spanish-as-primary-language.md).
- **Framework PWA: Svelte 5 + Vite + TypeScript** — ver
  [`ADR-012`](../03-adr/ADR-012-framework-pwa.md). Aprobado en Wave 1.

## Tecnologías

| Capa            | Tecnología                                              |
|-----------------|---------------------------------------------------------|
| PWA framework   | TBD (decisión en `ADR-012-framework-pwa.md`, M1)        |
| Voz STT         | Web Speech API (`SpeechRecognition`, `es-MX`)           |
| Voz TTS         | Web Speech API (`SpeechSynthesis`, `es-MX` / `es-AR`)   |
| LLM             | Gemini API con function calling                         |
| Storage cliente | IndexedDB sin cifrado (cache no sensible — sin secretos) |
| Edge runtime    | Deno (Supabase Edge Functions)                          |
| Validación      | Zod (schema Plan JSON, server-side autoritativo)        |
| Base de datos   | Postgres (Supabase managed)                             |
| Auditoría       | Tabla `orion_audit` (append-only)                       |

## M1 vs M2 — diferencias clave

| Aspecto                       | M1                                          | M2                                                |
|-------------------------------|---------------------------------------------|---------------------------------------------------|
| Rol de ejecución en Postgres  | `service_role` (bypass RLS, full perms)     | `orion_vox_executor` dedicado, grants mínimos     |
| Ubicación de Gemini API key   | Server-side env var de Edge `plan-intent`   | Igual (M1 ya nace defendible)                     |
| Confirmación de writes        | Client-side (modal en PWA)                  | Preview firmado server-side (`preview_id`)        |
| Schema summary                | Manual / embebido en bundle PWA             | Edge Function `schema-summary` con allowlist srv  |
| RLS                           | Bypaseada por `service_role`                | Estricta donde aplique                            |
| Operaciones bloqueadas        | Hardcoded en Edge Function                  | Hardcoded + grants Postgres no permiten DDL       |

## Documentos zoom

- **`COMPONENTS.md`** — detalle de cada componente (PWA shell, voice
  input, Gemini client, validators, edge functions).
- **`DATA-FLOW.md`** — flujo end-to-end runtime, fronteras de
  integración, errores, latencias.
- **`SECURITY-MODEL.md`** — modelo de seguridad por milestone, lethal
  trifecta, riesgos aceptados.
- **`PLAN-JSON-CONTRACT.md`** — el contrato técnico Plan JSON v1.0
  (schema, ejemplos, ejemplos rechazados).
- **`AUDIT-MODEL.md`** — DDL de `orion_audit`, ciclo de vida de
  registros, retención, espejo cliente.
