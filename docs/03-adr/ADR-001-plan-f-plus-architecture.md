---
title: "ADR-001: Adopción de Plan F+ como arquitectura base"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-002-discard-ok-google-native.md
  - ADR-003-plan-json-not-sql.md
  - ADR-006-pure-pwa-no-kotlin.md
  - ADR-007-web-speech-api-internal-voice-mode.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
  - ../02-architecture/OVERVIEW.md
---

# ADR-001: Adopción de Plan F+ como arquitectura base

## Contexto

Orion Vox arrancó como una idea conversacional: "quiero hablarle al celular
en español, que entienda lo que pido, y que toque mi Supabase". A partir de
esa premisa, durante cuatro rounds de debate entre Claude, Codex y el
usuario se evaluaron siete planes arquitectónicos distintos (A, B, C, D, D',
E, F y la variante final F+). Cada uno se cayó por una razón distinta
documentada (gatekeeping de Play Store, idioma forzado a inglés, hardware
no compatible, dependencia de APIs en Early Access, etc.).

El hardware target es un **Cubot KingKong 9** (Android stock con Gemini,
sin Bixby, sin Quick Phrases, sin acceso a AppFunctions EAP). El idioma
target es **español rioplatense / es-MX**. El modelo de distribución es
**sideload** — sin Play Store, sin gatekeeping de Google. El usuario es uno
solo (no hay multi-tenancy).

La pregunta de fondo era: ¿cómo combinar voz natural en español + ejecución
sobre Postgres + cero dependencia de gatekeepers, en un dispositivo que no
tiene los privilegios de hardware Pixel/Samsung? Plan F+ es la respuesta de
consenso.

## Decisión

Se adopta **Plan F+** como arquitectura base de Orion Vox para los tres
milestones del roadmap (M1, M2, M3). Plan F+ se compone de:

1. **PWA pura sideloaded** instalada en el Cubot KingKong 9, sin wrapper
   nativo, sin Kotlin, sin Play Store.
2. **Web Speech API** (`SpeechRecognition` + `SpeechSynthesis`) configurada
   en `es-MX` para captura y respuesta hablada dentro de la app.
3. **Gemini API con function calling**, invocada desde la PWA, devolviendo
   un **Plan JSON** estructurado (nunca SQL libre).
4. **Edge Function `execute-plan`** desplegada en Supabase, que valida el
   Plan JSON contra un schema, lo traduce a SQL parametrizado, lo ejecuta y
   audita el resultado en `orion_audit`.
5. **Atajos Android nativos** (icono home, lockscreen widget, Quick Tile)
   complementados con el wake aproximado **"OK Google, abrí Orion Vox"**
   para lanzar la app con micrófono listo.

El "+" en F+ marca la diferencia con el Plan F original: F era PWA pura sin
ningún punto de contacto con la voz del sistema. F+ acepta el wake
aproximado vía "OK Google, abrí Orion Vox" como concesión pragmática para
no perder por completo la sensación hands-free.

## Alternativas consideradas

- **Plan A — PWA con chat propio puro**: descartado porque ignoraba la
  premisa central (voz natural en el sistema). Sería sólo una web con
  textarea — perdíamos el caso de uso.
- **Plan B — PWA + Custom GPT Action**: descartado porque introducía
  dependencia de OpenAI y de un layer Action externo, sin ganar nada
  en hands-free real, y duplicando proveedores.
- **Plan C — Esperar AppFunctions GA**: descartado porque AppFunctions
  está en Early Access Program gated, sin garantía de acceso, restringido
  a Android 16+ y a hardware Pixel 10 / Galaxy S26. Esperar es plan de no
  hacer nada.
- **Plan D — TWA con deep links**: descartado porque deep links no
  resuelven el problema de voz; sólo permiten lanzar la app desde URLs.
- **Plan D' — TWA + Custom Intents**: descartado por tres razones
  documentadas (doc oficial 2026-02-26): Custom Intents son **solo en-US**,
  requieren publicación obligatoria en Play Store (incompatible con
  sideload), y limitan los `text` params a un máximo de 2.
- **Plan E — App Kotlin nativa + AppFunctions**: descartado porque
  AppFunctions está en EAP gated (sin garantía de acceso) y porque mete a
  todo el proyecto en el ciclo de release de Android nativo, anulando la
  ventaja de iteración inmediata de la PWA.
- **Plan F original — PWA pura sin "OK Google"**: Claude lo recomendó al
  inicio por sesgo PWA-first, pero el usuario lo descartó porque perdía
  el último resquicio de hands-free disponible para hardware Cubot. F+
  recupera ese resquicio con "OK Google, abrí Orion Vox".
- **Bixby Routines**: descartado porque el hardware no es Samsung.
- **Pixel Quick Phrases**: descartado porque el hardware no es Pixel y no
  hay API pública para terceros aunque lo fuera.
- **Tasker + AutoVoice**: descartado porque AutoVoice está roto desde 2019
  por cambios de Google Assistant.

## Consecuencias

**Positivas**:

- 100% web: cero dependencia de Play Store, cero proceso de revisión, cero
  esperas por aprobación de Google.
- Iteración inmediata: deploy de la PWA = `git push`, sin ciclo de build
  Android.
- Español nativo de punta a punta (Web Speech `es-MX`, Gemini en español,
  UX en español).
- Sin Kotlin, sin Android Studio, sin APK signing — un solo stack web.
- Toda la inteligencia vive en la PWA + Edge Functions, fácil de debuggear
  localmente.

**Negativas / deuda asumida**:

- Se pierde el hands-free completo "OK Google, agregá una tarea para
  mañana". El wake aproximado "OK Google, abrí Orion Vox" sólo lanza la
  app; el usuario aún tiene que hablar adentro.
- La PWA debe estar abierta o ser invocada por atajo cada vez. No hay
  background voice listening.
- Web Speech API en Chrome Android usa los servidores de Google: no
  funciona offline y la calidad depende de la red.
- Se asume el riesgo de la "lethal trifecta" (LLM + entrada usuario +
  acceso a datos sensibles), mitigado por los innegociables del proyecto
  (ver Constitución).

**Neutrales**:

- El framework concreto de la PWA (Vite + React, SvelteKit, Next.js, etc.)
  queda explícitamente sin decidir hasta el inicio de M1 (futuro ADR-012).
- La elección de `es-MX` vs `es-AR` para TTS depende de pruebas reales en
  hardware; no es decidible en papel.

## Aplicabilidad

- Aplica a **M1, M2 y M3**. Es la arquitectura base del proyecto. Cualquier
  cambio que la modifique requiere un nuevo ADR que la **supersede**
  explícitamente.
- Revisión: si Google libera AppFunctions a hardware Cubot o si aparece
  una API pública de wake words en es-MX, se reabre la discusión.

## Referencias

- ADR-002 — descarte de "OK Google" hands-free completo.
- ADR-003 — Plan JSON como contrato Gemini ↔ ejecución.
- ADR-006 — confirmación de PWA pura sin Kotlin.
- ADR-007 — Web Speech API como modo voz interno.
- ADR-009 — roadmap modular M1 → M2 → M3.
- `docs/00-constitution/CONSTITUTION.md` — principios fundacionales.
- `docs/02-architecture/OVERVIEW.md` — diagrama de componentes.
- Engram: `consenso final arquitectura Orion Vox`, `pivote arquitectónico
  Orion Vox single user`, `veredicto round 2 TWA Gemini`.
