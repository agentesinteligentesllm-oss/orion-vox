---
title: Glosario canónico de Orion Vox
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - CONSTITUTION.md
  - ../02-architecture/OVERVIEW.md
---

# Glosario

Términos canónicos del proyecto. Si un documento usa uno de estos términos
con un significado distinto al de acá, **el glosario gana** y el documento
debe corregirse.

---

### Plan JSON

Estructura de datos producida por Gemini en respuesta a un prompt
conversacional, que describe la operación a ejecutar contra Postgres en
forma declarativa. Forma mínima v1.0 (una operación por request,
`operation` singular): `{ version: '1.0', operation:
'select'|'insert'|'update'|'delete', table, columns?, values?, filters?,
limit?, order_by?, joins? }`. **Nunca contiene SQL**. Es validado por
la Edge Function `execute-plan` antes de cualquier ejecución. Ver
`docs/04-specs/spec-plan-json-schema.md` (canónico) y
`docs/02-architecture/PLAN-JSON-CONTRACT.md`.

### Schema Summary

Resumen filtrado y curado del esquema de Postgres del proyecto Supabase
del usuario, que se inyecta como `system prompt` en la llamada a Gemini.
En M1 se construye manualmente (dump filtrado por humano); en M2 lo
genera la Edge Function `schema-summary` con allowlist server-side.

### execute-plan (Edge Function)

Edge Function Deno desplegada en Supabase que recibe un Plan JSON, lo
valida contra el esquema, lo traduce a SQL parametrizado, lo ejecuta
con `service_role` (M1) o con `orion_vox_executor` (M2), inserta el
resultado en `orion_audit`, y devuelve el resultado a la PWA.

### schema-summary (Edge Function)

Edge Function Deno (M2 en adelante) que devuelve el schema summary
filtrado a la PWA. En M1 esta función puede estar ausente y el summary
viajar embebido en el bundle de la PWA, como deuda técnica documentada.

### orion_audit (tabla)

Tabla Postgres donde se registra **toda** ejecución que pasa por
`execute-plan`, exitosa o fallida. Columnas mínimas: `id`, `created_at`,
`plan_json`, `sql_ejecutado`, `filas_afectadas`, `error`, `latencia_ms`.
Es la única fuente de verdad de auditoría.

### service_role

Rol de Supabase con privilegios totales sobre el proyecto, incluido
bypass de RLS. Se usa en M1 como deuda técnica explícita: la Edge
Function ejecuta con `service_role` mientras se construye y prueba el
flujo end-to-end. **Se reemplaza en M2** por `orion_vox_executor`.

### orion_vox_executor

Rol Postgres dedicado planificado para M2, con `GRANT` mínimo necesario
sobre las tablas allowlisted, sin bypass de RLS, con `statement_timeout`
forzado y sin permisos DDL. Su definición vivirá en
`docs/04-specs/orion-vox-executor-role.md` cuando se implemente.

### PWA (Progressive Web App)

Aplicación web instalable, en este caso por sideload (no Play Store), que
corre en el navegador del Cubot KingKong 9 y se comporta como app nativa:
icono en home, pantalla completa, service worker para caching, acceso a
APIs del navegador (mic, almacenamiento). El framework concreto se decide
en ADR-012 al arrancar M1.

### TWA (Trusted Web Activity)

Patrón Android para envolver una PWA en un APK distribuible por Play
Store y obtener acceso a integraciones nativas como App Actions.
**Descartado** en este proyecto porque las App Actions con Custom Intents
son `en-US` only y requieren publicación en Play Store. Ver
`docs/03-adr/ADR-002-discard-ok-google-native.md`.

### AppFunctions

API moderna de Android (Android 16+) para que apps expongan funciones
invocables desde Gemini sistema vía intents semánticos. **Descartada**
en este proyecto: está en EAP gated, requiere app nativa Kotlin y
publicación regulada. Ver `docs/03-adr/ADR-006-pure-pwa-no-kotlin.md`.

### Web Speech API

API estándar del navegador con dos componentes:

- `SpeechRecognition` — reconocimiento de voz a texto (en Orion Vox,
  configurado en `es-MX`).
- `SpeechSynthesis` — síntesis de texto a voz (TTS).

Es la base de la capa de voz de la PWA. Limitaciones conocidas:
implementación en Chrome Android va al servidor de Google, no funciona
offline; calidad variable según hardware y red.

### Function calling

Capacidad de Gemini API (y otros LLMs modernos) de devolver respuestas
estructuradas que coinciden con un schema declarado por el cliente, en
vez de texto libre. En Orion Vox se usa exclusivamente para que Gemini
devuelva el Plan JSON con forma garantizada.

### Cubot KingKong 9

Smartphone Android rugged, hardware target oficial del proyecto.
Características relevantes: Android stock con Gemini integrado,
**sin** Bixby (no es Samsung), **sin** Quick Phrases (no es Pixel),
**sin** acceso a AppFunctions EAP. El único atajo de voz hands-free
disponible es "OK Google, abrí <nombre de app>".

### Tribunal de IAs

Modelo de gobernanza del proyecto: tres voces (Claude, Codex, usuario)
con roles definidos en `GOVERNANCE.md`. Toda decisión arquitectónica
requiere consenso o escalación al usuario.

### ADR (Architecture Decision Record)

Documento corto que registra una decisión arquitectónica con: fecha,
contexto, alternativas evaluadas, decisión tomada, consecuencias y
estado (`proposed | accepted | superseded | deprecated`). Vive bajo
`docs/03-adr/`.

### M1 / M2 / M3

Milestones del roadmap modular:

- **M1** — MVP funcional: Plan F+ con deuda aceptada.
- **M2** — Hardening: rol dedicado, secrets server-side, RLS estricta.
- **M3** — Features: multi-modelo, multi-proyecto, exports, gráficos.

### Innegociables

Lista de reglas duras de M1 que **no admiten excepción** sin ADR explícito
de suspensión: Plan JSON estructurado, operaciones bloqueadas hardcoded,
auditoría server-side, confirmación táctil para writes, LIMIT obligatorio,
statement_timeout. Ver `CONSTITUTION.md`.

### Sideload

Instalación de una app fuera del store oficial. En este proyecto, la PWA
se instala desde un endpoint propio del usuario (o un APK PWA wrapper
local), sin pasar por Play Store. Esto evita el gatekeeping de Google y
permite iteración inmediata, a cambio de no acceder a integraciones
nativas reservadas a apps publicadas.

### Lethal trifecta

Riesgo conocido en sistemas que combinan: **(a)** un LLM con acceso a
herramientas, **(b)** entrada controlada por el usuario o por contenido
externo, y **(c)** acceso a datos sensibles o capacidad de mutarlos.
Orion Vox cae deliberadamente en este patrón, y por eso los innegociables
M1 (Plan JSON, allowlist, confirmación táctil, auditoría) son la
mitigación explícita. Documentado completo en
`docs/02-architecture/THREAT-MODEL.md`.

### Plan F+

Nombre canónico de la **arquitectura aprobada del proyecto**: PWA pura
sideloaded + Web Speech API + Gemini API con function calling +
Plan JSON estructurado + Edge Function `execute-plan` con allowlist y
auditoría + lanzamiento desde "OK Google, abrí Orion Vox". Resulta de los
4 rounds Claude↔Codex↔usuario y descarta explícitamente F puro, TWA,
AppFunctions y app nativa Kotlin. Ver
`docs/03-adr/ADR-001-plan-f-plus-architecture.md`.
