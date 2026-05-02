# server-shared

Módulos compartidos entre la PWA (cliente Vite/TS) y las Edge Functions (Deno).

**Contenido previsto (B1):**
- `plan-schema.ts` — validador Zod del Plan JSON v1.0 (ADR-003)

**Regla de uso:**
- El cliente importa desde aquí vía path alias.
- Las Edge Functions copian o referencian este módulo con import directo de Deno.
- Cualquier cambio aquí requiere verificar que ambos lados compilan.

> Vacío en B0 por diseño. El validador se implementa en B1 (T1.8).
