---
title: "ADR-007: Web Speech API como modo voz interno de la PWA"
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
  - ADR-006-pure-pwa-no-kotlin.md
  - ADR-011-spanish-as-primary-language.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-007: Web Speech API como modo voz interno de la PWA

## Contexto

Una vez descartado el "OK Google" hands-free completo en español (ADR-002)
y confirmada la PWA pura sin Kotlin (ADR-006), la voz se vuelve un
**modo interno de la app**: el usuario invoca la PWA (por atajo o por
"OK Google, abrí Orion Vox"), y a partir de ahí toda la interacción
hablada vive dentro del navegador.

Hay varias opciones técnicas para implementar voz dentro de un PWA en
Chrome Android:

- **Web Speech API** (`SpeechRecognition` + `SpeechSynthesis`): API
  estándar del navegador, disponible en Chrome Android, con soporte
  declarado para `es-MX` y `es-AR`. Implementación de Chrome usa los
  servidores de reconocimiento de Google (no funciona offline).
- **Gemini Live API** (audio in / audio out con LLM): producto reciente,
  pensado para conversación continua. Más caro, latencia mayor en hardware
  modesto, y todavía con cobertura idiomática parcial.
- **Grabar audio en cliente + STT en servidor** (Whisper, Deepgram, etc.):
  requiere infraestructura propia, costos por minuto, y no resuelve el
  TTS de retorno.
- **Whisper local en WebAssembly**: viable técnicamente pero el bundle es
  pesado (decenas de MB) y el rendimiento en hardware Cubot no está
  validado.

La voz de Orion Vox tiene dos roles distintos:

1. **Captura del pedido del usuario** (STT): "agregá una tarea para
   mañana".
2. **Respuesta hablada del sistema** (TTS): "listo, agregué la tarea
   para mañana".

Ambos roles deben funcionar en `es-MX` (o `es-AR` si en pruebas TTS suena
mejor). El usuario también debe tener feedback visual sincronizado
(transcript en pantalla, indicador de "escuchando", etc.) para validar
que el sistema entendió.

## Decisión

Orion Vox usa **Web Speech API** como única capa de voz dentro de la PWA:

- **`SpeechRecognition` configurado en `es-MX`** para la captura del
  pedido. Modo: `continuous = false` (cada turno termina al silencio
  detectado), `interimResults = true` (mostrar transcript parcial en
  pantalla), con re-arranque automático tras una respuesta del sistema
  para fluidez conversacional.
- **`SpeechSynthesis` en `es-MX`** (con `es-AR` como fallback si `es-MX`
  no está instalado en el dispositivo) para la respuesta hablada.
- **Auto-listen al abrir la app**: la PWA, tras chequear permisos de mic,
  arranca a escuchar de inmediato. El usuario no tiene que tocar un
  botón. Esto compensa parcialmente la pérdida del hands-free de
  sistema (ADR-002).
- **Fallback a teclado** siempre disponible: si el mic está denegado, la
  red está caída, o el reconocimiento falla, hay un input de texto.

El bundle de la PWA **no incluye** modelos de STT/TTS propios. La
calidad y latencia dependen de los servicios de Google que Chrome usa
internamente.

## Alternativas consideradas

- **Gemini Live API (audio in / audio out)**: rechazado para M1 por:
  - **Costo**: tokens de audio son mucho más caros que de texto, en
    una app conversacional de uso frecuente eso escala rápido.
  - **Latencia**: en pruebas reportadas en hardware no-flagship, la
    latencia round-trip de Live API es notoriamente más alta que Web
    Speech + Gemini text.
  - **Cobertura idiomática parcial**: el soporte de `es` en Live API en
    fecha de decisión no estaba validado al nivel de Web Speech.
  - Re-evaluable en M3 si latencia y costo mejoran.
- **STT en servidor (Whisper / Deepgram / Speechmatics)**: rechazado.
  Requiere infraestructura propia o un proveedor adicional, costo por
  minuto, y la latencia agregada (audio → server → STT → text → PWA →
  Gemini) hace la conversación lenta. Sin beneficio claro respecto a
  Web Speech para single-user.
- **Whisper local en WASM**: rechazado para M1 por peso del bundle
  (decenas de MB) y por rendimiento incierto en Cubot. Re-evaluable si
  un modelo small + cuantizado demuestra ser usable.
- **TTS con voz "premium" vía API (ElevenLabs, Google Cloud TTS,
  Azure)**: rechazado para M1 — agrega proveedor, costo y latencia. La
  voz de `SpeechSynthesis` `es-MX` es funcional para el caso de uso. Se
  re-evalúa en M3 si la calidad subjetiva resulta insuficiente.

## Consecuencias

**Positivas**:

- Cero costo incremental (la STT/TTS de Chrome es gratis para el
  desarrollador).
- Cero infraestructura propia para voz: nada que monitorear, nada que
  rotar, nada que escalar.
- Latencia razonable: una vez warm, el reconocimiento es prácticamente
  inmediato para frases cortas en `es-MX`.
- Fluidez conversacional: auto-listen tras respuesta + interim results
  en pantalla aproximan la sensación de "estar hablando con alguien".

**Negativas / deuda asumida**:

- **Online-only**: Web Speech en Chrome Android va a los servidores de
  Google. Sin red, no hay voz. Aceptable porque Gemini API también
  requiere red — si no hay red, la app no puede funcionar de todos modos.
- **Calidad variable**: el reconocimiento depende de calidad del mic
  del Cubot, ruido ambiente, conexión y modelos del lado de Google.
- **API no estandarizada al 100%**: hay diferencias entre browsers y la
  API es marcada como experimental en algunas referencias. Aceptable
  porque el target es Chrome Android específicamente.
- **Voces TTS limitadas**: el catálogo de voces `es-MX` instalado por
  defecto es pobre en algunos dispositivos. Mitigable pidiéndole al
  usuario instalar voces de calidad desde la configuración de Android
  ("Text-to-speech engine" en settings).

**Neutrales**:

- La elección entre `es-MX` y `es-AR` para TTS no se decide en este ADR.
  Se valida empíricamente en hardware Cubot durante M1; si `es-AR` suena
  más natural al usuario rioplatense, se usa esa.

## Aplicabilidad

- Aplica a **M1, M2 y M3** salvo que en M3 se decida migrar a Gemini
  Live API u otro proveedor (en cuyo caso requeriría un ADR superseder).

## Referencias

- ADR-001 — Plan F+ donde Web Speech es la capa de voz.
- ADR-002 — descarte del "OK Google" nativo hands-free, que motiva
  reemplazar la voz de sistema por voz interna.
- ADR-006 — PWA pura sin Kotlin, que descarta foreground services o
  wake words nativos.
- ADR-011 — español como idioma primario, que define `es-MX` como
  locale objetivo.
- `docs/00-constitution/CONSTITUTION.md` § 8 (Web Speech API + atajo
  Android).
- Glosario: `Web Speech API`.
- MDN Web Speech API:
  `developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API`.
