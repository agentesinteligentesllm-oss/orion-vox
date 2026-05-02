# contracts

Capa de adaptación PWA para los contratos compartidos entre cliente y Edge Functions.

**Fuente canónica**: `supabase/functions/_shared/` (ADR-013).
**Esta carpeta**: re-exports hacia el resto de la PWA. Nadie importa `$shared` directamente — importan desde aquí.

## Contenido

- `plan-schema.ts` — re-export del schema Zod + tipos de `$shared/plan-schema`

## Regla de uso

```typescript
// ✅ Correcto — toda la PWA importa desde el barrel
import { PlanSchema, type Plan } from '$lib/contracts/plan-schema';

// ❌ Incorrecto — no importar $shared directamente desde la PWA
import { PlanSchema } from '$shared/plan-schema';
```

## Regla de frontera (`_shared/`)

`supabase/functions/_shared/` acepta ÚNICAMENTE contratos puros:
schemas Zod, tipos inferidos, constantes, helpers sin I/O.
Cero APIs de Deno, cero cliente Supabase, cero secretos.

Ver ADR-013 para la estrategia completa de código compartido.
