---
title: Bitácora de investigación — rounds 1, 2 y 3
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ./DEBATE-LOG.md
  - ../EXTERNAL-LINKS.md
  - ../../03-adr/ADR-001-plan-f-plus-architecture.md
  - ../../03-adr/ADR-002-discard-ok-google-native.md
---

# Bitácora de investigación — Orion Vox

Síntesis de los rounds de investigación que sostuvieron las decisiones
arquitectónicas del proyecto. **Este documento NO transcribe respuestas
completas**: captura tema, fecha, fuentes consultadas, hallazgo principal
e impacto sobre las decisiones documentadas en los ADRs.

> Las transcripciones largas viven en engram (`mem_search` con los topics
> mencionados al final de cada round) y en el historial de chat del
> usuario. Acá queda el resumen permanente.

---

## Round 1 — Mecanismos de Gemini para operar apps Android (2026-05-01)

### Tema
Investigación inicial sobre **cómo Gemini en Android opera apps de
terceros** y si una PWA (sideloaded o instalada como TWA) podía ser
invocada por voz desde "OK Google" en español.

### Disparador
El usuario aclaró que ya había usado Gemini para mandar mensajes por
WhatsApp desde su Android. Eso contradecía el análisis preliminar de
Claude que decía "no se puede integrar PWA con Gemini sistema". Hubo que
distinguir los **mecanismos reales** de integración.

### Fuentes consultadas
- `developer.android.com/guide/app-actions/overview`
- `developer.android.com/guide/app-actions/built-in-intents`
- `developer.android.com/ai/appfunctions`
- Artículos técnicos de 2025-2026 sobre la transición Google Assistant →
  Gemini.
- Documentación de Bubblewrap y PWABuilder.

### Hallazgo principal
Gemini en Android opera apps de terceros por **cuatro mecanismos
distintos** — no uno solo:

1. **Built-in App Actions** (BIIs como `SEND_MESSAGE`): cómo funciona
   WhatsApp. Limitado a verbos predefinidos por Google.
2. **Custom App Actions / deep links**: Gemini infiere desde voz cuál
   deep link abrir. Frágil, heurístico.
3. **AppFunctions**: function calling estructurado app-Gemini. **Alpha,
   gated, EAP, hardware Pixel 10 / Galaxy S26**. PWAs no pueden
   registrar AppFunctions — la API está pensada para Kotlin nativo.
4. **Accessibility / Gemini Live "ver pantalla"**: Gemini observa la UI
   y opera táctilmente. Disponible para cualquier app pero frágil y
   visual.

PWAs puras solo acceden al mecanismo (4). TWAs llegan a (2) y (4). Solo
apps nativas Kotlin acceden a los cuatro.

### Impacto sobre decisiones
- **Descarte preliminar** de la fantasía "Gemini sistema invoca a la PWA
  con un function call estructurado y lee el resultado de vuelta por
  voz". Eso requiere AppFunctions, que requiere acceso EAP + hardware
  Pixel 10, ninguno disponible.
- Apertura del análisis hacia opciones híbridas (TWA + deep links + Edge
  Functions) — luego también descartadas en Round 2.

### Engram
- Topic: `architecture/gemini-android-bridge-mechanisms`
- Observación: `#437 — Rectificación: Gemini Android sí opera apps, pero
  solo nativas o TWA con deep links`.

---

## Round 2 — TWA + App Actions con Gemini en 2026 (2026-05-01)

### Tema
Validación profunda de la viabilidad de la opción **TWA con Custom
Intents de App Actions**, asumiendo Gemini como asistente activo
(post-marzo 2026, cuando Google apagó el Assistant clásico).

### Disparador
Codex propuso Plan D' (TWA + Custom Intents + Edge Functions) como
cumplimiento mínimo de la premisa "OK Google hands-free". Había que
confirmar si la promesa se sostenía técnicamente con casos reales de
2026.

### Fuentes consultadas
- `developer.android.com/ai/appfunctions` (estado del programa EAP).
- `developer.chrome.com/docs/android/trusted-web-activity/query-parameters`
  (paso de query strings a TWA).
- `codelabs.developers.google.com/codelabs/appactions` (tutorial oficial
  vigente).
- Repositorio Bubblewrap (qué genera y qué no).
- Búsqueda activa de **casos públicos documentados** de TWA + Gemini en
  producción (2025-2026).

### Hallazgo principal
- **TWA + deep links abre la UI sin voz de respuesta**. Gemini puede
  abrir la TWA con query params, pero NO lee el resultado de vuelta por
  voz si no hay AppFunctions.
- **Custom Intents** existen pero requieren editar el wrapper Android a
  mano (Bubblewrap NO los genera) y pasar por review manual de Google
  Play.
- **Cero casos públicos documentados** de TWA + Gemini en producción.
  Todos los integradores se movieron a Kotlin nativo.
- **AppFunctions sigue gated** (alpha08, EAP, sin garantía de acceso) y
  exige Android 16+.
- **Conversational Actions** murió en jun-2023 sin sucesor de terceros.

### Impacto sobre decisiones
- **Pivote** del Plan D inicial al **Plan D' híbrido** (APK Kotlin
  mínima + PWA + Edge Functions). Tribunal aceptó temporalmente este
  plan como mejor compromiso.
- Codex aportó tres correcciones que quedaron firmes incluso después
  del descarte de D' en Round 3:
  - **Plan JSON** estructurado en lugar de SQL libre.
  - **Rol Postgres dedicado** en M2 (no `service_role` perpetuo).
  - **Schema autogenerado** + **auditoría server-side** desde M1.

### Engram
- Topic: `architecture/twa-gemini-final-options`
- Observación: `#439 — Veredicto round 2: TWA + Gemini OK Google = abre
  UI sin voz de respuesta`.
- Topic: `architecture/final-architecture-consensus` (consenso D')
- Observación: `#440 — Consenso Claude+Codex: Plan D' híbrido (APK
  nativa mínima + PWA + Edge Functions)`.

---

## Round 3 — Validación crítica de afirmaciones sobre Custom Intents (2026-05-01)

### Tema
Verificación cruzada de **tres afirmaciones absolutas** que Codex había
puesto sobre la mesa al cuestionar la viabilidad de Custom Intents en
español + sideload:

1. Custom Intents son `en-US` exclusivamente.
2. Custom Intents requieren publicación en Play Store.
3. Custom Intents limitan los `text` params a un máximo de 2.

### Disparador
Antes de gastar semanas montando Plan D' con APK Kotlin + Custom
Intents, hacía falta confirmar que esas afirmaciones eran ciertas en
**mayo 2026** (no en 2023, no en blog post desactualizado). Si las tres
eran ciertas, Plan D' colapsaba.

### Fuentes consultadas
- `developer.android.com/guide/app-actions/custom-intents` — snapshot
  oficial 2026-02-26.
- Documentación de **Bixby Routines** (Samsung) — para evaluar wake
  words alternativos en español.
- Documentación de **Pixel Quick Phrases** — APIs públicas para
  terceros.
- Estado de **Tasker + AutoVoice** post-2019.
- **Google Home Routines** — capacidad de slots de texto libre.

### Hallazgo principal
Las tres afirmaciones de Codex se confirmaron **3 de 3**:

- ✅ **`en-US` only**: confirmado por la doc oficial 2026-02-26.
- ✅ **Play Store obligatorio**: sideload no registra Custom Intents
  reconocibles por Gemini.
- ✅ **Máx 2 text params**: insuficiente para un asistente
  conversacional con N entidades.

Adicionalmente, todas las opciones alternativas en hardware no-Cubot
también cayeron:

- **Bixby Routines**: descartado por hardware no Samsung.
- **Pixel Quick Phrases**: descartado por hardware no Pixel + sin API
  para terceros aunque lo fuera (solo Stop/Snooze/Answer/Decline).
- **Tasker + AutoVoice**: roto desde 2019 cuando Google mató third-party
  Assistant actions.
- **Google Home Routines**: frase fija sin slots de texto libre.

### Impacto sobre decisiones
- **Descarte definitivo** del "OK Google hands-free completo en español"
  como entry point del proyecto. La premisa central original (que había
  sido el norte del usuario) quedó inviable bajo cualquier combinación
  realista.
- **Pivote final al Plan F+**: PWA pura + Web Speech API + atajos Android
  nativos + wake aproximado vía "OK Google, abrí Orion Vox" (que NO usa
  Custom Intents — usa la capability genérica de "abrir app").
- ADR-002 documenta esta decisión cerrada.

### Engram
- Topic: `research/ok-google-spanish-impossible`
- Observación: `#443 — Confirmado: OK Google + texto libre + español +
  sideload = imposible mayo 2026`.

---

## Fuentes clave consolidadas

URLs que aparecieron en más de un round o que sustentan más de una
decisión arquitectónica. La curaduría completa vive en
[`../EXTERNAL-LINKS.md`](../EXTERNAL-LINKS.md).

| URL | Rounds donde apareció | Decisión que sostiene |
|-----|----------------------|-----------------------|
| `developer.android.com/guide/app-actions/custom-intents` | 1, 2, 3 | ADR-002 (descarte OK Google) |
| `developer.android.com/ai/appfunctions` | 1, 2 | ADR-001 (descarte plan E), ADR-006 (PWA pura) |
| `developer.chrome.com/docs/android/trusted-web-activity/query-parameters` | 2 | ADR-001 (descarte plan D), ADR-006 |
| `codelabs.developers.google.com/codelabs/appactions` | 2 | ADR-002 (refuerzo `en-US`) |
| `developer.mozilla.org/.../SpeechRecognition` | 3 (cierre) | ADR-007 (Web Speech como capa de voz) |
| `simonwillison.net/.../supabase-mcp-lethal-trifecta` | (continuo) | ADR-003 (Plan JSON), THREAT-MODEL |

---

## Lecciones aprendidas (para futuras decisiones)

1. **No confiar en información de modelos LLM sobre APIs vivas.** La
   verdad cambia. Toda afirmación absoluta ("no se puede X", "Y es
   imposible") debe validarse contra fuente oficial actual con fecha de
   snapshot. Los rounds 1 y 2 erraron por suponer; el round 3 acertó por
   verificar.
2. **Las afirmaciones absolutas deben matizarse con condiciones.** "Las
   Custom Intents no funcionan" es falso a secas; "las Custom Intents no
   funcionan **en español** + **sideload** + **con más de 2 params text**"
   es verdadero. El nivel de detalle salva semanas de implementación.
3. **Las APIs en Early Access Program no son plan, son ilusión.**
   AppFunctions estuvo dos rounds como esperanza; al confirmarse "alpha,
   gated, sin garantía" se descartó. Construir sobre EAP = construir
   sobre arena.
4. **Buscar casos públicos en producción** de cualquier integración nueva
   antes de adoptarla. Si nadie lo está usando hoy en una app real, la
   viabilidad es teórica. Round 2 lo confirmó: cero casos de TWA+Gemini.
5. **La premisa central puede ser inviable.** Es válido — y necesario —
   declararla muerta y pivotear. Lo que NO es válido es seguir empujando
   un plan inviable porque ya se invirtió tiempo en él (sunk cost).
   Round 3 mató la premisa "OK Google" y el proyecto siguió vivo.
