---
title: "ADR-013 — Estrategia de esquema compartido Plan JSON entre PWA y Edge Functions"
decision-status: accepted
status: stable
milestone: M1
owner: orion-vox
decision-date: 2026-05-01
last-reviewed: 2026-05-01
related:
  - ADR-003-plan-json-not-sql.md
  - ADR-005-gemini-key-client-m1-server-m2.md
  - ADR-012-framework-pwa.md
  - ../04-specs/spec-plan-intent-edge.md
  - ../02-architecture/PLAN-JSON-CONTRACT.md
---

# ADR-013 — Estrategia de esquema compartido Plan JSON entre PWA y Edge Functions

## Contexto

El Plan JSON v1.0 (ADR-003) es el contrato estructural central del sistema. Debe
validarse en **dos runtimes distintos**:

- **PWA** (Vite + TypeScript, runtime Node-like vía Vite dev server y bundle
  esbuild): necesita validación para UX (mostrar errores de plan antes de
  confirmar), para armar el payload al llamar `execute-plan`, y para tipar
  correctamente el estado de la UI.
- **Edge Functions Deno** (`execute-plan`): necesita validación con **autoridad**
  de seguridad. El servidor es el único árbitro real; la validación cliente es
  solo UX defensiva.

El reto: **compartir el validador Zod entre PWA y Deno sin monorepo, sin npm
publishing, sin pasos de sincronización manuales y sin duplicar código.**

Las restricciones del entorno:

- Repositorio single-package (no monorepo, no npm workspace).
- Las Edge Functions son Deno; no pueden importar módulos de `node_modules/` con
  rutas relativas a la raíz del repo como si fuera un paquete npm.
- Supabase CLI tiene comportamiento documentado: **bundlea automáticamente el
  directorio `supabase/functions/_shared/`** junto con cada función al hacer
  `supabase functions deploy`. Esta es la herramienta de Supabase para código
  compartido entre funciones.
- El ecosistema Zod 4 introduce un export separado `zod/v4` que permite
  coexistencia con código Zod 3. Es el export recomendado para código nuevo.

## Decisión

### 1. Fuente canónica: `supabase/functions/_shared/plan-schema.ts`

El validador Zod vive en `supabase/functions/_shared/plan-schema.ts`. Es la
**única fuente de verdad** del esquema. Deno lo importa con path relativo:

```typescript
// supabase/functions/execute-plan/index.ts
import { PlanSchema, type Plan } from '../_shared/plan-schema.ts';
```

Supabase CLI bundlea `_shared/` automáticamente — sin scripts adicionales, sin
build steps, sin watch.

### 2. Alias Vite: `$shared` → `./supabase/functions/_shared/`

La PWA accede al mismo módulo vía alias de Vite:

```typescript
// vite.config.ts
import path from 'node:path';
resolve: {
  alias: {
    '$shared': path.resolve('./supabase/functions/_shared'),
  },
},
```

TypeScript recibe el mismo alias vía `paths` en `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "$shared/*": ["./supabase/functions/_shared/*"]
    }
  },
  "include": [
    "src/**/*.ts",
    "src/**/*.svelte",
    "supabase/functions/_shared/**/*.ts"
  ]
}
```

El mismo alias se replica en `vitest.config.ts` (vía `mergeConfig` con
`vite.config.ts`) para que los tests de Vitest resuelvan `$shared` igual que
el build.

### 3. Barrel PWA: `src/lib/contracts/plan-schema.ts`

Toda la PWA importa el validador desde el barrel interno, **nunca directamente
desde `$shared`**:

```typescript
// src/lib/contracts/plan-schema.ts
export { PlanSchema, type Plan, type PlanFilter, type PlanJoin } from '$shared/plan-schema';
```

El directorio `src/lib/contracts/` (renombrado de `src/lib/server-shared/`) es
la capa de adaptación: si mañana el origen cambia, solo cambia el barrel.

### 4. Zod 4.4.2 exact pin, import desde `'zod/v4'`

- Versión: **4.4.2**, `--save-exact` en `package.json` (sin caret `^`).
- Import: `import { z } from 'zod/v4'` — usa el export dedicado de Zod 4, que
  garantiza compatibilidad con `z.toJSONSchema()` para Gemini function calling.
- Deno: import map en `deno.json` por función (no global):

```json
{
  "imports": {
    "zod/v4": "npm:zod@4.4.2/v4"
  }
}
```

### 5. Regla de frontera para `_shared/`

`supabase/functions/_shared/` es **ÚNICAMENTE para contratos puros**:

✅ Permitido:
- Schemas Zod (`z.object(...)`)
- Tipos inferidos (`z.infer<typeof ...>`)
- Constantes del contrato (versión del Plan, operaciones permitidas, límites)
- Helpers puros sin efectos ni I/O

❌ Prohibido:
- APIs de Deno (`Deno.env`, `Deno.serve`, etc.)
- Cliente Supabase
- `fetch` con URLs hardcoded
- Variables de entorno
- Secretos de ningún tipo

Si se necesita código compartido que no sea un contrato puro, va en
`supabase/functions/_shared/utils/` con la misma restricción, o se replica por
función si el código es pequeño.

## Alternativas consideradas

### Opción B — npm workspace / monorepo

Convertir el repo en un monorepo con `packages/plan-schema/` y publicarlo como
paquete local.

**Descartada.** Introduce complejidad de tooling (npm workspace, `package.json`
adicional, resolución de paths en Deno) por cero ganancia en un proyecto
single-user. El problema ya está resuelto por Supabase CLI con `_shared/`.

### Opción C — Script copy-on-save

Un script que copia `src/lib/contracts/plan-schema.ts` a
`supabase/functions/_shared/` en cada cambio (watch mode).

**Descartada.** Introduce un paso de sincronización frágil: si el dev olvida
ejecutar el script, el schema de Edge y el de cliente divergen silenciosamente.
El patrón `_shared/` + alias Vite elimina la posibilidad de desincronización.

### Opción D — Schema como constante en runtime

No usar Zod en cliente; enviar el JSON schema de Gemini function calling como
constante hardcoded en `plan-intent`.

**Descartada.** La validación Zod en cliente da UX defensiva (errores de plan
antes de llamar a la Edge) y tipos TypeScript concretos para el resto de la PWA.
Sin ella, la UI trabaja con `unknown` y los errores se detectan tarde.

### Opción E — Deno + npm specifier directo sin deno.json

Importar directamente `npm:zod@4.4.2/v4` en el código fuente de la función
sin deno.json.

**Descartada.** El import map en `deno.json` por función permite:
1. Fijar la versión en un solo lugar por función.
2. Cambiar la versión sin tocar todos los imports del código fuente.
3. Alinearse con la convención oficial de Supabase Edge Functions con Deno.

## Consecuencias

### Positivas

- **Cero duplicación**: el schema Zod existe en un único archivo.
- **Cero sincronización manual**: Supabase CLI bundlea `_shared/` en cada
  `functions deploy`; Vite resuelve el alias en cada build/dev.
- **Type safety end-to-end**: el mismo tipo `Plan` (inferido de Zod) se usa en
  la PWA y en la Edge, con source-of-truth único.
- **`z.toJSONSchema()`** disponible: Zod 4 genera el schema para Gemini function
  calling desde el mismo objeto Zod que valida en runtime.
- **Tests cross-runtime**: los fixtures JSON en `tests/fixtures/plans/` se usan
  tanto en Vitest (PWA) como en `deno test` (Edge) con el mismo schema.

### Negativas / compromisos

- `tsconfig.app.json` incluye `supabase/functions/_shared/**/*.ts` — TypeScript
  compila código fuera de `src/`. Esto es intencional y acotado al directorio
  `_shared/`.
- El alias `$shared` debe mantenerse en tres archivos (`vite.config.ts`,
  `tsconfig.app.json`, `vitest.config.ts`). Si se mueve `_shared/`, los tres
  deben actualizarse.
- Zod 4.4.2 exact pin requiere atención manual al hacer upgrade. La deuda es
  controlada: hay un único lugar donde revisar (`package.json` +
  `deno.json` × 3 funciones).

## Implementación

Los cambios estructurales que activa este ADR:

1. `supabase/functions/_shared/plan-schema.ts` — schema Zod canónico.
2. `supabase/functions/{plan-intent,execute-plan,schema-summary}/deno.json` —
   import map con `"zod/v4": "npm:zod@4.4.2/v4"`.
3. `src/lib/server-shared/` → `src/lib/contracts/` (git mv).
4. `src/lib/contracts/plan-schema.ts` — barrel re-export desde `$shared`.
5. `vite.config.ts` — alias `$shared`.
6. `tsconfig.app.json` — `baseUrl`, `paths`, include ampliado.
7. `vitest.config.ts` — hereda alias vía `mergeConfig`.
8. `supabase/migrations/001_orion_audit.sql` — DDL canónico de `orion_audit`.
9. `package.json` — `zod@4.4.2` (exact), `vitest` (dev dep).
