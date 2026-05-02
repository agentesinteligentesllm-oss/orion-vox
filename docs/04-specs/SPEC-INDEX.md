---
title: Índice de specs técnicas — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ../02-architecture/OVERVIEW.md
  - ../02-architecture/COMPONENTS.md
  - ../03-adr/ADR-INDEX.md
  - ../00-constitution/CHANGE-PROTOCOL.md
---

# Índice de specs técnicas — Orion Vox

Las specs son el contrato técnico **operativo** de cada componente del
sistema. Bajan los principios constitucionales y las decisiones de
arquitectura a un nivel de detalle suficiente para implementar y para
verificar. Si una spec contradice un ADR o un documento de
`02-architecture/`, **gana el documento de mayor jerarquía** (ADR >
arquitectura > spec) y la spec se corrige vía CHANGE-PROTOCOL.

---

## Tabla de specs

| ID                      | Nombre                                              | Milestone | Status | Link                                                  |
|-------------------------|-----------------------------------------------------|-----------|--------|-------------------------------------------------------|
| spec-pwa-shell          | PWA Shell (manifest, SW, atajos)                    | M1        | stable | [spec-pwa-shell.md](./spec-pwa-shell.md)              |
| spec-voice-input        | Voice Input (Web Speech Recognition)                | M1        | stable | [spec-voice-input.md](./spec-voice-input.md)          |
| spec-auth-flow          | Auth Flow (Supabase Auth + JWT + ORION_ALLOWED_USER_ID) | M1    | stable | [spec-auth-flow.md](./spec-auth-flow.md)              |
| spec-gemini-client      | Gemini API Client (function calling) — **superseded** por spec-plan-intent-edge | M1 | superseded | [spec-gemini-client.md](./spec-gemini-client.md) |
| spec-plan-intent-edge   | Edge Function `plan-intent` (proxy server-side a Gemini) | M1   | stable | [spec-plan-intent-edge.md](./spec-plan-intent-edge.md) |
| spec-plan-json-schema   | Plan JSON v1.0 — schema y validador                 | M1        | stable | [spec-plan-json-schema.md](./spec-plan-json-schema.md)|
| spec-execute-plan-edge  | Edge Function `execute-plan`                        | M1        | stable | [spec-execute-plan-edge.md](./spec-execute-plan-edge.md) |
| spec-schema-summary-edge| Edge Function `schema-summary`                      | M1        | stable | [spec-schema-summary-edge.md](./spec-schema-summary-edge.md) |
| spec-audit-table        | Tabla `orion_audit` (DDL, índices, contratos)       | M1        | stable | [spec-audit-table.md](./spec-audit-table.md)          |
| spec-config-ui          | Pantallas de configuración inicial y corriente      | M1        | stable | [spec-config-ui.md](./spec-config-ui.md)              |
| spec-confirmation-flow  | Flujo de confirmación táctil (writes)               | M1        | stable | [spec-confirmation-flow.md](./spec-confirmation-flow.md) |
| spec-tts-output         | TTS Output (Web Speech Synthesis)                   | M1        | stable | [spec-tts-output.md](./spec-tts-output.md)            |
| spec-credentials-storage| Almacenamiento local (IndexedDB no cifrado + sesión Supabase) | M1 | stable | [spec-credentials-storage.md](./spec-credentials-storage.md) |
| spec-error-handling     | Manejo de errores cross-cutting                     | M1        | stable | [spec-error-handling.md](./spec-error-handling.md)    |

> **Nota reforma seguridad M1 (2026-05-01)**: `spec-gemini-client`
> queda `superseded` por `spec-plan-intent-edge` — la PWA ya no habla
> con Gemini directamente. `spec-credentials-storage` cambió alcance:
> ya no maneja secretos cifrados (no hay), solo cache local no
> sensible. `spec-auth-flow` y `spec-plan-intent-edge` son nuevas.

---

## Convenciones generales para specs

Toda spec sigue el frontmatter:

```yaml
---
title: <Spec name>
status: stable | draft | superseded
milestone: M1 | M2 | M3
owner: orion-vox
last-reviewed: YYYY-MM-DD
supersedes: []
related: []
---
```

Y la estructura interna:

1. **Propósito**
2. **Alcance** (in / out)
3. **Interfaces / API / Contratos**
4. **Comportamiento esperado**
5. **Estados / lifecycle** (si aplica)
6. **Errores y manejo**
7. **Restricciones M1** (deuda explícita)
8. **Criterios de aceptación verificables**
9. **Dependencias**
10. **Referencias**

---

## Cómo agregar una spec nueva

1. Verificá que la spec no choca con ningún ADR ni con los documentos de
   `02-architecture/`. Si choca, leé `00-constitution/CHANGE-PROTOCOL.md`
   y arrancá por ahí: probablemente necesitás un ADR antes.
2. Creá el archivo en `docs/04-specs/spec-<slug>.md` con el frontmatter
   y la estructura de arriba.
3. Linkealo en la tabla de este índice (mantené el orden alfabético
   dentro del mismo milestone).
4. En `related:` enumerá los specs vecinos, los ADRs aplicables y los
   documentos de arquitectura involucrados.
5. Antes de marcar `status: stable`, alguien ajeno a quien escribió la
   spec debe poder leerla y derivar tests sin preguntas adicionales.
   Si necesita preguntar, está incompleta.

---

## Cómo modificar una spec existente

1. Si el cambio es **menor** (clarificación, ejemplo, rewording sin
   cambiar contrato): editá directamente, actualizá `last-reviewed`,
   anotá en commit qué se aclaró.
2. Si el cambio es **mayor** (cambia un campo del contrato, agrega o
   quita una operación, cambia un código de error): seguí
   `CHANGE-PROTOCOL.md`. Probablemente requiere ADR.
3. Si la spec queda obsoleta y reemplazada: cambiala a
   `status: superseded`, completá `supersedes-by` con el ID de la spec
   nueva, y actualizá esta tabla (la dejás listada con status superseded
   por trazabilidad).

---

## Referencias cruzadas rápidas

- Constitución: `../00-constitution/CONSTITUTION.md`
- Protocolo de cambio: `../00-constitution/CHANGE-PROTOCOL.md`
- Gobernanza tribunal IAs: `../00-constitution/GOVERNANCE.md`
- Arquitectura overview: `../02-architecture/OVERVIEW.md`
- Componentes: `../02-architecture/COMPONENTS.md`
- Flujo de datos: `../02-architecture/DATA-FLOW.md`
- Modelo de seguridad: `../02-architecture/SECURITY-MODEL.md`
- Plan JSON contract (autoritativo): `../02-architecture/PLAN-JSON-CONTRACT.md`
- Audit model (autoritativo): `../02-architecture/AUDIT-MODEL.md`
- ADRs: `../03-adr/ADR-INDEX.md`
