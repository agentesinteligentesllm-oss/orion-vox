---
title: HANDOFF — Documento maestro de orquestación
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-03 (B4.5 + ADR-014 Wave 10)
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
- **Avance M1**: ~80% (B0-B4 completos, B5-B8 pendientes).
- **Próxima acción concreta**: arrancar B5 (Confirmation Modal — modal
  táctil para writes + doble confirmación + cancel audit). Ver §3.
- **Bloque B4 cerrado**: B4.1→B4.5 todos ✅. Spec de B5 estable en
  [`04-specs/spec-confirmation-flow.md`](./04-specs/spec-confirmation-flow.md).
  Leer COMPLETO antes de tocar código.
- **⚡ Pivote de testing (ADR-014)**: a partir de B5 la cobertura cambia a
  mínima intencional. B6 es excepción obligatoria (2 tests mínimos — toca
  Postgres real). Ver [`03-adr/ADR-014-testing-strategy-pivot.md`](./03-adr/ADR-014-testing-strategy-pivot.md)
  para el razonamiento completo, la tabla por bloque y cómo revertir.
- **Working tree LIMPIO** al cierre de ADR-014 + Wave 10 (commit `d3d8c0a`
  docs Wave 10). Verificar con `git status` antes de tocar nada.
- **Riesgo activo**: `deno test` no re-verificado desde commit `c07b235`
  (ver §8). Gate `check` 0 errores desde B4.2 (`71daedf`).

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
| **B5** | Confirmation Modal flow | 🔲 pendiente | — |
| **B6** | Execute & Audit cliente | 🔲 pendiente | — |
| **B7** | Atajos Android + Instalación PWA | 🔲 pendiente | — |
| **B8** | Deploy + Smoke E2E Cubot KK9 | 🔲 pendiente | — |

**Tests al cierre B4.5**: 213/213 Vitest verde (208 previos + 5 nuevos
de `b45-voice-plan-flow.test.ts`). Gate `check` verde (0 errores).
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
   [hash]   docs: … Wave 10 …   ← el top debe ser un commit docs de Wave 10
   0e6bbfc  docs: HANDOFF sincronizado post-B4.5 (Wave 9)
   7299218  B4.5: tests E2E B4 voice→plan-intent
   e01f293  docs: HANDOFF sincronizado post-B4.4 (Wave 8)
   ae1ce17  B4.4: clarification flow con TTS + re-listen + buildClarifiedPrompt
   ```
   El hash exacto del top puede variar si hubo hotfixes de docs en Wave 10;
   lo que importa es que el mensaje mencione "Wave 10" y el working tree esté limpio.
3. **LEER spec completa ANTES de codear**: `docs/04-specs/spec-confirmation-flow.md`.
   Es el único documento autoritativo para B5. El HANDOFF resume los puntos
   clave, pero la spec tiene los contratos exactos, los estados del modal,
   el manejo de errores y las restricciones M1.
4. Si el working tree NO está limpio, alguien dejó trabajo en curso.
   Pausar y reportar al director antes de tocar nada.

### Estado B4 (✅ cerrado completamente)

| Sub-bloque | Commit | Qué entrega |
|------------|--------|-------------|
| B4.1 | `d1e8a94` | `plan-intent-client.ts` + 8 tests unit |
| B4.2 | `b959081` | VoiceScreen integrado + 14 mensajes error ES + 9 tests |
| B4.3 | `e5bb9ff` | `PlanPreview.svelte` render legible + 10 tests unit |
| B4.4 | `ae1ce17` | Clarification flow TTS + auto-restart + buildClarifiedPrompt + 10 tests unit |
| B4.5 | `7299218` | 5 tests E2E flow completo voice→plan-intent→PlanPreview |

**Gotchas de B4 que persisten en B5 (no perder de vista)**:

1. **`toBeDisabled()` / `toBeEnabled()` NO disponibles**: usar
   `expect((btn as HTMLButtonElement).disabled).toBe(true/false)`.
2. **Mock TTS patrón B4.4**: `_handlers` map público + helper `emit(inst, event, value?)`.
   El mock de B3 (`on = vi.fn()`) no sirve para tests que necesiten disparar eventos TTS.
3. **`recognition.resetToIdle()` es no-op en mocks**: emitir `emit(rec, 'state', 'idle')`
   manualmente si el test necesita que `voiceState` vuelva a idle.
4. **`tts.cancel()` emite `'error'` con `code:'interrupted'`**, NO `'end'`. En tests
   que simulen cancel de TTS: `emit(tts, 'error', { code: 'interrupted' })`.

---

### B5 — Confirmation Modal flow (🔲 pendiente, PRÓXIMO BLOQUE)

**Spec autoritativa**: `docs/04-specs/spec-confirmation-flow.md` (leer completa).

**Qué construye B5** (5 tareas de `openspec/changes/m1-mvp/tasks.md` §Bloque 5):

| Tarea | Descripción |
|-------|-------------|
| T5.1 | `ConfirmationModal.svelte` — modal táctil full-screen para writes |
| T5.2 | Preview SQL legible (operación, tabla, filtros, valores, SQL preview colapsable) |
| T5.3 | Doble confirmación para `delete` sin filtros / estimación > 100 filas |
| T5.4 | Cancel auditado — fire-and-forget POST a `execute-plan` con `rejected_by_user: true` |
| T5.5 | Toggle `dry_run` global en `Settings.svelte` (verificar si ya existe en B2) |

**Archivos a crear / modificar**:

```
src/
├── components/
│   └── ConfirmationModal.svelte    ← NUEVO (T5.1 + T5.2 + T5.3)
└── lib/
    └── api/
        └── execute-plan-client.ts  ← NUEVO mínimo (T5.4 cancel audit)
                                       B6 lo extiende con el path confirmar

src/components/VoiceScreen.svelte   ← MODIFICAR: trigger modal cuando
                                      planResponse.kind === 'plan' &&
                                      shouldConfirm(plan)
src/components/Settings.svelte      ← VERIFICAR si dry_run toggle existe;
                                      si no, AGREGAR (T5.5)

tests/unit/b51-confirmation-modal.test.ts   ← NUEVO (modal unit)
tests/unit/b52-double-confirm.test.ts       ← NUEVO (doble confirmación)
tests/e2e/b53-confirmation-flow.test.ts     ← NUEVO (E2E: show modal → confirm/cancel)
```

**Interfaz del modal** (de spec §3.2):

```ts
// src/components/ConfirmationModal.svelte — props
interface ConfirmationModalProps {
  plan: Plan;
  sqlPreview: string;          // generado client-side (aproximación)
  warnings: string[];          // ej: 'Sin filtros: afecta toda la tabla.'
  requiresDouble: boolean;     // true para delete sin filtros / estimación > 100
  onConfirm(): void;
  onCancel(): void;
}
```

**Funciones helper** (definir en el mismo componente o en `src/lib/confirmation-utils.ts`):

```ts
function shouldConfirm(plan: Plan): boolean {
  return plan.operation !== 'select';
}

function requiresDoubleConfirm(plan: Plan): boolean {
  if (plan.operation === 'delete') {
    if (!plan.filters || plan.filters.length === 0) return true;
  }
  return false;
  // M1: sin estimación de filas — esa lógica es M2 (dry_run automático)
}
```

**UX innegociable** (spec §3.3 + §7):
- Modal **full-screen** en mobile. No popup pequeño.
- Botón **Cancelar default focused**. `Enter` **NO confirma**.
- Header: azul `insert`, naranja `update`, rojo `delete`.
- **Sin filas estimadas** en M1 (el `dry_run` automático pre-modal es M2).
- Countdown visible a 50s; auto-cancel a 60s (audita como `rejected_by_user`).
- Botón Confirmar se deshabilita tras primer tap (evita doble request).
- Tap fuera del modal NO cierra (full-screen no tiene "fuera").

**Cancel audit — fire-and-forget** (spec §3.6):

```ts
// execute-plan-client.ts mínimo para B5
async function auditCancel(plan: Plan, accessToken: string): Promise<void> {
  fetch(EXECUTE_PLAN_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, rejected_by_user: true }),
  }).catch((err) => console.warn('audit cancel failed', err));
  // Fire-and-forget: si falla, el cancel local procede igual. No bloquea UX.
}
```

**Integración en VoiceScreen.svelte** — cambio principal:

Cuando `planResponse?.kind === 'plan'` y `shouldConfirm(planResponse.plan) === true`:
- En lugar de solo mostrar `PlanPreview`, mostrar `ConfirmationModal` encima.
- `onConfirm` → de momento emitir event / llamar callback (B6 conecta la ejecución real).
- `onCancel` → llamar `auditCancel(plan, token)` (fire-and-forget) + limpiar estado.

**Reglas duras para B5**:
- B5 NO ejecuta el plan contra Postgres — la ejecución es B6 (T6.1).
- B5 solo hace la UI del modal + el fire-and-forget del cancel audit.
- `ConfirmationModal` es un componente puro: no llama directamente a la Edge
  desde adentro; la lógica de llamada vive en VoiceScreen / callbacks.
- Gates antes de commit: `npm run check` + `npm run lint` + `npx vitest run`.
- Sub-bloques sugeridos:
  - **B5.1** — `ConfirmationModal.svelte` completo + tests unit (T5.1+T5.2+T5.3).
  - **B5.2** — Integración en VoiceScreen + `execute-plan-client.ts` minimal + T5.5 + tests E2E (T5.4).
- Al cerrar B5: reportar al director, actualizar HANDOFF (§1, §2, §3, §5, §6, §19)
  y commitear docs Wave 11 ANTES del siguiente bloque.

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

Estado al cierre de ADR-014 + Wave 10: **working tree limpio, todo commiteado**.

Verificar siempre al abrir sesión:

```bash
git status         # debe decir: nothing to commit, working tree clean
git log --oneline -5
# debe mostrar (más recientes primero):
#   [hash]   docs: … Wave 10 …  ← top = docs Wave 10 (hash puede variar por hotfixes)
#   0e6bbfc  docs: HANDOFF sincronizado post-B4.5 (Wave 9)
#   7299218  B4.5: tests E2E B4 voice→plan-intent
#   e01f293  docs: HANDOFF sincronizado post-B4.4 (Wave 8)
#   ae1ce17  B4.4: clarification flow con TTS + re-listen + buildClarifiedPrompt
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
│   ├── VoiceScreen.svelte           — pantalla voz + integración plan-intent (B3+B4.2+B4.3+B4.4) ✅
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
    └── api/
        ├── plan-intent-client.ts    — HTTP client plan-intent (B4.1) ✅ d1e8a94
        └── plan-intent-messages.ts  — 14 mensajes error español (B4.2) ✅ b959081

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
│   └── b45-voice-plan-flow.test.ts  — 5 tests E2E voice→plan-intent→PlanPreview (B4.5) ✅ 7299218
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
