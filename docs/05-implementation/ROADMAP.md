---
title: Roadmap de implementación — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./M1-MVP.md
  - ./M2-HARDENING.md
  - ./M3-FEATURES.md
  - ./TECHNICAL-DEBT.md
  - ../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
  - ../01-product/PRD.md
  - ../../openspec/README.md
---

# Roadmap de implementación — Orion Vox

Visión operativa de la implementación de Orion Vox a lo largo de los
tres milestones definidos por la Constitución (§ 6) y formalizados en
[ADR-009](../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md).

> Este documento describe **cómo se construye y en qué orden**. La
> definición de qué hace cada milestone vive en el ADR-009 y en el PRD.
> El detalle día a día de cada tarea vive en el change OpenSpec
> correspondiente (`openspec/changes/<id>/`).

---

## Vista general M1 → M2 → M3

```
┌──────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   M1 — MVP       │ ──▶ │  M2 — Hardening    │ ──▶ │  M3 — Features   │
│   (en curso)     │     │   (post M1 +2sem)  │     │  (post M2 done)  │
│                  │     │                    │     │                  │
│  Plan F+ end-to- │     │  Cierra deuda M1   │     │  Multi-modelo,   │
│  end con deuda   │     │  RLS estricta      │     │  multi-proyecto, │
│  controlada      │     │  Preview firmado   │     │  exports, charts │
└──────────────────┘     └────────────────────┘     └──────────────────┘
       │                          │                          │
       ▼                          ▼                          ▼
  openspec/                 openspec/                  openspec/
  changes/m1-mvp/           changes/m2-hardening/      changes/m3-features/
  (activo, in-progress)     (no creado todavía)        (no creado todavía)
```

**Regla constitucional fundamental** (ADR-009): no se saltan fases. M3
no arranca hasta que M2 esté cerrado con sus 5 gates de salida
verificados. Una feature de M3 no se "cuela" en M2 porque "es chica" o
"es atractiva".

---

## Módulos por milestone

### M1 — MVP funcional (en curso)

| # | Módulo | Estado | Estimado | Depende de |
|---|--------|--------|----------|------------|
| M1-01 | PWA shell (manifest, SW, atajos, instalable) | pendiente | mediano | ADR-012 (framework) |
| M1-02 | Login Supabase Auth (magic link) + persistencia de JWT por SDK | pendiente | mediano | M1-01 |
| M1-03 | UI de configuración (Supabase URL + `anon_key`, locale; **sin secretos en cliente**) | pendiente | mediano | M1-02 |
| M1-04 | Edge Function `plan-intent` (Deno) — custodia Gemini key, function calling, devuelve Plan JSON v1.0 | pendiente | mediano | M1-03 |
| M1-05 | Web Speech Recognition `es-MX` con UI de escucha | pendiente | mediano | M1-01 |
| M1-06 | Web Speech Synthesis `es-MX` con interrupción | pendiente | corto | M1-05 |
| M1-07 | Validador Plan JSON cliente (preflight) | pendiente | corto | M1-04 |
| M1-08 | Edge Function `execute-plan` (Deno) — ejecuta Plan JSON con `service_role` server-side, valida JWT + allowlist + redacción, audita | pendiente | mediano | M1-09 |
| M1-09 | DDL `orion_audit` + migración versionada | pendiente | corto | — |
| M1-10 | Edge Function `schema-summary` (mínima, dump filtrado) | pendiente | corto | M1-09 |
| M1-11 | Modal de confirmación táctil (preview SQL legible) | pendiente | mediano | M1-04, M1-08 |
| M1-12 | Vista de auditoría client-side (espejo de `orion_audit`) | pendiente | corto | M1-08 |
| M1-13 | Manejo de errores cross-cutting (códigos, TTS, audit) | pendiente | mediano | M1-08, M1-06 |
| M1-14 | Deploy PWA a Vercel + smoke en Cubot KK9 | pendiente | corto | todos |

**Detalle**: [`M1-MVP.md`](./M1-MVP.md). Change activo:
[`openspec/changes/m1-mvp/`](../../openspec/changes/m1-mvp/).

### M2 — Hardening (post M1 + estabilización)

| # | Módulo | Estado | Estimado | Depende de |
|---|--------|--------|----------|------------|
| M2-01 | Rol Postgres dedicado `orion_vox_executor` + permisos mínimos por tabla/operación | bloqueado por M1 | mediano | M1 cerrado |
| M2-02 | Preview firmado server-side (HMAC + `preview_id`) en `execute-plan` | bloqueado por M1 | mediano | M2-01 |
| M2-03 | UI admin para gestionar allowlist y hints semánticos schema | bloqueado por M1 | mediano | M2-01 |
| M2-04 | RLS estricta en `orion_audit` y tablas operativas | bloqueado por M1 | corto | M2-01 |
| M2-05 | `dry_run` con estimación visible de filas en modal de confirmación | mejora UX | corto | M2-02 |
| M2-06 | (resuelto en M1: auth con JWT del usuario ya activa) | resuelto-en-m1 | — | — |
| M2-07 | Doble confirmación para deletes de alto impacto (US-SEC-06) | bloqueado por M1 | corto | M2-03 |
| M2-08 | Métricas básicas de uso (US-AUD-05) | bloqueado por M1 | corto | M1-12 |
| M2-09 | Pantalla "estado del proyecto" con deuda visible (US-MNT-03) | bloqueado por M1 | corto | — |
| M2-10 | Política de retención formal de `orion_audit` | bloqueado por M1 | corto | M1-09 |

**Detalle**: [`M2-HARDENING.md`](./M2-HARDENING.md). Change futuro:
`openspec/changes/m2-hardening/` (a crear cuando arranque M2).

### M3 — Features (post M2 cerrado)

| # | Módulo | Estado | Estimado | Depende de |
|---|--------|--------|----------|------------|
| M3-01 | Multi-modelo LLM (Claude / GPT como fallback de Gemini) | bloqueado por M2 | grande | M2 cerrado |
| M3-02 | Multi-proyecto Supabase (selector de target) | bloqueado por M2 | grande | M2 cerrado |
| M3-03 | Export de `orion_audit` a CSV / JSON (US-AUD-04) | bloqueado por M2 | corto | M1-12 |
| M3-04 | Gráficos inline para responses agregadas | bloqueado por M2 | mediano | M3-02 |
| M3-05 | Repetir consulta del historial (US-AUD-03) | bloqueado por M2 | corto | M1-12 |
| M3-06 | Filtros por fecha en historial (US-AUD-02) | bloqueado por M2 | corto | M1-12 |
| M3-07 | Voice tuning / templates de prompts / macros | bloqueado por M2 | mediano | M2 cerrado |

**Detalle**: [`M3-FEATURES.md`](./M3-FEATURES.md). Change futuro:
`openspec/changes/m3-features/` (a crear cuando arranque M3).

---

## Reglas de transición entre milestones

### M1 → M2

Para declarar M1 cerrado y abrir M2 deben cumplirse **todas** estas
condiciones:

1. **Todas las US M1** del backlog (`docs/01-product/USER-STORIES.md`)
   están implementadas y verificadas con sus criterios de aceptación.
2. **Métricas de éxito M1** del PRD § 5 cumplidas (las 1–4 al menos
   parcialmente, las 5–7 al 100 %).
3. **Uso real continuo** del usuario (director) durante **al menos 2
   semanas** sobre el Cubot KK9 contra su Supabase real.
4. **Cero pérdidas de datos** en `orion_audit` durante ese período (no
   hay ejecuciones sin auditoría).
5. **Cero ejecuciones de operaciones bloqueadas** (DDL, multi-statement)
   durante ese período.
6. **Deuda M1 documentada y nombrada** en
   [`TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md) sin sorpresas: cada item
   tiene ADR y plan de pago.
7. **Tribunal aprueba el cierre** (revisión Claude + Codex + director).

Si alguno falla, M1 sigue abierto. No se "abre M2 en paralelo" para
ganar tiempo.

### M2 → M3

Para declarar M2 cerrado y abrir M3 deben cumplirse **todas** estas
condiciones:

1. **100 % de la deuda M1** marcada como `cerrada` en
   [`TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md).
2. **Gates de salida M2** del ADR-009 verificados:
   - `execute-plan` ya **no** usa `service_role`: usa rol Postgres
     dedicado `orion_vox_executor` sin BYPASSRLS.
   - Preview firmado server-side (HMAC + `preview_id`) validado por
     `execute-plan`.
   - UI admin de allowlist/redacción operativa.
   - RLS estricta sobre `orion_audit` y tablas operadas.
   - Tests de integración para los 4 puntos anteriores en CI.
   *(Notas: `schema-summary` server-side, JWT auth y Gemini key
   server-side ya estaban en M1; no son gates M2.)*
3. **Threat model M2** re-evaluado y documentado (revisión del
   `SECURITY-MODEL.md`).
4. **RLS estricta probada** con tests de integración que demuestren que
   `orion_vox_executor` no puede pasar de su scope.
5. **Tribunal aprueba el cierre** (revisión Claude + Codex + director).

---

## Gobernanza por milestone

Cada milestone arranca con un **change OpenSpec dedicado** que vive en
`openspec/changes/<id>/`:

- M1: `openspec/changes/m1-mvp/` (activo).
- M2: `openspec/changes/m2-hardening/` (a crear cuando se cumplan los
  gates de transición M1 → M2).
- M3: `openspec/changes/m3-features/` (a crear cuando se cumplan los
  gates de transición M2 → M3).

Reglas (vienen de `openspec/README.md`):

- El change empaqueta `proposal.md`, `spec.md` (delta), `design.md`,
  `tasks.md`, `state.yaml`.
- Mientras un milestone está abierto, las specs delta viven en el
  change. Cuando cierra, las specs se promueven a `docs/04-specs/` y
  el change se mueve a `openspec/archive/`.
- Los ADRs derivados de un change viven directamente en
  `docs/03-adr/` (no se duplican en el change).

---

## Estado actual del roadmap

| Milestone | Estado | Change OpenSpec | Próxima acción |
|-----------|--------|------------------|----------------|
| M1 | en curso (preparación) | `openspec/changes/m1-mvp/` (in-progress) | Crear ADR-012 (framework PWA) y arrancar Bloque 1 de tasks |
| M2 | bloqueado por M1 | — (no creado) | Esperar gates de transición M1 → M2 |
| M3 | bloqueado por M2 | — (no creado) | Esperar gates de transición M2 → M3 |

---

## Cláusula de cierre

> Este roadmap es la vista operativa. Si entra en conflicto con el
> ADR-009 o con la Constitución § 6, gana el documento de mayor
> jerarquía y este roadmap se corrige. Cualquier cambio de orden,
> prioridad o gates requiere CHANGE-PROTOCOL.
