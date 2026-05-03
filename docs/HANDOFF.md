---
title: HANDOFF — Documento maestro de orquestación
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-03
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
- **Avance M1**: ~55% (B0-B3 done, B4.1 done sin commit, B4.2-B4.5
  pendientes, B5-B8 pendientes).
- **Próxima acción concreta**: el director decide si commitear el
  trabajo no commiteado de T3.1 (B4.1) y arrancar B4.2.
- **Decisiones B4 resueltas**: las 4 divergencias detectadas en pre-read
  ya están cerradas en
  [`05-implementation/B4-PENDING-DECISIONS.md`](./05-implementation/B4-PENDING-DECISIONS.md).
- **Working tree NO limpio**: hay cambios pendientes. Ver § 5.
- **Riesgo activo**: `deno test` no re-verificado desde commit `c07b235`
  (ver § 8).

---

## 2. Avance por bloques

| Bloque | Descripción | Estado | Commit cierre |
|--------|-------------|--------|---------------|
| **B0** | Setup base (Svelte 5 + Vite 7 + TS strict + Tailwind 4 + Biome + vite-plugin-pwa) | ✅ done | `45b0707` |
| **B1** | Edge Functions backend (3 funciones + módulos `_shared/` + tests cross-runtime + 2 migrations DDL) | ✅ done (código) ⚠️ sin deploy real | `c07b235` |
| **B2** | PWA Auth + Config + IndexedDB + Logout + tests E2E | ✅ done | `138f4e3` |
| **B3** | PWA Voice (recognition + synthesis wrappers + VoiceScreen + auto-listen + keyboard fallback) | ✅ done | `5ebb458` |
| **Wave 4** | Sync de docs post B0-B3 (no es bloque de implementación) | ✅ done | `91b3bb1` |
| **B4** | Plan-Intent integration cliente | 🔄 EN CURSO — B4.1/T3.1 implementado SIN COMMIT, B4.2-B4.5 pendientes | — |
| **B5** | Confirmation Modal flow | 🔲 pendiente | — |
| **B6** | Execute & Audit cliente | 🔲 pendiente | — |
| **B7** | Atajos Android + Instalación PWA | 🔲 pendiente | — |
| **B8** | Deploy + Smoke E2E Cubot KK9 | 🔲 pendiente | — |

**Tests al cierre Wave 4**: 168/168 Vitest verde + 66/66 Deno verde
(último confirmado en `c07b235`). Tests de B4.1 (`plan-intent-client.test.ts`)
agregan más, pero no se contaron en el último commit verificado.

---

## 3. Próximo paso EXACTO

### Opción A — Cerrar T3.1 con commit y seguir B4.2 (recomendado)

1. Verificar que el working tree (§ 5) refleje exactamente T3.1 sin
   trabajo de otros bloques mezclado.
2. Correr gates verde: `npm run check` + `npm run lint` +
   `npm run test:contracts` (Vitest + Deno).
3. Commit dedicado:
   ```
   B4.1: plan-intent-client + tests + spec sync (PROMPT-ENG, B4-PENDING, HANDOFF)

   - src/lib/api/plan-intent-client.ts: HTTP client con JWT Bearer,
     11 error codes (PlanIntentClientError + PlanIntentServerErrorCode),
     manejo de schema_hash (cache invalidation + X-Refresh-Schema),
     onUnauthorized callback para redirect a login.
   - tests/unit/plan-intent-client.test.ts: tests con mock fetch.
   - supabase/functions/plan-intent/index.ts: ajustes menores spec.
   - docs/02-architecture/PROMPT-ENGINEERING.md: formato concat
     clarification documentado (Decisión 3 de B4-PENDING-DECISIONS).
   - docs/05-implementation/B4-PENDING-DECISIONS.md: decisiones marcadas [x].
   - openspec/changes/m1-mvp/{state.yaml,tasks.md}: T3.1 done.
   - .gitignore: proteger datos sensibles del director.

   Decisiones B4 (consenso director+Claude 2026-05-03):
   - #1 schema_stale: opción (a) cliente detecta hash distinto + X-Refresh-Schema header
   - #2 gemini_unavailable (502) + gemini_timeout (504) separados
   - #3 concat clarificación: ${prompt}\n\nAclaración del usuario: ${respuesta}
   - #4 conversation_id: ignorado (M2)

   Ref: B4-PENDING-DECISIONS.md, ADR-013, spec-plan-intent-edge.md.
   ```
4. Reportar al director: hash + gates verde + actualización HANDOFF
   marcando B4.1 done.

### Opción B — Si el director prefiere revisar antes de commitear

Pedir al director que revise el diff completo (`git diff HEAD` +
contenido de `src/lib/api/plan-intent-client.ts` y
`tests/unit/plan-intent-client.test.ts`). NO commitear sin su
autorización explícita (regla constitucional: el director es el
único que aprueba commits con cambios de scope cliente↔server).

### Después del commit (B4.2)

| Sub-bloque | Scope | Commit sugerido |
|------------|-------|-----------------|
| B4.2 | VoiceScreen → plan-intent integration: dispatch post-recognition + loading state visual | `B4.2: VoiceScreen dispara plan-intent con loading state` |
| B4.3 | `PlanPreview.svelte`: render legible NO técnico del Plan JSON | `B4.3: PlanPreview component` |
| B4.4 | Clarification flow: TTS lee pregunta + auto-restart recognition + concat aprobado | `B4.4: clarification flow con TTS + re-listen` |
| B4.5 | Tests E2E del flow completo voice → plan-intent → preview / clarification | `B4.5: tests E2E B4` |

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

## 5. Working tree NO limpio (al 2026-05-03)

Cambios pendientes de commit (parte de T3.1, sin commit todavía):

```
M  .gitignore                                         (este HANDOFF + protección datos sensibles)
M  docs/02-architecture/PROMPT-ENGINEERING.md         (formato concat clarification)
M  docs/05-implementation/B4-PENDING-DECISIONS.md     (decisiones marcadas [x])
M  docs/HANDOFF.md                                    (este documento, reescrito 2026-05-03)
M  openspec/changes/m1-mvp/state.yaml                 (current_block + last_updated)
M  openspec/changes/m1-mvp/tasks.md                   (T3.1 marcada [x])
M  supabase/functions/plan-intent/index.ts            (ajustes menores)
?? src/lib/api/                                       (plan-intent-client.ts + posible index.ts)
?? tests/unit/plan-intent-client.test.ts              (tests del client)
```

**Acción**: el director revisa el diff y autoriza commit (Opción A
del § 3).

---

## 6. Estructura del código fuente (estado real)

```
src/
├── App.svelte                       — shell principal, routing por router.mode
├── components/
│   ├── VoiceScreen.svelte           — pantalla voz (B3) ✅
│   ├── LoginWizard.svelte           — login magic link (B2) ✅
│   ├── Settings.svelte              — pantalla config (B2) ✅
│   └── ConfigWrapper.svelte         — wrapper config+settings (B2) ✅
└── lib/
    ├── auth-store.svelte.ts         — sesión Supabase, Svelte 5 runes (B2) ✅
    ├── router.svelte.ts             — routing reactivo (B2) ✅
    ├── supabase.ts                  — cliente Supabase anon (B2) ✅
    ├── voice/
    │   ├── recognition.ts           — VoiceInputController (B3) ✅
    │   └── synthesis.ts             — TtsOutputController (B3) ✅
    ├── storage/
    │   ├── local-store.ts           — IndexedDB wrapper (B2) ✅
    │   └── types.ts                 — tipos storage/settings (B2) ✅
    ├── contracts/
    │   └── plan-schema.ts           — barrel re-export desde $shared (B1, ADR-013)
    └── api/
        └── plan-intent-client.ts    — HTTP client plan-intent (B4.1) 🔄 sin commit

supabase/
├── functions/
│   ├── _shared/
│   │   ├── plan-schema.ts           — Zod schema Plan JSON v1.0 (B1) ✅
│   │   ├── query-builder.ts         — SQL builder (B1) ✅
│   │   ├── redact.ts                — redactSqlParams (B1) ✅
│   │   ├── schema-summary-core.ts   — lógica pura schema (B1) ✅
│   │   ├── audit.ts                 — helpers audit (B1) ✅
│   │   └── retries.ts               — backoff helpers (B1) ✅
│   ├── plan-intent/index.ts         — Edge Function (B1) ✅ (modif. menor sin commit)
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
│   └── plan-intent-client.test.ts   — tests del client (B4.1) 🔄 sin commit
├── e2e/
│   ├── b2-auth-config.test.ts       — flows auth, config, logout (B2) ✅
│   └── b3-voice-screen.test.ts      — 8 tests VoiceScreen UI (B3) ✅
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

## 8. Riesgos abiertos (al 2026-05-03)

| ID | Riesgo | Mitigación | Cuándo cerrar |
|----|--------|-----------|---------------|
| R-01 | `deno test` no re-verificado desde `c07b235` (último 66/66 verde). `supabase/functions/` sin cambios significativos en B2-B3, pero la modificación menor sin commit en `plan-intent/index.ts` debe re-verificarse. | Re-instalar Deno + correr `npm run test:contracts` ambos halves verde antes de B8. Si la modificación de plan-intent toca lógica relevante, verificar antes del commit T3.1. | Pre-B8 (obligatorio) |
| R-02 | Magic link callback no probado contra Supabase real | Depende del director (T1.1, T1.2). Smoke en B6/B8 cuando exista proyecto Supabase. | Pre-B8 |
| R-03 | Web Speech + TTS en Cubot KK9 no probado | Smoke E2E B8 en hardware real. Si falla: fallback teclado + lectura visual ya soportado. | B8 |
| R-04 | Plan inválido del LLM sin retry inteligente (TD-008) | Documentado, retry con reprompting postergado a M2. | M2 |
| R-05 | `datos de suapabase` (archivo del director con credenciales) | Agregado a `.gitignore`. Verificar que NUNCA aparezca en `git status`. | Verificar tras este HANDOFF |

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
npm run test                 # todos los Vitest
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

**Estado esperado tras T3.1 commit**:
- `npm run check` → 0 errores
- `npm run lint` → 0 errores
- `npm run test:contracts` → todos verde (Vitest + Deno)

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
| Decisiones arquitectónicas | `docs/03-adr/ADR-INDEX.md` (13 ADRs) |
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
| Wave 5 | HANDOFF reescrito a prueba de fallos + .gitignore protegido | 2026-05-03 | (este) |
