---
title: "ADR-014: Pivote de estrategia de testing — cobertura mínima a partir de B5"
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-03
decision-date: 2026-05-03
decision-status: accepted
supersedes: null
superseded-by: null
related:
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ADR-012-framework-pwa.md
  - ../HANDOFF.md
  - ../05-implementation/TECHNICAL-DEBT.md
  - ../../openspec/changes/m1-mvp/tasks.md
---

# ADR-014: Pivote de estrategia de testing — cobertura mínima a partir de B5

## Contexto

### El momento exacto de esta decisión

Este ADR fue aceptado al cierre del bloque B4.5, en el commit
`0e6bbfc` (Wave 9, 2026-05-03). En ese punto el proyecto tiene:

- **~80% de M1 completado**: B0-B4 todos cerrados.
- **213 tests Vitest verdes** distribuidos en unit, E2E, contracts y smoke.
- **4 bloques pendientes**: B5 (Confirmation Modal), B6 (Execute & Audit),
  B7 (PWA Atajos / Instalación), B8 (Deploy & Validación).
- **Working tree limpio** en `master`. Baseline reproducible en cualquier
  momento con `git checkout 0e6bbfc`.

### La estrategia de testing hasta B4

Hasta B4.5, el proyecto siguió TDD estricto en cada sub-bloque:

- **Tests unitarios** para cada módulo nuevo (recognition, synthesis,
  plan-intent-client, PlanPreview, clarification flow).
- **Tests E2E** para cada bloque de integración (auth/config, VoiceScreen,
  voice→plan-intent flow completo).
- **Mock patterns elaborados**: `_handlers` map + helper `emit(inst, event, value?)`
  para simular TTS y recognition con fidelidad de estado.
- **Cobertura de edge cases**: 10 tests unitarios de clarification flow
  (B4.4), 8 tests E2E de VoiceScreen (B3), 5 tests E2E de flow completo (B4.5).

Los archivos que representan el **baseline completo** de este nivel de cobertura son:

```
tests/unit/b44-clarification-flow.test.ts  — patrón mock más elaborado
tests/e2e/b45-voice-plan-flow.test.ts      — patrón E2E con flow multi-turno
tests/e2e/b3-voice-screen.test.ts          — patrón E2E de UI básico
```

Cualquier LLM o desarrollador que quiera **retomar la cobertura completa**
debe leer estos tres archivos como referencia. Los patrones están documentados
en `docs/HANDOFF.md` §3 (gotchas de B4).

### Por qué el nivel de cobertura de B4 es insostenible para B5–B8

Orion Vox es una **herramienta operativa personal single-user**, instalada
vía sideload en un Cubot KingKong 9. No es software de producción multi-usuario,
no tiene SLA, no tiene más de un operador.

El costo de TDD estricto para los 4 bloques restantes es de **~3-4 sesiones
adicionales** de trabajo en tests, con retorno marginal para este contexto:

- **B5 (Confirmation Modal)**: es UI pura. Un bug en el timeout o en la
  doble confirmación es visible inmediatamente en pantalla. No corrompe datos.
- **B7 (PWA Atajos / Instalación)**: es configuración de manifest + service
  worker. Se valida instalando en el Cubot, no con tests de código.
- **B8 (Deploy)**: el smoke E2E manual en el dispositivo físico es la
  definición de done. Tests automatizados adicionales no agregan valor.

La única excepción es B6, donde el código toca Postgres con `service_role`
y `BYPASSRLS` activos. Un bug silencioso ahí no aparece en pantalla — aparece
como datos corruptos o filas eliminadas sin intención.

## Decisión

**A partir de B5, la cobertura de tests cambia a mínima intencional.**

### Tabla de cobertura por bloque

| Bloque | Cobertura mínima requerida | Justificación |
|--------|---------------------------|---------------|
| **B5** — Confirmation Modal | Un test E2E: golden path confirm + golden path cancel. Sin edge cases (timeout, doble confirm). | UI pura. Bugs visibles en pantalla. No toca datos. |
| **B6** — Execute & Audit | **Mínimo obligatorio: 2 tests.** (1) confirm path → execute-plan llamado con plan correcto. (2) cancel path → audit fire-and-forget llamado con `rejected_by_user: true`. | Toca Postgres con `service_role` + `BYPASSRLS`. Un bug silencioso corrompe datos reales. |
| **B7** — PWA Atajos | **Cero tests de código.** Verificación manual: instalar en Cubot, verificar shortcuts. | Es manifest + service worker. No hay lógica de negocio testeable con Vitest. |
| **B8** — Deploy & Validación | **Smoke manual en Cubot.** No tests automatizados nuevos. | El criterio de done es que funciona en el dispositivo físico real. |

### Excepción innegociable: B6

B6 es la única excepción a la cobertura mínima porque es donde el sistema
ejecuta SQL real contra la base de datos del director con `service_role`
(`BYPASSRLS` activo). Las consecuencias de un bug silencioso son:

- Filas borradas sin confirmación correcta.
- Auditoría de cancelaciones no registrada (traza forense rota).
- Operaciones ejecutadas sin que el modal de confirmación haya validado.

Los **dos tests mínimos de B6** no son opcionales. Si el tiempo apremia,
son los últimos tests que se recortan.

### Qué se mantiene igual

- **Gates no cambian**: `npm run check` + `npm run lint` + `npx vitest run`
  deben ser verdes antes de cada commit, igual que antes.
- **Patrón de mocks**: cuando se necesite un test, usar el patrón B4.4
  (`_handlers` público + helper `emit`). No inventar uno nuevo.
- **El baseline de 213 tests no se toca**: los tests existentes (B0-B4)
  no se eliminan. Solo se decide no ampliar la cobertura al mismo nivel
  para B5-B8.

## Alternativas consideradas

### Alternativa A — Mantener TDD estricto en todos los bloques

- **Pros**: máxima protección contra regresiones; documentación de
  comportamiento más completa.
- **Contras**: +3-4 sesiones de trabajo para una herramienta single-user
  que se valida en el dispositivo real. El retorno no justifica el costo
  en este contexto.
- **Estado**: descartada.

### Alternativa B — Cero tests para B5-B8

- **Pros**: velocidad máxima de implementación.
- **Contras**: B6 ejecuta con `service_role` + `BYPASSRLS`. Un bug en el
  path de confirmación o en el audit de cancelación es indetectable hasta
  que los datos ya están corruptos.
- **Estado**: descartada. Inaceptable para B6.

### Alternativa C — Cobertura mínima diferenciada por riesgo (elegida)

- **Pros**: velocidad para bloques de bajo riesgo (B5, B7, B8). Protección
  mínima garantizada en el único bloque de riesgo real (B6).
- **Contras**: si surgen bugs de edge case en B5 modal (ej: timeout no se
  dispara, doble confirmación mal reseteada), no serán detectados por tests.
  Serán detectados en smoke manual o en uso real.
- **Riesgo aceptado explícitamente**: bugs de UI en B5 que aparezcan en uso
  real son recuperables (el usuario ve el modal en estado incorrecto, no se
  pierden datos). Documentado más abajo en §Consecuencias.
- **Estado**: elegida.

## Cómo revertir esta decisión

Si en algún punto de B5-B8 surge un bug que la cobertura mínima no habría
atrapado, y se decide retomar TDD estricto:

1. Leer `tests/unit/b44-clarification-flow.test.ts` — es el template de
   mock más elaborado del proyecto (TtsOutputController con `_handlers`,
   helper `emit`, gotchas documentados en el HANDOFF §3).
2. Leer `tests/e2e/b45-voice-plan-flow.test.ts` — es el template para
   tests E2E multi-turno con flow completo.
3. Ampliar los tests del bloque donde se detectó el bug siguiendo esos
   patrones.
4. No es necesario un nuevo ADR para revertir: la cobertura adicional
   nunca fue prohibida, solo se decidió no exigirla.

El punto de retorno exacto es el commit `0e6bbfc`. Desde ahí se puede
revisar qué tests existen y qué patrones usar.

## Consecuencias

### Positivas

- **Velocidad**: B5-B8 pueden completarse en ~2 sesiones menos.
- **Foco en lo que importa**: el esfuerzo de testing se concentra en B6,
  el único bloque con consecuencias reales de datos.
- **El smoke en Cubot KK9 sigue siendo obligatorio** (B8): que la PWA
  funcione en el dispositivo real sigue siendo el criterio de done de M1.
  Esto no cambia.

### Negativas / riesgos aceptados

- **Bugs de UI en B5 modal** (timeout, doble confirmación, countdown) solo
  se detectan en uso real. Son recuperables: no corrompen datos.
- **Regresiones en VoiceScreen** al integrar el modal de B5 son menos
  seguras sin E2E de cobertura total. Mitigación: los tests E2E existentes
  de B4.5 siguen corriendo y cubren el flow básico de VoiceScreen.
- **Sin cobertura de PWA manifest / service worker**: los atajos de B7 se
  verifican manualmente en el Cubot. Si algo no funciona en hardware, se
  descubre en B8.

### Neutrales

- Los 213 tests existentes (B0-B4) no cambian, no se eliminan, y siguen
  siendo el contrato de correctitud para las capas ya construidas.
- La postura de este ADR es **pragmática y temporal**: aplica a los bloques
  restantes de M1. M2 puede definir su propia estrategia de testing.

## Aplicabilidad

- Aplica a los bloques **B5, B6, B7, B8** de M1.
- **No aplica retroactivamente** a B0-B4 (esos tests existen y se conservan).
- **Revisable en M2**: cuando M2 arranque, el tribunal decide si mantener
  esta política o retomar cobertura más amplia.

## Referencias

- Commit de referencia (punto de quiebre): `0e6bbfc` — `docs: HANDOFF
  sincronizado post-B4.5 (Wave 9)`
- `docs/HANDOFF.md` §3 — gotchas de B4 que siguen aplicando en B5+
- `tests/unit/b44-clarification-flow.test.ts` — baseline de mock TDD completo
- `tests/e2e/b45-voice-plan-flow.test.ts` — baseline de E2E completo
- `docs/04-specs/spec-confirmation-flow.md` — spec autoritativa de B5
- `docs/04-specs/spec-execute-plan-edge.md` — spec de B6 (justifica excepción)
- `docs/05-implementation/TECHNICAL-DEBT.md` — deuda M1→M2 (TD-001-bis:
  `service_role` + `BYPASSRLS` es la razón por la que B6 es excepción)
- ADR-009 — roadmap M1→M2→M3 (la estrategia de testing es consecuencia
  directa del alcance y contexto de M1)
