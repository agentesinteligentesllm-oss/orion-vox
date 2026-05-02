# OpenSpec — Workflow de cambios para Orion Vox

OpenSpec es el **layer de planificación incremental** del proyecto. Toda
modificación sustantiva (nueva feature, cambio de contrato, refactor
arquitectónico) pasa primero por una carpeta bajo `openspec/changes/<id>/`
con un conjunto canónico de artefactos antes de tocar código o promoverse a
la documentación estable.

---

## Regla de autoridad `docs/` ↔ `openspec/` (CRÍTICA)

> **`docs/` describe el sistema en su estado deseado estable.**
> **`openspec/changes/<id>/` describe los cambios en vuelo.**
> **Cuando un change se completa, su delta se promueve a `docs/04-specs/`**
> **y la carpeta se mueve a `openspec/archive/`.**
> **NO duplicar.**

Concretamente:

- Si una feature está propuesta pero no implementada, su spec vive solo en
  `openspec/changes/<id>/spec.md`. **No** se copia a `docs/04-specs/`.
- Cuando el change pasa a `completed`, el spec delta se **promueve** (mueve)
  a `docs/04-specs/` con el nombre canónico, y la carpeta del change se
  **archiva** en `openspec/archive/<id>/`.
- Bajo ningún escenario el mismo spec vive simultáneamente como autoridad en
  ambos lados. Si lo está, hay un bug de proceso que se resuelve borrando la
  copia más vieja y dejando una nota de archive en `openspec/archive/`.

---

## Estructura de directorios

```
openspec/
├── README.md ............... (este archivo)
├── changes/ ................ Changes en vuelo (uno por carpeta)
│   └── <change-id>/
│       ├── proposal.md ..... Intención, scope, justificación
│       ├── spec.md ......... Requerimientos delta y escenarios
│       ├── design.md ....... Decisiones técnicas y arquitectura
│       ├── tasks.md ........ Checklist accionable de implementación
│       └── state.yaml ...... Estado, owner, dependencias, milestone target
│
└── archive/ ................ Changes ya completados y promovidos a docs/
    └── <change-id>/ ........ Misma estructura, congelada
```

## Lifecycle de un change

```
draft ──▶ in-review ──▶ approved ──▶ in-progress ──▶ completed ──▶ archived
  │           │             │              │              │
  │           │             │              │              └─▶ delta promovido a docs/04-specs/
  │           │             │              └─▶ código mergeado, tests verdes
  │           │             └─▶ tribunal aprobó (Claude+Codex+usuario)
  │           └─▶ propuesta y spec en revisión activa
  └─▶ proposal.md inicial creada, faltan specs/design/tasks
```

Reglas mínimas por etapa:

| Etapa         | Requiere                                                  |
| ------------- | --------------------------------------------------------- |
| `draft`       | `proposal.md` con intención clara                         |
| `in-review`   | `proposal.md` + `spec.md` + `design.md` + tribunal mira   |
| `approved`    | Consenso del tribunal + ADR si toca arquitectura          |
| `in-progress` | `tasks.md` con checklist + ramas de trabajo creadas       |
| `completed`   | Tasks marcados, tests verdes, código mergeado a main      |
| `archived`    | Spec promovido a `docs/04-specs/`, carpeta movida a archive |

## Convención de `state.yaml`

Cada change lleva un `state.yaml` mínimo:

```yaml
id: m1-mvp
title: MVP funcional Plan F+
status: draft           # draft | in-review | approved | in-progress | completed | archived
owner: orion-vox
created: 2026-05-01
last-updated: 2026-05-01
target_milestone: M1    # M1 | M2 | M3
dependencies: []        # IDs de otros changes que deben completarse antes
adrs: []                # IDs de ADRs ligados a este change
```

## Convención de `proposal.md`

Mínimo cuatro secciones: **Contexto**, **Propuesta**, **Alternativas
consideradas**, **Riesgos**. Idioma: español. Frontmatter YAML obligatorio
con los campos estándar del proyecto (`title`, `status`, `milestone`,
`owner`, `last-reviewed`, `supersedes`, `related`).

## Convención de `spec.md`

Especificación delta — solo lo que cambia respecto al estado actual de
`docs/`. Formato: requerimientos numerados con escenarios de aceptación
("dado / cuando / entonces" o equivalente). No describir lo que ya está
documentado en `docs/`; en su lugar, referenciarlo y describir el delta.

## Convención de `design.md`

Decisiones técnicas: estructura de archivos, contratos internos, librerías,
tradeoffs. Si una decisión amerita ADR, se referencia desde acá pero el ADR
vive en `docs/03-adr/`.

## Convención de `tasks.md`

Checklist Markdown de tareas accionables, cada una verificable. Ejemplo:

```markdown
- [ ] Crear esquema de validación del Plan JSON con Zod
- [ ] Implementar Edge Function `execute-plan` con allowlist hardcoded
- [ ] Crear tabla `orion_audit` con migración SQL versionada
- [ ] Tests de integración: SELECT, INSERT con confirmación, DELETE bloqueado
```

## Change activo actual

```
openspec/changes/m1-mvp/    [a crear]
  ├── proposal.md
  ├── spec.md
  ├── design.md
  ├── tasks.md
  └── state.yaml            (status: draft)
```

Este change empaqueta la entrega del MVP funcional Plan F+ con la deuda
técnica documentada y aceptada para M1. La proposal se redactará una vez
cerrada la documentación de arquitectura en `docs/02-architecture/`.

## Relación con engram (memoria persistente)

El backend de persistencia primario del proyecto es **engram**. Cada
artefacto OpenSpec se respalda en engram bajo `topic_key` previsibles:

- `sdd/m1-mvp/proposal`
- `sdd/m1-mvp/spec`
- `sdd/m1-mvp/design`
- `sdd/m1-mvp/tasks`
- `sdd/m1-mvp/state`

El uso de archivos en `openspec/` es complementario (modo `hybrid`): permite
revisión humana y trazabilidad en git, pero la memoria viva de las
decisiones reside en engram.
