---
title: TTS Output — síntesis de voz con Web Speech Synthesis
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-voice-input.md
  - ./spec-confirmation-flow.md
  - ./spec-error-handling.md
  - ../02-architecture/COMPONENTS.md
  - ../03-adr/ADR-007-web-speech-api-internal-voice-mode.md
  - ../03-adr/ADR-011-spanish-as-primary-language.md
---

# Spec — TTS Output

## 1. Propósito

Convertir las respuestas de Orion Vox en voz hablada en español, usando
la Web Speech Synthesis API. El TTS es el cierre del loop "habla →
respuesta hablada"; sin él, el modo voz se siente roto. Es además
**no bloqueante**: si falla, la respuesta visual queda y la app sigue.

## 2. Alcance

**Cubre:**

- Inicialización de `SpeechSynthesis` con voz `es-MX` (preferida) o
  fallback (`es-ES`, `es-AR`).
- API de hablar / cancelar.
- Configuración de rate, pitch, volumen.
- Formateo de respuestas según tipo (SELECT, INSERT/UPDATE/DELETE,
  errores, aclaraciones).
- Truncado para respuestas largas.
- Fallback a sólo texto si TTS no disponible.

**NO cubre:**

- Captura de voz → `spec-voice-input.md`.
- Render visual de respuestas (lo decide la capa UI).
- Síntesis en idiomas distintos a español.

## 3. Interfaces / API / Contratos

### 3.1 API expuesta

```ts
interface TtsOutputAPI {
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  cancel(): void;            // detiene la elocución actual
  isAvailable(): boolean;
  on(event: 'start', cb: () => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: SpeechError) => void): void;
  setDefaultOptions(opts: Partial<SpeakOptions>): void;
}

interface SpeakOptions {
  voice?: SpeechSynthesisVoice;   // override de voz
  rate?: number;                   // 0.7..1.3, default 1.0
  pitch?: number;                  // 0.8..1.2, default 1.0
  volume?: number;                 // 0..1, default 1.0
}

interface SpeechError {
  code: 'unavailable' | 'voice-missing' | 'interrupted' | 'unknown';
  message: string;
}
```

### 3.2 Selección de voz

Al iniciar:

```ts
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  // 1. Idioma exacto preferido (configurable: es-MX | es-AR | es-ES)
  // 2. Cualquier es-* si la preferida no existe.
  // 3. null → fallback solo texto.
  const preferred = userSettings.voiceLang;  // 'es-MX' default
  return voices.find(v => v.lang === preferred)
      || voices.find(v => v.lang.startsWith('es'))
      || null;
}
```

Las voces están disponibles asincrónicamente; escuchar
`speechSynthesis.onvoiceschanged` para actualizar el cache de voz.

### 3.3 Configuración default

| Param  | Default | Rango configurable | Notas                              |
|--------|---------|--------------------|------------------------------------|
| rate   | 1.0     | 0.7..1.3           | < 0.7 muy lento; > 1.3 ininteligible. |
| pitch  | 1.0     | 0.8..1.2           | Mantener neutro.                   |
| volume | 1.0     | 0..1               | Usuario controla con HW del Cubot. |

## 4. Comportamiento esperado

### 4.1 Formateo por tipo de respuesta

#### SELECT con resultados
```
0 filas:    "No encontré nada."
1 fila:     "Encontré 1: <resumen primer fila>."
2..5 filas: "Encontré N. La primera es <resumen primer fila>."
6+ filas:   "Encontré N filas. Te las muestro en pantalla."
```

`<resumen primer fila>` es heurística client-side: si la fila tiene
columna `titulo` o `nombre` o `descripcion`, usar esa; sino, JSON
compacto truncado a 80 chars.

#### INSERT
```
"Listo, agregué un registro a <tabla>."
```

#### UPDATE
```
0 filas: "No encontré nada para actualizar."
1 fila:  "Listo, actualicé 1 fila de <tabla>."
N filas: "Listo, actualicé N filas de <tabla>."
```

#### DELETE
```
0 filas: "No encontré nada para borrar."
1 fila:  "Listo, borré 1 fila de <tabla>."
N filas: "Listo, borré N filas de <tabla>."
```

#### Aclaración solicitada por Gemini (`request_clarification`)
```
"<question tal cual de Gemini>"
```

#### Cancelación del modal
```
"Cancelado."  (opcional, configurable; muchos usuarios prefieren silencio)
```

#### Errores críticos (red, autenticación)
```
"Hubo un error: <mensaje corto en español>."
```

Los errores no críticos (validación, ya mostrados visualmente) NO se
hablan para evitar ruido.

### 4.2 Truncado

- Si la respuesta a hablar excede **300 caracteres**, truncar con
  "... más en pantalla."
- Sólo se trunca lo hablado, no lo mostrado visualmente.

### 4.3 Interrumpibilidad

- Si el usuario inicia un nuevo dictado mientras el TTS está hablando,
  llamar a `speechSynthesis.cancel()` antes de armar el mic.
- Si el usuario tap en un botón de UI que dispara nueva acción, idem.
- API `cancel()` es idempotente (call cuando no hay nada hablando es
  no-op).

### 4.4 Race conditions

- Si dos `speak()` se invocan en rápida sucesión, el segundo se
  encola (default Web Speech). Para Orion Vox: cancelamos antes de
  speak para evitar acumulación.

```ts
async function speak(text, opts) {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  const utter = new SpeechSynthesisUtterance(text);
  // ... aplicar opts
  speechSynthesis.speak(utter);
}
```

## 5. Estados / lifecycle

```
[idle]
   │
   │ speak(text)
   ▼
[speaking] ──cancel/onend──▶ [idle]
   │
   │ otro speak()
   ▼
(cancel previo + nuevo speaking)
```

## 6. Errores y manejo

| Código          | Situación                                         | Comportamiento UX                              |
|-----------------|---------------------------------------------------|------------------------------------------------|
| `unavailable`   | `speechSynthesis` no existe o no funciona         | `isAvailable()` retorna false. Sólo render visual. |
| `voice-missing` | No hay ninguna voz `es-*` disponible              | Hablar con voz default del navegador (cualquiera) y loguear warning. Mejor "voz extraña" que silencio. |
| `interrupted`   | Usuario o sistema canceló mid-speech              | Sin mensaje. Operación normal.                  |
| `unknown`       | Otro error de la API                              | Log, sin mensaje al usuario.                   |

TTS NO bloquea el flujo. Si falla, el resto de la app sigue.

## 7. Restricciones M1

- **Sin SSML.** Web Speech API no soporta SSML universalmente. Texto plano.
- **Sin descarga de voces extra.** Se usa lo que el sistema tenga.
- **Sin selección por género** explícita. Algunas voces no exponen
  género de forma fiable.
- **Sin modulación emocional.** Pitch/rate fijos.
- **Sin caching de utterances.** Cada speak es nuevo.

## 8. Criterios de aceptación verificables

- [ ] En Chrome Android con voces es-* instaladas, `speak("Hola")`
      reproduce audio.
- [ ] `isAvailable()` retorna true en navegadores con SpeechSynthesis,
      false en navegadores sin.
- [ ] Llamar `speak` mientras hay audio sonando cancela el previo.
- [ ] `cancel()` durante audio detiene inmediatamente.
- [ ] Mensaje > 300 chars se trunca con "... más en pantalla."
- [ ] Cada formato del §4.1 se verifica (mock de tipos de Plan +
      resultado).
- [ ] Si no hay voz es-*, se usa voz default del navegador y se logea
      warning.
- [ ] El config-ui permite cambiar `rate`, `pitch`, `volume`, `voice`,
      y los cambios persisten.
- [ ] Botón de preview en config-ui dispara TTS de "Hola, soy Orion"
      con la config actual.
- [ ] Eventos `start` y `end` se disparan correctamente.

## 9. Dependencias

- Web Speech Synthesis API.
- Settings de usuario para voz preferida + rate/pitch/volume.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §7
- `../03-adr/ADR-007-web-speech-api-internal-voice-mode.md`
- `../03-adr/ADR-011-spanish-as-primary-language.md`
- MDN SpeechSynthesis API
