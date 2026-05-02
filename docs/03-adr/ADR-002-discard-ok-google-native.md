---
title: "ADR-002: Descarte de \"OK Google\" nativo hands-free en español"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-006-pure-pwa-no-kotlin.md
  - ADR-007-web-speech-api-internal-voice-mode.md
  - ADR-011-spanish-as-primary-language.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-002: Descarte de "OK Google" nativo hands-free en español

## Contexto

La idea original del usuario era: decir "OK Google, anotá una tarea para
mañana" o "OK Google, mostrame los pendientes" desde el celular y que
Gemini sistema invoque a Orion Vox sin que el usuario tenga que abrir
nada. Es decir, **hands-free completo en español, sin abrir la app**.

Durante los 4 rounds del tribunal Claude↔Codex se invirtió investigación
real para validar si eso era posible en mayo 2026 con el hardware target
(Cubot KingKong 9, Android stock con Gemini integrado, sin Bixby, sin
Quick Phrases). El hallazgo fue contundente y está documentado en engram
bajo el topic `ok google español imposible mayo 2026`.

Resultados clave (todos verificados contra fuentes oficiales):

- **App Actions con Custom Intents** (la API moderna de Google Assistant /
  Gemini para que apps de terceros expongan intents conversacionales):
  - Documentación oficial 2026-02-26: **`en-US` exclusivamente**. No hay
    soporte para español en Custom Intents al día de la decisión.
  - Requieren **publicación obligatoria en Play Store** para ser
    indexables por el sistema (sideload no registra Custom Intents).
  - Limitan los parámetros de tipo `text` a un **máximo de 2** por
    intent — insuficiente para un asistente conversacional.
  - Fuente: `developer.android.com/guide/app-actions/custom-intents`
    (snapshot 2026-02-26).

- **AppFunctions** (la API sucesora moderna, Android 16+):
  - **Early Access Program gated**: requiere aplicación y aprobación de
    Google. Sin garantía de acceso.
  - Hardware soportado: Pixel 10, Galaxy S26 — **no Cubot**.
  - Requiere app nativa Kotlin publicada (no PWA, no sideload trivial).

- **Conversational Actions**: muerto. Google las deprecó en 2023.

- **Bixby Routines**: requieren hardware Samsung. Cubot KingKong 9 no es
  Samsung.

- **Pixel Quick Phrases**: requieren hardware Pixel. Cubot KingKong 9 no es
  Pixel. Además no exponen API pública para terceros.

- **Tasker + AutoVoice**: técnica histórica que funcionaba como puente
  entre Google Assistant y apps. **Roto desde 2019** por cambios en
  Google Assistant; AutoVoice ya no recibe los comandos.

## Decisión

Orion Vox **NO intenta** integración hands-free completa con Gemini sistema
en español. Esa puerta está cerrada en el hardware y stack target al día
de hoy, y forzarla significaría:

- traducir la UX a inglés (rechazado por el usuario, contradice ADR-011), o
- comprar hardware nuevo Pixel/Galaxy y migrar el plan completo
  (rechazado por costo y por desviarse del objetivo), o
- esperar que Google libere AppFunctions a hardware Cubot (rechazado por
  ser plan de no hacer nada).

En su lugar, se acepta el **wake aproximado** vía:

- **"OK Google, abrí Orion Vox"** — Google Assistant interpreta esto como
  una intención de "abrir app" (capability genérica, no Custom Intent), y
  lanza la PWA. La PWA, al arrancar, activa `SpeechRecognition` en `es-MX`
  automáticamente (ver ADR-007).
- **Atajos Android nativos**: icono en home, widget en lockscreen, Quick
  Tile en el panel de notificaciones, todos lanzando la PWA con
  micrófono listo.

El usuario sigue diciendo lo que quiere "casi" hands-free: dos pasos en
vez de uno (lanzar + hablar), con la app completamente operada por voz a
partir del segundo paso.

## Alternativas consideradas

- **Traducir la UX a inglés y usar Custom Intents en-US**: rechazado por el
  usuario explícitamente. La premisa central del proyecto es voz natural
  en español. Cambiar el idioma para acomodar una limitación de plataforma
  invierte la prioridad y quema la razón de existir del producto.
- **Comprar Pixel 10 + esperar acceso AppFunctions EAP**: rechazado por
  costo, por incertidumbre del EAP, y por desviar el alcance hacia "elegir
  hardware nuevo" en vez de "hacer funcionar el hardware actual".
- **Bixby Voice Wake (con hardware Samsung futuro)**: postergado a un
  hipotético escenario donde el hardware cambie. No bloquea la decisión.
- **Wake word en background dentro de la PWA** (mantener mic siempre
  escuchando): rechazado por consumo de batería, por restricciones de
  Chrome Android al mic en background, y porque la UX de "siempre
  escuchando" excede el alcance de M1.
- **App Kotlin nativa con foreground service de wake word**: rechazado por
  contradecir ADR-006 (PWA pura sin Kotlin) y por costo de mantenimiento.

## Consecuencias

**Positivas**:

- Decisión cerrada y documentada: no se vuelve a re-debatir cada tres
  meses si "ya hay forma de hacer hands-free completo".
- Mantiene la PWA pura (ADR-006) y el español como idioma primario
  (ADR-011) sin compromisos.
- Elimina dependencia de gatekeeping (Play Store, EAP de AppFunctions).

**Negativas / deuda asumida**:

- El usuario debe ejecutar dos acciones para hablar: invocar la app
  ("OK Google, abrí Orion Vox" o tocar atajo) **y luego** hablar el
  pedido. No es el "OK Google, anotá una tarea" puro.
- La latencia de arranque de la PWA + activación del mic introduce un
  delay perceptible (estimado 1-3 segundos en hardware Cubot).
- Si el navegador no fue abierto recientemente, el wake puede mostrar
  splash screen antes de capturar voz.

**Neutrales**:

- El UX de la PWA puede compensar parcialmente con un `auto-listen` al
  arranque y feedback visual + auditivo de "te estoy escuchando" en
  menos de 500ms tras open.

## Aplicabilidad

- Aplica a **M1, M2 y M3**.
- Revisión condicional: si en algún momento (a) Google publica Custom
  Intents en español, **o** (b) AppFunctions sale de EAP y soporta
  hardware Cubot, se reabre como ADR-013+.

## Referencias

- ADR-001 — Plan F+ que codifica este wake aproximado.
- ADR-007 — Web Speech API como capa de voz interna que reemplaza el
  hands-free perdido.
- ADR-011 — Español como idioma primario (justifica el rechazo de la
  alternativa "traducir a inglés").
- Doc oficial: `developer.android.com/guide/app-actions/custom-intents`
  (consultado 2026-02-26).
- Engram: `ok google español imposible mayo 2026`.
