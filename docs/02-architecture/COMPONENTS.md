---
title: Componentes del sistema
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - DATA-FLOW.md
  - SECURITY-MODEL.md
  - PLAN-JSON-CONTRACT.md
  - AUDIT-MODEL.md
---

# Componentes del sistema

Detalle por componente: propósito, responsabilidades, dependencias,
interfaces y decisiones de diseño. Si un componente cambia, se actualiza
acá y se refleja en `OVERVIEW.md` y, si tiene impacto contractual, en
`PLAN-JSON-CONTRACT.md`.

---

## 1. PWA Shell

**Propósito.** Carcasa de la aplicación: instalable en el Cubot KK9,
ejecuta offline lo posible, gestiona ciclo de vida y entrada por atajo.

**Responsabilidades.**

- Declarar `manifest.webmanifest` con `display: standalone`, `scope`
  acotado, icono y nombre `Orion Vox` (clave para "OK Google, abrí Orion
  Vox").
- Registrar service worker con estrategia cache-first para assets, y
  network-first para llamadas a Edge Functions.
- Inicializar la PWA en el entry point con micrófono pre-armado para
  capturar inmediatamente cuando el usuario llega vía atajo de Gemini
  sistema.
- Manejar instalación (`beforeinstallprompt`) y actualizaciones del SW.

**Dependencias.** Navegador Chromium del Cubot KK9. Service Worker API.
Web App Manifest.

**Interfaces.** Expone una "ruta" raíz `/` que renderiza la UI principal
de Voice Input. Sin routing complejo en M1 (single screen).

**Decisiones de diseño.** No usar Workbox ni librerías de PWA pesadas en
M1: el SW es un script vanilla cortito. Framework concreto pendiente
(`ADR-012`).

---

## 1.b Auth Client (Supabase Auth — sesión PWA)

**Propósito.** Gestionar la sesión Supabase Auth en el dispositivo:
login con magic link, persistencia y refresco automático del JWT,
logout. Tras la reforma de seguridad M1, **el JWT de sesión es la única
credencial que la PWA presenta** a las Edge Functions.

**Responsabilidades.**

- Inicializar `@supabase/supabase-js` con la `SUPABASE_URL` y
  `SUPABASE_ANON_KEY` (ambas públicas — la `anon_key` está pensada para
  cliente).
- Si no hay sesión válida al arrancar, mostrar UI de login con magic
  link (input email + botón "enviarme el link"). El usuario tappea el
  link en su email y la PWA recupera la sesión vía deep link.
- Persistir la sesión en `localStorage` (clave `sb-<project-ref>-auth-token`,
  manejada por el SDK).
- Refrescar el `access_token` automáticamente antes de expirar (el SDK
  lo hace solo). Exponer `getAccessToken()` síncrono para los HTTP
  clients.
- Logout: borrar sesión + `wipeAll()` IndexedDB + redirigir a UI de
  login.
- No hace ninguna validación de autoridad: la única que importa es
  `user.id == ORION_ALLOWED_USER_ID`, que vive server-side en cada Edge.

**Dependencias.** `@supabase/supabase-js` (Auth submódulo).
`localStorage`. Servicio Supabase Auth (GoTrue).

**Interfaces.**

```
   ┌──────────────────────────────────┐
   │ Auth Client                      │
   │   signInWithMagicLink(email)     │
   │   getSession() / getAccessToken()│
   │   onAuthStateChange(cb)          │
   │   signOut()                      │
   └──────────────────────────────────┘
```

**Decisiones de diseño.** Usamos magic link en vez de OAuth porque el
proyecto es single-user y evita registrar un cliente OAuth en Google.
Email del usuario único queda configurado server-side
(`ORION_ALLOWED_USER_ID` apunta al `user.id` que GoTrue genera al
verificar ese email). Detalles en `spec-auth-flow.md`.

---

## 2. Voice Input Module

**Propósito.** Convertir voz del usuario en texto, mostrar feedback
visual de escucha y permitir fallback a teclado.

**Responsabilidades.**

- Inicializar `SpeechRecognition` con `lang = 'es-MX'`, `continuous =
  false`, `interimResults = true` (para feedback en vivo).
- Mostrar indicador visual de estado: idle / escuchando / procesando /
  error. Botón grande, accesible con guantes (Cubot rugged).
- Manejar errores: `no-speech`, `audio-capture`, `not-allowed`,
  `network`. Cada uno con mensaje claro en español.
- Fallback teclado: `<input>` siempre disponible para casos donde STT
  falla o el usuario prefiere escribir.
- Permitir interrumpir captura (botón cancelar).

**Dependencias.** Web Speech API. Permiso de micrófono.

**Interfaces.**

```
            ┌──────────────────────┐
   voz  ──▶ │  Voice Input Module  │ ──▶ texto plano (string es-MX)
            └──────────────────────┘
                       │
            estado UI: idle/listen/process/error
```

**Decisiones de diseño.** No usar ningún SDK de Google Cloud Speech: la
Web Speech API ya manda el audio a Google bajo el capó en Chrome
Android, agregar SDK sería redundante y obligaría a otra API key. La
calidad es "la que da el navegador"; aceptado como tradeoff para M1.

---

## 3. Plan Intent Client (PWA → Edge `plan-intent`)

**Propósito.** Pedir un Plan JSON al servidor. La PWA **no** habla con
Gemini directamente; le habla a la Edge Function `plan-intent` que
custodia la Gemini API key server-side y hace function calling de forma
segura. Tras la reforma de seguridad M1 (ver `SECURITY-MODEL.md` §1),
la Gemini key NUNCA vive en cliente.

**Responsabilidades.**

- Construir POST a `${SUPABASE_URL}/functions/v1/plan-intent` con header
  `Authorization: Bearer ${supabase_jwt}` (token de sesión Supabase
  Auth) y body `{ user_prompt, client_version, conversation_id?,
  hints? }`.
- Timeout total 10s por llamada (Gemini upstream tiene 8s + buffer red).
- Parseo de la respuesta: `{ kind: 'plan' | 'clarification', ... }`.
- Si `kind: 'clarification'`, dispara TTS de la pregunta y espera nuevo
  prompt del usuario.
- Sin reintentos client-side: la Edge ya hace 3 reintentos con backoff
  contra Gemini (`spec-plan-intent-edge.md` §4.5).

**Dependencias.** `fetch` nativo. `@supabase/supabase-js` (para obtener
JWT actual de la sesión).

**Interfaces.**

```
   ┌──────────────────────────────────┐
   │ Plan Intent Client (PWA-side)    │
   │                                  │
   │   in:  text + jwt + hints?       │ ──▶ POST /functions/v1/plan-intent
   │   out: Plan JSON | Clarification │
   └──────────────────────────────────┘
```

**Decisiones de diseño.** Toda la complejidad de function calling
(declaración de tools, parseo de tool calls, validación de respuesta)
vive server-side en `plan-intent`. El cliente sólo pide y consume el
resultado validado. Detalles en `spec-plan-intent-edge.md`.

---

## 4. Plan JSON Validator (cliente)

**Propósito.** Validar el Plan JSON localmente antes de enviarlo a la
Edge Function, para feedback rápido y ahorro de roundtrip.

**Responsabilidades.**

- Validar estructura contra el schema Zod compartido con la Edge
  Function (`PLAN-JSON-CONTRACT.md` define el schema canónico).
- Rechazar plans malformados con mensaje claro en español ("El plan
  tiene una operación no soportada: …").
- **No es autoridad.** La validación server-side se ejecuta siempre,
  haya pasado o no la cliente. Cliente = UX, Server = autoridad.
- Marcar el plan como `read` o `write` para decidir si requiere modal
  de confirmación.

**Dependencias.** Zod (o equivalente). Schema compartido en
`docs/04-specs/plan-json-schema.ts` (cuando se implemente).

**Interfaces.**

```
   Plan JSON ──▶ [ Validator ] ──▶ { valid, kind: 'read'|'write', errors? }
```

**Decisiones de diseño.** Schema **compartido cliente y server**, no
duplicado: la fuente de verdad es un único módulo importado por ambos.
Si el cliente y el server divergen, la consecuencia es 422 desde el
server y mensaje confuso al usuario; por eso es crítico mantener el
schema sincronizado.

---

## 5. Confirmation Modal

**Propósito.** Cumplir el principio constitucional 5: **toque humano
obligatorio para writes**.

**Responsabilidades.**

- Activarse automáticamente cuando el Plan JSON es `insert | update |
  delete`.
- Mostrar: tabla destino, operación textual ("Vas a borrar 3 filas de
  `tareas` donde estado = 'archivada'"), preview del SQL parametrizado
  generado en cliente (informativo; el SQL real se construye server),
  filas estimadas afectadas (vía pre-flight `SELECT count(*)` opcional
  M2).
- Botones: "Confirmar" (grande, claro), "Cancelar". Sin atajos de
  teclado peligrosos (no Enter = confirmar).
- Sin auto-cierre. Sin timeout.
- Si el usuario cancela, registrar en audit local con `was_confirmed =
  false` (la auditoría server-side solo se crea si efectivamente se
  llama a Edge).

**Dependencias.** UI framework PWA. Schema Plan JSON.

**Decisiones de diseño.** El preview SQL es **informativo**, no
contractual: la Edge Function genera su propio SQL parametrizado y es
el que se ejecuta y se loguea en `orion_audit`. Mostrar el SQL al
usuario tiene un costo (ruido visual) pero un valor (transparencia
total) que en M1 elegimos pagar.

---

## 6. HTTP Client → Edge Functions

**Propósito.** Comunicación entre PWA y Supabase Edge Functions
(`plan-intent`, `execute-plan`, `schema-summary`).

**Responsabilidades.**

- Construir `POST` a `${SUPABASE_URL}/functions/v1/<edge>` con header
  `Authorization: Bearer ${supabase_jwt}` en M1 y M2 (el token es la
  sesión Supabase Auth obtenida vía magic link; ver
  `spec-auth-flow.md`).
- Body: JSON específico de cada Edge.
- Timeout 12s (la Edge Function tiene `statement_timeout` 10s + buffer
  red).
- Retries solo para errores de red (no para 4xx / 5xx semánticos del
  server).
- Parseo de respuesta según contrato de cada Edge.
- Si recibe 401 `invalid_token`, fuerza re-login (sesión expirada o
  rota).
- Si recibe 403 `forbidden_user`, muestra error claro: la cuenta no
  está autorizada (`ORION_ALLOWED_USER_ID` mal configurado).

**Dependencias.** `fetch`. `@supabase/supabase-js` (para JWT vigente).
**No** lee `service_role` ni Gemini key — esos secretos viven solo en
env vars server-side.

**Interfaces.**

```
   PWA ──[ POST /functions/v1/execute-plan ]──▶ Edge Function
       ◀────[ { ok, result, audit_id }   ]────
```

**Decisiones de diseño.** No usar el Supabase JS SDK en M1: agrega peso
y abstracciones que no necesitamos. `fetch` directo es suficiente y
deja el contrato HTTP visible. Si en M2 entra OAuth o JWT rotativo, se
revisa.

---

## 7. TTS Output Module

**Propósito.** Sintetizar las respuestas en voz, en español neutro.

**Responsabilidades.**

- Inicializar `SpeechSynthesis` con voz `es-MX` (o `es-AR` si la
  prueba en hardware da mejor resultado, decisión empírica).
- Recibir un string de respuesta y emitirlo como audio.
- Permitir interrumpir (`cancel()`) si el usuario dispara nueva
  consulta.
- Configurable: rate, pitch, volumen (defaults conservadores).
- Fallback texto: si TTS no disponible, mostrar respuesta en pantalla.

**Dependencias.** Web Speech Synthesis API.

**Decisiones de diseño.** TTS no es bloqueante: si falla, la respuesta
visual ya está. No re-intentar.

---

## 8. Local Storage Manager (IndexedDB no cifrado + sesión Supabase)

**Propósito.** Persistir cache de schema, espejo de auditoría y
settings UX. Tras la reforma de seguridad M1, **no hay secretos
client-side que cifrar**: la sesión Supabase Auth es el único token
y la maneja `@supabase/supabase-js`.

**Responsabilidades.**

- Stores IndexedDB (sin cifrado): `schema_cache`, `audit_mirror`,
  `settings`. Detalles en `spec-credentials-storage.md`.
- Sesión Supabase Auth persistida en `localStorage` por el SDK
  (`sb-<project-ref>-auth-token`). El SDK refresca el access_token
  automáticamente.
- `wipeAll()` borra IndexedDB completo al hacer logout.

**Dependencias.** IndexedDB. `@supabase/supabase-js` (sesión).

**Interfaces.**

```
   ┌──────────────────────────────────┐
   │ Local Storage Manager            │
   │   getSchemaCache / put...        │
   │   appendAuditMirror / list...    │
   │   getSetting / putSetting        │
   │   wipeAll                        │
   │ — sin cifrado (no hay secretos)  │
   └──────────────────────────────────┘
```

**Decisiones de diseño.** Tras la reforma de seguridad de M1
(`SECURITY-MODEL.md` §1), Gemini key y `service_role` viven solo en
env vars server-side. Con esos secretos fuera del cliente, no hay
material que justifique el costo de PBKDF2 + AES-GCM ni la UX de
PIN/biometría obligatoria. La sesión Supabase Auth es el único token
y el SDK la rota sola.

---

## 8.b Edge Function `plan-intent`

**Propósito.** Custodiar la `GEMINI_API_KEY` server-side y orquestar
function calling contra Gemini para generar un Plan JSON validado a
partir del prompt del usuario. Es el **único componente** del sistema
que conoce la Gemini API key. Tras la reforma de seguridad M1, esta
Edge es **obligatoria desde el día 1** (no existe el atajo "PWA llama
a Gemini directo").

**Responsabilidades.**

- Recibir POST con header `Authorization: Bearer ${supabase_jwt}` y
  body `{ user_prompt, client_version, conversation_id?, hints? }`.
- Validar JWT vía `auth.getUser` y verificar
  `user.id == ORION_ALLOWED_USER_ID` (env var server). Sino, 403
  `forbidden_user`.
- Invocar internamente a `schema-summary` (cache por `schema_hash` con
  TTL configurable; ver `spec-plan-intent-edge.md` §3).
- Construir el system prompt + schema markdown + declaración de tool
  `execute_plan` (single function call de Gemini).
- POST `generateContent` a Gemini API con `x-goog-api-key` (env var
  `GEMINI_API_KEY`). Reintentos con backoff exponencial (3 intentos)
  para 429 / 5xx.
- Parsear el `functionCall` devuelto por Gemini, extraer el Plan JSON.
- Validar el Plan JSON contra Zod (mismo schema canónico que
  `execute-plan`). Sino, 422 `plan_invalid`.
- Auditar la intención **siempre** en `orion_audit` con
  `was_dry_run=true`, `was_confirmed=false`, `fase='plan-intent'`,
  incluso para errores (`forbidden_user`, `gemini_unavailable`,
  `plan_invalid`).
- Devolver `{ kind: 'plan', plan, audit_id_intent }` o
  `{ kind: 'clarification', question }` si Gemini pidió aclaración en
  vez de devolver Plan.

**Dependencias.** Deno runtime. `fetch` (Gemini). Zod. Schema canónico
Plan JSON. Cliente interno hacia `schema-summary` (vía URL
`http://kong-internal/.../functions/v1/schema-summary` o invocación
directa según runtime de Supabase).

**Interfaces.**

```
   ┌──────────────────────────────────────────────┐
   │  Edge Function: plan-intent                  │
   │                                              │
   │  POST /functions/v1/plan-intent              │
   │   in:  { user_prompt, client_version, ... }  │
   │   out: { kind:'plan', plan, audit_id_intent }│
   │      | { kind:'clarification', question }    │
   │                                              │
   │  env: GEMINI_API_KEY,                        │
   │       SUPABASE_SERVICE_ROLE_KEY,             │
   │       ORION_ALLOWED_USER_ID                  │
   └──────────────────────────────────────────────┘
```

**Decisiones de diseño.** Mantener `plan-intent` y `execute-plan`
**separadas** (en vez de una sola Edge que hace todo) permite: (a)
auditar la intención antes del modal de confirmación; (b) reusar
`execute-plan` para escenarios no-Gemini (replays, scripts, debugging);
(c) escalar y cachear cada Edge por separado. Detalles en
`spec-plan-intent-edge.md`.

---

## 9. Edge Function `execute-plan`

**Propósito.** Validar, traducir, ejecutar y auditar Plans.

**Responsabilidades.**

- Recibir POST con Plan JSON en el body, header
  `Authorization: Bearer ${supabase_jwt}`.
- Validar JWT vía `auth.getUser` y verificar
  `user.id == ORION_ALLOWED_USER_ID` (env var server). Sino, 403
  `forbidden_user`.
- Validar contra Zod (mismo schema que cliente, server es autoridad).
- Validar que `plan.table` y todas las `plan.joins[].table` estén en
  `ORION_ALLOWED_TABLES` (env var server). Sino, 403
  `table_not_allowed`.
- Rechazar **incondicionalmente** (lista hardcoded, cubierta por tests):
  `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `COPY`,
  `DO`, multi-statement (cualquier `;` con segunda sentencia), strings
  con patrones SQL crudos.
- Traducir Plan JSON a SQL parametrizado mediante query builder seguro
  (ej: `pg-promise`, `slonik`, o builder propio). **Nunca** concatenar
  strings con valores del usuario.
- Forzar `statement_timeout = 10s` por sesión.
- Forzar `LIMIT` en selects (default 100, max 1000).
- Crear registro en `orion_audit` **antes** de ejecutar (con
  `result_summary = null`, `error = null`).
- Ejecutar con `service_role` (M1, leído de env var server) o
  `orion_vox_executor` (M2, rol Postgres dedicado).
- Aplicar redacción de columnas sensibles (`ORION_REDACTED_COLUMNS`)
  sobre `result` y `result_summary` antes de devolver / loguear.
- Completar registro de audit con resultado o error.
- Devolver `{ ok, result, audit_id, error? }`.

**Dependencias.** Deno runtime. Postgres driver (Deno-compatible).
Zod. Schema canónico Plan JSON.

**Interfaces.**

```
   ┌──────────────────────────────────────────────┐
   │  Edge Function: execute-plan                 │
   │                                              │
   │  POST /functions/v1/execute-plan             │
   │   in:  { plan_json, user_prompt, schema_h }  │
   │   out: { ok, result, audit_id, error? }      │
   └──────────────────────────────────────────────┘
```

**Decisiones de diseño.** Re-validación server-side **no es opcional**.
La Edge Function asume que el cliente puede ser comprometido o
inconsistente; el contrato lo define el servidor. Tests unitarios para
cada operación bloqueada son obligatorios antes de pasar M1 a estable.

---

## 10. Edge Function `schema-summary`

**Propósito.** Generar el resumen del schema que se inyecta como system
prompt en Gemini.

**Responsabilidades.**

- Leer `pg_catalog.pg_class`, `pg_catalog.pg_attribute`,
  `information_schema.columns`, `information_schema.table_constraints`,
  `information_schema.key_column_usage` para reconstruir tablas,
  columnas, tipos, PKs y FKs.
- Filtrar por allowlist `ORION_ALLOWED_TABLES` (env var server-side
  desde M1). M2 agrega UI admin para editarla con audit.
- Devolver markdown estructurado, ej:

```
  # tareas
  - id (uuid, pk)
  - titulo (text, not null)
  - estado (text)
  - creado_en (timestamptz, default now())
  FK: ninguna
```

- Calcular `schema_hash` (sha256 del markdown) para que el cliente
  detecte cambios.

**Dependencias.** Deno runtime. Postgres driver.

**Interfaces.**

```
   GET /functions/v1/schema-summary
     out: { markdown, schema_hash, generated_at }
```

**Decisiones de diseño.** Tras la reforma de seguridad de M1, esta
función es **obligatoria desde M1** (no más fallback embebido en
bundle). La allowlist vive server-side en `ORION_ALLOWED_TABLES`
desde día 1; el cliente nunca la edita. M2 agrega UI admin protegida
para gestionarla.

---

## 11. Tabla `orion_audit`

**Propósito.** Única fuente de verdad de auditoría server-side.

**Responsabilidades.** Registrar **toda** ejecución (exitosa, fallida,
rechazada por validación) que pasa por `execute-plan`. La PWA mantiene
un espejo cliente, pero la fuente de verdad vive en Postgres.

DDL completo, ciclo de vida, retención y privacidad: ver
`AUDIT-MODEL.md`.
