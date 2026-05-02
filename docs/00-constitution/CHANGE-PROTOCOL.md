---
title: Protocolo de cambios — cómo proponer y aprobar modificaciones
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - CONSTITUTION.md
  - GOVERNANCE.md
  - PRINCIPLES-CHECKLIST.md
  - ../../openspec/README.md
---

# Protocolo de cambios

Este documento define **cómo se propone, debate, aprueba y aplica** cualquier
modificación al proyecto: documentación, contratos, arquitectura, principios.

---

## Tipos de cambio

Identificar primero qué tipo de cambio es. De ahí depende el camino.

### 1. Editorial

Typos, links rotos, claridad redactiva, ejemplos, formato Markdown.

- **Camino**: commit directo a main.
- **Aprobación**: ninguna (autor commitea solo).
- **Documentación**: el commit en sí.
- **Restricción**: cero cambios de significado. Si al "arreglar redacción"
  cambia el sentido de un párrafo, ya no es editorial — es spec o
  arquitectónico.

### 2. Spec (cambio de contrato)

Modifica un contrato público: forma del Plan JSON, API de una Edge
Function, columnas de `orion_audit`, formato de un mensaje de error,
parámetros de configuración.

- **Camino**: crear/editar carpeta en `openspec/changes/<id>/` con
  `proposal.md`, `spec.md`, `tasks.md`, `state.yaml`.
- **Aprobación**: tribunal (Claude + Codex + usuario) en `state.yaml:
  status: approved`.
- **Documentación**: cuando el change pasa a `completed`, el spec se
  promueve a `docs/04-specs/` y la carpeta se mueve a `openspec/archive/`.
- **Si afecta arquitectura**: además abrir ADR (ver tipo 3).

### 3. Arquitectónico

Afecta componentes, capas, decisiones estructurales: cambiar el framework
PWA, agregar un nuevo servicio externo, cambiar el flujo de auditoría,
mover lógica entre cliente y Edge Function.

- **Camino obligatorio**:
  1. Debate en el tribunal con propuesta + alternativas + riesgos.
  2. ADR nuevo en `docs/03-adr/ADR-NNN-titulo.md` con: contexto,
     alternativas, decisión, consecuencias, disidencias.
  3. Si además cambia un contrato → change OpenSpec ligado al ADR.
  4. Implementación.
  5. Documentación afectada actualizada en el mismo PR (
     `docs/02-architecture/`, `docs/04-specs/`, runbooks).
- **Aprobación**: consenso del tribunal o decisión escalada al usuario
  con disidencia documentada en el ADR.
- **Restricción**: nada se mergea a main sin ADR aprobado.

### 4. Constitucional

Toca uno de los 12 principios de `CONSTITUTION.md`, modifica
`NON-GOALS.md`, cambia `GOVERNANCE.md` o este mismo `CHANGE-PROTOCOL.md`.

- **Camino obligatorio**:
  1. ADR explícito que **suspenda o modifique** el principio afectado,
     con justificación firmada por el usuario.
  2. Si suspende un principio: detallar **alcance temporal** (¿es
     permanente o solo para este change?), **mitigaciones** equivalentes
     que cubran el riesgo que el principio cubría, y **plan de retorno**
     si la suspensión es temporal.
  3. Debate del tribunal con quórum completo (las tres voces).
  4. Aprobación explícita del usuario en el ADR (texto firmado, no
     emoji-aprobación).
  5. Modificación del documento constitucional afectado, con
     `last-reviewed` actualizado y `supersedes:` si aplica.
- **Aprobación**: usuario obligatorio. Sin la firma del usuario, no se
  ejecuta.

---

## Lifecycle de un change OpenSpec

```
draft ──▶ in-review ──▶ approved ──▶ in-progress ──▶ completed ──▶ archived
```

Reglas por transición:

- **draft → in-review**: el change tiene `proposal.md` y `spec.md`
  mínimos; el autor pide revisión al tribunal.
- **in-review → approved**: tribunal alcanza consenso (o usuario decide
  con disidencia documentada). Si hay impacto arquitectónico, el ADR
  asociado debe estar `accepted` en este punto. La
  `PRINCIPLES-CHECKLIST.md` está completa.
- **approved → in-progress**: hay `tasks.md` con checklist accionable y
  ramas de trabajo creadas.
- **in-progress → completed**: tasks marcados, tests verdes, código
  mergeado a main, documentación afectada actualizada.
- **completed → archived**: spec delta promovido a `docs/04-specs/` con
  el nombre canónico, carpeta del change movida a `openspec/archive/`,
  links actualizados.

## Reglas duras del proceso

1. **Nada se mergea sin ADR si es arquitectónico.**
   "Es un detalle de implementación" no es excusa válida si la decisión
   afecta componentes o contratos.

2. **Nada se promueve a `docs/` desde `openspec/` sin marcar el change
   como `completed`.**
   La promoción anticipada produce drift entre lo que dice `docs/` y lo
   que está en main.

3. **Nada se borra de `docs/` sin migrarlo a `archive/`.**
   Si un documento queda obsoleto, se marca `status: deprecated` y se
   linkea al sucesor con `supersedes:`. Los archivos solo se mueven a
   `openspec/archive/` o a `docs/07-references/history/` cuando ya no
   tienen valor en su ubicación original.

4. **Las suspensiones de principios constitucionales son siempre
   acotadas.**
   No se acepta "suspender el principio 5 indefinidamente". Se acepta
   "suspender el principio 5 durante M1 con la mitigación X documentada,
   con plan de restauración en M2".

5. **El autor del change no es el revisor.**
   La `PRINCIPLES-CHECKLIST.md` la firma alguien distinto al autor.
   Para cambios arquitectónicos, las tres voces del tribunal participan
   antes del merge.

---

## Plantilla mínima de ADR

```markdown
---
title: ADR-NNN — <Título corto de la decisión>
status: proposed | accepted | superseded | deprecated
milestone: M1 | M2 | M3 | constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related: []
---

# ADR-NNN — <Título>

## Contexto

¿Qué situación dispara la decisión? ¿Qué problema se resuelve?

## Alternativas evaluadas

### Alternativa A — <nombre>
- Pros
- Contras

### Alternativa B — <nombre>
- Pros
- Contras

(repetir tantas como aplique)

## Decisión

Cuál se eligió y por qué.

## Consecuencias

### Positivas
- ...

### Negativas / deuda asumida
- ...

## Disidencias

¿Alguna de las tres voces del tribunal disintió? Documentar literalmente.

## Notas de implementación

(opcional) Punteros a specs, tasks, archivos.
```

---

## Plantilla mínima de change OpenSpec

Estructura de archivos:

```
openspec/changes/<change-id>/
  ├── proposal.md
  ├── spec.md
  ├── design.md      (si hay decisiones técnicas no triviales)
  ├── tasks.md
  └── state.yaml
```

`state.yaml` mínimo:

```yaml
id: <change-id>
title: <Título del change>
status: draft
owner: orion-vox
created: 2026-05-01
last-updated: 2026-05-01
target_milestone: M1
dependencies: []
adrs: []
```

---

## Excepción: primer change de un proyecto

En condiciones normales, los specs de un change viven en
`openspec/changes/<id>/spec.md` como **delta** sobre los specs
canónicos en `docs/04-specs/`, y se promueven a `docs/04-specs/` cuando
el change pasa a `completed`.

**Excepción**: el **primer change de un proyecto** (ej. `m1-mvp`)
introduce los specs **directamente** en `docs/04-specs/` desde el día
1, porque no hay versión previa que reemplazar. En ese caso:

- El `spec.md` del primer change **documenta esta excepción** y
  **enumera** qué specs introduce (lista de archivos creados en
  `docs/04-specs/`), pero **no duplica el contenido**. La fuente única
  de verdad es `docs/04-specs/`.
- Cuando el primer change pasa a `completed`, **NO hay promoción de
  archivos** (ya viven en `docs/04-specs/`); solo se mueve la carpeta
  del change a `openspec/archive/` y se actualizan links.
- El ADR asociado al primer change debe mencionar explícitamente que
  esta excepción aplicó, para trazabilidad.

Esta excepción aplica **una sola vez por proyecto**. Todos los changes
posteriores son deltas regulares y siguen el flujo estándar
`draft → in-review → approved → in-progress → completed → archived`
con promoción al final.

---

## Anti-patrones explícitamente prohibidos

- Mergear código que viola un principio "porque es fácil revertir después".
- Cambiar `CONSTITUTION.md` sin ADR.
- Promover specs a `docs/` mientras el change sigue `in-progress`.
- Reescribir ADRs aceptados (se crean ADRs nuevos que `supersedes:` el
  anterior, y el viejo pasa a `status: superseded`).
- Borrar la disidencia de un ADR cuando finalmente se llega a consenso
  posterior. La disidencia se mantiene como registro histórico.
- Saltar el debate del tribunal porque "Claude y Codex ya lo discutieron
  en otro contexto". Si no quedó por escrito en este proyecto, no existe
  para este proyecto.
