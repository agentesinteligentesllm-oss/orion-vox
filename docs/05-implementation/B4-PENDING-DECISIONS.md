---
title: B4 — Decisiones pendientes antes de codear
status: draft
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-02
supersedes: []
related:
  - ../../docs/04-specs/spec-plan-intent-edge.md
  - ../../docs/02-architecture/DATA-FLOW.md
  - ../HANDOFF.md
---

# B4 — Decisiones pendientes antes de codear

Divergencias identificadas durante el pre-read de specs de B4
(2026-05-02). Ninguna puede resolverse con asunciones: cada una
afecta la firma de `plan-intent-client.ts` o la UX del flujo.

**Estado**: requieren respuesta del director antes de arrancar B4.1.

---

## Decisión 1 — `schema_stale` (bloqueante)

**Contexto**: las instrucciones de B4 del director dicen:
> "409 schema_stale → invalidar cache schema y reintentar".

**Problema**: `spec-plan-intent-edge.md` **no tiene ningún 409**
en su tabla de errores. El mecanismo de frescura del schema en
el spec es:
- Header de request `X-Refresh-Schema: 1` (§4.4): el cliente puede
  forzar refresh del schema-summary antes de llamar Gemini.
- Campo `schema_hash` en la response (§3.3): el cliente puede
  detectar que el hash cambió y marcar su cache como stale.

No hay un HTTP 409 emitido por el server en ninguna parte del spec.

**Opciones**:

| Opción | Descripción |
|--------|-------------|
| (a) Seguir el spec estrictamente | Detectar `schema_hash` diferente al cacheado client-side → invalidar cache → próxima llamada envía `X-Refresh-Schema: 1`. No hay retry automático. 409 no existe en M1. |
| (b) Tratar 409 como error futuro | Agregar `if (error === 'schema_stale')` en el error handler pero documentarlo como dead code en M1 (nunca se dispara). Queda la plomería lista para M2 si el server la emite. |
| (c) Hay documentación aparte del spec | El director tiene un contrato de error adicional no reflejado en el spec. Compartirlo. |

**Recomendación**: opción (a). Es lo que el spec describe. El
retry automático no está en el spec; agregarlo sin base introduce
comportamiento no auditado.

**Decisión del director**: _______________

---

## Decisión 2 — `gemini_error` vs `gemini_unavailable`/`gemini_timeout` (bloqueante)

**Contexto**: las instrucciones de B4 del director dicen:
> "502 gemini_error".

**Problema**: el spec define DOS códigos separados con mensajes
distintos:

| HTTP | Código | Mensaje español (spec §6.3) |
|------|--------|-----------------------------|
| 502  | `gemini_unavailable` | "El asistente no responde. Probá en unos minutos." |
| 504  | `gemini_timeout` | "El asistente tardó demasiado. Probá de nuevo." |

No existe `gemini_error` como código en el spec.

**Opciones**:

| Opción | Descripción |
|--------|-------------|
| (a) Implementar ambos por separado (seguir spec) | `gemini_unavailable` y `gemini_timeout` como casos distintos, mensajes diferentes. Requiere dos ramas en el cliente. |
| (b) Colapsar a un solo handler | Ambos 502/504 muestran el mismo mensaje genérico "El asistente no responde". Más simple, menos fiel al spec. |

**Recomendación**: opción (a). La distinción entre "no responde" y
"tardó demasiado" es útil para el usuario (en el segundo caso sabe
que Gemini recibió la request pero fue lenta, puede reintentar;
en el primero Gemini está caído).

**Decisión del director**: _______________

---

## Decisión 3 — Formato de concatenación en flujo de clarificación (bloqueante)

**Contexto**: cuando Gemini devuelve una Clarification y el usuario
responde la pregunta, el cliente debe reenviar la frase refinada
a `plan-intent`. El spec §4.2 dice:
> "el cliente concatena el contexto en `user_prompt`"

**Problema**: ni el spec ni `PROMPT-ENGINEERING.md` especifican
el **formato exacto** de esa concatenación.

**Propuesta** de Claude:
```
"${promptOriginal}\n\nAclaración del usuario: ${respuestaUsuario}"
```

**Alternativas posibles**:
```
"${promptOriginal} [Aclaración: ${respuestaUsuario}]"
```
```
"Contexto: ${promptOriginal}. Respuesta: ${respuestaUsuario}"
```

El formato que se elija afecta directamente cómo Gemini interpreta
el contexto del turno anterior. Una vez elegido, se documenta en
`PROMPT-ENGINEERING.md` §4 (actualmente vacío para esta sección).

**Decisión del director**: _______________

---

## Decisión 4 — `client_version` = `'0.0.0'` (informativa, sin bloqueo)

**Contexto**: el campo `client_version` del request a `plan-intent`
se envía con el valor de `package.json`. El `package.json` actual
tiene `"version": "0.0.0"` (valor por defecto de Vite scaffold).

**Impacto**: en `plan-intent` el server puede loguear
`client_version: '0.0.0'` en `orion_audit`. Funciona, pero puede
confundir en auditoría si alguna vez hay versiones reales.

**Opción por defecto** (no requiere acción): dejar `0.0.0` hasta
que haya una versión real en M1. El server no rechaza por versión
en ninguna parte del spec.

**¿El director quiere asignar una versión semántica ahora?**
Opciones: `0.1.0` (B0 done), `0.3.0` (B3 done), `1.0.0-alpha.1`
(convención pre-release).

**Decisión del director**: _______________

---

## Decisión 5 — `conversation_id` (informativa, no bloquea)

**Contexto**: `DATA-FLOW.md` incluye `conversation_id?` en la tabla
de boundary de integración.

**Estado**: el spec `spec-plan-intent-edge.md` §3.2 lo marca
explícitamente como **M2**. No se envía en M1, no se procesa en
el server en M1.

**Acción requerida**: ninguna en B4. Queda documentado para M2.

---

## Checklist para desbloquear B4

- [ ] Decisión 1 — schema_stale: director elige opción (a), (b) o (c)
- [ ] Decisión 2 — gemini codes: director confirma opción (a) o (b)
- [ ] Decisión 3 — clarification format: director aprueba formato
- [ ] Decisión 4 — client_version: director confirma o elige otra versión

Una vez todas con [x], Codex puede arrancar B4.1 (`plan-intent-client.ts`).
