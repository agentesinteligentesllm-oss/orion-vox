---
title: Modelo de seguridad — M1 y M2
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - PLAN-JSON-CONTRACT.md
  - AUDIT-MODEL.md
  - ../00-constitution/CONSTITUTION.md
  - ../04-specs/spec-auth-flow.md
  - ../04-specs/spec-plan-intent-edge.md
  - ../04-specs/spec-execute-plan-edge.md
  - ../04-specs/spec-schema-summary-edge.md
---

# Modelo de seguridad

Orion Vox cae **deliberadamente** en el patrón "lethal trifecta" (LLM con
acceso a herramientas + entrada de usuario + datos sensibles). Este
documento describe cómo ese riesgo se mitiga por milestone, qué se
acepta como deuda en M1, y qué nunca se acepta.

> **Reforma de seguridad M1 (2026-05-01).** Tras el round de auditoría
> Claude↔Codex, M1 se reformuló para nacer **defendible**: el
> `service_role` y la `Gemini API key` **nunca** viven en cliente; la
> auth se hace con Supabase Auth + JWT validado contra
> `ORION_ALLOWED_USER_ID` server-side; la allowlist de tablas vive en
> env var `ORION_ALLOWED_TABLES` server-side; y existe una nueva Edge
> Function `plan-intent` que custodia la Gemini key y proxy-ea las
> llamadas. M2 pasa a ser únicamente "calidad de vida + rol Postgres
> dedicado".

---

## 1. Modelo de seguridad por milestone — vista comparativa

| Decisión                                | M1 (defendible)                                                       | M2 (endurecido)                                                    |
|-----------------------------------------|-----------------------------------------------------------------------|--------------------------------------------------------------------|
| Rol Postgres                            | `service_role` en env var de Edge Functions (NO en cliente)            | `orion_vox_executor` dedicado, grants mínimos, sin DDL             |
| RLS                                     | Bypaseada (justificable: `service_role` server-side, single user)      | Estricta donde aplique                                             |
| Gemini API key                          | **Server-side**, en env var de Edge Function `plan-intent`             | Igual (M1 ya nace defendible)                                      |
| Supabase `service_role`                 | **Solo en env var de Edge Functions, NO en cliente, NO enviada por cliente** | Reemplazado por `orion_vox_executor`                          |
| Auth de la PWA                          | **Supabase Auth + JWT** validado server-side contra `ORION_ALLOWED_USER_ID` | Igual                                                          |
| Confirmación de writes                  | Client-side (modal en PWA)                                             | Preview firmado server-side con `preview_id`                       |
| Schema summary                          | Edge `schema-summary` con allowlist server-side via env var            | Igual + UI admin protegida para editar la allowlist                |
| Allowlist de tablas                     | Env var `ORION_ALLOWED_TABLES` server-side (NO editable desde PWA)     | UI admin protegida + audit de cambios                              |
| Auditoría                               | Server-side, append-only                                               | Server-side, append-only + UI auditoría en PWA                     |
| Operaciones bloqueadas                  | Hardcoded en Edge Function                                             | Hardcoded + grants Postgres no permiten DDL                        |
| `statement_timeout`                     | 10s forzado en sesión                                                  | 10s forzado + límites por rol                                      |
| `LIMIT` en selects                      | Default 100, max 1000 (en query builder)                               | Default 100, max 1000 + límites por grant                          |
| Redacción de datos sensibles            | Lista hardcoded + env var `ORION_REDACTED_COLUMNS`                     | UI para gestionar lista                                            |

---

## 2. M1 — Modelo "defendible desde día 1"

M1 es el MVP funcional, **pero ya defendible**. Lo único que queda como
deuda M2 son: rol Postgres dedicado, preview HMAC firmado, UI nativa
de auditoría y UI admin para allowlist.

**Decisiones M1.**

- **`service_role` solo en env var de Edge Functions.** **NO** vive en
  cliente, **NO** se envía por cliente, **NO** aparece en el bundle
  PWA. La PWA autentica con su JWT Supabase Auth; las Edge Functions
  leen `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` internamente cuando
  necesitan privilegios sobre Postgres.
- **Gemini API key solo en env var de Edge Function `plan-intent`.**
  La PWA **no** habla con Gemini directamente. Llama a `plan-intent`
  con su JWT; `plan-intent` valida user, llama Gemini server-side,
  devuelve Plan JSON. Detalles en `spec-plan-intent-edge.md`.
- **Auth = Supabase Auth + JWT.** La PWA hace login con magic link;
  obtiene sesión Supabase. Cada call a Edge va con
  `Authorization: Bearer <supabase_jwt>`. Las Edge validan el JWT
  con `auth.getUser(token)` y verifican
  `user.id == Deno.env.get('ORION_ALLOWED_USER_ID')`. Si no matchea,
  403 `forbidden_user`. Detalles en `spec-auth-flow.md`.
- **Allowlist de tablas server-side via env var.** La env var
  `ORION_ALLOWED_TABLES` define qué tablas son visibles para Gemini
  (vía `schema-summary`) y qué tablas pueden tocarse (vía
  `execute-plan`). **No** se puede editar desde la PWA: un cliente
  comprometido no puede ampliar el alcance del LLM ni del executor.
- **Confirmación táctil client-side** — el modal en la PWA es el gate
  para writes. La Edge `execute-plan` recibe `confirmed: true` en el
  body; no hay cross-check criptográfico en M1. Es la única deuda de
  seguridad del flujo de write que persiste a M2 (preview HMAC
  firmado).
- **Auditoría server-side desde día 1** — `orion_audit` es la fuente
  de verdad. Tanto `plan-intent` (intento) como `execute-plan`
  (ejecución) loguean. **Innegociable**.
- **Operaciones bloqueadas hardcoded** en `execute-plan` (DROP,
  TRUNCATE, ALTER, CREATE, GRANT, REVOKE, COPY, DO, multi-statement).
  Lista cubierta por tests.
- **Plan JSON estructurado** validado contra Zod en cliente y server.
  No hay path para SQL libre.
- **Schema summary autogenerado** server-side por `schema-summary`
  Edge, filtrado por `ORION_ALLOWED_TABLES`. Refresh del cliente vía
  cache TTL.
- **Redacción de columnas sensibles** server-side antes de devolver al
  cliente y antes de loguear (ver §7).

---

## 3. M2 — Modelo "endurecido"

M2 paga la deuda de seguridad **restante** de M1 y agrega calidad de
vida para operación.

**Decisiones M2.**

- **Rol Postgres dedicado `orion_vox_executor`** con grants mínimos:
  `SELECT, INSERT, UPDATE, DELETE` solo sobre las tablas allowlisted.
  Sin `DROP`, sin `ALTER`, sin `CREATE`, sin `TRUNCATE`. Sin
  `BYPASSRLS`. `statement_timeout = 10s` forzado vía `ALTER ROLE …
  SET statement_timeout = …`. Reemplaza al `service_role` en
  `execute-plan`. (`schema-summary` y `plan-intent` siguen usando un
  rol con permisos de lectura sobre `pg_catalog` /
  `information_schema`).
- **Preview firmado server-side**: el flujo de write se vuelve dos
  fases:
  1. PWA llama `plan-intent`, obtiene Plan JSON + `preview_id` (HMAC
     del plan + timestamp + nonce, firmado por la Edge).
  2. Usuario confirma en la PWA.
  3. PWA llama `execute-plan` con `{ plan_json, preview_id, user_sig }`.
  4. Edge verifica HMAC + ventana temporal (ej: 60s). Si no matchea,
     rechaza.
  Esto cierra la deuda TD-003 (única de seguridad que queda M1→M2).
- **UI admin protegida para allowlist**: la lista de tablas
  permitidas se gestiona desde una pantalla admin de la PWA, con
  re-login Supabase + audit de cambios en `orion_audit`. La env var
  `ORION_ALLOWED_TABLES` queda como fallback inicial.
- **RLS estricta** donde aplique. Como single-user no necesitamos RLS
  por `user_id`, pero sí podemos restringir tablas internas
  (`orion_audit`, configuración) a roles específicos.
- **UI de auditoría** en la PWA: pantalla con filtros (fecha,
  operación, tabla, error) que lee directo `orion_audit`.
- **UI para gestionar `ORION_REDACTED_COLUMNS`** (lista de columnas
  sensibles a redactar antes de devolver al cliente o loguear).

---

## 4. Riesgos aceptados en M1 (deuda explícita)

Documentados acá para que estén visibles. Tras la reforma quedan
**pocos** items.

| Riesgo                                                          | Mitigación parcial M1                              | Pago en M2                              |
|-----------------------------------------------------------------|----------------------------------------------------|-----------------------------------------|
| `service_role` con bypass RLS en `execute-plan`                 | Vive solo en env var server, nunca en cliente      | Rol dedicado `orion_vox_executor` sin BYPASSRLS |
| Confirmación client-side puede ser saltada por código malicioso | Modal + validación server-side de operaciones      | Preview firmado HMAC server-side        |
| RLS deshabilitada en `orion_audit`                              | Tabla no expuesta directo a cliente; lecturas vía `service_role` server | RLS estricta + roles diferenciados |

**Riesgos eliminados por la reforma (ya NO son deuda):**

- ~~`service_role` en cliente (cifrado)~~ → vive solo server-side.
- ~~Gemini key en cliente (cifrado)~~ → vive solo server-side en
  `plan-intent`.
- ~~Auth con `anon_key`~~ → reemplazado por Supabase Auth + JWT +
  `ORION_ALLOWED_USER_ID`.
- ~~Schema-summary embebido manual~~ → Edge `schema-summary` autogen
  con allowlist server-side.
- ~~Allowlist exclusiones desde cliente~~ → `ORION_ALLOWED_TABLES`
  server-side.

---

## 5. Riesgos NUNCA aceptados (innegociables)

Estos NO son deuda; nunca pueden estar en ningún milestone.

- **`service_role` en el cliente, en cualquier forma** — ni cifrado,
  ni plaintext, ni en bundle, ni en header saliente del cliente.
  Vive solo en env var de Edge Functions.
- **Gemini API key en el cliente, en cualquier forma** — ídem. Vive
  solo en env var de `plan-intent`.
- **`anon_key` como mecanismo de autenticación** — la `anon_key` es
  pública por diseño y no identifica a nadie. La auth real es
  Supabase Auth + JWT validado contra `ORION_ALLOWED_USER_ID`.
- **SQL libre desde Gemini al server** — el contrato es Plan JSON,
  punto. Si alguien quiere agregar un campo `raw_sql`, eso requiere
  ADR de suspensión del principio constitucional 2.
- **Multi-statement** — un Plan JSON nunca debe traducirse a múltiples
  sentencias separadas por `;`. La Edge Function rechaza
  incondicionalmente cualquier intento.
- **DDL en runtime** — DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE,
  COPY, DO. Nunca. Las migraciones se hacen por fuera de Orion Vox
  (psql, Supabase CLI, dashboard).
- **Allowlist editable desde la PWA en M1** — la env var
  `ORION_ALLOWED_TABLES` se cambia en Supabase dashboard (fuera del
  alcance de un cliente comprometido). M2 puede agregar UI admin con
  re-login + audit, pero la env var sigue siendo el fallback.
- **Auditoría client-side como única fuente** — el espejo cliente es
  conveniencia; la fuente de verdad es server.
- **Ejecución sin auditoría** — si por algún motivo `orion_audit` no
  acepta el INSERT, la operación se aborta. Sin audit, no hay
  ejecución.

---

## 6. Lethal trifecta — análisis explícito

El "lethal trifecta" combina:

- **(a)** un LLM con acceso a herramientas (Gemini con function
  calling),
- **(b)** entrada controlada por usuario o contenido externo (la voz
  del usuario, transcrita),
- **(c)** acceso a datos sensibles o capacidad de mutarlos (Postgres
  del usuario).

Orion Vox tiene los tres. La mitigación NO es eliminar uno (eso mataría
el producto). Es:

| Vector                                              | Mitigación M1                                            |
|-----------------------------------------------------|----------------------------------------------------------|
| Gemini ejecuta operación destructiva alucinada      | Confirmación táctil obligatoria para writes              |
| Gemini ejecuta operación legítima pero sobre tabla equivocada | Schema-summary acotado por allowlist server-side + el usuario ve el preview |
| Gemini intenta tabla fuera de allowlist             | `execute-plan` rechaza con 403 `table_not_allowed` (defensa en profundidad) |
| Gemini intenta DDL                                  | Rechazo hardcoded en Edge Function (cubierto por tests)  |
| Gemini intenta SQL libre                            | No puede: function calling restringe a Plan JSON         |
| Gemini envenenado por prompt injection vía datos    | Plan JSON limita superficie; auditoría detecta patrones; redacción de columnas sensibles antes de devolver |
| Cliente comprometido inyecta Plan JSON malicioso    | Validación server-side; allowlist server-side; en M2 preview firmado |
| Cliente comprometido intenta usar la sesión robada para abusar de la cuota Gemini | `plan-intent` valida JWT + `ORION_ALLOWED_USER_ID` por request |

**Sin terceros que escriban data en la base** — la PWA no acepta
contenido externo no controlado por el usuario que termine como
contexto del LLM. Esto reduce significativamente el vector de prompt
injection vía contenido envenenado.

---

## 7. Política de redacción de datos sensibles

Para evitar exfiltrar secretos de la propia base del director (hashes,
tokens, API keys almacenados en columnas de aplicación), las Edge
Functions aplican **redacción server-side** antes de devolver al cliente
y antes de loguear en `orion_audit`.

### 7.1 Mecanismo

Variable de entorno server-side:

```
ORION_REDACTED_COLUMNS=password,password_hash,token,api_key,secret,refresh_token,access_token
```

(Lista por defecto. El director puede ampliar en su deploy.)

`execute-plan` y `plan-intent`, antes de:

- Devolver `result` al cliente.
- Escribir `result_summary` en `orion_audit`.

reemplazan los valores de cualquier columna cuyo nombre matchee
(case-insensitive, exact-match) la lista, por la string `"[REDACTED]"`.

La lista matchea por **nombre de columna**, no por contenido. Es
suficiente para columnas convencionalmente nombradas; no detecta un
campo `notas` con contenido sensible.

### 7.2 Aplicación por superficie

| Superficie                                    | Redacción aplicada                                    |
|-----------------------------------------------|-------------------------------------------------------|
| `execute-plan.result` (devuelto al cliente)   | Sí, sobre filas devueltas en SELECT                   |
| `orion_audit.result_summary`                  | Sí, sobre el snapshot de filas afectadas/leídas       |
| `orion_audit.user_prompt`                     | No (es lo que dijo el director; no es output)         |
| `orion_audit.plan_json`                       | No, EXCEPTO valores parametrizados que matcheen una columna sensible (`update users set password = $1`: el `$1` se redacta en `sql_params`) |
| `orion_audit.sql_executed`                    | No (no contiene valores; los valores van en `sql_params`) |
| `orion_audit.sql_params`                      | Sí, posicional: si el param se asocia a una columna sensible (`set password = $1`), `params[0] = '[REDACTED]'` |
| Respuesta TTS al usuario                      | Sí: si la PWA va a leer en voz alta el resultado, sustituye valores `[REDACTED]` y opcionalmente skip de la columna ("…y otros campos sensibles ocultados") |
| Preview SQL en modal de confirmación          | Sí, si el valor parametrizado matchea por columna     |

### 7.3 M1 vs M2

- **M1**: lista hardcoded como default + override via env var
  `ORION_REDACTED_COLUMNS`. Cambios requieren redeploy de Edge.
- **M2**: UI en la PWA (admin protegido) para gestionar la lista
  con audit de cambios. La env var sigue como fallback inicial.

### 7.4 Limitaciones aceptadas

- No hay detección por contenido (no se reconoce un JWT en una columna
  `notas`).
- No hay redacción transitiva (si una columna `audit_log` contiene
  valores que vienen de otra columna sensible, no se reemplazan).
- M3 podría agregar detección por patrón (regex de prefijos típicos:
  `eyJ` para JWT, `AIza` para Google keys, etc.) pero no es M1/M2.

---

## 8. Notas para producción

> **ADVERTENCIA.** Este sistema tras la reforma M1 es defendible para
> exploración personal sobre la propia base Supabase del director,
> incluso con datos sensibles del propio negocio del director. **No
> está diseñado para Supabase compartido con datos sensibles de
> terceros** hasta haber completado M2 (rol dedicado + preview HMAC).
>
> Casos OK para M1:
>
> - Base personal del director con datos propios (incluye PII propia).
> - Base de un negocio con un único operador (el director) y datos
>   propios del negocio.
>
> Casos NO OK para M1 (esperar M2):
>
> - Bases con datos PII de terceros (clientes, usuarios) regulados
>   (GDPR, HIPAA, datos de menores, financieros regulados).
> - Bases compartidas con otros operadores humanos que no son el
>   director.
> - Bases productivas críticas donde un bug en `execute-plan` no es
>   tolerable (esperar al rol dedicado de M2 que limita el blast
>   radius por grants).
>
> Si necesitás operar sobre una base sensible de terceros antes de M2:
>
> - Usá Orion Vox sobre una réplica read-only.
> - O ajustá la `ORION_ALLOWED_TABLES` para que sólo cubra tablas
>   no-PII.
> - O configurá `execute-plan` en modo solo lectura (toggle global o
>   `operation: 'select'` único).
