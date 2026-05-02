---
title: Índice de Architecture Decision Records (ADRs)
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/CHANGE-PROTOCOL.md
  - ../00-constitution/GOVERNANCE.md
---

# Índice de ADRs — Orion Vox

Este índice lista las decisiones arquitectónicas registradas del proyecto.
Toda decisión arquitectónica vive como un ADR independiente, numerado en
orden de aceptación. Las decisiones constitucionales (ADR-001 a ADR-011)
fueron cerradas en consenso de tribunal el 2026-05-01 antes de cualquier
línea de código.

---

## Tabla de ADRs

| ID      | Título                                                              | Status | Decision Date | Aplicabilidad |
|---------|---------------------------------------------------------------------|--------|---------------|---------------|
| ADR-001 | [Adopción de Plan F+ como arquitectura base](./ADR-001-plan-f-plus-architecture.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-002 | [Descarte de "OK Google" nativo hands-free en español](./ADR-002-discard-ok-google-native.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-003 | [Plan JSON estructurado, NUNCA SQL libre](./ADR-003-plan-json-not-sql.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-004 | [service_role en M1, rol dedicado en M2](./ADR-004-service-role-m1-dedicated-role-m2.md) | accepted | 2026-05-01 | M1, M2 |
| ADR-005 | [Gemini API key server-side desde M1 (Edge `plan-intent`)](./ADR-005-gemini-key-client-m1-server-m2.md) | accepted | 2026-05-01 | M1, M2 |
| ADR-006 | [PWA pura, sin componente nativo Kotlin](./ADR-006-pure-pwa-no-kotlin.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-007 | [Web Speech API como modo voz interno](./ADR-007-web-speech-api-internal-voice-mode.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-008 | [Auditoría server-side desde M1](./ADR-008-server-side-audit-from-m1.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-009 | [Roadmap modular M1 → M2 → M3](./ADR-009-modular-roadmap-m1-m2-m3.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-010 | [Schema Summary autogenerado, no manual](./ADR-010-schema-autogeneration.md) | accepted | 2026-05-01 | M2 (M1 acepta deuda) |
| ADR-011 | [Español como idioma primario](./ADR-011-spanish-as-primary-language.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-012 | [Framework PWA — Svelte 5 + Vite + TypeScript](./ADR-012-framework-pwa.md) | accepted | 2026-05-01 | M1, M2, M3 |
| ADR-013 | [Estrategia de esquema compartido Plan JSON entre PWA y Edge Functions](./ADR-013-shared-plan-schema-strategy.md) | accepted | 2026-05-01 | M1, M2, M3 |

---

## Leyenda de status

| Status        | Significado |
|---------------|-------------|
| `proposed`    | Discutido pero no aprobado por consenso del tribunal. No vinculante. |
| `accepted`    | Aprobado por consenso. Vinculante para todo el código y docs. |
| `superseded`  | Reemplazado por un ADR posterior. El campo `superseded-by` apunta al sucesor. Se conserva por trazabilidad histórica. |
| `deprecated`  | Ya no aplica (ej. la decisión cubría un componente eliminado). No se debe seguir. |

---

## Cómo proponer un nuevo ADR

1. Lee `docs/00-constitution/CHANGE-PROTOCOL.md` para entender el flujo de
   cambios constitucionales y arquitectónicos.
2. Crea un archivo nuevo en `docs/03-adr/ADR-NNN-<slug>.md` siguiendo la
   plantilla de cualquier ADR existente. El `NNN` es el siguiente número
   disponible en este índice.
3. Marca `decision-status: proposed` en el frontmatter mientras esté en
   discusión.
4. Llevalo al tribunal (Claude + Codex + usuario). Si hay consenso, cambia
   a `accepted` y agregalo a la tabla de arriba en el mismo PR.
5. Si el ADR reemplaza a uno previo, actualizá el ADR antiguo a
   `superseded` y completá su campo `superseded-by` con el nuevo ID.

> Recordatorio del principio constitucional 12: **toda decisión
> arquitectónica tiene ADR, sin excepción.** Lo obvio hoy es ruido mañana
> cuando alguien (incluido vos en seis meses) pregunte "¿por qué elegimos
> esto?".

---

## ADRs reservados a futuro (sin crear todavía)

- **ADR-014+** — Reservados para decisiones que surjan durante M1/M2/M3.

No se crean ADRs especulativos. Si una decisión no está sobre la mesa, no
tiene ADR.
