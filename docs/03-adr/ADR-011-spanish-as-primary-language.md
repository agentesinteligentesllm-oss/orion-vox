---
title: "ADR-011: Español como idioma primario"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-002-discard-ok-google-native.md
  - ADR-007-web-speech-api-internal-voice-mode.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-011: Español como idioma primario

## Contexto

El usuario es hispanohablante (rioplatense) y la premisa central del
proyecto es **hablar al celular en español natural**. Esta es la razón
por la cual:

- ADR-002 descarta "OK Google" hands-free completo: Custom Intents son
  `en-US` only y traducir la UX a inglés invertiría la prioridad del
  proyecto.
- ADR-007 elige Web Speech API: porque soporta `es-MX` (y `es-AR`)
  para reconocimiento y síntesis.

Pero "español primario" tiene varias dimensiones a definir
explícitamente para evitar ambigüedad: ¿qué significa "primario"? ¿UX
en español pero código en inglés? ¿Errores en español pero logs en
inglés? ¿Mensajes a Gemini en español o en inglés? ¿i18n para futuro
multi-idioma o no?

Este ADR fija las respuestas para que ningún componente futuro tenga
que improvisar.

## Decisión

**Español es el idioma primario y único del proyecto, sin i18n**.

Concretamente:

- **UX visible al usuario**: español. Todos los textos de la PWA
  (botones, labels, placeholders, errores visibles, modales de
  confirmación, mensajes de estado, onboarding) en español rioplatense
  / es-MX (sin formalidades innecesarias, voseo cuando suene natural,
  "vos" en vez de "tú").
- **Voz**:
  - **Reconocimiento** (`SpeechRecognition`): configurado en `es-MX`
    como locale primario. Si en pruebas Cubot `es-AR` da mejores
    resultados, se usa `es-AR`.
  - **Síntesis** (`SpeechSynthesis`): voz `es-MX` o `es-AR`, según
    cuál suene más natural en hardware Cubot.
- **Documentación**: el README, los ADRs, las specs, los runbooks, el
  glosario — todo en español. Términos técnicos en inglés sólo cuando
  son nombres propios (`PWA`, `Edge Function`, `Plan JSON`,
  `Service Worker`, etc.).
- **Mensajes de error visibles al usuario**: en español, claros, sin
  códigos de error técnicos como mensaje principal (los códigos pueden
  estar en logs y como detalle expandible).
- **Prompts a Gemini**: el system prompt y los user messages se
  envían **en español**. Gemini responde en español. Esto incluye los
  hints semánticos del Schema Summary (ADR-010).
- **Código fuente**: en **inglés**. Nombres de variables, funciones,
  tipos, componentes, archivos, branches, commits. Esto es convención
  estándar de la industria y facilita el uso de tooling (linters,
  autocompletado, librerías).
- **Identificadores de Postgres**: nombres de tablas y columnas
  pueden estar en español (`tareas`, `vence`) o inglés según prefiera
  el usuario en su Postgres real — Orion Vox no impone convención
  acá.
- **Logs internos** (Edge Functions, debugging): en inglés, por
  consistencia con tooling y para que sean grep-ables con vocabulario
  estándar.

**Sin i18n, sin selector de idioma**:

- No hay archivos de traducciones (`en.json`, `es.json`, etc.).
- No hay `i18n` framework (`react-intl`, `i18next`, etc.).
- No hay selector de idioma en la UI.
- Si en el futuro se quisiera abrir a otros idiomas, **eso sería un
  proyecto distinto**, no una evolución de éste. Mismo principio que la
  decisión de single-user (Constitución § 1).

## Alternativas consideradas

- **Bilingüe es/en con i18n desde día 1**: rechazado. Single-user
  hispanohablante no necesita inglés. Agregar i18n preventivo es
  over-engineering; cada string duplicado y cada selector de idioma es
  scope no usado.
- **UX en inglés (para acomodar Custom Intents)**: rechazado por
  contradecir la premisa central. Ya descartado en ADR-002.
- **UX en español pero docs en inglés** (para colaboradores futuros):
  rechazado. Los docs son para el usuario y el tribunal (Claude, Codex,
  usuario). Los tres operan en español. Inglés sería traducir hacia
  nadie.
- **Código en español** (`tareas`, `crearTarea()`): rechazado. Pelea
  contra todo el ecosistema (linters, librerías, ejemplos, prompts a
  LLMs durante desarrollo). El costo de mezclar idiomas en código no
  paga su beneficio.
- **Logs en español**: rechazado por la misma razón. Logs son para
  debug técnico, vocabulario estándar de la industria es inglés.

## Consecuencias

**Positivas**:

- UX coherente y natural para el usuario, sin "lost in translation".
- Sin overhead de i18n en código (un selector de idioma menos, un
  bundle más liviano, menos lógica).
- Documentación accesible directamente al usuario sin necesidad de
  traducción.
- Los prompts a Gemini en español aprovechan que los modelos modernos
  responden bien en español sin penalización notable.

**Negativas / deuda asumida**:

- Si el proyecto eventualmente se quisiera abrir a otros usuarios
  hispanohablantes con preferencia por otra variante (ej. español
  ibérico vs rioplatense), la UX no está parametrizada. Aceptable
  porque single-user (Constitución § 1).
- Algunos términos técnicos en docs van a tener variante mixta
  inevitablemente ("la Edge Function", "el Service Worker"). Aceptable.
- Onboarding de un colaborador no hispanohablante sería difícil. No es
  un problema actual (tribunal y usuario son hispanohablantes).

**Neutrales**:

- La elección final entre `es-MX` y `es-AR` para Web Speech (TTS y
  STT) se hace en M1 con prueba real en Cubot, no en este ADR.

## Aplicabilidad

- Aplica al **proyecto entero, M1, M2 y M3**.
- Es uno de los **principios constitucionales** (§ 11 — Español como
  idioma primario).

## Referencias

- ADR-001 — Plan F+ se construye sobre la premisa de español natural.
- ADR-002 — descarte de "OK Google" nativo, justificado en parte por
  no traducir la UX a inglés.
- ADR-007 — Web Speech API en `es-MX`.
- `docs/00-constitution/CONSTITUTION.md` § 1 (single user) y § 11
  (español primario).
- Glosario: `Cubot KingKong 9` (hardware target hispanohablante).
