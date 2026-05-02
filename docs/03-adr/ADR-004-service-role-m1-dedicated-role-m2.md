---
title: "ADR-004: service_role en M1, rol Postgres dedicado en M2"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-003-plan-json-not-sql.md
  - ADR-005-gemini-key-client-m1-server-m2.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-004: service_role en M1, rol Postgres dedicado en M2

## Contexto

La Edge Function `execute-plan` necesita un rol de Postgres con
permisos suficientes para ejecutar las operaciones autorizadas por el
Plan JSON (SELECT, INSERT, UPDATE, DELETE) sobre las tablas relevantes
del proyecto Supabase del usuario. La pregunta de tribunal fue:
**¿desde el día 1 con un rol mínimo dedicado, o aceptar `service_role`
como deuda M1 y endurecer en M2?**

`service_role` en Supabase tiene privilegios totales: bypass de RLS,
acceso a todas las tablas (incluidas tablas internas de Supabase), y
capacidad implícita de DDL si no hay un check upstream. Es la "llave
maestra" del proyecto. Vivir en producción con `service_role` como rol de
ejecución es aceptable mientras existan barreras upstream que limiten qué
SQL se construye (Plan JSON validado, query builder, lista de operaciones
bloqueadas hardcoded — ver ADR-003).

Codex argumentó en round 3 que un rol dedicado debería ser obligatorio
desde día 1: "service_role es incompatible con cualquier postura de
seguridad mínima". Claude propuso desdoblar en dos milestones para
desbloquear M1 sin sacrificar el destino. El usuario aceptó la división.

## Decisión

**M1 — service_role en Edge Function, server-side únicamente.**

- La Edge Function `execute-plan` ejecuta el SQL parametrizado usando la
  `SUPABASE_SERVICE_ROLE_KEY` inyectada como variable de entorno de la
  función (Deno secrets).
- `service_role` **NUNCA** vive en el cliente, ni en localStorage, ni en
  el bundle de la PWA, ni en variables de entorno expuestas al browser.
  Esta restricción es **innegociable** incluso en M1.
- La defensa contra abuso de `service_role` en M1 son las barreras
  upstream:
  - Plan JSON estructurado (ADR-003) — el modelo no puede expresar
    operaciones destructivas.
  - Lista de operaciones bloqueadas hardcoded en la Edge Function
    (Constitución § 4).
  - Confirmación táctil para writes (Constitución § 5).
  - Auditoría server-side desde día 1 (ADR-008).

**M2 — rol Postgres dedicado `orion_vox_executor`.**

- Se crea un rol Postgres dedicado en el proyecto Supabase del usuario,
  llamado `orion_vox_executor`, con:
  - `GRANT` mínimo (`SELECT, INSERT, UPDATE, DELETE`) **sólo** sobre las
    tablas allowlisted del schema operativo del usuario.
  - **Sin** bypass de RLS — RLS aplicada estrictamente donde corresponda.
  - **Sin** ningún privilegio DDL (no CREATE, no ALTER, no DROP, no
    GRANT, no TRUNCATE).
  - `statement_timeout` forzado a un valor conservador (orden de
    segundos).
  - `idle_in_transaction_session_timeout` forzado para evitar leaks.
- La Edge Function `execute-plan` deja de usar `service_role` y pasa a
  conectar como `orion_vox_executor` (credenciales en Deno secrets, igual
  que antes).
- La definición SQL completa del rol vive en
  `docs/04-specs/orion-vox-executor-role.md` cuando se implemente.

La migración M1 → M2 está condicionada a la validación de los gates de
M2 (ver ADR-009).

## Alternativas consideradas

- **Rol dedicado desde el día 1**: postura de Codex inicial. Rechazado
  para M1 por overhead operativo: requiere diseñar el rol antes de
  conocer las tablas reales del usuario, validar con tests de integración
  contra cada combinación de allowlist, y mantener el rol sincronizado
  con cada cambio de schema. Overkill para un MVP exploratorio. **Se
  acepta** como destino obligatorio en M2.
- **`service_role` para siempre**: rechazado. Aceptable como deuda
  explícita y temporal de M1; inaceptable como estado final. Vivir
  permanentemente con la llave maestra es contradecir la Constitución
  (defensa en profundidad, principio de mínimo privilegio).
- **`service_role` en el cliente con RLS estricta como única barrera**:
  rechazado **sin excepción**. Exponer `service_role` al browser anula
  cualquier RLS (porque `service_role` la bypasea por diseño) y deja la
  llave maestra al alcance de cualquier extensión, devtools o malware
  local.
- **`anon` key del cliente con RPC y RLS**: rechazado por inflexibilidad
  (mismo argumento que en ADR-003 contra "RPC pre-definidas").

## Consecuencias

**Positivas**:

- M1 desbloqueado en plazo razonable: no hay que diseñar el rol antes de
  tener tablas reales sobre las cuales razonar.
- M2 tiene un destino claro y un spec dedicado
  (`orion-vox-executor-role.md`) para no improvisar al migrar.
- La barrera real contra abuso vive en el Plan JSON + query builder +
  operaciones bloqueadas, no en el rol. Eso significa que incluso si en
  M2 hubiera un bug en el rol dedicado, la defensa upstream sigue
  protegiendo. Defensa en profundidad real.

**Negativas / deuda asumida**:

- Durante M1 la "llave maestra" vive en producción. Si la Edge Function
  tuviera un bug que permitiera escapar de las barreras upstream (ej.
  multi-statement no detectado, Plan JSON validado mal), el blast radius
  es total.
- La migración M1 → M2 requiere un ejercicio de mapeo de allowlist:
  qué tablas son operables, con qué columnas, con qué restricciones por
  RLS. Es trabajo no trivial.
- Cualquier herramienta de monitoreo / observabilidad de Supabase que
  asuma `service_role` necesitará reconfiguración al migrar.

**Neutrales**:

- La rotación de credenciales se hace con la misma cadencia en M1 y M2
  (mecánica idéntica, sólo cambia qué credencial se rota).

## Aplicabilidad

- Aplica a **M1 y M2**. M3 hereda el rol dedicado de M2 sin cambios
  (salvo ampliación de allowlist si se agregan features nuevas).
- Gate de M1 → M2: este ADR define una de las condiciones obligatorias
  para considerar M2 completado (ver ADR-009).

## Referencias

- ADR-001 — Plan F+, donde la Edge Function `execute-plan` es el
  componente afectado.
- ADR-003 — Plan JSON como barrera upstream que justifica aceptar
  `service_role` en M1.
- ADR-005 — gemelo de éste para la Gemini API key (mismo patrón M1/M2).
- ADR-008 — auditoría server-side, complementaria.
- ADR-009 — roadmap modular y gates M1 → M2.
- `docs/00-constitution/CONSTITUTION.md` § 6 (roadmap modular).
- Glosario: `service_role`, `orion_vox_executor`.
- `docs/04-specs/orion-vox-executor-role.md` (a crear cuando arranque M2).
