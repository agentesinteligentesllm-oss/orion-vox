---
title: HANDOFF — Documento maestro de orquestación
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-03 (B7 Wave 13)
purpose: |
  Único documento de entrada para cualquier sesión nueva (Claude o
  Codex) que retome el proyecto. Se actualiza al cierre de cada bloque
  ANTES del próximo commit. Si está desactualizado, el director lo
  bloquea hasta sincronizar.
related:
  - ./INDEX.md
  - ../CLAUDE.md
  - ./05-implementation/B4-PENDING-DECISIONS.md
  - ./05-implementation/M1-MVP.md
  - ./05-implementation/ROADMAP.md
  - ./05-implementation/TECHNICAL-DEBT.md
  - ../openspec/changes/m1-mvp/tasks.md
  - ../openspec/changes/m1-mvp/state.yaml
---

# HANDOFF — Orion Vox (estado al 2026-05-03)

> **Si abrís este repo por primera vez en esta sesión: leé SOLO este
> documento. Después reportá al director qué entendiste antes de tocar
> nada.** Este documento es la fuente de verdad operativa única.

---

## 1. Lo más importante en 60 segundos

- **Proyecto**: PWA personal single-user (Svelte 5 + Vite 7 + TS) que
  sirve de puente entre Gemini (Android) y un proyecto Supabase del
  director, usando voz natural en español. Cubot KingKong 9 es el
  dispositivo target.
- **Avance M1**: ~98% (B0-B7 completos, B8 pendiente).
- **Próxima acción concreta**: arrancar B8 (Deploy Vercel + Smoke E2E Cubot
  KK9). **Prerequisito bloqueante**: setup Supabase real (§9). Ver §3.
- **Bloque B7 cerrado**: manifest canónico + Workbox (registerType:prompt) +
  NetworkOnly Gemini/Supabase + pwa.svelte.ts (install + update banners) +
  iconos PNG + 2 tests E2E. Commit `d46a9c9`.
- **⚡ Pivote de testing (ADR-014)**: a partir de B5 la cobertura es mínima
  intencional. B7: 2 tests E2E (golden paths). B8: mínima o ninguna.
  Ver [`03-adr/ADR-014-testing-strategy-pivot.md`](./03-adr/ADR-014-testing-strategy-pivot.md).
- **Working tree LIMPIO** al cierre de B7 + Wave 13.
  Verificar con `git status` antes de tocar nada.
- **Riesgo activo**: `deno test` no re-verificado desde commit `c07b235`
  (ver §8). Gate `check` 0 errores mantenido en todos los bloques.

---

## 2. Avance por bloques

| Bloque | Descripción | Estado | Commit cierre |
|--------|-------------|--------|---------------|
| **B0** | Setup base (Svelte 5 + Vite 7 + TS strict + Tailwind 4 + Biome + vite-plugin-pwa) | ✅ done | `45b0707` |
| **B1** | Edge Functions backend (3 funciones + módulos `_shared/` + tests cross-runtime + 2 migrations DDL) | ✅ done (código) ⚠️ sin deploy real | `c07b235` |
| **B2** | PWA Auth + Config + IndexedDB + Logout + tests E2E | ✅ done | `138f4e3` |
| **B3** | PWA Voice (recognition + synthesis wrappers + VoiceScreen + auto-listen + keyboard fallback) | ✅ done | `5ebb458` |
| **Wave 4** | Sync de docs post B0-B3 (no es bloque de implementación) | ✅ done | `91b3bb1` |
| **B4.1 / T3.1** | Plan-Intent client (`src/lib/api/plan-intent-client.ts` + tests + audit fixes ES + Biome format) | ✅ done | `d1e8a94` |
| **Wave 5** | HANDOFF reescrito a prueba de fallos + .gitignore protección credenciales | ✅ done | `bbcab81` |
| **fix** | Tipos Web Speech API (`speech-recognition.d.ts`) + null guard `recognition.ts` — gate `check` reparado (0 errores) | ✅ done | `71daedf` |
| **B4.2** | VoiceScreen → plan-intent: `callPlanIntent()`, loading state, 14 códigos error ES, cards plan/clarification, `plan-intent-messages.ts` + 9 tests | ✅ done | `b959081` |
| **B4.3** | `PlanPreview.svelte`: render legible humano del Plan JSON — verb label + tabla + frase + aviso confirmación writes. 10 tests unit. | ✅ done | `e5bb9ff` |
| **B4.4** | Clarification flow: `tts.speak(question)` + `tts.on('end')` auto-restart + `buildClarifiedPrompt()` + re-envío. 10 tests unit. | ✅ done | `ae1ce17` |
| **B4.5** | Tests E2E del flow completo voice → plan-intent → PlanPreview / clarification | ✅ done | `7299218` |
| **B5** | Confirmation Modal flow (ConfirmationModal + confirmation-utils + execute-plan-client stub + VoiceScreen integrado) | ✅ done | `3c3b926` |
| **B6** | Execute & Audit cliente (executePlan real + AuditView + redact-client + VoiceScreen wired) | ✅ done | `496e848` |
| **B7** | Atajos Android + Instalación PWA | ✅ done | `d46a9c9` |
| **B8** | Deploy + Smoke E2E Cubot KK9 | 🔲 pendiente | — |

**Tests al cierre B7**: 224/224 Vitest verde + 2 skipped (integración B6,
bloqueados hasta configurar Supabase). Gate `check` verde (0 errores).
Gate `lint` verde (0 errores). Deno tests no re-verificados desde `c07b235`
(re-verificación obligatoria pre-deploy en B8).

---

## 3. Próximo paso EXACTO

### Pre-flight obligatorio antes de tocar código

1. **Verificar working tree limpio**: `git status` debe decir
   "nothing to commit, working tree clean". Si hay cambios pendientes,
   pausar y reportar al director — pueden ser de otra sesión cruzada.
2. **Verificar últimos commits**: `git log --oneline -5` debe mostrar
   (más recientes primero):
   ```
   [hash]   docs: HANDOFF + openspec sincronizados post-B7 (Wave 13)  ← top = Wave 13
   d46a9c9  B7: Manifest canónico + Workbox PWA + install/update banners + iconos + 2 tests E2E
   bc80478  docs: HANDOFF + openspec sincronizados post-B6 (Wave 12)
   496e848  B6: Execute & Audit cliente — executePlan real + AuditView + redact-client
   3e3e66d  docs: HANDOFF + openspec sincronizados post-B5 (Wave 11)
   ```
   El hash exacto del top puede variar; lo que importa es que mencione "Wave 13"
   y el working tree esté limpio.
3. **LEER spec antes de codear B8**: spec autoritativa para B8:
   - `docs/05-implementation/M1-MVP.md` — criterios de Done M1.
   - `docs/06-deploy/` — instrucciones de deploy (si existen).
4. **Prerequisito bloqueante para B8**: setup Supabase real (§9).
   Sin proyecto Supabase + env vars configuradas, B8 no puede empezar.
5. Si el working tree NO está limpio, alguien dejó trabajo en curso.
   Pausar y reportar al director antes de tocar nada.

### Estado B7 (✅ cerrado completamente)

| Sub-bloque | Commit | Qué entrega |
|------------|--------|-------------|
| B7 | `d46a9c9` | Manifest canónico (start_url, shortcuts, tema). Workbox registerType:prompt. NetworkOnly Gemini+Supabase. pwa.svelte.ts (PwaStore: install + update). App.svelte banners. Iconos PNG. 2 tests E2E. |

**Gotchas de B7 que persisten en B8 (no perder de vista)**:

1. **`toBeDisabled()` / `toBeEnabled()` NO disponibles** (sin jest-dom): usar
   `expect((btn as HTMLButtonElement).disabled).toBe(true/false)`.
2. **Mock TTS patrón B4.4**: `_handlers` map público + helper `emit(inst, event, value?)`.
3. **`recognition.resetToIdle()` es no-op en mocks**: emitir `emit(rec, 'state', 'idle')`
   manualmente si el test necesita que `voiceState` vuelva a idle.
4. **`tts.cancel()` emite `'error'` con `code:'interrupted'`**, NO `'end'`.
5. **`handleConfirmed()` es async**: setea `planResponse = null` ANTES de `executePlan()`
   para cerrar el modal inmediatamente.
6. **Mock `execute-plan-client` en b53**: incluye `ExecutePlanClientError` + `executePlan`
   — si se agrega algo al módulo real, actualizar también el mock del test.
7. **2 tests B6 bloqueados con skip**: se activan automáticamente cuando
   `.env.local` tenga `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
8. **`virtual:pwa-register` en tests**: cualquier test que monte `App.svelte` necesita
   que `vitest.config.ts` tenga el alias → `src/__mocks__/pwa-register.ts` (ya configurado).
   Si se agregan tests nuevos que monten App, no necesitan hacer nada extra.

---

### B8 — Deploy & Validación (🔲 pendiente, PRÓXIMO BLOQUE)

**⚠️ BLOQUEANTE**: B8 requiere que el director complete el setup de Supabase (§9).
Sin eso, T8.1 y T8.4 no pueden ejecutarse.

**Qué construye B8** (tareas de `openspec/changes/m1-mvp/tasks.md` §Bloque 8):

| Tarea | Descripción |
|-------|-------------|
| T8.1 | Deploy PWA a Vercel (preview + production con HTTPS). |
| T8.2 | Verificar HTTPS + criterios PWA: Lighthouse PWA score ≥ 90. |
| T8.3 | Instalar PWA en Cubot KK9 desde Chrome Android. |
| T8.4 | Smoke E2E manual: "OK Google, abrí Orion Vox" → login → voz → resultado TTS. |
| T8.5 | Verificar todas las US M1 contra criterios de aceptación. |
| T8.6 | Verificar todos los criterios de Done de `M1-MVP.md`. |
| T8.7 | Marcar change `m1-mvp` como `completed` en `state.yaml` + archivar. |

**Tareas técnicas adicionales en B8**:
- Re-verificar `deno test` (R-01: no verificado desde `c07b235`).
- Confirmar que los 2 tests B6 skip pasan con Supabase real configurado.
- Reemplazar iconos placeholder `public/icons/` con PNGs de diseño final (si aplica).
- Configurar Vercel: proyecto, dominio, env vars (no se almacenan en repo).

**Reglas duras para B8**:
- Supabase URL, anon_key: en `.env.local` (protegido por .gitignore, NUNCA commitear).
- Service role key: SOLO en env vars de Supabase Edge Functions, NUNCA en cliente.
- Gates antes de commit: `npm run check` + `npm run lint` + `npx vitest run`.
- Al cerrar B8: actualizar HANDOFF + tasks + state.yaml + CLAUDE.md. Commitear Wave 14.

---

## 4. Decisiones B4 ya tomadas (NO re-debatir)

Documentadas formal en
[`B4-PENDING-DECISIONS.md`](./05-implementation/B4-PENDING-DECISIONS.md).
Resumen:

| # | Divergencia | Decisión |
|---|-------------|----------|
| 1 | `schema_stale` 409 no existe en spec | **Opción (a)**: cliente detecta `schema_hash` distinto del cacheado → invalida cache local → próxima request envía header `X-Refresh-Schema: 1`. Sin retry automático en M1. |
| 2 | `gemini_error` único vs separados | **Implementar ambos**: `gemini_unavailable` (HTTP 502) + `gemini_timeout` (HTTP 504) con mensajes en español del spec §6.3. |
| 3 | Formato concat clarificación | **Aprobado**: `${promptOriginal}\n\nAclaración del usuario: ${respuestaUsuario}`. Documentado en `PROMPT-ENGINEERING.md` §4. |
| 4 | `conversation_id` | **Ignorar** — es M2. |
| 5 | `client_version` | Dejar `0.0.0` hasta que haya versión real. |

---

## 5. Working tree LIMPIO (verificación obligatoria al abrir sesión)

Estado al cierre de B7 + Wave 13: **working tree limpio, todo commiteado**.

Verificar siempre al abrir sesión:

```bash
git status         # debe decir: nothing to commit, working tree clean
git log --oneline -5
# debe mostrar (más recientes primero):
#   [hash]   docs: HANDOFF + openspec sincronizados post-B7 (Wave 13)  ← top
#   d46a9c9  B7: Manifest canónico + Workbox PWA + install/update banners…
#   bc80478  docs: HANDOFF + openspec sincronizados post-B6 (Wave 12)
#   496e848  B6: Execute & Audit cliente — executePlan real + AuditView + redact-client
#   3e3e66d  docs: HANDOFF + openspec sincronizados post-B5 (Wave 11)
```

Si el working tree NO está limpio, alguien dejó trabajo en curso.
Pausar y reportar al director antes de tocar nada.

**Archivo `datos de suapabase`**: existe localmente con credenciales
del director. Está protegido por `.gitignore` (entrada agregada en
Wave 5). Debe NUNCA aparecer en `git status` como untracked.

---

## 6. Estructura del código fuente (estado real)

```
src/
├── App.svelte                       — shell principal, routing por router.mode
├── components/
│   ├── VoiceScreen.svelte           — pantalla voz + plan-intent + modal + execute (B3+B4.x+B5+B6) ✅ 496e848
│   ├── ConfirmationModal.svelte     — modal full-screen writes (B5) ✅ 3c3b926
│   ├── AuditView.svelte             — vista auditoría local IDB, detalle expandible (B6) ✅ 496e848
│   ├── PlanPreview.svelte           — render legible del Plan JSON (B4.3) ✅ e5bb9ff
│   ├── LoginWizard.svelte           — login magic link (B2) ✅
│   ├── Settings.svelte              — pantalla config (B2) ✅
│   └── ConfigWrapper.svelte         — wrapper config+settings (B2) ✅
└── lib/
    ├── auth-store.svelte.ts         — sesión Supabase, Svelte 5 runes (B2) ✅
    ├── router.svelte.ts             — routing reactivo (B2) ✅
    ├── supabase.ts                  — cliente Supabase anon (B2) ✅
    ├── voice/
    │   ├── recognition.ts           — VoiceInputController (B3) ✅
    │   ├── synthesis.ts             — TtsOutputController (B3) ✅
    │   └── speech-recognition.d.ts  — tipos Web Speech API (fix, no en lib.dom.d.ts de TS6) ✅
    ├── storage/
    │   ├── local-store.ts           — IndexedDB wrapper (B2) ✅
    │   └── types.ts                 — tipos storage/settings (B2) ✅
    ├── contracts/
    │   └── plan-schema.ts           — barrel re-export desde $shared (B1, ADR-013)
    ├── confirmation-utils.ts        — shouldConfirm, requiresDoubleConfirm, buildSqlPreview, buildWarnings (B5) ✅ 3c3b926
    ├── pwa.svelte.ts                — PwaStore: canInstall + needsUpdate + init/install/applyUpdate (B7) ✅ d46a9c9
    ├── utils/
    │   └── redact-client.ts         — redactResult() defensa client-side columnas sensibles (B6) ✅ 496e848
    └── api/
        ├── plan-intent-client.ts    — HTTP client plan-intent (B4.1) ✅ d1e8a94
        ├── plan-intent-messages.ts  — 14 mensajes error español (B4.2) ✅ b959081
        └── execute-plan-client.ts   — executePlan() + ExecutePlanClientError + auditCancel (B5+B6) ✅ 496e848

src/__mocks__/
└── pwa-register.ts                  — stub registerSW no-op para Vitest (B7) ✅ d46a9c9

scripts/
└── gen-icons.mjs                    — generador PNG sin deps externas (node:zlib) (B7) ✅ d46a9c9

public/
├── favicon.svg                      — logo Orion (B0) ✅
└── icons/                           — PNG para manifest PWA (B7) ✅ d46a9c9
    ├── icon-192.png                 — 192×192 any maskable (placeholder violeta #863bff)
    ├── icon-512.png                 — 512×512 any maskable (placeholder)
    ├── shortcut-voice.png           — 96×96 shortcut Voz
    ├── shortcut-config.png          — 96×96 shortcut Config
    └── shortcut-audit.png           — 96×96 shortcut Audit

supabase/
├── functions/
│   ├── _shared/
│   │   ├── plan-schema.ts           — Zod schema Plan JSON v1.0 (B1) ✅
│   │   ├── query-builder.ts         — SQL builder (B1) ✅
│   │   ├── redact.ts                — redactSqlParams (B1) ✅
│   │   ├── schema-summary-core.ts   — lógica pura schema (B1) ✅
│   │   ├── audit.ts                 — helpers audit (B1) ✅
│   │   └── retries.ts               — backoff helpers (B1) ✅
│   ├── plan-intent/index.ts         — Edge Function (B1) ✅
│   ├── execute-plan/index.ts        — Edge Function (B1) ✅
│   ├── schema-summary/index.ts      — Edge Function (B1) ✅
│   ├── tests/                       — deno test suites (B1) ✅
│   └── deno.json (root + per-fn)    — import maps + tasks (B1) ✅
└── migrations/
    ├── 001_orion_audit.sql          — DDL inicial 14 cols (B1) ✅
    └── 002_orion_audit_add_source_nullable_plan.sql — col 15 source (B1) ✅

tests/
├── unit/
│   ├── recognition.test.ts          — 14 tests VoiceInputController (B3) ✅
│   ├── synthesis.test.ts            — 16 tests TtsOutputController (B3) ✅
│   ├── plan-intent-client.test.ts   — tests del client (B4.1) ✅ d1e8a94
│   ├── plan-preview.test.ts         — 10 tests PlanPreview (B4.3) ✅ e5bb9ff
│   └── b44-clarification-flow.test.ts — 10 tests clarification flow TTS+re-listen (B4.4) ✅ ae1ce17
├── e2e/
│   ├── b2-auth-config.test.ts       — flows auth, config, logout (B2) ✅
│   ├── b3-voice-screen.test.ts      — 8 tests VoiceScreen UI (B3) ✅
│   ├── b45-voice-plan-flow.test.ts  — 5 tests E2E voice→plan-intent→PlanPreview (B4.5) ✅ 7299218
│   ├── b53-confirmation-flow.test.ts — 2 tests E2E confirm+cancel (B5) ✅ 3c3b926
│   └── b7-pwa-shell.test.ts         — 2 tests E2E install banner + update banner (B7) ✅ d46a9c9
├── contracts/
│   ├── plan-schema.test.ts          — Vitest schema Zod (B1) ✅
│   ├── import-guard.test.ts         — guard no-imports cross-layer (B1) ✅
│   ├── redact.test.ts               — redactSqlParams cross-runtime (B1) ✅
│   └── schema-summary-format.test.ts— markdown formatter (B1) ✅
├── smoke/
│   └── border.test.ts               — guard ADR-013 alias $shared (B1) ✅
└── fixtures/plans/                  — 11 valid + 10 invalid + golden SQL (B1) ✅
```

---

## 7. Reglas innegociables (M1)

> Estas vienen de `docs/00-constitution/CONSTITUTION.md`. Si una sesión
> propone violar alguna, el director bloquea y se documenta ADR
> explícito que la suspenda con justificación.

1. **`service_role` NUNCA en cliente** (ni cifrado, ni plaintext, ni
   en bundle, ni en header). Solo en env var de Edge Functions.
2. **`GEMINI_API_KEY` NUNCA en cliente.** Solo en env var de Edge
   `plan-intent`.
3. **`anon_key` NO es auth.** Auth = Supabase Auth + JWT + validación
   `user.id == ORION_ALLOWED_USER_ID` env var server-side.
4. **Allowlist de tablas en env var server-side** (`ORION_ALLOWED_TABLES`).
   No configurable desde la PWA en M1.
5. **Plan JSON v1.0 estructurado.** NUNCA SQL libre desde el LLM.
   `operation` singular, schema canónico en `_shared/plan-schema.ts`.
6. **Operaciones bloqueadas hardcoded**: `DROP`, `TRUNCATE`, `ALTER`,
   `CREATE`, `GRANT`, `COPY`, `DO`, multi-statement, funciones SQL.
7. **Auditoría server-side de TODA ejecución** (incluye cancelaciones
   con `dry_run + rejected_by_user`). Tabla `orion_audit`, 15 columnas.
8. **Confirmación táctil obligatoria para todo write**
   (`UPDATE`/`DELETE`/`INSERT`).
9. **`LIMIT` obligatorio en SELECT** (default 100, max 1000).
10. **`statement_timeout` = 10s** en la sesión de la Edge Function.
11. **Política de redacción `ORION_REDACTED_COLUMNS`** aplica a
    `sql_params`, `result_summary`, TTS y preview SQL.
12. **TypeScript estricto**: sin `any` implícito, sin `@ts-ignore`
    sin justificación inline.

Lista completa: `docs/00-constitution/CONSTITUTION.md`. Checklist
ejecutable: `docs/00-constitution/PRINCIPLES-CHECKLIST.md`.

---

## 8. Riesgos abiertos (al 2026-05-03, post B4.2)

| ID | Riesgo | Mitigación | Cuándo cerrar |
|----|--------|-----------|---------------|
| R-01 | `deno test` no re-verificado desde `c07b235` (último 66/66 verde). `supabase/functions/` sin cambios en B2-B4. | Re-instalar Deno + correr `npm run test:contracts` (ambos halves verde) antes de B8. | Pre-B8 (obligatorio) |
| R-02 | Magic link callback no probado contra Supabase real | Depende del director (T1.1, T1.2). Smoke en B6/B8 cuando exista proyecto Supabase. | Pre-B8 |
| R-03 | Web Speech + TTS en Cubot KK9 no probado | Smoke E2E B8 en hardware real. Si falla: fallback teclado + lectura visual ya soportado. | B8 |
| R-04 | Plan inválido del LLM sin retry inteligente (TD-008) | Documentado, retry con reprompting postergado a M2. | M2 |
| R-05 | `datos de suapabase` (archivo del director con credenciales) | ✅ Cerrado en Wave 5 — protegido por `.gitignore`. Verificar periódicamente con `git status` que no aparezca. | Cerrado 2026-05-03 |
| R-06 | Gate `check` roto desde B3 (6 errores pre-existentes en `recognition.ts`) | ✅ Cerrado en B4.2 (`71daedf`) — `speech-recognition.d.ts` + null guard. 0 errores desde entonces. | Cerrado 2026-05-03 |

---

## 9. Pendientes del director

Acción humana requerida — sin esto, **B6/B8 quedan bloqueados** en
máximo 2-3 sesiones más. Hacer en paralelo a B4-B5:

1. **Crear proyecto Supabase** + anotar URL + `anon_key` + `service_role`.
2. **Authentication → Magic link enabled** + Site URL
   `http://localhost:5173` + Redirect URLs
   `http://localhost:5173/**` + URL Vercel cuando exista.
3. **SQL Editor → correr migrations 001 + 002** del repo.
4. **Settings → Edge Functions env vars**: `GEMINI_API_KEY`,
   `ORION_ALLOWED_USER_ID` (post primer login), `ORION_ALLOWED_TABLES`,
   `ORION_REDACTED_COLUMNS`.
5. **`supabase functions deploy plan-intent execute-plan schema-summary`**.
6. **Crear `.env.local`** con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   (formato en `.env.example` del repo).
7. **Pasar a la próxima sesión**: URL + `anon_key` + tu `user.id`
   post-primer-login.

> **CRÍTICO**: el archivo `datos de suapabase` (sin extensión) que
> tenés local NO debe commitearse. Ya está protegido por `.gitignore`
> tras este HANDOFF. Cuando crees el proyecto Supabase, podés guardar
> ahí las credenciales — quedará ignorado por git.

---

## 10. Workflow obligatorio

1. **Pre-implementación**: leer spec autoritativo ANTES de codear.
   Si hay divergencia → pausar y reportar al director, no improvisar.
2. **Implementar** código + tests unitarios mínimos.
3. **Gates verde antes de commit**: `npm run check` + `npm run lint` +
   `npm run test:contracts` (Vitest + Deno si está disponible).
4. **Commits separados** por sub-bloque (un commit por T*.x).
   Mensaje descriptivo en español, sin emojis, sin co-author Claude/Codex.
5. **Reportar al director** después de cada sub-bloque (o agrupado de
   2-3) con:
   - Hash del commit
   - Gates verde explícitos (Vitest + Deno + check + lint)
   - Decisiones implícitas tomadas
   - Divergencias detectadas
   - **Check explícito**: "Verificaciones pendientes del round
     anterior: [todas cerradas / X pendientes con razón]"
6. **Esperar luz verde** antes del siguiente sub-bloque.
7. **Actualizar este HANDOFF.md** al cerrar cada bloque (B4, B5, B6,
   B7, B8) ANTES del próximo commit. Sin handoff actualizado, no hay
   continuidad confiable entre sesiones.

---

## 11. Comandos útiles

```bash
# Desarrollo
npm run dev                  # Vite dev server (http://localhost:5173)
npm run build                # Producción
npm run preview              # Servir build local

# Verificación
npm run check                # svelte-check + tsc --noEmit
npm run lint                 # biome check
npm run format               # biome format --write

# Tests
# NOTA: 'npm run test' NO existe como script — usar npx vitest run directamente
npx vitest run               # todos los Vitest (equivale a 'npm run test')
npm run test:contracts       # cross-runtime: Vitest + deno test (requiere Deno)
npx vitest run tests/unit/   # solo unit
npx vitest run tests/e2e/    # solo E2E
npx vitest run tests/contracts/  # solo contracts

# Estado del repo
git status                   # ver archivos modificados
git log --oneline -10        # últimos 10 commits
git diff HEAD                # ver todos los cambios sin commit

# Deno (si está instalado)
deno --version
deno test --allow-read supabase/functions/tests/
```

**Estado esperado tras cada commit de implementación**:
- `npm run check` → 0 errores
- `npm run lint` → 0 errores
- `npx vitest run` → todos verde

---

## 12. Errores históricos a NO repetir

Patrones que ya costaron retrabajo. Evitar:

- **Escribir código antes de leer spec**: pagado caro 3 veces (B1.fix
  Plan JSON ops, schema-summary HTTP bypass, Gemini SDK functionCalls).
  Pre-read es obligatorio.
- **Saltar verificaciones meta** (versiones pinned, gates explícitos,
  paridad cross-runtime): pagado caro en Deno (instalado, perdido,
  instalado de nuevo). Cada reporte debe terminar con check explícito
  de pendientes.
- **Optional chaining para "taparse"** (ej: `response.functionCalls?.()`
  cuando es getter, no method): esconde bugs de runtime. Verificar
  API real ANTES.
- **Normalizar deudas inseguras** (ej: service_role cifrado en cliente):
  el tribunal Claude+Codex+usuario rechazó esto. NO reabrir.
- **Commitear sin autorización del director**: regla constitucional.
  El director aprueba todo commit.
- **Asumir que docs están sincronizados**: validar con `git status` y
  `git log` antes de creer lo que dice un doc.

---

## 13. ADRs vigentes (referencia rápida)

| ADR | Decisión |
|-----|----------|
| ADR-001 | Plan F+ como arquitectura base |
| ADR-002 | Descarte de "OK Google" hands-free nativo en español |
| ADR-003 | Plan JSON v1.0 estructurado, NUNCA SQL libre |
| ADR-004 | `service_role` server-side en M1, rol dedicado en M2 |
| ADR-005 | Gemini API key server-side desde M1 (Edge `plan-intent`) |
| ADR-006 | PWA pura, sin componente nativo Kotlin |
| ADR-007 | Web Speech API como modo voz interno |
| ADR-008 | Auditoría server-side desde día 1 |
| ADR-009 | Roadmap modular M1 (base segura) → M2 (hardening) → M3 (features) |
| ADR-010 | Schema-summary autogenerado desde `pg_catalog` |
| ADR-011 | Español como idioma primario |
| ADR-012 | Svelte 5 + Vite + TypeScript como framework PWA |
| ADR-013 | Shared plan-schema entre PWA y Deno sin monorepo |
| ADR-014 | **Pivote de testing a partir de B5** — cobertura mínima (B5/B7/B8), 2 tests obligatorios en B6. Commit de referencia: `0e6bbfc`. |

Índice navegable: `docs/03-adr/ADR-INDEX.md`.

---

## 14. Deuda técnica activa

Solo deuda M1 → M2 (las resueltas en M1 no aparecen acá; ver
`TECHNICAL-DEBT.md` para historial completo).

| ID | Deuda | Paga en |
|----|-------|---------|
| TD-001-bis | `service_role` con `BYPASSRLS` en `execute-plan` | M2 → rol dedicado `orion_vox_executor` |
| TD-003 | Confirmación táctil sin preview firmado server-side | M2 → preview firmado HMAC con `preview_id` |
| TD-004 | Allowlist via env var sin UI admin | M2 → UI admin protegida |
| TD-005 | RLS deshabilitada en `orion_audit` | M2 → RLS estricta con rol dedicado |
| TD-008 | Sin retry inteligente para Plan JSON inválido del LLM | M2 → retry con reprompting (max 1) |

Detalle: `docs/05-implementation/TECHNICAL-DEBT.md`.

---

## 15. Mapa de docs (entry points por necesidad)

| Necesidad | Documento |
|-----------|-----------|
| **Estado y próximo paso** | **Este archivo (HANDOFF.md)** |
| Contexto general del proyecto | `CLAUDE.md` raíz |
| Índice navegable de toda la doc | `docs/INDEX.md` |
| Decisiones arquitectónicas | `docs/03-adr/ADR-INDEX.md` (14 ADRs) |
| Specs técnicas | `docs/04-specs/SPEC-INDEX.md` (14 specs) |
| Mapa de arquitectura C4 | `docs/02-architecture/OVERVIEW.md` |
| Sequence diagrams READ/WRITE/CANCEL/ERROR | `docs/02-architecture/DATA-FLOW.md` |
| Modelo de seguridad por milestone | `docs/02-architecture/SECURITY-MODEL.md` |
| Innegociables M1 detallados | `docs/00-constitution/CONSTITUTION.md` + `PRINCIPLES-CHECKLIST.md` |
| Deuda M1→M2 | `docs/05-implementation/TECHNICAL-DEBT.md` |
| Tasks operativas con checkboxes | `openspec/changes/m1-mvp/tasks.md` |
| Estado del change M1 | `openspec/changes/m1-mvp/state.yaml` |
| Bitácora honesta del debate Claude↔Codex | `docs/07-references/history/DEBATE-LOG.md` |
| Decisiones B4 resueltas | `docs/05-implementation/B4-PENDING-DECISIONS.md` |

---

## 16. Engram (memoria persistente)

Para recovery profundo entre sesiones (cuando este HANDOFF no alcance):

```
mem_search "consenso final arquitectura Orion Vox"
mem_search "wave 1 sub-agente alpha"      # reforma de seguridad
mem_search "wave 4 docs sync"             # sync post B0-B3
mem_search "B4.1 plan-intent client"      # último trabajo en curso
mem_session_summary                       # último summary del proyecto
```

---

## 17. Prompt minimalista para abrir nueva sesión

Copiá tal cual al abrir la próxima sesión:

```
Soy el director del proyecto Orion Vox.

Carpeta del repo: c:\Users\LABORATORIO\Downloads\desarrollos\ORION OCG\pwa-supabase-ia

PRIMERA ACCIÓN OBLIGATORIA: leer docs/HANDOFF.md COMPLETO.
Es el documento maestro y único entry point.

Después reportame en 5 líneas:
- Qué entendiste del proyecto
- Estado actual exacto
- El próximo paso EXACTO según el HANDOFF
- Cualquier ambigüedad detectada
- Verificaciones que vas a hacer antes de tocar código

Esperá luz verde antes de tocar código, docs o git.
```

Nada más. El HANDOFF tiene todo. Si la sesión nueva detecta
ambigüedades, las arreglamos juntos antes de avanzar.

---

## 18. Convención permanente de actualización

**Cada cierre de bloque (B4, B5, B6, B7, B8) actualiza este HANDOFF.md
ANTES del próximo commit.** Mínimo a actualizar:

- § 1 (resumen 60 segundos) — nuevo % de avance.
- § 2 (avance por bloques) — bloque cerrado con commit hash.
- § 3 (próximo paso EXACTO) — nuevo bloque a arrancar.
- § 5 (working tree) — limpio o con cambios pendientes.
- § 8 (riesgos abiertos) — nuevos riesgos detectados, riesgos
  cerrados.
- `last-reviewed:` en frontmatter.

Si la sesión olvida actualizarlo, el director pide el update antes
del siguiente bloque. **Sin HANDOFF actualizado, no hay continuidad
confiable entre sesiones.**

---

## 19. Historial de Waves

| Wave | Descripción | Fecha | Commit |
|------|-------------|-------|--------|
| Wave 1 | Reforma de seguridad post-auditoría Codex (Gemini key + service_role server-side, JWT, ADR-005 reescrito) | 2026-05-01 | varios |
| Wave 2 | Roadmap M1/M2/M3 reformulado (ADR-009 reescrito) | 2026-05-01 | varios |
| Wave 3 | Auditoría final + CLAUDE.md actualizado | 2026-05-01 | varios |
| Wave 4 | Docs sync post B0-B3 + B4 pending decisions formalizadas | 2026-05-02 | `91b3bb1` |
| Wave 5 | HANDOFF reescrito a prueba de fallos + .gitignore protegido (cierra R-05); seguido por commit `d1e8a94` (B4.1 plan-intent client de sesión cruzada con Codex 5.5) | 2026-05-03 | `bbcab81` |
| Wave 6 | B4.2 commiteado (trabajo pendiente de sesión anterior): fix gate check pre-existente (`71daedf`) + VoiceScreen integración plan-intent completa (`b959081`). HANDOFF sincronizado. | 2026-05-03 | `b959081` |
| Wave 7 | B4.3: PlanPreview.svelte (render legible humano) + 10 tests unit + VoiceScreen actualizado. HANDOFF sincronizado. Gates: 198/198 verde. | 2026-05-03 | `e5bb9ff` |
| Wave 8 | B4.4: clarification flow completo (TTS speaks question + auto-restart recognition + buildClarifiedPrompt + re-submit) + 10 tests unit. HANDOFF sincronizado para B4.5. Gates: 208/208 verde. | 2026-05-03 | `ae1ce17` |
| Wave 9 | B4.5: 5 tests E2E flow completo voice→plan-intent→PlanPreview/clarification. Bloque B4 cerrado. HANDOFF sincronizado para B5 (Confirmation Modal). Corrección: `npm run test` no existe → `npx vitest run`. Gates: 213/213 verde. | 2026-05-03 | `0e6bbfc` |
| Wave 10 | ADR-014 formalizado (pivote de testing B5-B8 — cobertura mínima intencional, excepción B6). HANDOFF + CLAUDE.md + ADR-INDEX.md sincronizados. Baseline: 213 tests, commit `0e6bbfc`. Hotfix Wave 10: referencias de Wave y git log corregidas en HANDOFF §1, §3, §5, §15, §19. | 2026-05-03 | `d3d8c0a` |
| Wave 11 | B5 cerrado: ConfirmationModal.svelte (step machine, timer 60s, doble confirmación), confirmation-utils.ts, execute-plan-client.ts (stub auditCancel), VoiceScreen integrado, 2 tests E2E (b53). Decisiones: confirmSettings lazy-load en callPlanIntent (evita deadlock IDB), localStore mockeado en b53, waitFor espera header+botón para evitar Cancelar ambiguo. Gates: 218/218 verde. | 2026-05-03 | `3c3b926` |
| Wave 12 | B6 cerrado: executePlan() real + ExecutePlanClientError + 17 msgs ES, AuditView.svelte, redact-client.ts, VoiceScreen handleConfirmed() async, ruta `audit` en router/App. 2 tests integración skip (ADR-014, bloqueados sin Supabase). Mock b53 actualizado. Divergencia detectada: spec-pwa-shell §7 dice SW vanilla, tasks T7.2 dice Workbox — resolver al inicio B7. Gates: 220/220 verde + 2 skip. | 2026-05-03 | `496e848` |
| Wave 13 | B7 cerrado: manifest canónico (spec §3.1), Workbox registerType:prompt, runtimeCaching NetworkOnly Gemini+Supabase, pwa.svelte.ts (PwaStore install/update), App.svelte banners, scripts/gen-icons.mjs (PNG sin deps), public/icons/ (5 PNG placeholder), src/__mocks__/pwa-register.ts + vitest.config.ts alias (fix virtual:pwa-register en Vitest), 2 tests E2E b7. T7.4/T7.5 N/A per spec §7+ADR-006. Decisión: Workbox > SW vanilla. Gates: 224/224 verde + 2 skip. | 2026-05-03 | `d46a9c9` |
