---
title: "Design — M1 MVP funcional Plan F+"
change-id: m1-mvp
change-status: in-progress
target-milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./proposal.md
  - ./spec.md
  - ./tasks.md
  - ../../../docs/02-architecture/OVERVIEW.md
  - ../../../docs/02-architecture/COMPONENTS.md
  - ../../../docs/03-adr/ADR-001-plan-f-plus-architecture.md
  - ../../../docs/03-adr/ADR-006-pure-pwa-no-kotlin.md
---

# Design — M1 MVP funcional Plan F+

Decisiones de diseño operativas para implementar M1. **No** redefine
la arquitectura (vive en `docs/02-architecture/`) ni los principios
(viven en `docs/00-constitution/`). Sólo cubre el "cómo" práctico
para escribir código.

> **Decisiones bloqueantes pendientes**: ADR-012 (framework PWA) debe
> aprobarse por el tribunal antes de iniciar el Bloque 1 de
> [`tasks.md`](./tasks.md). La sección "Framework PWA" abajo es la
> recomendación inicial Claude+Codex que entra al debate.

---

## 1. Framework PWA (TBD — espera ADR-012)

**Recomendación inicial Claude + Codex**:

- **Lenguaje**: TypeScript estricto (`strict: true`,
  `noUncheckedIndexedAccess: true`).
- **Bundler**: Vite (rápido, soporte PWA maduro vía `vite-plugin-pwa`).
- **Framework UI**: liviano. En orden de preferencia:
  1. **Svelte 5** — bundle mínimo, reactividad simple, runes.
  2. **Solid** — performance, granular reactivity, JSX familiar.
  3. **React** — ecosistema, conocimiento universal, bundle más
     grande.

**Criterio de elección**: bundle inicial < 500 KB minified+gzip,
soporte first-class de PWA, productividad razonable del director.

**Decisión final**: pendiente del tribunal en ADR-012. Las tasks del
Bloque 1 quedan bloqueadas hasta entonces.

---

## 2. Estilo CSS (TBD)

**Recomendación inicial**:

- **Opción A — Tailwind CSS**: utility-first, productividad alta,
  bundle controlado con purge automático.
- **Opción B — CSS Modules con vanilla CSS**: cero overhead, control
  fino, requiere disciplina.
- **Opción C — CSS-in-JS (panda, vanilla-extract)**: type-safe,
  pero agrega complejidad.

**Recomendación**: Tailwind CSS por velocidad de iteración en M1.
Decisión final con el tribunal cuando se elija el framework.

---

## 3. Gestión de estado

**Decisión**: **sin store global complejo**. Single user, app
pequeña, ~4 vistas. Cada componente maneja su estado local; estado
compartido (credenciales, schema, locale, modo read-only) vive en
servicios singleton + suscripciones reactivas del framework elegido.

- Si Svelte: stores nativos (`writable`, `readable`, `derived`).
- Si Solid: signals + createStore.
- Si React: Context + `useSyncExternalStore` o Zustand minimal.

**No se justifica**: Redux, Pinia, MobX, XState (overkill para M1).

---

## 4. Routing

**Decisión**: routing simple con 4 vistas:

| Vista | Ruta | Atajo PWA |
|-------|------|-----------|
| Voice Mode | `/` o `/voice` | sí (atajo principal) |
| Settings | `/settings` | no |
| Audit | `/audit` | sí (atajo secundario) |
| Schema Editor | `/schema` | no |

Implementación: hash-based router minimal (50 líneas) o el router
nativo del framework si trae uno liviano. **No** instalar React
Router / SvelteKit / Solid Router para 4 rutas.

---

## 5. Offline behavior

**Decisión**: PWA cachea **shell** (HTML/CSS/JS/iconos) vía service
worker. Las requests a Gemini API y Supabase Edge Functions
requieren red.

- **Modo offline detectado**: indicador visual prominente, bloqueo
  de captura de voz con CTA "estás offline, reconectá".
- **Sin cola de comandos diferidos**: el director necesita feedback
  inmediato; no tiene sentido encolar voz para ejecutar más tarde.
- **Reintentos**: una sola vez automático para errores de red
  transientes; después al usuario.

---

## 6. Bundle size objetivo

**Objetivo**: < **500 KB** minified + gzip para el bundle inicial
(JS principal + CSS crítico). Lazy load para vistas secundarias
(Audit, Schema Editor).

**Verificación**: `vite build --report` o equivalente en cada PR.
Bloquear merge si supera el budget.

---

## 7. Browser target

| Browser | Soporte | Notas |
|---------|---------|-------|
| Chrome Android (latest) | **prioritario** | target principal Cubot KK9 |
| Chrome desktop (latest) | secundario | dev environment del director |
| Firefox Android | best-effort | no garantizado |
| Samsung Browser | best-effort | usable, no certificado |
| Safari iOS | **fuera de alcance** | NON-GOAL explícito |

**No** se compila / polyfillea para browsers viejos. ES2022+ baseline.

---

## 8. Internacionalización

**Decisión**: español **hardcoded** en código. Sin librería de
i18n en M1. Strings en componentes en español plano.

Si en algún momento se incorpora i18n, será un change OpenSpec
dedicado en M3 o post-M3.

---

## 9. Testing

| Capa | Herramienta | Cobertura objetivo M1 |
|------|-------------|------------------------|
| Unit | Vitest | utils, validador Plan JSON, parsers |
| Component | Vitest + Testing Library del framework | componentes críticos (modal, voice indicator) |
| Edge Function unit | Deno test | query builder, validadores, mappers |
| E2E | Playwright (si tiempo permite) | flujo voz→Supabase happy path + cancel |
| Smoke manual | checklist | obligatorio sobre Cubot KK9 antes de cerrar M1 |

**Cobertura no es métrica**. La métrica es: "cada criterio de
aceptación de cada US tiene un test que lo verifica".

---

## 10. Dev environment

- **Supabase local con Docker**: `supabase start` (Supabase CLI).
  Migraciones versionadas en `supabase/migrations/`.
- **Gemini API key dev separada de prod-personal**: el director
  genera dos keys distintas en Google AI Studio y las inyecta como
  env var `GEMINI_API_KEY` de la Edge `plan-intent` en cada entorno
  (Supabase project dev vs prod-personal). La key nunca toca el
  cliente ni el repo.
- **Variables de entorno**: `.env.local` sólo para Supabase URL +
  `anon_key` (públicas) en dev; secrets Edge se configuran con
  `supabase secrets set`. Nunca commitear ningún tipo de key.
- **Postgres seed**: script de seed con 3 tablas piloto realistas
  para tests E2E. Vive en `supabase/seed.sql`.

---

## 11. Estructura de carpetas (propuesta)

A confirmar tras decidir framework. Esqueleto inicial:

```
pwa-supabase-ia/
├── src/                          # PWA frontend
│   ├── components/               # UI components
│   ├── views/                    # Voice / Settings / Audit / Schema
│   ├── services/                 # gemini, supabase, storage, voice
│   ├── lib/                      # plan-json validator, types, utils
│   └── main.ts
├── supabase/
│   ├── functions/
│   │   ├── execute-plan/         # Deno Edge Function
│   │   └── schema-summary/       # Deno Edge Function
│   ├── migrations/               # SQL migrations versionadas
│   └── seed.sql
├── public/                       # manifest, iconos, service worker
├── tests/                        # E2E (Playwright)
├── docs/                         # ya existe
├── openspec/                     # ya existe
└── package.json, vite.config.ts, etc.
```

---

## 12. Edge Functions (Deno)

- **Runtime**: Deno (nativo de Supabase Edge Functions).
- **Imports**: usar `npm:` o `https://deno.land/x/...` con versiones
  pinneadas. **No** import maps dinámicos.
- **Validación**: Zod (vía `npm:zod`) para Plan JSON server-side.
- **Logging**: `console.log` estructurado (JSON) que Supabase ya
  recolecta. No instalar logger custom en M1.
- **Tests**: `deno test` con mocks del cliente Postgres.

---

## 13. Performance budget

| Métrica | Budget M1 |
|---------|-----------|
| Bundle JS inicial (gzip) | < 500 KB |
| TTFB (PWA shell) | < 800 ms en 4G |
| Time to Interactive | < 2 s en Cubot KK9 |
| Latencia voz→TTS (query simple) | < 6 s (PRD § 5) |
| Latencia Edge Function (sin Gemini) | < 500 ms p95 |

Verificación: Lighthouse + medición en el dispositivo real.

---

## 14. Decisiones que **no** se toman acá

Estas decisiones quedan pendientes y se resuelven en sub-changes o
ADRs cuando aplique:

- **Modelo concreto de Gemini** (Pro / Flash): se decide al
  implementar `spec-gemini-client`, basado en latencia y tasa de
  Plan JSON válido en pruebas.
- **Diseño visual / theming**: M1 prioriza funcional sobre lindo.
  Estética pulida vive en M3.
- **Error tracking externo** (Sentry, etc.): no se incorpora en M1.
  `orion_audit` cubre el caso operativo.
- **Analytics de uso**: no se incorpora en M1. Si se necesita en
  M2, US-AUD-05 lo cubre.

---

## 15. Tradeoffs aceptados

- **Bundle size vs DX**: se prioriza bundle chico. Si Tailwind o el
  framework elegido lo inflan, se revisita.
- **Type safety vs velocidad**: TypeScript estricto desde día 1.
  Aceptamos un poco más de fricción inicial por menos bugs en
  runtime.
- **Test coverage vs cierre M1**: se prioriza tests de criterios
  innegociables (auditoría, operaciones bloqueadas, confirmación)
  sobre cobertura uniforme.
- **Hosting Vercel vs alternativas**: Vercel por velocidad de
  deploy. Si el plan free se queda corto, se evalúa Cloudflare
  Pages en M2.
