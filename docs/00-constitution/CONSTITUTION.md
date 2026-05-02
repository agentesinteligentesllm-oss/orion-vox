---
title: Constitución de Orion Vox — 12 principios fundacionales
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - GOVERNANCE.md
  - NON-GOALS.md
  - PRINCIPLES-CHECKLIST.md
  - CHANGE-PROTOCOL.md
---

# Constitución de Orion Vox

Estos 12 principios definen la identidad técnica y operativa del proyecto.
Son la **fuente de verdad de mayor jerarquía**: si cualquier ADR, spec o
implementación los contradice, gana la constitución.

Cualquier excepción requiere un ADR explícito que **suspenda** el principio
afectado, con justificación firmada por el usuario y revisión del tribunal
(ver `CHANGE-PROTOCOL.md`).

---

## 1. Single user, sin multi-tenancy

Orion Vox está diseñado para **un único usuario** (vos). No hay tabla de
usuarios, ni autenticación multi-cuenta, ni separación lógica por tenant.
Todo el modelo de seguridad y datos asume un actor humano único.

Consecuencia: las decisiones que en un producto SaaS serían triviales
(RLS por user_id, JWT por sesión, billing por workspace) acá son ruido. Se
omiten deliberadamente. Si en el futuro se quisiera abrir a más usuarios,
**eso sería un proyecto distinto**, no una evolución de éste.

## 2. Plan JSON, NUNCA SQL libre

Gemini **jamás** devuelve SQL crudo. Devuelve un Plan JSON estructurado
v1.0 con forma estricta (una operación por request): `{ version: '1.0',
operation: 'select'|'insert'|'update'|'delete', table, columns?, values?,
filters?, limit?, order_by?, joins? }`. La Edge Function `execute-plan`
valida ese plan contra un esquema (Zod) y construye el SQL parametrizado
internamente. Spec canónica:
`docs/04-specs/spec-plan-json-schema.md`.

Razón: SQL libre desde un LLM es la puerta a inyecciones, escalado de
privilegios y operaciones destructivas no auditables. El Plan JSON es la
**barrera dura** entre lenguaje natural y ejecución.

## 3. Auditoría server-side desde el día 1

Toda ejecución — exitosa, fallida, o rechazada por validación — se inserta
en la tabla `orion_audit` (timestamp, plan_json, sql_ejecutado,
filas_afectadas, error, latencia). La auditoría vive en Postgres, **no en el
cliente**. El cliente puede mostrar logs, pero no es la fuente de verdad.

Razón: si M1 introduce una regresión de seguridad, la auditoría server-side
es la única evidencia confiable de qué pasó y cuándo.

## 4. Operaciones bloqueadas hardcoded

La Edge Function `execute-plan` rechaza incondicionalmente cualquier intento
de ejecutar: `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`,
`COPY`, `DO`, y cualquier multi-statement (separador `;` con segunda
sentencia). Esta lista es **hardcoded en código**, no configurable, y
cubierta por tests.

Razón: estas operaciones nunca son legítimas en el flujo conversacional. Su
único caso de uso sería una migración, que se hace por fuera de Orion Vox.

## 5. Confirmación táctil para writes

`UPDATE`, `DELETE` e `INSERT` requieren un **toque humano explícito** en un
modal de confirmación de la PWA, mostrando: la tabla, las filas afectadas
estimadas (preview), y la operación textual. Sin ese toque, no se ejecuta.

Razón: la voz es ambigua, los LLMs alucinan, y un `DELETE FROM tareas`
malinterpretado puede vaciar una tabla en milisegundos. El humano es el
último gate.

## 6. Roadmap modular M1 → M2 → M3, en ese orden

- **M1**: funcional **y** base segura. Plan F+ con Supabase Auth + JWT,
  Gemini key y `service_role` server-side desde día 1 (env vars de Edge
  Functions), allowlist y redacción server-side, auditoría server-side
  desde día 1. Deuda residual M1→M2: rol dedicado `orion_vox_executor`
  (vs `service_role` con BYPASSRLS), preview firmado server-side, UI
  admin de allowlist, RLS estricta. (Ver `TECHNICAL-DEBT.md`.)
- **M2**: hardening. Cierra los 4 items residuales: rol Postgres
  dedicado, preview firmado server-side, UI admin allowlist, RLS
  estricta donde aplique.
- **M3**: rico. Multi-modelo, multi-proyecto, exports, gráficos, atajos.

No se saltan fases. Una feature de M3 no se adelanta porque "es chica".
La modularidad protege contra el over-engineering temprano y contra dejar
deuda M1 sin pagar.

## 7. PWA pura, sin componente nativo Kotlin

El entregable es una **PWA sideloaded**, no una app nativa Android. Esta
decisión cierra la puerta a Play Store, App Actions, AppFunctions y
Custom Intents — y eso es deseable: elimina dependencias de gatekeeping
externo y permite iteración inmediata.

Razón completa en `docs/03-adr/ADR-006-pure-pwa-no-kotlin.md`.

## 8. Web Speech API + atajo Android, NO OK Google nativo

El reconocimiento de voz vive **dentro de la PWA**, vía `SpeechRecognition`
en `es-MX`. El único punto de contacto con el asistente del sistema es el
atajo "OK Google, abrí Orion Vox" para lanzar la app con el micrófono
listo.

No se intenta interceptar el comando hablado por Gemini sistema, ni
implementar wake words globales en español, ni integrar con Bixby (el
hardware no es Samsung) o Quick Phrases (no Pixel). Ese camino se exploró
y se descartó en los 4 rounds Claude↔Codex.

## 9. Documentación viva

Cada cambio de código actualiza la documentación afectada **antes o durante**
el commit, no después. Un PR sin docs actualizadas se considera incompleto.

Concretamente:

- Cambio arquitectónico → ADR nuevo o modificado.
- Cambio de contrato → spec actualizado en `openspec/changes/<id>/spec.md`
  o, si ya está en main, en `docs/04-specs/`.
- Cambio de operación → runbook en `docs/06-operations/`.

## 10. Tribunal Claude + Codex + usuario para decisiones arquitectónicas

Las decisiones arquitectónicas requieren **consenso del tribunal**:

- **Usuario**: define alcance, prioridades, tradeoffs aceptables.
- **Claude**: propone, debate, valida con investigación.
- **Codex**: propone, debate, valida con investigación.

Sin consenso, no se avanza. La velocidad **no es** métrica de éxito.
Detalle del proceso en `GOVERNANCE.md`.

## 11. Español como idioma primario

UX, voz, mensajes de error visibles, documentación: todo en español.
Inglés solo para nombres propios técnicos (`PWA`, `Edge Function`,
`Plan JSON`), código fuente, identificadores de tablas/columnas, y mensajes
de log internos.

Esto excluye explícitamente i18n: no hay archivos de traducciones, no hay
selector de idioma. Es-MX (o es-AR en TTS, según prueba con Web Speech)
es el único locale soportado.

## 12. Toda decisión arquitectónica tiene ADR

Sin excepción. Un ADR mínimo lleva: **fecha**, **contexto**, **alternativas
evaluadas con pros/contras**, **decisión**, **consecuencias** (positivas y
negativas), y **estado** (`proposed | accepted | superseded | deprecated`).

Si una decisión "es obvia", el ADR igual se escribe. Lo obvio hoy es ruido
mañana cuando alguien (incluido vos en seis meses) pregunte "¿por qué
elegimos esto?".

---

## Cláusula de cierre

> **Estos principios son innegociables.**
> **Cualquier excepción requiere un ADR explícito que los suspenda con**
> **justificación firmada por el usuario y revisión del tribunal.**
> **Ver `CHANGE-PROTOCOL.md`.**
