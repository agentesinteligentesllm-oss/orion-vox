---
title: Flujo de datos end-to-end
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - COMPONENTS.md
  - PLAN-JSON-CONTRACT.md
  - AUDIT-MODEL.md
  - SECURITY-MODEL.md
  - ../04-specs/spec-auth-flow.md
  - ../04-specs/spec-plan-intent-edge.md
  - ../04-specs/spec-execute-plan-edge.md
---

# Flujo de datos end-to-end

Tras la reforma de seguridad de Wave 1 (`SECURITY-MODEL.md` §1, `ADR-012`),
el flujo end-to-end tiene **3 hops principales** (auth, plan-intent,
execute-plan). La PWA es un **cliente delgado**: sólo captura voz, gestiona
sesión, muestra modales y sintetiza respuestas. Toda la inteligencia
(prompt engineering, llamada a Gemini, validación, traducción a SQL,
auditoría) y todos los permisos viven server-side en 3 Edge Functions
(`plan-intent`, `execute-plan`, `schema-summary`). Ni la API key de Gemini
ni el `service_role` de Supabase tocan jamás el cliente.

Este documento muestra: el **runtime flow** por escenario (READ, WRITE,
CANCELACIÓN, ERROR), las **integration boundaries**, el manejo de errores
por paso y las latencias esperadas.

---

## 1. Runtime flow — diagramas de secuencia

### 1.1 Flujo READ end-to-end (consulta sin modificación)

```
Usuario   PWA          Supabase Auth     Edge plan-intent     Edge schema-summary    Gemini API     Edge execute-plan    Postgres
  │        │                │                   │                     │                  │                  │                │
  │ "OK Google,             │                   │                     │                  │                  │                │
  │  abrí Orion Vox"        │                   │                     │                  │                  │                │
  │───────▶│                │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │ ◇ check sesión │                   │                     │                  │                  │                │
  │        │ → JWT válido?  │                   │                     │                  │                  │                │
  │        │   (sino: magic │                   │                     │                  │                  │                │
  │        │    link UI)    │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │ ◇ STT es-MX    │                   │                     │                  │                  │                │
  │        │  → "mostrame   │                   │                     │                  │                  │                │
  │        │    las tareas  │                   │                     │                  │                  │                │
  │        │    activas"    │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │  POST /plan-intent                  │                     │                  │                  │                │
  │        │  → JWT, prompt │                   │                     │                  │                  │                │
  │        │───────────────────────────────────▶│                     │                  │                  │                │
  │        │                │                   │ ◇ valida JWT        │                  │                  │                │
  │        │                │ ◀──auth.getUser──│                     │                  │                  │                │
  │        │                │ ──user.id──────▶ │                     │                  │                  │                │
  │        │                │                   │ ◇ user.id ==        │                  │                  │                │
  │        │                │                   │   ORION_ALLOWED_    │                  │                  │                │
  │        │                │                   │   USER_ID? sino 403 │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │  invocación interna │                  │                  │                │
  │        │                │                   │  → schema_hash?     │                  │                  │                │
  │        │                │                   │────────────────────▶│                  │                  │                │
  │        │                │                   │ ◀──markdown,hash───│                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │ ◇ build system      │                  │                  │                │
  │        │                │                   │   prompt + schema   │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │  POST generateContent                  │                  │                │
  │        │                │                   │  → x-goog-api-key (env), system, user, tools              │                │
  │        │                │                   │────────────────────────────────────────▶│                  │                │
  │        │                │                   │ ◀──functionCall(execute_plan, args)───│                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │ ◇ validate Plan     │                  │                  │                │
  │        │                │                   │   JSON (Zod)        │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │  INSERT orion_audit │                  │                  │                │
  │        │                │                   │  (was_dry_run=true, was_confirmed=false, fase=plan-intent)│                │
  │        │                │                   │────────────────────────────────────────────────────────────────────────────▶│
  │        │ ◀───── { kind:'plan', plan, audit_id_intent } ─────────│                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │ ◇ validate     │                   │                     │                  │                  │                │
  │        │ ◇ kind = read  │                   │                     │                  │                  │                │
  │        │ ◇ NO modal     │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │  POST /execute-plan                 │                     │                  │                  │                │
  │        │  → JWT, plan, user_prompt, client_version                │                  │                  │                │
  │        │─────────────────────────────────────────────────────────────────────────────────────────────────▶                │
  │        │                │ ◀──auth.getUser──│                     │                  │ ◇ valida JWT     │                │
  │        │                │                   │                     │                  │ ◇ user.id ==     │                │
  │        │                │                   │                     │                  │   ORION_ALLOWED_ │                │
  │        │                │                   │                     │                  │   USER_ID?       │                │
  │        │                │                   │                     │                  │ ◇ valida Plan    │                │
  │        │                │                   │                     │                  │   (Zod)          │                │
  │        │                │                   │                     │                  │ ◇ valida tablas  │                │
  │        │                │                   │                     │                  │   en ORION_      │                │
  │        │                │                   │                     │                  │   ALLOWED_TABLES │                │
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │  INSERT orion_audit (pending)     │
  │        │                │                   │                     │                  │─────────────────────────────────▶│
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │ ◇ build SQL      │                │
  │        │                │                   │                     │                  │   parametrizado  │                │
  │        │                │                   │                     │                  │  EXECUTE (service_role env, statement_timeout=10s)
  │        │                │                   │                     │                  │─────────────────────────────────▶│
  │        │                │                   │                     │                  │ ◀────── rows ───────────────────│
  │        │                │                   │                     │                  │                  │                │
  │        │                │                   │                     │                  │ ◇ aplicar redacción              │
  │        │                │                   │                     │                  │   (ORION_REDACTED_COLUMNS)       │
  │        │                │                   │                     │                  │  UPDATE orion_audit (resultado)  │
  │        │                │                   │                     │                  │─────────────────────────────────▶│
  │        │ ◀── { ok:true, result, rows_affected, audit_id, sql_preview } ─────────────│                  │                │
  │        │                │                   │                     │                  │                  │                │
  │        │ ◇ render UI    │                   │                     │                  │                  │                │
  │        │ ◇ TTS es-MX    │                   │                     │                  │                  │                │
  │ ◀──────│ "Tenés 3 tareas activas..."        │                     │                  │                  │                │
```

### 1.2 Flujo WRITE end-to-end (insert / update / delete) — con confirmación táctil

```
Usuario   PWA          Edge plan-intent     Gemini API     Edge execute-plan    Postgres / orion_audit
  │        │                │                   │                  │                     │
  │        │ ◇ JWT vigente, STT, prompt = "borrá las archivadas"   │                     │
  │        │                │                   │                  │                     │
  │        │  POST /plan-intent (JWT, prompt)                       │                     │
  │        │───────────────▶│                   │                  │                     │
  │        │                │ ◇ valida JWT + user.id               │                     │
  │        │                │ ◇ schema-summary (interna)           │                     │
  │        │                │ ◇ generateContent (Gemini env key)   │                     │
  │        │                │──────────────────▶│                  │                     │
  │        │                │ ◀── functionCall {op:delete,...} ────│                     │
  │        │                │ ◇ valida Plan JSON                   │                     │
  │        │                │ INSERT orion_audit (was_dry_run=true, was_confirmed=false, fase=plan-intent)
  │        │                │──────────────────────────────────────────────────────────▶│
  │        │ ◀──────── { kind:'plan', plan, audit_id_intent } ────│                     │
  │        │                │                   │                  │                     │
  │        │ ◇ validate (Zod cliente)            │                  │                     │
  │        │ ◇ kind = write │                   │                  │                     │
  │        │ ◇ MODAL CONFIRM:                   │                  │                     │
  │        │     - tabla destino                │                  │                     │
  │        │     - sql_preview (informativo)    │                  │                     │
  │        │     - filas estimadas (opcional)   │                  │                     │
  │ ◀──────│ ve modal       │                   │                  │                     │
  │ TOCA   │                │                   │                  │                     │
  │ "OK"   │                │                   │                  │                     │
  │───────▶│                │                   │                  │                     │
  │        │                │                   │                  │                     │
  │        │  POST /execute-plan                 │                  │                     │
  │        │  → JWT, plan, user_prompt, client_version, dry_run=false, confirmed=true   │
  │        │───────────────────────────────────────────────────────▶│                     │
  │        │                │                   │                  │ ◇ valida JWT, user.id, Plan, allowlist
  │        │                │                   │                  │ INSERT orion_audit (pending, was_confirmed=true)
  │        │                │                   │                  │────────────────────▶│
  │        │                │                   │                  │ ◇ build SQL DELETE  │
  │        │                │                   │                  │ EXECUTE (service_role env)
  │        │                │                   │                  │────────────────────▶│
  │        │                │                   │                  │ ◀──── rows_affected │
  │        │                │                   │                  │ ◇ redacción         │
  │        │                │                   │                  │ UPDATE orion_audit  │
  │        │                │                   │                  │────────────────────▶│
  │        │ ◀── { ok:true, result, rows_affected:3, audit_id, sql_preview } ───────────│
  │        │ ◇ TTS confirma │                   │                  │                     │
  │ ◀──────│ "Borré 3 tareas"                   │                  │                     │
```

### 1.3 Flujo CANCELACIÓN (usuario cancela en modal post-plan)

```
Usuario   PWA          Edge execute-plan        Postgres / orion_audit
  │        │                │                          │
  │        │  (ya recibió Plan JSON write desde plan-intent;  │
  │        │   modal de confirmación visible)                  │
  │ ◀──────│ ve modal       │                          │
  │ TOCA   │                │                          │
  │"Cancelar"               │                          │
  │───────▶│                │                          │
  │        │ ◇ cierra modal │                          │
  │        │ ◇ TTS:         │                          │
  │        │   "Cancelado"  │                          │
  │        │                │                          │
  │        │  POST /execute-plan (fire-and-forget)     │
  │        │  → JWT, plan, user_prompt, client_version,│
  │        │    dry_run=true, rejected_by_user=true     │
  │        │───────────────▶│                          │
  │        │                │ ◇ valida JWT + user.id   │
  │        │                │ ◇ valida Plan + allowlist│
  │        │                │ INSERT orion_audit       │
  │        │                │  (was_dry_run=true,      │
  │        │                │   was_confirmed=false,   │
  │        │                │   rejected_by_user=true, │
  │        │                │   rows_affected=0)       │
  │        │                │─────────────────────────▶│
  │        │                │ ◇ NO se ejecuta SQL      │
  │        │ ◀── { ok:true, result:null, audit_id } ──│
  │        │ (PWA ignora respuesta — fire-and-forget)  │
```

La cancelación se audita server-side **antes** de descartar el Plan: queda
trazabilidad de la intención del usuario y de la decisión de no ejecutar.

### 1.4 Flujo ERROR (con manejo en cada nodo)

Casos cubiertos: JWT inválido, `user.id` no autorizado, Plan JSON malformado,
tabla no allowlisted, Gemini timeout. Cada nodo maneja su error y deja
trazabilidad cuando aplica.

```
Usuario   PWA          Edge plan-intent     Gemini API     Edge execute-plan    Postgres / orion_audit
  │        │                │                   │                  │                     │
  │ Caso A: JWT expirado / inválido                                                       │
  │        │  POST /plan-intent (JWT)                               │                     │
  │        │───────────────▶│                   │                  │                     │
  │        │                │ ◇ auth.getUser → null                │                     │
  │        │                │ ◇ NO INSERT audit (no hay user.id)   │                     │
  │        │ ◀── 401 { error:'invalid_token' } │                  │                     │
  │        │ ◇ fuerza re-login (magic link UI)                     │                     │
  │        │                │                   │                  │                     │
  │ Caso B: user.id ≠ ORION_ALLOWED_USER_ID                                               │
  │        │  POST /plan-intent (JWT válido pero usuario no autorizado)                  │
  │        │───────────────▶│                   │                  │                     │
  │        │                │ ◇ user.id ≠ ALLOWED                  │                     │
  │        │                │ INSERT orion_audit (forbidden_user, NO ejecuta Gemini)     │
  │        │                │──────────────────────────────────────────────────────────▶│
  │        │ ◀── 403 { error:'forbidden_user' } │                  │                     │
  │        │ ◇ muestra: "Cuenta no autorizada"                     │                     │
  │        │                │                   │                  │                     │
  │ Caso C: Gemini timeout / 5xx (post 3 reintentos backoff)                              │
  │        │  POST /plan-intent (JWT, prompt)                       │                     │
  │        │───────────────▶│                   │                  │                     │
  │        │                │ ◇ valida JWT OK                      │                     │
  │        │                │ generateContent (intento 1, 2, 3)    │                     │
  │        │                │──────────────────▶│                  │                     │
  │        │                │ ◀── timeout / 503 │                  │                     │
  │        │                │ INSERT orion_audit (gemini_unavailable, was_dry_run=true)  │
  │        │                │──────────────────────────────────────────────────────────▶│
  │        │ ◀── 502 { error:'gemini_unavailable' }                │                     │
  │        │ ◇ muestra: "Gemini no responde, probá de nuevo"       │                     │
  │        │                │                   │                  │                     │
  │ Caso D: Plan JSON malformado (Gemini devolvió basura)                                 │
  │        │  POST /plan-intent (JWT, prompt)                       │                     │
  │        │───────────────▶│                   │                  │                     │
  │        │                │ ◇ Gemini OK pero JSON falla Zod      │                     │
  │        │                │ INSERT orion_audit (plan_invalid)    │                     │
  │        │                │──────────────────────────────────────────────────────────▶│
  │        │ ◀── 422 { error:'plan_invalid', detail }              │                     │
  │        │ ◇ muestra: "No pude traducir, reformulá"              │                     │
  │        │                │                   │                  │                     │
  │ Caso E: tabla NO en ORION_ALLOWED_TABLES (en execute-plan)                            │
  │        │  POST /execute-plan (JWT, plan con tabla `secretos`)   │                     │
  │        │───────────────────────────────────────────────────────▶│                     │
  │        │                │                   │                  │ ◇ valida JWT OK     │
  │        │                │                   │                  │ ◇ tabla NO allowed  │
  │        │                │                   │                  │ INSERT orion_audit  │
  │        │                │                   │                  │  (table_not_allowed)│
  │        │                │                   │                  │────────────────────▶│
  │        │ ◀── 403 { error:'table_not_allowed', table:'secretos' } ──────────────────│
  │        │ ◇ muestra: "Operación no permitida sobre `secretos`"  │                     │
  │        │                │                   │                  │                     │
  │ Caso F: Postgres timeout (>10s statement_timeout)                                     │
  │        │  POST /execute-plan (consulta pesada)                  │                     │
  │        │───────────────────────────────────────────────────────▶│                     │
  │        │                │                   │                  │ EXECUTE → timeout   │
  │        │                │                   │                  │────────────────────▶│
  │        │                │                   │                  │ UPDATE orion_audit  │
  │        │                │                   │                  │  (error:'pg_timeout')
  │        │                │                   │                  │────────────────────▶│
  │        │ ◀── 504 { error:'pg_timeout', audit_id } ─────────────│                     │
  │        │ ◇ muestra: "La consulta tardó demasiado"               │                     │
```

**Invariante de auditoría**: salvo el Caso A (JWT inválido — no hay `user.id`
para asociar la entrada), **toda** llamada que cruza la frontera con
identidad reconocida deja registro en `orion_audit`, exitosa o fallida.

---

## 2. Integration boundaries

| Frontera                                        | Protocolo | Payload entrada                                                          | Payload salida                                                | Auth                                |
|-------------------------------------------------|-----------|--------------------------------------------------------------------------|---------------------------------------------------------------|-------------------------------------|
| Cubot KK9 → PWA                                 | Intent    | "OK Google, abrí Orion Vox"                                              | (PWA arranca con micrófono pre-armado)                        | N/A — atajo del sistema             |
| PWA → Web Speech API (STT)                      | JS API    | audio mic                                                                | string (transcripción es-MX)                                  | permiso usuario (mic)               |
| PWA → Supabase Auth                             | HTTPS     | email (magic link) o `refresh_token`                                     | `{ access_token, refresh_token, user }`                       | público (magic link) / refresh_token|
| PWA → Edge `plan-intent`                        | HTTPS     | `{ user_prompt, client_version, conversation_id?, hints? }`              | `{ kind:'plan', plan, audit_id_intent }` o `{ kind:'clarification', ... }` | `Bearer <supabase_jwt>`     |
| PWA → Edge `execute-plan`                       | HTTPS     | `{ plan, user_prompt, client_version, dry_run?, confirmed?, rejected_by_user? }` | `{ ok, result, rows_affected, audit_id, sql_preview, error? }` | `Bearer <supabase_jwt>`         |
| Edge `plan-intent` → Edge `schema-summary`      | invocación interna (Deno) | `{ if_hash? }`                                              | `{ markdown, schema_hash, generated_at }`                     | `service_role` env (intra-Supabase) |
| Edge `plan-intent` → Gemini API                 | HTTPS     | `{ system, user, tools:[execute_plan] }`                                  | `{ functionCall: { name, args: PlanJSON } }`                  | `x-goog-api-key` (env Edge)         |
| Edge `execute-plan` → Postgres                  | TCP/TLS   | SQL parametrizado + valores                                              | rows / rowsAffected / error                                   | `service_role` env (M1) / executor M2 |
| Edge `plan-intent` → `orion_audit`              | TCP/TLS   | INSERT (`fase=plan-intent`)                                              | id                                                            | `service_role` env                  |
| Edge `execute-plan` → `orion_audit`             | TCP/TLS   | INSERT (pending) + UPDATE (resultado/error)                              | id                                                            | `service_role` env                  |
| PWA → Web Speech Synth. (TTS)                   | JS API    | string                                                                   | audio (out speakers)                                          | N/A                                 |

**Observaciones críticas.**

- **Ninguna llamada de cliente lleva `service_role` ni Gemini API key.** El
  cliente sólo presenta `Bearer <supabase_jwt>` (token de sesión Supabase
  Auth, rotado por el SDK). `service_role` y `GEMINI_API_KEY` son **env
  vars** de las Edge Functions, accesibles únicamente desde `Deno.env`.
- La frontera **`plan-intent` → Gemini** transporta el schema-summary. Si
  la base de datos del usuario tiene tablas con datos sensibles en el
  nombre, esos nombres viajan a Google. Mitigación M1: allowlist
  server-side `ORION_ALLOWED_TABLES` filtra qué tablas aparecen en el
  summary.
- La frontera **PWA → Edge** es la única vía a Postgres. **No** hay
  llamadas directas PWA → Postgres (lo prohíbe la constitución: toda
  ejecución debe pasar por `execute-plan` para auditoría).
- La invocación `plan-intent` → `schema-summary` es **interna** (otra
  Edge en el mismo proyecto Supabase), no atraviesa internet abierto.

---

## 3. Manejo de errores por paso

| Paso                              | Error posible                                  | Comportamiento                                                                                       |
|-----------------------------------|------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Voice Input                       | `no-speech`, `audio-capture`, `not-allowed`    | Mensaje claro es-MX, retry manual. Fallback teclado siempre disponible.                              |
| Supabase Auth (magic link)        | email inválido / mailer caído                  | Mensaje "No pude enviar el link, probá de nuevo en un rato".                                         |
| Supabase Auth (refresh)           | `refresh_token_expired`                        | SDK fuerza re-login con magic link.                                                                  |
| PWA → `plan-intent`               | 401 `invalid_token`                            | Forzar re-login (UI magic link). Sin retry automático.                                               |
| PWA → `plan-intent`               | 403 `forbidden_user`                           | Mensaje: "Cuenta no autorizada para Orion Vox". Sin retry. Audit registró el intento.                |
| Edge `plan-intent` → Gemini       | 429 (rate limit)                               | Backoff exponencial 3 intentos server-side. Si persiste → 502 `gemini_unavailable` al cliente.       |
| Edge `plan-intent` → Gemini       | 5xx / timeout                                  | Backoff exp. 3 intentos. Si persiste → 502 `gemini_unavailable`. Audit registra fallo.               |
| Edge `plan-intent` → Gemini       | 4xx (auth/quota inválida)                      | NO retry. Devuelve 502 `gemini_misconfigured`. Audit registra. Operador revisa env var.              |
| Edge `plan-intent` (post-Gemini)  | Plan JSON malformado (no pasa Zod)             | 422 `plan_invalid` + detalle. Audit registra (`plan_invalid`). PWA muestra "No pude traducir, reformulá". |
| Edge `plan-intent` → `schema-summary` | timeout / error                            | Si hay cache válido (`schema_hash`), continúa con cache. Sino, 503 `schema_unavailable`.            |
| Cliente: validación Plan JSON     | Plan malformado (cliente)                       | Mensaje genérico, no ejecuta `execute-plan`. (Excepcional — server ya validó.)                      |
| PWA → `execute-plan`              | 401 `invalid_token`                             | Re-login. Sin retry.                                                                                 |
| PWA → `execute-plan`              | 403 `forbidden_user`                            | Mensaje cuenta no autorizada.                                                                        |
| Edge `execute-plan`               | 403 `table_not_allowed`                         | Mensaje: "Operación no permitida sobre `<tabla>`". Audit registra.                                   |
| Edge `execute-plan`               | 422 `plan_invalid`                              | Mensaje técnico; usuario reformula. Audit registra.                                                  |
| Edge `execute-plan`               | 403 `operation_blocked` (DROP/TRUNCATE/etc.)    | Mensaje: "Operación no permitida". Audit registra el intento.                                        |
| Edge `execute-plan` → Postgres    | timeout (>10s statement_timeout)                | 504 `pg_timeout` + audit error. PWA muestra "La consulta tardó demasiado".                           |
| Edge `execute-plan` → Postgres    | error semántico (col no existe, FK, etc.)       | 400 `pg_error` + audit. PWA muestra error en español.                                                |
| HTTP Client → Edge                | timeout red (>12s)                              | 1 retry para errores de red puros. Si persiste, "Sin conexión / Edge caído".                         |
| TTS                               | voz no disponible                                | Silencio. Respuesta visual queda. Sin reintento.                                                     |

---

## 4. Latencias esperadas (orientativas, M1)

Mediciones objetivo en hardware target (Cubot KK9, conexión 4G ~20Mbps).

| Paso                                                       | Latencia típica  | Worst-case      | Notas                                              |
|------------------------------------------------------------|------------------|-----------------|----------------------------------------------------|
| Atajo "OK Google" → PWA arrancada                          | 1.0 s            | 2.5 s           | Depende de cold start del SW                       |
| PWA: check sesión Supabase Auth (cache local)              | < 50 ms          | 200 ms          | Lectura `localStorage` + decode JWT exp            |
| Voice Input (final result)                                 | ~1.0 s           | 3.0 s           | Web Speech API, depende de ruido                   |
| **Edge `plan-intent`: validación JWT (`auth.getUser`)**    | ~50 ms           | 200 ms          | Llamada interna a Auth                             |
| **Edge `plan-intent` → `schema-summary` (cached)**         | ~50 ms           | 200 ms          | Cache hit por `schema_hash`                        |
| **Edge `plan-intent` → `schema-summary` (cold)**           | ~500 ms          | 1.5 s           | Lectura `pg_catalog` + render markdown             |
| **Edge `plan-intent` → Gemini API**                        | 1-3 s            | 4 s             | Function calling tiende a tardar más               |
| **Edge `plan-intent`: validación Plan JSON (Zod)**         | ~50 ms           | 150 ms          | Schema chico                                       |
| **Edge `plan-intent` → INSERT `orion_audit`**              | ~50 ms           | 200 ms          | Una fila                                           |
| HTTP PWA ↔ Edge (round trip red por hop)                   | 200 ms           | 800 ms          | LATAM → us-east, conexión 4G                       |
| Modal confirmación (write)                                 | toque humano     | —               | Sin timeout                                        |
| **Edge `execute-plan`: validación (JWT + Plan + allowlist)** | ~50 ms         | 200 ms          | JWT + Zod + lookup env var                         |
| **Edge `execute-plan` → Postgres (SELECT chico, LIMIT 100)** | ~50-500 ms     | 2 s             | Depende de query                                   |
| **Edge `execute-plan` → Postgres (INSERT/UPDATE chico)**   | ~50 ms           | 500 ms          |                                                    |
| **Edge `execute-plan` → UPDATE `orion_audit`**             | ~50 ms           | 200 ms          |                                                    |
| TTS (string típico < 200 chars)                            | ~1.0 s           | 2.0 s           | Síntesis local                                     |
| **Total READ end-to-end**                                  | **~3-6 s**       | **~13 s**       | (1 voz + 1 plan-intent + 1 execute-plan + TTS)     |
| **Total WRITE end-to-end (sin pausa modal)**               | **~4-7 s**       | **~14 s**       | + tiempo del usuario tappeando "OK"                |

**Implicaciones.**

- READ debe sentirse fluido (~3-6s de "habla → escuchá respuesta"). Si
  excede 10s consistentemente, hay que investigar (Gemini, red, Edge
  cold start, schema-summary cold).
- WRITE incluye pausa humana en el modal — la latencia total es
  inherentemente más alta y eso es **deseable** (la pausa es la
  feature, no el bug — `CONSTITUTION.md` principio 5).
- El doble hop PWA → `plan-intent` → `execute-plan` agrega ~400ms de
  red vs un único hop. Aceptado: es el costo de tener Gemini y
  validación de identidad server-side.
- Si Gemini API supera consistentemente 4s, evaluar en M3 alternativas
  (Gemini Flash más nuevo, modelos locales, etc.).
- Cold start de Edge Function (~100-300ms) sólo afecta la primera
  invocación post-deploy; luego el isolate queda caliente.
