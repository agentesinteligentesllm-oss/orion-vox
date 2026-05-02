---
title: Deuda técnica — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./ROADMAP.md
  - ./M1-MVP.md
  - ./M2-HARDENING.md
  - ../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
  - ../03-adr/ADR-008-server-side-audit-from-m1.md
  - ../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../03-adr/ADR-010-schema-autogeneration.md
  - ../01-product/USER-STORIES.md
  - ../02-architecture/SECURITY-MODEL.md
---

# Deuda técnica — Orion Vox

Lista viva de la deuda técnica del proyecto. Cada item tiene un ID
estable, descripción concreta, milestone donde se contrae, milestone
donde se paga, estado actual y links a ADRs y US relacionados.

> **Esta lista es autoritativa.** Si una deuda existe en el código y
> no está acá, el proceso falló. Si una deuda está acá y ya no existe
> en el código, su estado debe ser `cerrada` con la fecha de cierre.

> **Reforma de seguridad M1 (2026-05-01).** Tras el round de auditoría
> Claude↔Codex, la arquitectura de seguridad de M1 se reformó: el
> `service_role` y la Gemini key salen del cliente (vivían cifradas) y
> pasan a env vars server-side; auth pasa a Supabase Auth + JWT +
> `ORION_ALLOWED_USER_ID`; allowlist de tablas pasa a env var
> server-side; nace la Edge `plan-intent`. Esto **resuelve TD-001,
> TD-002, TD-006 y TD-007** desde M1. La deuda restante M1→M2 son
> TD-003, TD-004 (reformulada) y TD-005.

---

## Reglas de actualización

- **Agregar entrada al detectar deuda nueva**: cualquier developer /
  agente del tribunal que detecte deuda durante implementación o
  revisión la registra acá con un nuevo ID `TD-NNN` correlativo.
- **Marcar como `cerrada` al pagar**: cuando una deuda se cierra
  (típicamente al cerrar el milestone que la paga), se actualiza el
  estado a `cerrada`, se completa la fecha de cierre y se anota el
  PR / commit que la resolvió.
- **No borrar entradas cerradas**: la trazabilidad histórica importa.
  Las entradas cerradas se mantienen con estado `cerrada`.
- **Revisar al cerrar cada milestone**: el cierre de M1 debe
  confirmar que toda la deuda M1 está acá; el cierre de M2 debe
  confirmar que toda la deuda M1 está `cerrada`.

Estados posibles: `abierta` | `en-progreso` | `cerrada` |
`reclasificada` | `resuelta-en-m1`.

---

## Deuda contraída en M1 (paga M2)

### TD-001 — `service_role` en cliente

- **Descripción original**: la PWA cifraba el `service_role` en
  IndexedDB (AES-GCM + PBKDF2) para autenticarse contra la Edge
  `execute-plan`. Aunque cifrado, vivía en el dispositivo.
- **Contraída en**: M1.
- **Estado**: `resuelta-en-m1`.
- **Fecha de cierre**: 2026-05-01 (resolución por reforma de
  seguridad M1).
- **Cómo se resolvió**: el `service_role` **nunca** vive en cliente.
  Vive solo en env var `SUPABASE_SERVICE_ROLE_KEY` de las Edge
  Functions. La PWA autentica con JWT Supabase Auth + validación
  `ORION_ALLOWED_USER_ID` server-side. Ver `SECURITY-MODEL.md` §1.
- **ADR**: [ADR-004](../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md)
  (rol dedicado `orion_vox_executor` sigue siendo deuda M2 — ver
  TD-001-bis abajo).

### TD-001-bis — `service_role` con BYPASSRLS en `execute-plan`

- **Descripción**: la Edge `execute-plan` ejecuta SQL con
  `service_role`, que tiene `BYPASSRLS` y privilegios totales. Si
  un bug en validación deja pasar una operación, el blast radius es
  máximo.
- **Contraída en**: M1.
- **Pagada en**: M2 (módulo M2-02).
- **Estado**: `abierta`.
- **Fecha de cierre**: —
- **Plan de pago**: crear rol Postgres dedicado `orion_vox_executor`
  con grants mínimos por tabla / operación según
  `ORION_ALLOWED_TABLES`. Sin `BYPASSRLS`, sin DDL.
- **ADR**: [ADR-004](../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md).
- **US relacionada**: ninguna directa (deuda interna).

### TD-002 — Gemini API key cifrada en cliente

- **Descripción original**: la Gemini API key vivía cifrada en
  IndexedDB de la PWA. Cualquier malware o XSS con la sesión
  desbloqueada podía exfiltrarla y consumir cuota.
- **Contraída en**: M1.
- **Estado**: `resuelta-en-m1`.
- **Fecha de cierre**: 2026-05-01 (resolución por reforma de
  seguridad M1).
- **Cómo se resolvió**: la Gemini API key vive solo en env var
  `GEMINI_API_KEY` de la Edge Function `plan-intent`. La PWA llama
  `plan-intent` con su JWT, la Edge custodia la key y proxy-ea las
  llamadas a Gemini. Ver `spec-plan-intent-edge.md` y ADR-005
  (reescrito 2026-05-01).
- **ADR**: [ADR-005](../03-adr/ADR-005-gemini-key-client-m1-server-m2.md)
  (reescrito).
- **US relacionada**: US-CFG-02.

### TD-003 — Confirmación táctil sin preview firmado

- **Descripción**: el modal de confirmación arma el preview SQL
  client-side a partir del Plan JSON y manda a `execute-plan` con
  un flag `confirmed: true`. Hay una ventana de TOCTOU (time of
  check to time of use): un atacante con control del cliente puede
  mostrar un preview "inocente" y enviar otro plan al servidor.
- **Contraída en**: M1.
- **Pagada en**: M2 (módulo M2-03).
- **Estado**: `abierta`.
- **Fecha de cierre**: —
- **Plan de pago**: el flujo se parte en dos pasos. (1) PWA pide
  preview a `plan-intent`, que devuelve `preview_id` + payload firmado
  HMAC. (2) Modal muestra el preview, usuario confirma, y la PWA
  envía el `preview_id` firmado a `execute-plan`, que valida la firma
  y ejecuta exactamente el plan firmado.
- **ADR**: ninguno específico (se documentará un ADR-013 al iniciar
  M2).
- **US relacionada**: US-SEC-01, US-SEC-02.

### TD-004 — Allowlist de tablas vía env var (sin UI admin)

- **Descripción original**: el `schema-summary` se mantenía a mano
  embebido en el bundle.
- **Reformulación M1**: gracias a la reforma de seguridad, el
  `schema-summary` ya es autogenerado server-side desde día 1, con
  allowlist server-side via env var `ORION_ALLOWED_TABLES`. La
  deuda residual es **operativa**: cambiar la allowlist requiere
  acceso al dashboard Supabase para editar la env var; no hay UI
  admin in-app con audit de cambios.
- **Contraída en**: M1.
- **Pagada en**: M2 (módulo M2-04).
- **Estado**: `abierta`.
- **Fecha de cierre**: —
- **Plan de pago**: UI admin protegida en la PWA con re-login
  Supabase + audit de cambios en `orion_audit`. La env var sigue
  como fallback inicial. Misma UX para
  `ORION_REDACTED_COLUMNS`.
- **ADR**: [ADR-010](../03-adr/ADR-010-schema-autogeneration.md).
- **US relacionada**: US-CFG-04, US-CFG-05, US-CFG-06, US-MNT-01.

### TD-005 — RLS deshabilitada en `orion_audit`

- **Descripción**: en M1 la tabla `orion_audit` tiene RLS
  deshabilitada para simplificar el flujo (la inserción la hace
  `service_role` que la bypasaría igual). Sin RLS y sin auth
  granular, cualquier rol con permiso de SELECT sobre la tabla
  podría leer todo el log.
- **Contraída en**: M1.
- **Pagada en**: M2 (módulo M2-05).
- **Estado**: `abierta`.
- **Fecha de cierre**: —
- **Plan de pago**: habilitar RLS en `orion_audit` con políticas
  que permitan SELECT solo al rol del director (autenticado vía
  JWT) e INSERT solo al rol que ejecuta `execute-plan`. Tests
  demostrando que un rol distinto no puede leer.
- **ADR**: [ADR-008](../03-adr/ADR-008-server-side-audit-from-m1.md)
  (la auditoría existe desde M1, RLS estricta es la deuda).
- **US relacionada**: US-AUD-01.

### TD-006 — Sin JWT del usuario, auth con `anon key`

- **Descripción original**: la PWA llamaba a las Edge Functions con
  `anon key` (o `service_role` cifrado en cliente). No había
  identificación real del usuario.
- **Contraída en**: M1.
- **Estado**: `resuelta-en-m1`.
- **Fecha de cierre**: 2026-05-01 (resolución por reforma de
  seguridad M1).
- **Cómo se resolvió**: Supabase Auth con magic link desde día 1.
  Cada call a Edge va con `Authorization: Bearer <supabase_jwt>`.
  Las Edge validan JWT vía `auth.getUser` y verifican
  `user.id == ORION_ALLOWED_USER_ID` (env var server-side). Ver
  `spec-auth-flow.md`.
- **ADR**: ninguno específico (se cubre con `spec-auth-flow.md`; un
  ADR-014 puede crearse si emerge una decisión adicional).
- **US relacionada**: ninguna directa (es plomería de seguridad).

### TD-007 — Sin separación `plan-intent` / `execute-plan`

- **Descripción original**: M1 tenía una sola Edge Function
  `execute-plan`. La llamada a Gemini vivía en cliente, sin capa
  server-side intermedia.
- **Contraída en**: M1.
- **Estado**: `resuelta-en-m1`.
- **Fecha de cierre**: 2026-05-01 (resolución por reforma de
  seguridad M1).
- **Cómo se resolvió**: nace la Edge `plan-intent` desde M1 (ver
  `spec-plan-intent-edge.md`). La PWA habla con `plan-intent`
  (frase + JWT → Plan JSON | Clarification) y luego con
  `execute-plan` (Plan JSON → ejecución). La Gemini key vive solo
  server-side en `plan-intent`.
- **ADR**: deriva de [ADR-005](../03-adr/ADR-005-gemini-key-client-m1-server-m2.md)
  (reescrito).
- **US relacionada**: ninguna directa.

---

### TD-008 — Sin retry inteligente para Plan JSON inválido del LLM

- **Descripción**: si Gemini devuelve un `function_call` con argumentos
  que fallan validación Zod (schema incorrecto, campo faltante, op
  desconocida), `plan-intent` retorna 502 `invalid_plan_from_llm` sin
  ningún mecanismo de auto-corrección. El usuario debe reformular o
  reintentar manualmente.
- **Contraída en**: M1.
- **Pagada en**: M2.
- **Estado**: `abierta`.
- **Fecha de cierre**: —
- **Plan de pago**: M2 agrega un retry (máximo 1 vez) en `plan-intent`:
  si el primer llamado a Gemini produce un plan inválido, se reenvía
  el llamado incluyendo el error Zod serializado en el contexto
  (`user` message con el JSON inválido + el mensaje de error) para
  que Gemini pueda auto-corregir. Si el segundo intento también falla,
  retorna 502 al cliente.
- **ADR**: ninguno (decisión de implementación B1 aceptada para M1).
- **US relacionada**: ninguna directa (resiliencia UX).

---

## Deuda contraída en M2 (paga M3 o más adelante)

> Ningún item registrado todavía. Se agregarán durante el desarrollo
> de M2 si aparecen.

---

## Deuda histórica cerrada

> Ningún item cerrado todavía. M1 está en curso. Las entradas con
> estado `resuelta-en-m1` (TD-001, TD-002, TD-006, TD-007) se cerrarán
> formalmente con el commit que implemente la reforma de seguridad
> según los specs actualizados.

---

## Cross-reference rápido

| ID         | Resumen                                         | ADR              | US                  | Estado            | Cierre |
|------------|-------------------------------------------------|------------------|---------------------|-------------------|--------|
| TD-001     | service_role cifrado en cliente                 | ADR-004          | —                   | resuelta-en-m1    | 2026-05-01 |
| TD-001-bis | service_role con BYPASSRLS en `execute-plan`    | ADR-004          | —                   | abierta           | M2 |
| TD-002     | Gemini key cifrada en cliente                   | ADR-005          | US-CFG-02           | resuelta-en-m1    | 2026-05-01 |
| TD-003     | Confirmación sin preview firmado                | (ADR-013)        | US-SEC-01,02        | abierta           | M2 |
| TD-004     | Allowlist via env var (sin UI admin)            | ADR-010          | US-CFG-04,05,06     | abierta           | M2 |
| TD-005     | RLS off en `orion_audit`                        | ADR-008          | US-AUD-01           | abierta           | M2 |
| TD-006     | Sin JWT del usuario (anon key)                  | (resuelto)       | —                   | resuelta-en-m1    | 2026-05-01 |
| TD-007     | Sin split plan-intent / execute-plan            | ADR-005          | —                   | resuelta-en-m1    | 2026-05-01 |
| TD-008     | Sin retry para Plan JSON inválido del LLM       | —                | —                   | abierta           | M2 |

**Deuda M1 que efectivamente cruza a M2**: TD-001-bis, TD-003, TD-004,
TD-005, TD-008. Cinco items, todos contenidos y con plan de pago claro.

---

## Cláusula de cierre

> Esta lista no es retórica. El cierre del milestone M2 está
> bloqueado hasta que cada item M1 con estado `abierta` o
> `en-progreso` acá esté `cerrada` con fecha y commit. Sin esa
> trazabilidad, M3 no abre. Es la mecánica constitucional del
> proyecto (ADR-009).
