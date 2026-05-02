---
title: Voice Input — captura de voz con Web Speech API
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-pwa-shell.md
  - ./spec-gemini-client.md
  - ./spec-tts-output.md
  - ./spec-error-handling.md
  - ../02-architecture/COMPONENTS.md
  - ../03-adr/ADR-007-web-speech-api-internal-voice-mode.md
  - ../03-adr/ADR-011-spanish-as-primary-language.md
---

# Spec — Voice Input

## 1. Propósito

Convertir voz del usuario en texto plano (string en `es-MX`) usando la
Web Speech API del navegador, con feedback visual claro de estado y
fallback a teclado. Este módulo es el **único** punto de entrada de la
intención del usuario en modo voz; la transcripción resultante alimenta
directamente al Gemini API Client.

## 2. Alcance

**Cubre:**

- Inicialización de `SpeechRecognition` con configuración española.
- UI de estado (idle / escuchando / procesando / error).
- Solicitud y manejo del permiso de micrófono.
- Fallback a `<input type="text">` para teclado.
- Cancelación manual del usuario.
- Manejo de errores enumerados de la Web Speech API.

**NO cubre:**

- Wake word interno tipo "Orion" — postergado a M3 con ADR aparte.
- Síntesis de voz de respuesta → `spec-tts-output.md`.
- Llamada a Gemini con la transcripción → `spec-gemini-client.md`.
- Modal de confirmación de writes → `spec-confirmation-flow.md`.

## 3. Interfaces / API / Contratos

### 3.1 Configuración de `SpeechRecognition`

```js
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = 'es-MX';            // ADR-011
recognition.continuous = false;        // un turno a la vez
recognition.interimResults = true;     // feedback en vivo
recognition.maxAlternatives = 1;       // top-1 es suficiente
```

### 3.2 API expuesta por el módulo

```ts
type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error';

interface VoiceInputAPI {
  start(): Promise<void>;
  stop(): void;            // detiene captura, dispara onresult con lo que haya
  cancel(): void;          // descarta lo capturado
  getState(): VoiceInputState;
  on(event: 'state', cb: (s: VoiceInputState) => void): void;
  on(event: 'interim', cb: (text: string) => void): void;
  on(event: 'result', cb: (text: string) => void): void;
  on(event: 'error', cb: (err: VoiceInputError) => void): void;
}

interface VoiceInputError {
  code: 'no-speech' | 'audio-capture' | 'not-allowed' | 'network'
      | 'aborted' | 'service-not-allowed' | 'unavailable';
  message: string;   // mensaje en español listo para mostrar
}
```

### 3.3 UI mínima

| Estado        | Indicador visual                                               | CTA disponibles                            |
|---------------|----------------------------------------------------------------|--------------------------------------------|
| `idle`        | Botón mic grande, color neutro.                                | Tap = start. Botón "teclado".              |
| `listening`   | Botón mic en color de acción, animación pulsante. Texto interim a medida que llega. | Tap = stop. Botón "cancelar".|
| `processing`  | Spinner sutil. "Pensando…".                                    | Botón "cancelar" (cancela todo el turno).  |
| `error`       | Icono de error, mensaje en español, CTA "Tocá para reintentar".| Tap = volver a `idle`. Botón "teclado".    |

El botón debe ser **grande** (>= 96×96 dp efectivos) — el Cubot rugged
puede usarse con guantes.

## 4. Comportamiento esperado

### 4.1 Golden path

1. Usuario tap (o auto-listen del shell) → `start()`.
2. Estado pasa a `listening`. Mic abierto.
3. A medida que el usuario habla, evento `interim` emite parciales que
   se renderean (gris claro) para feedback en vivo.
4. Usuario termina de hablar; `onspeechend` dispara internamente; tras
   un breve silencio Web Speech emite `onresult` con el final.
5. Estado pasa a `processing`. Se emite `result` con el string final.
6. El módulo entrega control al pipeline (Gemini Client lo recibe).
7. Cuando termina el turno completo (Gemini + Edge + TTS), el shell
   externamente vuelve el módulo a `idle`.

### 4.2 Stop manual

Usuario tap "stop" mientras `listening` → `recognition.stop()`. Web
Speech procesa lo capturado hasta ese instante y emite `onresult` con
el final parcial. Sigue el golden path desde el paso 5.

### 4.3 Cancel

Usuario tap "cancelar" mientras `listening` o `processing` →
`recognition.abort()`. Estado vuelve a `idle`. NO se emite `result`. El
turno entero se descarta; quien orquesta el pipeline debe interpretar
el cancel como abandono total.

### 4.4 Permiso al primer uso

1. Usuario tap por primera vez → `start()`.
2. El navegador muestra el prompt nativo "¿Permitir acceso al
   micrófono?".
3. Si concede → arranca `listening`.
4. Si deniega → estado pasa a `error` con `code: 'not-allowed'`,
   mensaje "Necesito permiso de micrófono. Abrí ajustes del navegador
   para concederlo." + CTA "Usar teclado".

### 4.5 Fallback teclado

CTA "teclado" siempre visible (no escondido en menús). Renderea un
`<input type="text">` con submit; al enviar, dispara el mismo evento
`result` que la voz. Esto desacopla el resto del pipeline: para Gemini
Client da igual si el texto vino de voz o de teclado.

## 5. Estados / lifecycle

```
   ┌───────────┐
   │   idle    │◀────────────────────────────┐
   └─────┬─────┘                             │
         │ start()                           │
         ▼                                   │
   ┌───────────┐  cancel()/abort()           │
   │ listening │────────────────────┐        │
   └─────┬─────┘                    │        │
         │ onresult / stop()        │        │
         ▼                          │        │
   ┌───────────┐                    │        │
   │ processing│────────────────────┤        │
   └─────┬─────┘                    │        │
         │ pipeline termina         │        │
         ▼                          │        │
        (vuelve a idle)             │        │
                                    │        │
   ┌───────────┐                    │        │
   │   error   │◀───────────────────┘        │
   └─────┬─────┘                             │
         │ tap reintentar / teclado          │
         └───────────────────────────────────┘
```

## 6. Errores y manejo

Los códigos siguen los del estándar Web Speech API más una entrada
sintética `unavailable` cuando la API directamente no existe.

| Código              | Mensaje en español                                                    | Acción sugerida           |
|---------------------|----------------------------------------------------------------------|---------------------------|
| `no-speech`         | "No escuché nada. Tocá para volver a intentar."                       | Volver a `idle`.          |
| `audio-capture`     | "No pude usar el micrófono. Verificá que ningún otro app lo use."     | Volver a `idle`.          |
| `not-allowed`       | "Necesito permiso de micrófono. Abrí ajustes del navegador."          | Mostrar CTA teclado.      |
| `network`           | "Falló la red al transcribir. Probá con teclado o reintentá."         | Mostrar CTA teclado.      |
| `aborted`           | (silencio: usuario canceló intencionalmente)                          | Volver a `idle`.          |
| `service-not-allowed`| "Tu navegador bloqueó el servicio de voz. Probá en Chrome reciente." | Mostrar CTA teclado.      |
| `unavailable`       | "Tu navegador no soporta voz. Usá teclado."                           | Mostrar solo teclado.     |

Logging: cada error con `console.warn({ code, message, ts })`. NO se
manda a `orion_audit` — la auditoría server-side cubre lo que llega a
la Edge, no lo que falla en captura local.

## 7. Restricciones M1

- **Sin wake word interno.** Activación es por tap o por auto-listen
  del shell tras "OK Google, abrí Orion Vox". Wake word continuo dentro
  de la PWA (siempre escuchando "Orion") está descartado en M1 por
  costo de batería y por permiso permanente de micrófono.
- **`continuous: false`.** Un turno por captura. Conversación
  multi-turno se hace con taps sucesivos.
- **`interimResults: true`** está activo solo para feedback visual; el
  texto que se entrega al pipeline es siempre el `final` de
  `onresult`.
- **Idioma fijo `es-MX`** (ADR-011). M3 puede ampliar a otras variantes
  si la calidad lo amerita.
- **Sin grabación local del audio.** No se persiste audio en ningún
  lado; sólo el texto resultante.

## 8. Criterios de aceptación verificables

- [ ] En Chrome Android (Cubot KK9 o equivalente), tap en mic → prompt
      de permiso → `listening` en < 500ms tras conceder.
- [ ] El interim text se renderea visiblemente mientras se habla.
- [ ] Tras silencio breve, se emite `result` con el texto final en `es-MX`.
- [ ] Cada uno de los 7 códigos de error muestra su mensaje en español
      (lista del §6) en pruebas simuladas.
- [ ] CTA "teclado" siempre disponible y dispara `result` al submit del
      input.
- [ ] `cancel()` en `listening` no emite `result` y vuelve a `idle`.
- [ ] Auto-listen desde shell con permisos previamente concedidos
      arranca `listening` en < 800ms desde la carga del módulo.
- [ ] Permiso denegado nunca crashea; siempre cae a estado `error` con
      mensaje claro.

## 9. Dependencias

- **PWA Shell** (`spec-pwa-shell.md`) — invoca el módulo y dispara
  auto-listen.
- **Gemini Client** (`spec-gemini-client.md`) — consumidor del evento
  `result`.
- **Error Handling** (`spec-error-handling.md`) — convenciones de
  mensajes de error UI.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §2
- `../03-adr/ADR-007-web-speech-api-internal-voice-mode.md`
- `../03-adr/ADR-011-spanish-as-primary-language.md`
- MDN Web Speech API
