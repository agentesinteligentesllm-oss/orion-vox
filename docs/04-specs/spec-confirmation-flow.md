---
title: Confirmation Flow — modal de confirmación táctil para writes
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-execute-plan-edge.md
  - ./spec-plan-json-schema.md
  - ./spec-config-ui.md
  - ./spec-tts-output.md
  - ../02-architecture/COMPONENTS.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../00-constitution/CONSTITUTION.md
---

# Spec — Confirmation Flow

## 1. Propósito

Implementar el principio constitucional 5: **toque humano obligatorio
para writes**. Cada vez que el Plan JSON tiene `operation` en
`{insert, update, delete}`, la PWA muestra un modal full-screen con
preview claro y exige tap explícito. Sin tap, no hay request a la Edge
para ejecución. Las cancelaciones también se auditan.

## 2. Alcance

**Cubre:**

- Trigger automático del modal por tipo de operación.
- Render del preview (operación, tabla, filtros, valores, SQL preview,
  filas estimadas).
- Doble confirmación condicional.
- Botones (confirmar / cancelar) con UX defensiva.
- Llamada a Edge `execute-plan` con `confirmed: true` (path confirmar).
- Llamada a Edge `execute-plan` con `rejected_by_user: true` (path
  cancelar) — auditoría de cancelación.
- Timeout del modal.

**NO cubre:**

- Validación del Plan → `spec-plan-json-schema.md`.
- Construcción del SQL preview detallado (puede ser approximation
  client-side).
- **Estimación visible de filas afectadas en el modal**: M2. En M1 el
  modal NO muestra estimación de filas (ver §3.3 y §7).

## 3. Interfaces / API / Contratos

### 3.1 Trigger

```ts
function shouldConfirm(plan: PlanJSON, settings: UserSettings): boolean {
  if (plan.operation === 'select') return false;
  // insert/update/delete siempre confirman
  return true;
}

function requiresDoubleConfirm(plan: PlanJSON, estimatedRows: number, settings: UserSettings): boolean {
  if (plan.operation === 'delete') {
    if (!plan.filters || plan.filters.length === 0) return true;  // (en realidad esto ya lo bloqueó el validador)
    if (estimatedRows > 100) return true;
    if (settings.doubleConfirmDelete) return true;
  }
  if (plan.operation === 'update') {
    if (estimatedRows > 100 && settings.doubleConfirmLargeUpdate) return true;
  }
  return false;
}
```

### 3.2 Datos del modal

```ts
interface ConfirmationModalProps {
  plan: PlanJSON;
  sqlPreview: string;             // SQL parametrizado generado client-side
  estimatedRows?: number;         // de un dry_run previo, opcional
  warnings: string[];             // ej: 'Sin filtros: afecta toda la tabla.'
  requiresDouble: boolean;
  onConfirm(): void;
  onCancel(): void;
}
```

### 3.3 Render layout

```
┌─────────────────────────────────────────────┐
│  ⚠  CONFIRMAR  <OPERATION>                  │  ← header con color
│                                             │     según severidad
├─────────────────────────────────────────────┤
│  Tabla:  tareas                             │
│                                             │
│  Filtros:                                   │
│   • estado = 'archivada'                    │
│   • actualizada_en < 2026-02-01             │
│                                             │
│  Filas estimadas: ~12                       │  ← M2 (en M1 no se muestra)
│                                             │
│  Warnings:                                  │  ← si hay
│   ⚠ Esta operación es irreversible.         │
│                                             │
│  SQL preview:                               │  ← collapsible
│   DELETE FROM "tareas"                      │
│   WHERE "estado" = $1                       │
│     AND "actualizada_en" < $2               │
│                                             │
├─────────────────────────────────────────────┤
│  [   CANCELAR (default)   ] [  Confirmar  ] │
└─────────────────────────────────────────────┘
```

**Reglas UX.**

- Header color: azul para `insert`, naranja para `update`, rojo para
  `delete`.
- Botón **Cancelar default focused**. Tap accidental → cancelar, no
  ejecutar.
- Botón **Confirmar** alineado a derecha, color del header pero
  visualmente menos prominente que Cancelar (anti-pattern intencional).
- Modal **full-screen** en mobile (no popup chiquito).
- Sin atajos de teclado peligrosos: `Enter` NO confirma.
- Tocar fuera del modal NO cierra (no hay "fuera"; es full-screen).

### 3.4 Doble confirmación

Cuando `requiresDouble: true`:

1. Tap "Confirmar" → modal se transforma:
   ```
   ⚠  ¿Estás seguro?
   Vas a borrar 152 filas.
   Esta acción es irreversible.
   [ NO, cancelar (default) ] [ Sí, borrar 152 filas ]
   ```
2. El segundo botón muestra el conteo explícitamente para evitar tap
   muscular.
3. Tap "Sí, borrar N filas" → ejecuta.
4. Tap cancelar → vuelve a `idle` y audita rechazo.

### 3.5 Path "Confirmar"

```ts
async function onConfirm() {
  // Llamada a Edge con confirmed: true (encoded en client_version o
  // body, según convención del implementador)
  const response = await fetch(EDGE_EXECUTE_PLAN_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      plan,
      user_prompt,
      client_version,
      schema_hash
      // dry_run y rejected_by_user omitidos = false
    })
  });
  // El audit_id en la response confirma que se ejecutó y se auditó.
}
```

### 3.6 Path "Cancelar" — auditoría de rechazo

```ts
async function onCancel() {
  // Llamada a Edge con rejected_by_user: true para auditar
  // sin ejecutar
  fetch(EDGE_EXECUTE_PLAN_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      plan,
      user_prompt,
      client_version,
      schema_hash,
      rejected_by_user: true  // Edge audita y NO ejecuta
    })
  }).catch(err => console.warn('audit cancel failed', err));
  // Fire-and-forget: no bloquea UX. Si falla, el cancel local se
  // registra solo en audit_mirror.
  closeModal();
}
```

**Nota sustantiva (origen Track A USE-CASES).** Las cancelaciones
también se auditan en `orion_audit` server-side con `error:
'rejected_by_user'` y `was_confirmed: false`. Esto preserva la traza
completa de intenciones, no sólo de ejecuciones — fundamental para
forense ("¿por qué Gemini propuso esto en primer lugar?").

### 3.7 Timeout del modal

- Si el usuario no interactúa por **60 segundos**, el modal se
  auto-cancela.
- Antes del auto-cancel, a los 50s, se muestra un countdown visible
  ("se cerrará en 10s").
- Auto-cancel sigue el path §3.6 (audita como `rejected_by_user`).

## 4. Comportamiento esperado

### 4.1 Golden path — confirmar simple

1. Plan JSON `{operation: 'insert', table: 'tareas', values: ...}` llega.
2. `shouldConfirm` retorna true.
3. Modal aparece con header azul, datos del insert.
4. Usuario tap "Confirmar".
5. PWA llama Edge con `confirmed`. Recibe `audit_id`.
6. Modal cierra; pasa a render del resultado + TTS.

### 4.2 Golden path — confirmar delete con doble

1. Plan `{operation: 'delete', table: 'tareas', filters: [...]}` llega.
2. **M2**: PWA hace un `dry_run: true` automático contra `execute-plan`
   para obtener la estimación de filas y mostrarla en el modal. **M1**:
   este paso no ocurre y el modal se muestra sin estimación de filas.
3. Modal aparece con header rojo, warnings.
4. Usuario tap "Confirmar".
5. Si `requiresDouble`, modal se transforma a "¿Estás seguro?".
6. Usuario tap "Sí, borrar N filas".
7. PWA llama Edge. Etc.

### 4.3 Cancelar

1. Modal visible.
2. Usuario tap "Cancelar".
3. Fire-and-forget POST a Edge con `rejected_by_user: true`.
4. Modal cierra.
5. UI vuelve a estado `idle` de Voice Input.
6. TTS opcional: "Cancelado".

### 4.4 Auto-timeout

1. Modal visible 50s sin interacción.
2. Aparece countdown "10... 9... 8...".
3. A los 60s, fire-and-forget cancel y cierra.

### 4.5 Cancelación por nuevo input de voz

Si mientras el modal está abierto el usuario empieza a hablar
(situación posible si Voice Input quedó armado):

- Voice Input se silencia mientras hay modal abierto (mutex UI).
- Si el usuario fuerza nuevo turn → trata como cancel del modal +
  empezar nuevo turno.

## 5. Estados / lifecycle

```
[modal cerrado]
      │
      │ Plan write llega
      ▼
[modal visible]
      │
   ┌──┴──┬──────────┐
   │     │          │
   ▼     ▼          ▼
[confirmar] [cancelar] [timeout]
   │           │           │
   │       (audit         (audit
   │        rejection)   rejection)
   │           │           │
   ▼           ▼           ▼
[POST exec]  [close]    [close]
   │
   ▼
[result + TTS]
   │
   ▼
[idle]
```

## 6. Errores y manejo

| Situación                                          | Comportamiento                                                  |
|----------------------------------------------------|-----------------------------------------------------------------|
| Edge falla durante "confirmar"                     | Mensaje de error en español. Modal queda abierto con CTA "reintentar" + "cancelar". |
| Edge falla durante audit de cancelación            | Log a consola; cancel local procede igual. No bloquea UX.        |
| Plan ya rechazado por validador antes del modal    | El modal no debería abrirse; si el flujo upstream falla, fallback es mostrar error sin modal. |
| Doble tap accidental en "Confirmar"                | Botón se deshabilita tras primer tap (loading state).            |

## 7. Restricciones M1

- **Sin estimación visible de filas en el modal.** En M1 la PWA
  **no** ejecuta un `dry_run` automático pre-modal: el modal de
  confirmación muestra operación + tabla + filtros + valores + SQL
  preview, **sin** línea "filas estimadas". El warning de irreversible
  cobra más peso. La estimación visible (modal con "este UPDATE
  afectaría 12 filas — confirmar?") llega en M2 cuando la PWA hace un
  `dry_run: true` automático antes de mostrar el modal.

  > **Aclaración importante sobre `dry_run` en M1**: el flag
  > `dry_run: true` en el body de `/execute-plan` SÍ es funcional
  > desde M1. Cuando llega activo, la Edge no ejecuta contra Postgres
  > pero sí valida el plan, registra el intento en `orion_audit` con
  > `was_dry_run = true`, y devuelve la respuesta de validación. Es
  > útil para testing y para validar planes sin riesgo. Lo que llega
  > en M2 es el **uso automático** del flag por parte de la PWA antes
  > del modal para obtener la estimación visible de filas. En M1, el
  > usuario que quiera operar en modo dry-run lo hace activando el
  > toggle "modo dry-run global" en config.
- **Sin preview firmado.** En M1 la confirmación es client-side; un
  cliente comprometido puede saltarla. Documentado en SECURITY-MODEL
  §4 como deuda. M2 introduce HMAC server-side (`preview_id`).
- **Sin "deshacer"**. Una vez confirmada y ejecutada, no hay rollback
  desde Orion Vox. El usuario debe hacer un Plan inverso (insert si
  borró, etc.).
- **Modal full-screen sin variante popup**. Decisión UX para Cubot
  rugged: pantalla pequeña, dedos gruesos, modal pequeño es trampa.
- **Sin sonido de alerta.** Sólo visual; no se quiere asustar al
  usuario en cada write.

## 8. Criterios de aceptación verificables

- [ ] Plan con `operation: 'select'` NO dispara modal.
- [ ] Plans con `insert`, `update`, `delete` SIEMPRE disparan modal.
- [ ] Botón "Cancelar" tiene focus default.
- [ ] Tap "Confirmar" en `delete` con `estimatedRows > 100` o con
      setting `doubleConfirmDelete: true` muestra segundo paso de
      confirmación.
- [ ] Segundo paso muestra el conteo explícito en el botón.
- [ ] Tap "Cancelar" dispara POST a Edge con `rejected_by_user: true`
      (verificable en logs / network tab).
- [ ] Tras 60s sin interacción, modal se auto-cierra y audita como
      rechazo.
- [ ] Countdown visible a partir de 50s.
- [ ] Modal es full-screen en viewport mobile (verificable con
      DevTools).
- [ ] `Enter` no confirma.
- [ ] Doble tap accidental no dispara dos requests.
- [ ] Si Edge falla en "confirmar", modal queda abierto con CTA
      "reintentar" sin perder el plan.

## 9. Dependencias

- **Plan JSON** (`spec-plan-json-schema.md`) — input del modal.
- **Execute Plan Edge** (`spec-execute-plan-edge.md`) — destino de
  ambos paths (confirmar + cancelar audit).
- **Config UI** (`spec-config-ui.md`) — toggles de doble confirmación.
- **TTS Output** (`spec-tts-output.md`) — opcional para feedback de
  cancelado / confirmado.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §5
- `../02-architecture/SECURITY-MODEL.md` §4 (deuda M1) y §6 (vectores)
- `../00-constitution/CONSTITUTION.md` (principio 5: toque humano)
- USE-CASES.md (Track A) — origen de auditoría de cancelaciones
