---
title: PRD — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - PERSONAS.md
  - USE-CASES.md
  - USER-STORIES.md
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/NON-GOALS.md
  - ../00-constitution/GLOSSARY.md
---

# PRD — Orion Vox

Documento principal de producto. Define qué es Orion Vox, para quién, qué
problema resuelve, cómo se mide el éxito y qué queda explícitamente fuera.

Este PRD se interpreta junto con la `CONSTITUTION.md` y `NON-GOALS.md`. Si
algo de este PRD entra en conflicto con un principio constitucional, gana
la constitución.

---

## 1. Visión

Orion Vox es una **PWA personal** que actúa como puente conversacional
entre el asistente Gemini de Android y un proyecto Supabase del usuario.
Su razón de ser es permitir consultar y modificar la base de datos
personal **hablando en español natural** desde el celular, sin abrir un
cliente SQL, sin usar el dashboard de Supabase, y sin escribir nada con
las manos cuando no es necesario.

El usuario invoca el asistente con "OK Google, abrí Orion Vox", la PWA
arranca con el micrófono activo, escucha una frase libre en español, la
traduce vía Gemini API a un Plan JSON estructurado, lo ejecuta en una
Edge Function de Supabase con auditoría server-side, y responde por TTS.

---

## 2. Problema que resuelve

El usuario es desarrollador y tiene su propio proyecto Supabase con
datos personales (ventas, clientes, notas, registros de actividades,
inventario, etc.). Hoy, para consultar o modificar esos datos desde el
celular debe:

- Abrir un cliente SQL en el móvil (lento, incómodo, requiere teclear
  consultas con teclado de pantalla).
- O abrir el dashboard de Supabase en el navegador móvil (UI no
  optimizada para móvil, varios taps por consulta).
- O esperar a estar frente a una computadora.

Ninguna opción es práctica para el caso típico: **"quiero registrar o
consultar algo rápido mientras estoy en movimiento"**.

Orion Vox resuelve esto reduciendo la fricción a una sola frase
hablada. El costo en complejidad lo absorbe el sistema (Plan JSON,
auditoría, confirmación táctil, allowlist), no el usuario.

---

## 3. Usuario objetivo

Un único usuario: el director del proyecto. Perfil completo en
[`PERSONAS.md`](./PERSONAS.md).

Resumen: ingeniero de software, cómodo con Supabase y SQL, dueño del
proyecto Supabase sobre el que opera Orion Vox, hardware target Cubot
KingKong 9. **No hay personas adicionales.** Diseñar para terceros está
explícitamente fuera de alcance (ver `NON-GOALS.md`, sección "Producto
y alcance").

---

## 4. Propuesta de valor

> **Invocar Gemini con la voz, decir una frase natural en español, y
> recibir una respuesta hablada con datos de tu propia base Supabase —
> sin tocar SQL ni el dashboard.**

Componentes de valor concretos:

- **Hands-free de entrada**: "OK Google, abrí Orion Vox" lanza la app
  con el micrófono ya activo (único punto de contacto con el asistente
  del sistema; el resto del flujo vive dentro de la PWA).
- **Frase libre en español**: nada de comandos predefinidos. El usuario
  habla como hablaría con una persona ("mostrame las ventas de hoy",
  "registrame que vendí tres cafés a Juan").
- **Plan JSON, no SQL libre**: Gemini devuelve estructura, no SQL crudo.
  Esto cierra la puerta a inyección y a operaciones destructivas.
- **Confirmación táctil para writes**: cualquier `INSERT`, `UPDATE` o
  `DELETE` requiere un toque humano explícito antes de ejecutarse.
- **Auditoría server-side**: toda ejecución (exitosa, fallida o
  bloqueada) queda registrada en `orion_audit`.
- **Respuesta verbal**: el resultado se sintetiza por TTS para cerrar
  el loop conversacional.

---

## 5. Métricas de éxito M1

M1 es **funcional**. No es producto comercial, no es seguro de
producción crítica. Las métricas reflejan eso: validan que el flujo
end-to-end funciona y que los innegociables se respetan.

| # | Métrica | Objetivo M1 | Cómo se mide |
|---|---------|------------|--------------|
| 1 | Cobertura de consultas | Al menos **3 tablas** del proyecto Supabase consultables con frase libre en español | Test manual sobre 3 tablas representativas |
| 2 | Cobertura de writes | `INSERT`, `UPDATE` y `DELETE` funcionan con confirmación táctil sobre al menos 2 tablas | Test manual + revisión de `orion_audit` |
| 3 | Latencia end-to-end (queries simples) | < **6 segundos** desde fin de habla hasta inicio de TTS de respuesta | Medición en `orion_audit.latencia_ms` + tiempo cliente |
| 4 | Tasa de Plan JSON válido en queries comunes | ≥ **90 %** sobre el set de pruebas de las 3 tablas piloto | Conteo `errores_validacion / total` en `orion_audit` |
| 5 | Auditoría obligatoria | **0** ejecuciones (incluso fallidas) sin entrada en `orion_audit` | Inspección de la Edge Function + revisión de logs |
| 6 | Operaciones bloqueadas | **0** ejecuciones de DDL (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `DO`) o multi-statement | Tests automatizados en `execute-plan` |
| 7 | Modo read-only respetado | **0** writes ejecutados cuando el toggle está activo | Test manual + auditoría |

Las métricas 5, 6 y 7 son **innegociables**: un fallo en cualquiera de
ellas bloquea el cierre de M1. Las 1–4 son objetivos de aceptación
funcional: si alguna queda corta, se decide caso por caso si se cierra
M1 con deuda documentada o se itera.

---

## 6. Alcance M1

M1 implementa la arquitectura **Plan F+** (ver glosario y
`docs/03-adr/ADR-001-arquitectura-plan-f-plus.md`) con la siguiente
deuda técnica explícita y aceptada:

> **Reformulado en Wave 1 (post-auditoría Codex).** La M1 anterior
> dejaba secretos en cliente; la M1 vigente nace ya defendible. Deuda
> residual M1→M2 = sólo 4 items operativos.

- **`service_role` en Edge `execute-plan`** (server-side, env var
  `SUPABASE_SERVICE_ROLE_KEY`): bypassa RLS por diseño. Vive **solo
  server-side**, jamás en cliente. M2 lo reemplaza por
  `orion_vox_executor` con grants mínimos (TD-001-bis).
- **Preview de writes generado en cliente**: el modal arma el preview
  SQL del lado de la PWA antes de invocar `execute-plan`. M2 firma el
  preview server-side con `preview_id` (TD-003).
- **Allowlist y redacción configurables sólo por env var server-side**:
  M1 no tiene UI admin; cambiarlas requiere redeploy. M2 agrega UI
  admin con permisos restringidos al usuario único (TD-004).
- **RLS deshabilitada en `orion_audit`**: justificable mientras el
  rol es `service_role`. M2 habilita RLS estricta tras migrar a
  `orion_vox_executor` (TD-005).

**Lo que NO es deuda M1 (cubierto desde día 1)**: Supabase Auth + JWT,
Gemini API key server-side en `plan-intent`, allowlist server-side,
política de redacción server-side, auditoría server-side completa,
3 Edge Functions separadas (`plan-intent` / `execute-plan` /
`schema-summary`), validación user.id contra `ORION_ALLOWED_USER_ID`.

Funcionalidades M1 (alto nivel):

- Configuración inicial: login Supabase Auth (magic link) + URL del
  proyecto Supabase + locale de voz. **Sin secretos a tipear**: la
  Gemini key y el `service_role` se cargan al deploy de las Edge
  Functions, no por el usuario.
- Captura de voz en `es-MX` vía `SpeechRecognition`.
- Llamada a Gemini API con function calling para producir Plan JSON.
- Validación de Plan JSON en `execute-plan` (Zod o equivalente).
- Ejecución de operaciones `select | insert | update | delete` con
  parametrización forzada y `LIMIT` obligatorio en lecturas.
- Bloqueo hardcoded de operaciones DDL y multi-statement.
- Modal de confirmación táctil para todos los writes con preview.
- Toggle global read-only.
- Inserción de toda ejecución en `orion_audit`.
- Respuesta verbal por `SpeechSynthesis`.
- Vista de historial básico (lecturas desde `orion_audit`).

---

## 7. Fuera de alcance

Lista canónica en [`NON-GOALS.md`](../00-constitution/NON-GOALS.md).

Resumen de lo más importante para evitar scope creep:

- Multi-tenant / multi-usuario.
- App nativa Kotlin / TWA / AppFunctions / Play Store.
- SQL libre desde el LLM.
- Operaciones DDL.
- Comandos predefinidos acotados (la frase libre es la razón de ser).
- Búsqueda semántica / RAG sobre los datos.
- Edición de schema desde la PWA.
- Visualizaciones complejas en M1 (texto y tablas; gráficos en M3).
- Sincronización offline compleja.
- iOS / Safari.
- Producción crítica con datos sensibles regulados (PII de terceros,
  PHI, PCI).

---

## 8. Restricciones

Restricciones duras del contexto que condicionan el diseño:

- **Hardware target**: Cubot KingKong 9 (Android stock con Gemini
  integrado). Sin Bixby (no es Samsung), sin Quick Phrases (no es
  Pixel), sin acceso a AppFunctions EAP.
- **Distribución**: sideload exclusivo. Sin Play Store. Esto cierra la
  puerta a App Actions / Custom Intents / AppFunctions y eso es
  deseable (ver ADR-002, ADR-003, ADR-004).
- **Idioma**: español primario (es-MX/es-AR para Web Speech). Sin i18n.
- **Dependencia de Gemini API personal**: el usuario provee y paga su
  propia API key. Si la API cambia precios, cuotas o disponibilidad,
  el proyecto se ve afectado.
- **Dependencia de Supabase Edge Functions**: el flujo asume que el
  free tier (o el plan que el usuario tenga) cubre la latencia y el
  volumen esperado.
- **Web Speech API en Chrome Android**: depende de Google (la
  implementación va al servidor de Google, no funciona offline). Si
  Google deprecara la API o cambiara políticas, hay que reevaluar.
- **Sin gatekeeper externo**: sin Play Store no hay revisión, pero
  tampoco hay distribución masiva. Aceptado: este proyecto es uso
  personal.

---

## 9. Suposiciones críticas

Estas suposiciones, si fallan, invalidan partes sustantivas del
proyecto. Vale la pena tenerlas explícitas:

- **Gemini API se mantiene disponible y económica** para el patrón de
  uso esperado (5–20 invocaciones/día). Si Gemini sube precios de
  forma significativa o cierra la API pública, se evalúa migrar a otro
  LLM con function calling (GPT-4 mini, Claude Haiku, modelo local).
- **Supabase mantiene Edge Functions accesibles** en el plan del
  usuario. Si esto cambia, habría que mover `execute-plan` a otro
  runtime (Cloudflare Workers, Deno Deploy, server propio).
- **Web Speech API sigue funcionando estable** en Chrome Android para
  español. Si cambia el comportamiento (peor reconocimiento, latencia,
  cuotas), se evalúa fallback a Whisper API u otro STT.
- **El patrón de uso real coincide con el patrón estimado**
  (5–20 invocaciones/día, predominio de lecturas, queries sobre las
  mismas 3–10 tablas). Si cambia drásticamente, las decisiones de
  arquitectura M1 podrían quedar cortas antes de M2.
- **El usuario entiende y acepta la deuda técnica de M1.** El proyecto
  no es seguro de producción en M1 y eso está documentado. Si en
  algún momento se decide poner datos sensibles regulados en el
  proyecto Supabase, M1 deja de ser apto y hay que adelantar M2 o
  rediseñar.

---

## 10. Mapa de roadmap

Roadmap modular, estricto, sin saltos (ver Constitución, principio 6).

- **M1 — Funcional y base segura.** Plan F+ con secretos server-side
  desde día 1 (Gemini key y `service_role` en env vars de Edge), auth
  Supabase + JWT, allowlist y redacción server-side. Deuda residual M1
  documentada en sección 6. Cierra cuando se cumplen las métricas de
  éxito de la sección 5.
- **M2 — Hardening.** Cierra los 4 items de deuda residual M1: rol
  Postgres dedicado `orion_vox_executor` (vs `service_role`), preview
  de writes firmado server-side, UI admin para allowlist/redacción,
  RLS estricta donde aplique.
- **M3 — Features.** Multi-modelo (Gemini + alternativos),
  multi-proyecto Supabase, exportación de resultados, gráficos
  básicos, atajos por frases recurrentes, mejoras UX.

Detalle vivo en `docs/05-implementation/ROADMAP.md` cuando exista.

---

## Cláusula de cierre

> Este PRD describe el "qué" y el "para qué" de Orion Vox. El "cómo" se
> define en `docs/02-architecture/`, `docs/03-adr/` y
> `docs/04-specs/`. Cualquier cambio sustantivo a este PRD requiere
> registro en ADR y revisión del tribunal (ver `CHANGE-PROTOCOL.md`).
