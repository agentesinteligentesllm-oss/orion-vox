---
title: "Tasks — M1 Base segura funcional Plan F+"
change-id: m1-mvp
change-status: in-progress
target-milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./proposal.md
  - ./spec.md
  - ./design.md
  - ./state.yaml
  - ../../../docs/04-specs/SPEC-INDEX.md
  - ../../../docs/04-specs/spec-auth-flow.md
  - ../../../docs/04-specs/spec-plan-intent-edge.md
  - ../../../docs/05-implementation/M1-MVP.md
  - ../../../docs/03-adr/ADR-012-framework-pwa.md
---

# Tasks — M1 Base segura funcional Plan F+

Checklist accionable para implementar M1 con base segura desde día 1.
Cada tarea tiene un criterio de aceptación corto. Marcar `[x]` cuando
se complete y se valide.

> **Pre-requisito**: ADR-012 (framework PWA = Svelte 5 + Vite + TS)
> **APROBADO**. Listo para arrancar Bloque 0.

---

## Bloque 0 — Setup base (depende: ADR-012 ✅ aprobado)

- [ ] **T0.1** — Inicializar repo Svelte 5 + Vite + TypeScript
  (`npm create vite@latest`, template `svelte-ts`).
  *Aceptación*: `npm run dev` levanta y `npm run build` produce bundle
  sin warnings.
- [ ] **T0.2** — Configurar Tailwind 4 (o CSS modules vanilla —
  decisión secundaria documentada en `design.md`).
  *Aceptación*: una clase de utility o un módulo CSS funciona en un
  componente smoke.
- [ ] **T0.3** — Configurar TypeScript estricto (`strict: true`,
  `noUncheckedIndexedAccess: true`) + Biome lint + format.
  *Aceptación*: `tsc --noEmit` y `biome check` pasan limpios.
- [ ] **T0.4** — Configurar `vite-plugin-pwa` con manifest base
  (nombre, iconos, theme color, shortcuts placeholder).
  *Aceptación*: `npm run build` produce `manifest.webmanifest` válido
  según Lighthouse.
- [ ] **T0.5** — Estructura de carpetas: `src/lib/` (módulos
  reutilizables), `src/routes/` (vistas), `src/components/` (UI),
  `src/lib/server-shared/` (validador Plan JSON compartido).
  *Aceptación*: árbol creado y `index.ts` en cada lib exporta lo suyo.

---

## Bloque 1 — Supabase backend (depende: B0)

- [ ] **T1.1** — Crear proyecto Supabase del director, obtener URL +
  `anon key`, guardar en password manager.
  *Aceptación*: dashboard responde, keys persistidas en bóveda.
- [ ] **T1.2** — Habilitar Supabase Auth y configurar magic link con
  callback URL apuntando a la PWA Vercel.
  *Aceptación*: enviar magic link al email del director llega y al
  hacer click activa la sesión.
- [ ] **T1.3** — Escribir DDL de `orion_audit` con índices según
  [`spec-audit-table`](../../../docs/04-specs/spec-audit-table.md);
  versionar como `supabase/migrations/001_orion_audit.sql`.
  *Aceptación*: `supabase db reset` aplica la migración limpia.
- [ ] **T1.4** — Implementar Edge Function `plan-intent` (Deno) según
  [`spec-plan-intent-edge`](../../../docs/04-specs/spec-plan-intent-edge.md):
  recibe `{user_prompt, client_version}` + JWT, valida
  `user.id == ORION_ALLOWED_USER_ID`, llama `schema-summary`
  internamente, llama Gemini server-side con `GEMINI_API_KEY`,
  devuelve Plan JSON o Clarification.
  *Aceptación*: `supabase functions serve plan-intent` responde a
  prompt válido con Plan JSON o Clarification, rechaza JWT inválido
  con 401.
- [ ] **T1.5** — Implementar Edge Function `execute-plan` (Deno) según
  [`spec-execute-plan-edge`](../../../docs/04-specs/spec-execute-plan-edge.md):
  recibe Plan JSON + JWT, valida JWT y allowlist
  `ORION_ALLOWED_TABLES`, ejecuta con `service_role` server-side,
  aplica `ORION_REDACTED_COLUMNS`, audita.
  *Aceptación*: smoke local con SELECT/INSERT/UPDATE/DELETE válidos
  ejecuta y audita; tabla fuera de allowlist devuelve 403.
- [ ] **T1.6** — Implementar Edge Function `schema-summary` (Deno)
  según [`spec-schema-summary-edge`](../../../docs/04-specs/spec-schema-summary-edge.md):
  introspección de `information_schema` filtrada por
  `ORION_ALLOWED_TABLES`, redacción según `ORION_REDACTED_COLUMNS`.
  Llamada interna por `plan-intent`.
  *Aceptación*: devuelve summary con sólo tablas allowlisted y sin
  columnas redactadas.
- [ ] **T1.7** — Configurar env vars en Supabase Edge Functions:
  `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `ORION_ALLOWED_USER_ID`, `ORION_ALLOWED_TABLES`,
  `ORION_REDACTED_COLUMNS`.
  *Aceptación*: las 3 Edge Functions arrancan sin errores y el
  smoke contra todas pasa.
- [ ] **T1.8** — Tests unitarios del query builder + validador Plan
  JSON (módulo compartido cliente / server) con Vitest (cliente) y
  `deno test` (server).
  *Aceptación*: cubre SELECT con LIMIT, INSERT, UPDATE con WHERE,
  DELETE con WHERE, rechazo de DDL / multi-statement, validación
  contra schema Zod.
- [ ] **T1.9** — Smoke con curl end-to-end: login → JWT → POST
  `plan-intent` → POST `execute-plan` con Plan resultado → fila
  registrada en `orion_audit`.
  *Aceptación*: secuencia documentada en `design.md` se ejecuta sin
  errores y deja audit trail completo.

---

## Bloque 2 — PWA Auth & Config (depende: B0 + B1.2)

- [ ] **T2.1** — Configurar `@supabase/supabase-js` con persistencia
  de sesión (`localStorage` por defecto del SDK, validar que
  funciona como PWA instalada).
  *Aceptación*: `supabase.auth.getSession()` devuelve sesión válida
  tras restart de la PWA.
- [ ] **T2.2** — Pantalla login con magic link (input email +
  botón "Enviar magic link" + estado).
  *Aceptación*: input + submit dispara `signInWithOtp`, muestra
  estado "revisá tu email".
- [ ] **T2.3** — Callback URL handling: ruta `/auth/callback` que
  consume el code de la URL y deja sesión activa, redirige a `/`.
  *Aceptación*: click en magic link en mobile abre la PWA y deja al
  director en la home con sesión activa.
- [ ] **T2.4** — Pantalla config (idioma TTS, voz preferida, toggle
  read-only global, toggle dry-run global).
  *Aceptación*: cambios persisten en IndexedDB y se aplican al
  siguiente request.
- [ ] **T2.5** — Logout + clear sesión + redirect a login.
  *Aceptación*: tras logout, `getSession()` devuelve null y la PWA
  fuerza login.

---

## Bloque 3 — PWA Plan-Intent integration (depende: B2 + B1.4)

- [ ] **T3.1** — Cliente `plan-intent` (fetch a la Edge con
  `Authorization: Bearer ${jwt}` header).
  *Aceptación*: una frase enviada al endpoint devuelve Plan JSON o
  Clarification; 401 manejado con redirect a login.
- [ ] **T3.2** — Manejo de respuesta Plan vs Clarification: si es
  Clarification, mostrar pregunta al usuario y reenviar refinada.
  *Aceptación*: frase ambigua ("borra eso") muestra pregunta de
  clarificación en pantalla y/o TTS.
- [ ] **T3.3** — Validador Plan JSON cliente (Zod) usando el módulo
  compartido `src/lib/server-shared/plan-schema.ts`.
  *Aceptación*: Plan inválido recibido del server se rechaza
  client-side con código de error específico antes de mostrar al
  usuario.

---

## Bloque 4 — PWA Voice (paralelo a B3, depende: B0)

- [ ] **T4.1** — Web Speech Recognition `es-MX` con `interimResults`
  según [`spec-voice-input`](../../../docs/04-specs/spec-voice-input.md).
  *Aceptación*: dictar una frase muestra transcripción incremental
  en pantalla.
- [ ] **T4.2** — Indicador visual de escucha
  (idle / escuchando / procesando / respondiendo).
  *Aceptación*: el estado visible coincide con el estado real del
  flujo en cada transición.
- [ ] **T4.3** — Auto-listen al abrir desde shortcut PWA
  (`?mode=voice`).
  *Aceptación*: abrir desde el atajo activa el mic o muestra botón
  claro si el browser exige interacción explícita.
- [ ] **T4.4** — Web Speech Synthesis `es-MX` con interrupción +
  voz configurable según
  [`spec-tts-output`](../../../docs/04-specs/spec-tts-output.md).
  *Aceptación*: una respuesta se sintetiza con la voz seleccionada
  y un tap la corta.
- [ ] **T4.5** — Smoke test Web Speech en Cubot KK9 (ver
  [`INSTALLATION-CUBOT.md`](../../../docs/06-deploy/INSTALLATION-CUBOT.md)
  § smoke test).
  *Aceptación*: dictado y síntesis funcionan en el dispositivo
  físico antes de avanzar a B5.

---

## Bloque 5 — PWA Confirmation flow (depende: B3)

- [ ] **T5.1** — Modal de confirmación táctil para writes según
  [`spec-confirmation-flow`](../../../docs/04-specs/spec-confirmation-flow.md).
  *Aceptación*: ningún write se ejecuta sin tap explícito en
  "Confirmar".
- [ ] **T5.2** — Preview SQL legible (tabla, valores, filtros, filas
  estimadas si están).
  *Aceptación*: el director entiende qué se va a ejecutar sin saber
  SQL.
- [ ] **T5.3** — Doble confirmación bloqueada server-side para
  `delete sin filtros` (regla hardcoded en `execute-plan`).
  *Aceptación*: `delete` sin WHERE rechazado por `execute-plan` con
  error legible y entrada en `orion_audit`. (US-SEC-06 doble
  confirmación high-impact se implementa en M2.)
- [ ] **T5.4** — Cancelación auditada: cancelar el modal envía POST
  a `execute-plan` con `dry_run: true` + `rejected_by_user: true`
  para registrar la decisión.
  *Aceptación*: cancelar genera entrada en `orion_audit` con código
  `rechazado_por_usuario`.
- [ ] **T5.5** — Toggle `dry_run` global en config (cuando está ON,
  todo write se envía con `dry_run: true`).
  *Aceptación*: con dry_run activo, ningún write toca Postgres pero
  todo se audita.

---

## Bloque 6 — PWA Execute & Audit (depende: B5 + B1.5)

- [ ] **T6.1** — Cliente `execute-plan` (fetch con JWT, manejo de
  errores: 401, 403, 422, 500).
  *Aceptación*: cada código de error produce mensaje legible + TTS +
  audit espejo en IndexedDB.
- [ ] **T6.2** — Vista de auditoría espejo en IndexedDB (últimas N
  ejecuciones cacheadas localmente para acceso rápido offline).
  *Aceptación*: cubre US-AUD-01 con detalle expandible por entrada;
  refresh manual descarga últimas N de `orion_audit` server.
- [ ] **T6.3** — Aplicar redacción client-side donde corresponda
  (en caso de que el server devuelva campos sensibles por error,
  doble defensa).
  *Aceptación*: campos en `ORION_REDACTED_COLUMNS` aparecen
  redactados en pantalla aunque el server los enviara crudos.

---

## Bloque 7 — PWA Atajos & Instalación (depende: B0)

- [ ] **T7.1** — Manifest con shortcuts (modo voz `?mode=voice`,
  config `/config`, auditoría `/audit`).
  *Aceptación*: long-press del icono en Android muestra los 3
  shortcuts.
- [ ] **T7.2** — Service worker con cache de assets estáticos
  (Workbox vía `vite-plugin-pwa`).
  *Aceptación*: segunda carga sin red sirve la shell desde cache.
- [ ] **T7.3** — Add to Home Screen flow funcional en Chrome Android.
  *Aceptación*: chrome://flags no requiere ajustes; el prompt
  aparece y la instalación coloca icono.
- [ ] **T7.4** — Lockscreen widget si Android del Cubot lo soporta
  (best-effort, no blocker).
  *Aceptación*: documentar en `INSTALLATION-CUBOT.md` si funciona o
  no en KK9.
- [ ] **T7.5** — Quick Tile si feasible (depende de versión Android
  Cubot — best-effort).
  *Aceptación*: documentar feasibility.

---

## Bloque 8 — Deploy & Validación (depende: todos)

- [ ] **T8.1** — Deploy PWA a Vercel (preview + production con dominio
  HTTPS).
  *Aceptación*: URL HTTPS pública responde con shell + service worker
  registrado + manifest válido.
- [ ] **T8.2** — Verificar HTTPS + criterios PWA install (manifest,
  iconos, service worker, start_url).
  *Aceptación*: Lighthouse PWA score ≥ 90 en producción.
- [ ] **T8.3** — Instalar PWA en Cubot KK9 desde Chrome Android.
  *Aceptación*: icono "Orion Vox" en home con atajo a Voice Mode
  funcional.
- [ ] **T8.4** — Smoke E2E manual: "OK Google, abrí Orion Vox" → si
  no logueado, login con magic link → voz → resultado TTS.
  *Aceptación*: flujo end-to-end completo desde lock screen.
- [ ] **T8.5** — Verificar todas las US M1 contra criterios de
  aceptación de
  [`USER-STORIES.md`](../../../docs/01-product/USER-STORIES.md).
  *Aceptación*: checklist completo, sin US M1 abierta.
- [ ] **T8.6** — Verificar todos los criterios de Done de
  [`M1-MVP.md`](../../../docs/05-implementation/M1-MVP.md).
  *Aceptación*: 100% de los criterios `[x]`.
- [ ] **T8.7** — Marcar change `m1-mvp` como `completed` en
  `state.yaml` y mover a `openspec/archive/m1-mvp/`.
  *Aceptación*: `openspec/changes/m1-mvp/` ya no existe; copia en
  archive con state actualizado.

---

## Resumen de bloques

| Bloque | Depende de | Paralelo a | Trigger |
|--------|------------|------------|---------|
| B0 Setup | ADR-012 ✅ | — | director da go |
| B1 Supabase | B0 | — | tras B0 |
| B2 Auth/Config | B0 + B1.2 | B1 (parcial) | tras B1.2 |
| B3 Plan-Intent | B2 + B1.4 | B4 | tras B2 + B1.4 |
| B4 Voice | B0 | B3 | tras B0 |
| B5 Confirmation | B3 | — | tras B3 |
| B6 Execute/Audit | B5 + B1.5 | — | tras B5 + B1.5 |
| B7 Atajos/PWA | B0 | — | tras B0 |
| B8 Deploy/Validación | todos | — | último |

---

## Reglas de marcado

- Marcar `[x]` **sólo** cuando se cumple el criterio de aceptación y
  el código está mergeado (no sólo "escrito").
- Cualquier tarea bloqueada anota la razón inline:
  `- [ ] T1.1 — ... [BLOQUEADA: razón]`.
- Tareas que descubren sub-tareas las agregan numeradas
  (`T1.5.a`, `T1.5.b`).
- Cuando se cierra el change, todas las tareas deben estar `[x]`.
