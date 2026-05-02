---
title: "ADR-012: Framework PWA — Svelte 5 + Vite + TypeScript"
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-006-pure-pwa-no-kotlin.md
  - ADR-007-web-speech-api-internal-voice-mode.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/NON-GOALS.md
---

# ADR-012: Framework PWA — Svelte 5 + Vite + TypeScript

## Contexto

Orion Vox es una **PWA pura** (ADR-006), single-user, single-device
target (Cubot KingKong 9), con superficie funcional reducida:

- 4–5 pantallas: login/PIN, voice mode (principal), settings, audit
  viewer (M2), schema editor (M2).
- Sin SSR (es PWA estática hosted).
- Hosting estático (Vercel/Netlify/Cloudflare Pages).
- Uso intensivo de **Web APIs nativas**: Web Speech (Recognition +
  Synthesis), IndexedDB, Web Crypto, `fetch`, Service Worker.
- Estado global mínimo (sesión + settings + última operación + cola
  pendiente). No hay tablas dinámicas grandes ni grids complejos.
- Performance crítica en arranque (cold start del Cubot tras matar la
  app debe ser sub-segundo a "listo para escuchar").
- **Single dev** mantiene el código.

La elección de framework debe optimizar para: bundle pequeño,
integración natural con Web APIs, simplicidad conceptual, longevidad
del código mantenido por una sola persona, y excelente DX para iterar
rápido en M1.

ADR-INDEX previamente reservó este slot como ADR-012 ("framework de la
PWA, se decide al arrancar M1").

## Alternativas evaluadas

### Alternativa A — Svelte 5 + Vite + TypeScript (ELEGIDA)

**Pros**:
- Bundle final típico < 100 KB (sin VDOM, runtime mínimo).
- **Runas** (Svelte 5) son reactividad nativa, simples de razonar.
- Sin abstracciones entre el componente y las Web APIs (Web Speech,
  IndexedDB, Crypto se usan directamente).
- `vite-plugin-pwa` cubre manifest + Service Worker out of the box.
- DX excelente (HMR instantáneo, errores claros, TS de primera).
- Single-file components (HTML + script + style juntos) reducen
  fricción para una app pequeña.

**Contras**:
- Ecosystem más chico que React/Vue (menos libs maduras de UI).
- Curva si nadie en el equipo conoce Svelte (mitigado: single dev,
  recursos abundantes en svelte.dev).

### Alternativa B — Solid.js + Vite

**Pros**:
- Signals-first, modelo mental similar a runas de Svelte 5.
- Performance equivalente o superior.
- TS first-class.

**Contras**:
- Ecosystem más chico aún que Svelte.
- Menos recursos didácticos en español.
- Sin un equivalente directo a `vite-plugin-pwa` con la misma madurez.

**Decisión**: #2. Buen candidato pero pierde por ecosystem y madurez
del tooling PWA.

### Alternativa C — Vanilla TS + Web Components

**Pros**:
- Cero framework, cero runtime, máxima portabilidad.
- Web Components son estándar nativo.

**Contras**:
- Mucho boilerplate para reactividad y bindings.
- Sin DX moderna (templates no compilados, sin HMR fluido sin tooling
  extra).

**Decisión**: #3. Válido para apps **aún más pequeñas** (1-2 pantallas
o widgets sueltos). Para 5 pantallas con flujos no triviales, el
boilerplate domina.

### Alternativa D — React + Vite

**Pros**:
- Ecosystem masivo, librerías para todo.
- Todo el equipo de software lo conoce.

**Contras**:
- Bundle base ~150 KB+ (React + ReactDOM) sin contar la app.
- Overhead conceptual (hooks, reglas de hooks, useEffect timing,
  re-renders fantasma) excesivo para una app de 5 pantallas.
- Más boilerplate (`useState`, `useEffect`, `useMemo`, etc.) frente a
  runas/signals declarativos.
- VDOM es overhead innecesario para esta superficie.

**Decisión**: #4. Justificable si se quisiera contratar más devs o
reusar componentes de un design system React existente — no es el
caso.

## Decisión

**Svelte 5 + Vite + TypeScript** como stack del frontend de Orion Vox.

Aplica a M1, M2 y M3.

## Consecuencias

### Positivas

- Bundle final estimado < 100 KB para todo el shell + lógica core.
  Tiempo de cold start en Cubot KK9 esperado: < 1.5s.
- Reactividad simple: `$state`, `$derived`, `$effect` cubren el 100%
  de las necesidades sin hooks ni reducers.
- Integración Web APIs sin wrappers: `new SpeechRecognition()`,
  `indexedDB.open()`, `crypto.subtle.encrypt()` se usan directo desde
  componentes.
- `vite-plugin-pwa` genera manifest + SW con poca config.
- DX moderna: TS estricto, HMR, vite-node para tests.

### Negativas / deuda asumida

- Ecosystem de UI libs más chico (no hay equivalente directo a
  Material UI o shadcn/ui en madurez Svelte — pero la app no necesita
  un design system completo).
- Si en el futuro se requiere un dev adicional sin experiencia Svelte,
  hay curva inicial (~1 semana). Mitigación: documentación viva y
  scaffold claro.
- Svelte 5 (runas) es reciente (2024); algunas libs comunitarias aún
  cubren Svelte 4 mejor. Para M1 esto no afecta porque no se usa
  ninguna lib de tercera parte significativa.

### Neutrales

- La decisión es revertible si M2 demanda algo que Svelte no resuelve
  bien (improbable dado el scope). Costo de migración: alto pero no
  catastrófico para una app de 5 pantallas.

## Aplicabilidad

- **M1**: stack base de la PWA.
- **M2**: agrega pantallas (audit viewer, schema editor) en el mismo
  stack.
- **M3**: si M3 introduce funcionalidades complejas (visualizaciones,
  modo offline avanzado), reevaluar; por ahora se mantiene.

## Tooling complementario (decisiones aceptadas)

| Capa            | Decisión                                                           |
|-----------------|--------------------------------------------------------------------|
| Build / Bundler | **Vite 5+**                                                        |
| Lenguaje        | **TypeScript estricto** (`"strict": true`)                         |
| PWA / SW        | **vite-plugin-pwa** (manifest + service worker)                    |
| Estado          | **Stores Svelte nativos** (`writable`, `readable`, `derived`) y/o runas. NO se usa Zustand, Redux, MobX, etc. |
| Routing         | **svelte-spa-router** o navegación basada en URL hash. File-based routing no se usa (innecesario para 5 pantallas). |
| CSS             | **Tailwind 4** o **vanilla CSS modules** — decisión secundaria, no bloqueante. Resolver al codear la primera pantalla. |
| Tests unit      | **Vitest**                                                         |
| Tests E2E       | **Playwright** si tiempo lo permite en M1; obligatorio en M2.      |
| Lint / Format   | **Biome** (más rápido que ESLint + Prettier; un solo binario)      |

## Disidencias

Ninguna registrada. Consenso del tribunal (Claude + Codex + usuario)
en sesión del 2026-05-01.

## Notas de implementación

- ADR-INDEX debe actualizarse para reflejar este ADR como `accepted`.
- Cualquier change OpenSpec que toque el frontend asume Svelte 5 +
  Vite + TS sin necesidad de re-decidirlo.
- Configuración de `tsconfig.json`, `vite.config.ts`, `biome.json` y
  `tailwind.config` (si aplica) viven en specs de implementación que
  se generan en el primer change M1 (no en este ADR).

## Referencias

- ADR-001 — Plan F+ donde la PWA es el cliente.
- ADR-006 — PWA pura (sin Kotlin/native).
- ADR-007 — Web Speech API como modo voz interno.
- ADR-009 — Roadmap modular M1 → M2 → M3.
