---
title: Error Handling — convenciones cross-cutting de errores
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-voice-input.md
  - ./spec-gemini-client.md
  - ./spec-execute-plan-edge.md
  - ./spec-tts-output.md
  - ./spec-confirmation-flow.md
  - ../02-architecture/DATA-FLOW.md
  - ../02-architecture/SECURITY-MODEL.md
---

# Spec — Error Handling cross-cutting

## 1. Propósito

Definir cómo Orion Vox clasifica, presenta, registra y reintenta
errores en cualquier capa. Sin una política consistente, los errores
producen mensajes incoherentes (mezcla de español y stack traces),
fallos silenciosos, o retries inadecuados que disparan costos.

## 2. Alcance

**Cubre:**

- Categorías canónicas de errores.
- Reglas de presentación (UI vs TTS).
- Política de retries y backoff.
- Logging (consola, `audit_mirror`, `orion_audit`).
- Convenciones de mensajes en español.
- Anti-patterns a evitar.

**NO cubre:**

- Errores específicos de cada componente (cada spec define los suyos);
  esta spec define la **forma** y la **política**.

## 3. Interfaces / API / Contratos

### 3.1 Categorías canónicas

Todo error debe encajar en una de estas categorías:

| Categoría        | Ejemplos                                              | Capa típica          |
|------------------|-------------------------------------------------------|----------------------|
| `network`        | DNS fail, fetch reject, timeout HTTP                  | PWA → Gemini, PWA → Edge |
| `auth`           | API key inválida, token expirado, 401, 403            | Gemini, Supabase     |
| `quota`          | 429 con detalle de quota agotada                      | Gemini               |
| `rate_limit`     | 429 transitorio                                       | Gemini, Edge         |
| `validation`     | Plan JSON inválido, campos requeridos faltantes       | Cliente, Edge        |
| `permission`     | Operación bloqueada (DDL, denylist), sin filtros      | Edge                 |
| `runtime`        | Postgres error semántico, query timeout, crash interno| Edge, PG             |
| `crypto`         | Falla en cifrado/descifrado, PIN incorrecto           | Cliente              |
| `device`         | Mic no disponible, WebAuthn no soportado              | Cliente              |
| `unknown`        | Catch-all para no clasificables                       | Cualquiera           |

### 3.2 Estructura canónica de error

```ts
interface OrionError {
  category: 'network' | 'auth' | 'quota' | 'rate_limit' | 'validation'
          | 'permission' | 'runtime' | 'crypto' | 'device' | 'unknown';
  code: string;              // específico del componente, ej: 'gemini_quota'
  messageEs: string;         // mensaje en español listo para mostrar
  retryable: boolean;
  cause?: unknown;           // raw error original (NO mostrar en UI)
  attempts?: number;
  context?: Record<string, unknown>;  // datos para logging
}
```

### 3.3 Reglas de presentación

| Categoría     | UI visual              | TTS                   | Notas                                 |
|---------------|------------------------|-----------------------|---------------------------------------|
| `network`     | banner + retry CTA     | "Hubo un error de red." | TTS sólo si modo voz activo.         |
| `auth`        | modal con CTA "Config" | "Falló la autenticación." | Direcciona a config.              |
| `quota`       | banner                 | "Te quedaste sin cuota." | Dejar claro que no es bug.         |
| `rate_limit`  | toast no intrusivo     | (silencio)            | Se reintenta automáticamente.         |
| `validation`  | inline + sugerencia    | (silencio)            | Mostrar al lado del input/preview.    |
| `permission`  | modal + explicación    | "Operación no permitida." | Educar por qué.                  |
| `runtime`     | banner + detalle       | "Falló la operación."  | Detalle PG truncado.                 |
| `crypto`      | modal bloqueante       | (silencio)            | Crítico, no continuar.                |
| `device`      | banner + CTA fallback  | (silencio)            | Sugerir alternativa (teclado).        |
| `unknown`     | banner genérico        | "Algo falló."          | Loguear con stack para debug.         |

**Regla TTS general:** sólo se hablan los errores que el usuario debe
oír (no lee la pantalla). Errores de validación inline o toasts
visuales NO se hablan.

### 3.4 Política de retries

| Categoría     | Retryable | Estrategia                                   |
|---------------|-----------|----------------------------------------------|
| `network`     | sí        | exp backoff con jitter: 1s, 2s, 4s. Max 3.   |
| `rate_limit`  | sí        | exp backoff: 500ms, 1s, 2s. Max 3.           |
| `runtime` (5xx)| sí       | 1 retry. Si persiste, surface al usuario.    |
| `auth`, `quota`, `validation`, `permission`, `crypto`, `device` | **no** | Un 4xx semántico no se "arregla" reintentando. |

**Backoff con jitter:**

```ts
function delay(attempt: number, baseMs = 1000): number {
  const exp = baseMs * Math.pow(2, attempt - 1);  // 1, 2, 4...
  const jitter = Math.random() * exp * 0.3;       // ±30%
  return Math.floor(exp + jitter);
}
```

Cada retry incrementa `attempts` en el `OrionError`. Si se llega al
max, surface al usuario con mensaje: "Reintenté <N> veces sin éxito".

### 3.5 Logging

| Destino           | Qué se loguea                                                |
|-------------------|--------------------------------------------------------------|
| `console.warn`    | Errores recoverable (rate limit, validación cliente).        |
| `console.error`   | Errores críticos (crypto, audit_insert_failed).              |
| `audit_mirror` (IDB) | Errores que llegaron a tener `audit_id` server (M2 opcional). |
| `orion_audit` (PG)| Errores de la Edge (validación server, permission, runtime). Vía el campo `error` del registro. |

**Nunca:**

- Loguear stack traces a `orion_audit` (campo `error` es texto corto).
- Loguear secretos (API keys, PIN, valores de IndexedDB cifrado).
- Mostrar stack traces en la UI. Single user pero buena práctica
  defensiva.

### 3.6 Convenciones de mensajes en español

- **Sujeto explícito** cuando aclara: "El plan tiene errores", "Gemini
  está saturado".
- **Voseo o tuteo neutro** consistente. Recomendado: forma neutra
  ("probá", "revisá") — coincide con español rioplatense del usuario.
- **Sin jerga técnica** salvo cuando aporta (ej: "API key",
  "Postgres" cuando es relevante).
- **Acción sugerida** siempre que sea posible: "...probá de nuevo",
  "...revisá la configuración".
- **Sin signos de exclamación**: tono calmo.
- **Máximo 2 oraciones** en mensajes user-facing.

### 3.7 Mapeo de errores HTTP de Edge

| HTTP   | Categoría         | Mensaje user-facing (ejemplo)                                  |
|--------|-------------------|----------------------------------------------------------------|
| 400    | validation        | "El plan recibido no es válido."                               |
| 401    | auth              | "Las credenciales de Supabase no son válidas. Revisá config."  |
| 403    | permission        | "Operación no permitida: <motivo>."                            |
| 422    | validation        | "El plan tiene errores: <lista>."                              |
| 429    | rate_limit / quota| "Saturado. Reintentando..." (rate) / "Sin cuota." (quota)       |
| 500    | runtime           | "Error interno en la Edge. Probá de nuevo."                    |
| 504    | runtime           | "La consulta tardó demasiado y se canceló."                    |

## 4. Comportamiento esperado

### 4.1 Pipeline canónico de manejo

```ts
try {
  const result = await someOperation();
  return result;
} catch (raw) {
  const orionError = classifyError(raw);
  logError(orionError);
  if (orionError.retryable && orionError.attempts < MAX_ATTEMPTS) {
    await sleep(delay(orionError.attempts + 1));
    // retry
  }
  surfaceToUI(orionError);
  if (shouldSpeak(orionError)) ttsOutput.speak(orionError.messageEs);
}
```

### 4.2 Surface to UI

- Banner / toast / modal según §3.3.
- Mensaje exacto del `messageEs` del OrionError.
- CTA contextuales (Config, Reintentar, Borrar credenciales).
- Detalle expandible (`details` técnicos) opcional, colapsado por
  default.

### 4.3 Errores no clasificables

Si `classifyError` no encuentra match, default es:

```ts
{
  category: 'unknown',
  code: 'unhandled',
  messageEs: 'Algo falló. Probá de nuevo.',
  retryable: false,
  cause: raw
}
```

Más se loguea con stack a `console.error` para debug.

## 5. Estados / lifecycle

Errores son eventos, no estados persistentes. La UI puede tener un
"banner de error visible" como pseudo-estado, pero el error en sí es
un evento que se procesa y se descarta.

## 6. Errores y manejo

(Esta spec ES la spec de manejo de errores; los componentes específicos
referencian esta convención.)

## 7. Restricciones M1

- **Sin telemetría externa.** No se mandan errores a Sentry / similar.
  Single user, datos sensibles.
- **Sin agrupación de errores.** Cada error se muestra individualmente.
- **Sin "modo offline gracioso" más allá de mensajes.** No hay queue de
  operaciones para cuando vuelva la red.
- **Sin internacionalización.** Sólo español (ADR-011).
- **Sin classifier ML.** `classifyError` es switch case simple.

## 8. Criterios de aceptación verificables

- [ ] Cada componente que produce errores los emite con la estructura
      `OrionError` del §3.2.
- [ ] Errores categorizados se presentan según la matriz §3.3
      (network → banner + retry CTA, etc.).
- [ ] Retries siguen exp backoff con jitter del §3.4.
- [ ] 4xx semánticos NUNCA se reintentan automáticamente.
- [ ] Errores de validación NO disparan TTS.
- [ ] Errores críticos (crypto) bloquean la app con modal.
- [ ] Mensajes UI están en español, sin jerga técnica innecesaria.
- [ ] Stack traces NO aparecen en la UI.
- [ ] Secretos NUNCA aparecen en logs.
- [ ] Errores que llegan a la Edge se registran en `orion_audit` con
      `error = '<motivo>'`.

## 9. Dependencias

- Esta spec es transversal: la consumen todas las otras specs.

## 10. Referencias

- `../02-architecture/DATA-FLOW.md` §3 (manejo por paso)
- `../02-architecture/SECURITY-MODEL.md`
- Cada spec individual define sus códigos específicos.
