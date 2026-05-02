---
title: Gobernanza — Tribunal de IAs y toma de decisiones
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - CONSTITUTION.md
  - CHANGE-PROTOCOL.md
---

# Gobernanza de Orion Vox

## Modelo: Tribunal de IAs

El proyecto se gobierna mediante un **tribunal de tres voces** con roles
explícitos y poderes distintos:

```
┌─────────────────────────────────────────────────────────────┐
│                    TRIBUNAL DE ORION VOX                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│   │   USUARIO   │   │   CLAUDE    │   │    CODEX    │       │
│   │ (director)  │   │ (debate IA) │   │ (debate IA) │       │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘       │
│          │                 │                 │              │
│          │  decide         │  propone        │  propone     │
│          │  alcance,       │  arquitectura,  │  arquitectura│
│          │  prioridad,     │  valida,        │  valida,     │
│          │  trade-offs     │  cuestiona      │  cuestiona   │
│          └─────────────────┴─────────────────┘              │
│                            │                                │
│                  ┌─────────▼──────────┐                     │
│                  │   CONSENSO o       │                     │
│                  │   ESCALACIÓN al    │                     │
│                  │   USUARIO          │                     │
│                  └─────────┬──────────┘                     │
│                            │                                │
│                  ┌─────────▼──────────┐                     │
│                  │   ADR + commit     │                     │
│                  └────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## Roles y poderes

### Usuario (director)

- Define qué construir y para cuándo.
- Define qué tradeoffs son aceptables (deuda técnica, costos, riesgos).
- Tiene **veto final** sobre cualquier decisión, incluso si las dos IAs
  acordaron lo contrario.
- Asigna las tareas: quién investiga, quién codifica, quién revisa.
- Es el único que puede declarar consenso forzado cuando las IAs no
  llegan a acuerdo y la decisión es bloqueante.

### Claude (colaborador IA)

- Propone arquitectura, patrones, librerías.
- Investiga (WebSearch, exploración de codebase, lectura de specs externas).
- **Cuestiona** las propuestas de Codex y del usuario cuando detecta
  riesgos, deuda oculta, o alternativas mejores.
- Implementa cuando se le asigna.
- Documenta sus propuestas con pros, contras y riesgos explícitos.

### Codex (colaborador IA, vía ChatGPT)

- Mismas responsabilidades que Claude, en paralelo.
- Su valor está en la **divergencia productiva**: si propone lo mismo que
  Claude, hay menos información útil; si propone algo distinto, hay debate.
- El usuario es el puente entre Claude y Codex (copia/pega de
  contraargumentos hasta convergencia).

## Cómo se toma una decisión

```
1. PROPUESTA
   Una de las tres voces plantea una decisión técnica con contexto y
   alternativas iniciales.

2. DEBATE
   Las otras dos voces responden: aceptar, rechazar, o contrapropuesta.
   Cada respuesta lleva justificación; "no me gusta" no cuenta como voto.

3. CONVERGENCIA o ESCALACIÓN
   - Si las tres voces convergen → consenso, se procede al paso 4.
   - Si dos convergen y una disiente con justificación técnica → el usuario
     escucha la disidencia y decide (puede dar la razón a la minoría).
   - Si no hay convergencia y la decisión bloquea → el usuario decide
     ejecutivamente y deja constancia en el ADR de la disidencia.

4. ADR
   La decisión se documenta en `docs/03-adr/ADR-NNN-titulo.md` con:
   contexto, alternativas evaluadas, decisión, consecuencias, disidencias.

5. COMMIT
   Recién acá se toca código o documentación operativa.
```

## Cuándo se pide consenso obligatorio

El tribunal **debe** debatir antes de avanzar en:

- Cambios de **arquitectura** (componentes, capas, contratos entre ellos).
- Cambios de **gobernanza** (este documento mismo, CONSTITUTION.md,
  CHANGE-PROTOCOL.md).
- Decisiones de **multi-tenancy** o aislamiento (aunque hoy esté excluido,
  cualquier insinuación de habilitarlo dispara debate).
- Decisiones de **seguridad**: rol Postgres, allowlists, manejo de secretos,
  flujos de confirmación.
- **Contratos públicos**: forma del Plan JSON, API de Edge Functions,
  schema de `orion_audit`.
- Adopción de **nuevas dependencias** mayores (framework, runtime,
  servicio externo).

## Cuándo se puede actuar unilateralmente

El asignado por el usuario puede proceder **sin consenso** en:

- Refactors internos que no cambian contratos públicos.
- Fixes de bugs que no son arquitectónicos (un null check, un typo en
  validación, un timeout corregido).
- Documentación menor: ortografía, links rotos, ejemplos.
- Tests adicionales sobre comportamiento ya especificado.
- Mejoras de UX que no tocan el flujo de seguridad (estilos, copys
  intermedios, animaciones).

En todos esos casos, igual queda registro en commit / changelog, pero no
requiere ADR ni quórum.

## Versionado de la gobernanza

Este documento es **constitutional**. Cualquier modificación a su contenido
sustantivo (no editorial) requiere:

1. ADR explícito que justifique el cambio.
2. Aprobación del usuario y del tribunal completo.
3. Bump del campo `last-reviewed` en el frontmatter.
4. Si el cambio es radical (cambio de modelo de gobernanza, no ajuste de
   matiz), `supersedes: [GOVERNANCE.md]` en el documento nuevo y este
   pasa a `status: deprecated` con link al sucesor.

## Anti-patrones explícitamente prohibidos

- **Avanzar sin ADR** porque "ya lo hablamos en el chat".
- **Reescribir consenso pasado** sin abrir un cambio formal.
- **Saltarse el debate** porque la decisión "es obvia".
- **Ignorar disidencia** sin documentarla.
- **Tomar decisiones arquitectónicas en mensajes de commit** en vez de
  ADRs.
