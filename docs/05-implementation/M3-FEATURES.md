---
title: M3 — Features (calidad de vida una vez seguro)
status: stable
milestone: M3
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./ROADMAP.md
  - ./M2-HARDENING.md
  - ../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../01-product/USER-STORIES.md
  - ../00-constitution/CONSTITUTION.md
---

# M3 — Features (calidad de vida una vez seguro)

> **Placeholder operativo.** Este documento describe el alcance, los
> pre-requisitos y la postura de M3. El change OpenSpec
> `openspec/changes/m3-features/` **aún no existe** y se crea cuando
> M2 cierre y se cumplan los gates de transición M2 → M3 definidos en
> [`ROADMAP.md`](./ROADMAP.md).

---

## Objetivo M3

> **Calidad de vida y expansión, una vez que el sistema es seguro
> según el threat model M2.**

M3 es donde Orion Vox deja de ser "MVP endurecido" y empieza a tener
features ricos: multi-modelo LLM, multi-proyecto Supabase, exports,
gráficos, voice tuning. Todas las features de M3 son **opcionales por
diseño**: el sistema sigue siendo correcto y seguro sin ellas, M3
agrega valor incremental sin tocar los cimientos.

---

## Alcance funcional

Catálogo de features candidatas. Cada una entra al change M3 con su
propio sub-spec o se factoriza a un change separado si crece.

| # | Feature | US relacionadas | Tamaño estimado |
|---|---------|-----------------|-----------------|
| M3-01 | Multi-modelo LLM (Claude / GPT como fallback de Gemini) | nueva | grande |
| M3-02 | Multi-proyecto Supabase (selector de target activo) | nueva | grande |
| M3-03 | Export de `orion_audit` a CSV / JSON | US-AUD-04 | corto |
| M3-04 | Gráficos inline para responses agregadas (charts) | nueva | mediano |
| M3-05 | Repetir consulta del historial | US-AUD-03 | corto |
| M3-06 | Filtros por fecha en historial | US-AUD-02 | corto |
| M3-07 | Voice tuning / templates de prompts / macros recurrentes | nueva | mediano |
| M3-08 | Wake word interno dentro de la PWA (sin "OK Google") | nueva | grande, exploratorio |

Notas:

- M3-01 (multi-modelo) requiere abstracción del cliente LLM. Es la
  feature más arquitectónica de M3.
- M3-02 (multi-proyecto) implica que la configuración pasa de
  "single project" a "lista de proyectos con uno activo".
- M3-08 (wake word interno) es exploratorio: depende de qué
  alternativas haya en Web (Porcupine, Picovoice WASM, etc.) sin
  romper el principio de PWA pura (ADR-006).

---

## Pre-requisitos para abrir M3

Vienen de la regla de transición M2 → M3 documentada en
[`ROADMAP.md`](./ROADMAP.md). Resumen:

1. M2 cerrado con sus 5 gates verificados.
2. 100 % de la deuda M1 marcada como `cerrada` en
   [`TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md).
3. Threat model M2 re-evaluado y documentado.
4. RLS estricta probada con tests de integración.
5. Tribunal aprueba la apertura de M3.

---

## Criterios de Done para cerrar M3

> **TBD por feature.** A diferencia de M1 y M2, M3 no se cierra como
> un bloque. Cada feature de M3 es un mini-milestone con sus propios
> criterios verificables. M3 como concepto puede quedar
> "permanentemente abierto" mientras se sigan agregando features.

Reglas para declarar **una feature** M3 como cerrada:

- [ ] Spec de la feature implementada y promovida a `docs/04-specs/`.
- [ ] Tests automatizados cubriendo el contrato.
- [ ] Smoke test manual sobre Cubot KK9.
- [ ] Documentación actualizada (`PRD.md`, `OVERVIEW.md` si aplica).
- [ ] Sin regresión de las US M1/M2 verificada.

---

## Postura de M3

- **Cero compromiso con la seguridad**: ninguna feature M3 puede
  introducir nueva deuda de seguridad. Si una feature requiere
  retroceder (ej. multi-modelo con keys client-side), se rechaza o
  se ajusta.
- **Cada feature en su change OpenSpec**: si una feature es grande
  (M3-01, M3-02), puede tener su propio change separado del change
  paraguas `m3-features`.
- **Feature flags**: features experimentales (M3-08 wake word
  interno) detrás de feature flag para poder deshabilitar sin
  rollback.

---

## Change OpenSpec futuro

`openspec/changes/m3-features/` — **no creado todavía**. Se crea
cuando arranque M3, con la estructura canónica de OpenSpec.

Variante esperada: changes separados por feature grande
(`openspec/changes/m3-multi-model/`,
`openspec/changes/m3-multi-project/`, etc.) en vez de un único change
paraguas. La decisión final se toma al abrir M3.

---

## Riesgos conocidos

- **Scope creep infinito**: M3 puede expandirse sin control. Cada
  feature pasa por proposal + tribunal antes de implementarse.
- **Tentación de "una feature pequeña en M2"**: prohibido por
  ADR-009. Si una feature M3 es realmente urgente, se debate si
  amerita un milestone M2.5 documentado, no se cuela en M2.
- **Multi-modelo puede revivir deuda**: si un proveedor LLM no
  soporta function calling estricto, su Plan JSON puede ser
  inestable. Se evalúa por proveedor.

---

## Cláusula de cierre

> M3 es la recompensa, no la prioridad. El director valida que el
> sistema es útil y seguro **antes** de pedir features. Sin M2
> cerrado, no hay M3.
