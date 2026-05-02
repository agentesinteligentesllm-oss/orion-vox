---
title: "Spec delta — M1 MVP funcional Plan F+"
change-id: m1-mvp
change-status: in-progress
target-milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./proposal.md
  - ./design.md
  - ./tasks.md
  - ../../README.md
  - ../../../docs/04-specs/SPEC-INDEX.md
---

# Spec delta — M1 MVP funcional Plan F+

> **Naturaleza de este delta**: este es el **primer change** del
> proyecto. Como tal, el "delta sobre el estado deseado estable" es
> en realidad la **introducción inicial** de los specs del sistema.
> Los specs autoritativos viven en `docs/04-specs/` por la regla de
> autoridad de [`openspec/README.md`](../../README.md): este change
> los introduce y, al cerrar, no se "promueven" porque ya están en
> el lugar correcto — sólo se marca el change como `archived`.

---

## Resumen del delta

Este change introduce los **12 specs M1** del sistema. Cada spec ya
fue escrita por el tribunal y vive como autoritativa en
`docs/04-specs/`. El change es responsable de implementar cada una
hasta que su criterio de aceptación se cumpla.

| ID change | Spec autoritativa | Status spec | Milestone |
|-----------|-------------------|-------------|-----------|
| Δ-01 | [`spec-pwa-shell`](../../../docs/04-specs/spec-pwa-shell.md) | stable | M1 |
| Δ-02 | [`spec-credentials-storage`](../../../docs/04-specs/spec-credentials-storage.md) | stable | M1 |
| Δ-03 | [`spec-config-ui`](../../../docs/04-specs/spec-config-ui.md) | stable | M1 |
| Δ-04 | [`spec-voice-input`](../../../docs/04-specs/spec-voice-input.md) | stable | M1 |
| Δ-05 | [`spec-tts-output`](../../../docs/04-specs/spec-tts-output.md) | stable | M1 |
| Δ-06 | [`spec-gemini-client`](../../../docs/04-specs/spec-gemini-client.md) | stable | M1 |
| Δ-07 | [`spec-plan-json-schema`](../../../docs/04-specs/spec-plan-json-schema.md) | stable | M1 |
| Δ-08 | [`spec-execute-plan-edge`](../../../docs/04-specs/spec-execute-plan-edge.md) | stable | M1 |
| Δ-09 | [`spec-schema-summary-edge`](../../../docs/04-specs/spec-schema-summary-edge.md) | stable | M1 (deuda) |
| Δ-10 | [`spec-audit-table`](../../../docs/04-specs/spec-audit-table.md) | stable | M1 |
| Δ-11 | [`spec-confirmation-flow`](../../../docs/04-specs/spec-confirmation-flow.md) | stable | M1 |
| Δ-12 | [`spec-error-handling`](../../../docs/04-specs/spec-error-handling.md) | stable | M1 |

---

## Δ-01 — `spec-pwa-shell`

**Introduce**: shell PWA instalable. Manifest válido, service worker,
atajos a "Voice Mode" / "Settings" / "Audit". Bundle inicial < 500 KB.

**Escenario clave de aceptación**:
- Dado un Cubot KK9 con Chrome Android, cuando el director navega a
  la URL desplegada y elige "instalar", entonces aparece un icono
  "Orion Vox" en home con atajo directo a Voice Mode.

Detalle completo: [`spec-pwa-shell.md`](../../../docs/04-specs/spec-pwa-shell.md).

---

## Δ-02 — `spec-credentials-storage`

**Introduce**: política de almacenamiento de credenciales en cliente
**sin secretos**. Tras la reforma de seguridad de Wave 1, la PWA
**no custodia secretos**: la Gemini API key y el `service_role` viven
server-side (env vars de Edge Functions). El cliente sólo guarda
Supabase URL + `anon_key` pública (sin cifrar) y la sesión Supabase
Auth (manejada por el SDK).

**Escenario clave de aceptación**:
- Dado un dispositivo recién inicializado, cuando el director ingresa
  la URL Supabase + `anon_key` pública y se loguea con magic link,
  entonces la PWA puede invocar `plan-intent` y `execute-plan` con
  Bearer JWT y **el bundle no contiene** strings tipo `GEMINI_API_KEY`,
  `service_role` ni nada que sugiera secretos en cliente.

Detalle completo: [`spec-credentials-storage.md`](../../../docs/04-specs/spec-credentials-storage.md).

---

## Δ-03 — `spec-config-ui`

**Introduce**: pantallas de configuración inicial y corriente.
Cubre US-CFG-01 a US-CFG-07.

**Escenario clave de aceptación**:
- Dado que falta una credencial obligatoria (URL Supabase, Gemini
  key, schema summary), cuando el director intenta consultar,
  entonces la PWA bloquea con CTA hacia configuración y mensaje
  específico.

Detalle completo: [`spec-config-ui.md`](../../../docs/04-specs/spec-config-ui.md).

---

## Δ-04 — `spec-voice-input`

**Introduce**: captura de voz `es-MX` vía Web Speech Recognition,
con `interimResults`, indicador visual, auto-listen al abrir desde
atajo.

**Escenario clave de aceptación**:
- Dado que el director abre Orion Vox desde el atajo de Voice Mode,
  cuando la app carga, entonces el micrófono se activa
  automáticamente (o aparece botón claro si el browser exige
  interacción), y la transcripción aparece en pantalla mientras
  habla.

Detalle completo: [`spec-voice-input.md`](../../../docs/04-specs/spec-voice-input.md).

---

## Δ-05 — `spec-tts-output`

**Introduce**: respuesta verbal por Web Speech Synthesis `es-MX`
con interrupción por tap.

**Escenario clave de aceptación**:
- Dado un resultado válido del backend, cuando la PWA recibe la
  respuesta, entonces se sintetiza un resumen humano (no JSON crudo)
  y un botón "stop" interrumpe el habla con un tap.

Detalle completo: [`spec-tts-output.md`](../../../docs/04-specs/spec-tts-output.md).

---

## Δ-06 — `spec-gemini-client`

**Introduce**: cliente Gemini con function calling. System prompt
compone schema-summary + reglas de Plan JSON + tool
`request_clarification`.

**Escenario clave de aceptación**:
- Dado un schema summary cargado y una frase del director, cuando
  el cliente Gemini procesa la frase, entonces devuelve un Plan
  JSON v1.0 estructuralmente válido o invoca
  `request_clarification` si la frase es ambigua.

Detalle completo: [`spec-gemini-client.md`](../../../docs/04-specs/spec-gemini-client.md).

---

## Δ-07 — `spec-plan-json-schema`

**Introduce**: contrato del Plan JSON v1.0 + validador
client-side (Zod o equivalente).

**Escenario clave de aceptación**:
- Dado un Plan JSON candidato, cuando el validador lo procesa,
  entonces (a) lo acepta y devuelve el plan tipado, o (b) lo
  rechaza con un código de error específico que se traduce a
  mensaje legible para el director.

Detalle completo: [`spec-plan-json-schema.md`](../../../docs/04-specs/spec-plan-json-schema.md).

---

## Δ-08 — `spec-execute-plan-edge`

**Introduce**: Edge Function `execute-plan` (Deno) que recibe Plan
JSON validado, re-valida server-side, ejecuta sobre Postgres con
`service_role`, registra en `orion_audit`.

**Escenario clave de aceptación**:
- Dado un Plan JSON con `op: "delete"` sin filtros, cuando la Edge
  Function lo procesa, entonces lo rechaza antes de tocar Postgres,
  registra `bloqueado_por_regla` en `orion_audit`, y devuelve
  código de error legible al cliente.

Detalle completo: [`spec-execute-plan-edge.md`](../../../docs/04-specs/spec-execute-plan-edge.md).

---

## Δ-09 — `spec-schema-summary-edge`

**Introduce**: Edge Function `schema-summary` mínima en M1 (dump
filtrado manual). En M2 se reemplaza con allowlist server-side.

**Escenario clave de aceptación M1**:
- Dado el dump filtrado del director cargado, cuando la PWA pide
  el schema, entonces la Edge Function devuelve el dump tal cual
  (sin allowlist server-side enforced).

Detalle completo: [`spec-schema-summary-edge.md`](../../../docs/04-specs/spec-schema-summary-edge.md).

---

## Δ-10 — `spec-audit-table`

**Introduce**: DDL de `orion_audit`, índices, contratos de
inserción, política de retención mínima (formal en M2).

**Escenario clave de aceptación**:
- Dado cualquier resultado de `execute-plan` (ok / error /
  bloqueado / cancelado por usuario), cuando la Edge Function
  termina, entonces existe exactamente una entrada en
  `orion_audit` con timestamp, frase, plan, resultado, latencia.

Detalle completo: [`spec-audit-table.md`](../../../docs/04-specs/spec-audit-table.md).

---

## Δ-11 — `spec-confirmation-flow`

**Introduce**: modal de confirmación táctil para writes (US-SEC-01,
02, 03). Preview SQL legible + botones diferenciados + cancelación
auditada.

**Escenario clave de aceptación**:
- Dado un Plan JSON con `op: "update"`, cuando la PWA lo recibe,
  entonces muestra modal con tabla, valores, filtros, SQL preview
  y filas estimadas; ningún write se ejecuta sin tap explícito en
  "Confirmar".

Detalle completo: [`spec-confirmation-flow.md`](../../../docs/04-specs/spec-confirmation-flow.md).

---

## Δ-12 — `spec-error-handling`

**Introduce**: códigos de error cross-cutting (red, Gemini caída,
Supabase caída, JSON inválido, timeout, regla violada). Render en
pantalla + TTS + audit.

**Escenario clave de aceptación**:
- Dado un timeout de Gemini, cuando la PWA detecta el error,
  entonces muestra mensaje legible, lo sintetiza por TTS, y
  registra el error en `orion_audit` con código `gemini_timeout`.

Detalle completo: [`spec-error-handling.md`](../../../docs/04-specs/spec-error-handling.md).

---

## Reglas de promoción al cerrar el change

Por la convención de [`openspec/README.md`](../../README.md):

- Los specs **ya viven en `docs/04-specs/`** (este change es el
  primero del proyecto y los introduce con su forma final).
- Al marcar el change como `completed`, **no hay promoción de
  archivos**: sólo se mueve la carpeta `openspec/changes/m1-mvp/`
  a `openspec/archive/m1-mvp/` y se actualiza el `state.yaml` a
  `archived`.
- Si durante M1 alguna spec se modifica sustancialmente, se sigue
  el [`CHANGE-PROTOCOL.md`](../../../docs/00-constitution/CHANGE-PROTOCOL.md)
  (típicamente con un sub-change OpenSpec y un ADR si toca
  arquitectura).
