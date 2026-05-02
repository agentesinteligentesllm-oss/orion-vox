---
title: M2 — Polish + endurecimiento secundario
status: stable
milestone: M2
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./ROADMAP.md
  - ./M1-MVP.md
  - ./TECHNICAL-DEBT.md
  - ../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md
  - ../03-adr/ADR-008-server-side-audit-from-m1.md
  - ../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../03-adr/ADR-010-schema-autogeneration.md
  - ../01-product/USER-STORIES.md
  - ../02-architecture/SECURITY-MODEL.md
---

# M2 — Polish + endurecimiento secundario

> **Placeholder operativo.** Este documento describe el alcance, los
> pre-requisitos y los criterios de salida de M2. El change OpenSpec
> `openspec/changes/m2-hardening/` **aún no existe** y se crea cuando
> M1 cierre y se cumplan los gates de transición M1 → M2 definidos en
> [ADR-009](../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md).

> **Reforma de seguridad 2026-05-01.** Tras la auditoría Codex, el
> hardening crítico se movió a M1 (auth real, Gemini server, allowlist
> server, separación de Edges). M2 quedó **mucho más chico** que la
> versión original: ahora es endurecimiento secundario y mejoras
> operativas, no rescate de seguridad. Ver ADR-009 reescrito.

---

## Objetivo M2

> **Cerrar las 4 deudas residuales M1→M2 y agregar polish operativo.**

M2 ya no es "el rescate del MVP". Es trabajo invisible que mueve el
sistema desde "M1 funcional y defendible" a "near-production con
postura de seguridad robusta y herramientas de operación cómodas". Su
valor se mide en deudas residuales cerradas, RLS estricta activa, y
herramientas admin operativas.

---

## Alcance funcional

Endurecimiento secundario sin cambiar el contrato observable para el
usuario:

| # | Cambio | Cierra |
|---|--------|--------|
| M2-01 | Rol Postgres `orion_vox_executor` con grants mínimos por tabla / operación | TD-001-bis (`service_role` + `BYPASSRLS`) |
| M2-02 | Preview firmado server-side con `preview_id` HMAC; flujo plan-intent → preview firmado → execute-plan valida firma | TD-003 (confirmación sin preview firmado) |
| M2-03 | UI admin in-app para `ORION_ALLOWED_TABLES`, `ORION_REDACTED_COLUMNS` y hints semánticos del schema-summary, con re-login Supabase y audit de cambios | TD-004 (allowlist sin UI admin) |
| M2-04 | RLS estricta en `orion_audit` y tablas operativas, posible una vez migrado el rol dedicado | TD-005 (RLS off en `orion_audit`) |
| M2-05 | `dry_run` con estimación visible de filas afectadas en el modal de confirmación (extender `execute-plan` con row count estimado pre-ejecución) | mejora UX |
| M2-06 | Métricas básicas de uso (consultas por día, errores, latencias, breakdown por tabla) | US-AUD-05 |
| M2-07 | Doble confirmación para deletes de alto impacto (>= N filas o tablas críticas) | US-SEC-06 |
| M2-08 | Política de retención formal de `orion_audit` (cron o función diaria) | gap operativo |
| M2-09 | Pantalla "estado del proyecto" con deuda visible en app | US-MNT-03 |

---

## Pre-requisitos para abrir M2

Vienen de la regla de transición M1 → M2 documentada en
[`ADR-009`](../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md):

1. M1 cerrado con todas sus US M1 implementadas y validadas.
2. **Uso real estable del director ≥ 2 semanas** sobre Cubot KK9 con
   `orion_audit` sin pérdidas.
3. Cero ejecuciones de operaciones bloqueadas violadas en ese período.
4. `TECHNICAL-DEBT.md` con las 4 deudas residuales (TD-001-bis,
   TD-003, TD-004, TD-005) explícitamente nombradas con plan de pago.
5. Tribunal aprueba la apertura de M2.

---

## Criterios de Done para cerrar M2

Lista verificable. Vienen de las reglas de transición M2 → M3 del
ADR-009 más los items derivados de las US M2.

- [ ] **Gate 1**: `execute-plan` ya **no** usa `service_role` para
  ejecutar SQL del usuario. Usa `orion_vox_executor` con grants
  mínimos.
- [ ] **Gate 2**: preview firmado server-side validado por
  `execute-plan` (rechazo de preview no firmado o con firma inválida).
- [ ] **Gate 3**: UI admin allowlist funcional con re-login Supabase
  y audit de cambios en `orion_audit`.
- [ ] **Gate 4**: RLS estricta activa en `orion_audit` y tablas
  operativas, con tests demostrando que un rol distinto no puede
  leer.
- [ ] **Gate 5**: tests de integración para los 4 gates anteriores
  en CI.
- [ ] **Threat model M2 re-evaluado**: revisión del
  [`SECURITY-MODEL.md`](../02-architecture/SECURITY-MODEL.md) con
  los nuevos componentes.
- [ ] **`dry_run` con estimación**: modal muestra filas afectadas
  estimadas antes de ejecución real.
- [ ] **Métricas de uso visibles** en pantalla dedicada (US-AUD-05).
- [ ] **Doble confirmación** para deletes high-impact (US-SEC-06).
- [ ] **Política de retención de `orion_audit`** documentada y
  automatizada (cron / función diaria).
- [ ] **`TECHNICAL-DEBT.md`**: TD-001-bis, TD-003, TD-004, TD-005
  marcados como `cerrada` con fecha y commit.
- [ ] **US M2** del backlog implementadas con sus criterios de
  aceptación: US-SEC-06, US-AUD-05, US-MNT-02, US-MNT-03,
  US-CFG-04/05/06 (parte M2 — UI admin), US-VOZ-02 (parte M2).
- [ ] **Tribunal aprueba el cierre** (Claude + Codex + director).

---

## Stories M2 conocidas

Subset del backlog en
[`USER-STORIES.md`](../01-product/USER-STORIES.md) que pertenece a M2:

- **US-SEC-06** — Confirmar operaciones de alto impacto con doble
  toque.
- **US-AUD-02** — Filtrar el historial por fecha.
- **US-AUD-05** — Ver métricas básicas de uso.
- **US-MNT-01** (parte M2) — Refrescar schema vía Edge Function (la
  base ya existe en M1, M2 agrega UI admin).
- **US-MNT-02** — Ver versión del contrato Plan JSON.
- **US-MNT-03** — Ver deuda técnica pendiente (visible en app).
- **US-CFG-04 / 05 / 06** (parte M2) — UI admin para allowlist,
  redacción y hints.
- **US-VOZ-02** (parte M2) — Indicador de nivel de audio refinado.

Cualquier US-*-M2 nueva descubierta durante M1 se agrega al backlog
y se incorpora al alcance M2 antes de redactar la `proposal.md` del
change.

---

## Change OpenSpec futuro

`openspec/changes/m2-hardening/` — **no creado todavía**. Se crea
cuando arranque M2, con la estructura canónica de OpenSpec
(`proposal.md`, `spec.md` delta, `design.md`, `tasks.md`,
`state.yaml`). La proposal debe explicitar qué stories M2 entran y
qué deuda residual cierra cada una.

---

## Riesgos conocidos

- **M2 puede sentirse aún más invisible que antes**: con el hardening
  crítico ya en M1, M2 es endurecimiento secundario. Mitigación:
  documentar las 4 deudas residuales como entregables visibles en sí
  mismas y reportar progreso por gate.
- **Migración a rol dedicado puede romper queries legítimas**: si los
  grants resultan demasiado restrictivos, queries M1 pueden empezar
  a fallar con permission denied. Rollback plan obligatorio en
  `tasks.md` del change M2 (revertir a `service_role` temporalmente
  mientras se ajustan grants).
- **Preview firmado agrega latencia**: el round trip extra
  PWA→plan-intent→PWA→execute-plan puede sumar 200-500 ms. Si
  `plan-intent` ya cargó el contexto, debería ser bajo. Medir antes
  de cerrar M2.
- **RLS estricta puede bloquear queries del director**: rollback
  plan obligatorio.
- **Tentación de saltar M2 directo a M3**: M1 va a "andar bien" y
  habrá presión por features. La Constitución § 6 y el ADR-009 son
  la barrera explícita.

---

## Cláusula de cierre

> M2 es la promesa que cierra las 4 deudas residuales de M1. Si esas
> deudas no se pagan antes de M3, el proyecto entra en deuda
> permanente y violamos el ADR-009. Sin excepción.
