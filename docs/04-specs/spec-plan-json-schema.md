---
title: Plan JSON v1.0 — schema operativo y validador
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-gemini-client.md
  - ./spec-execute-plan-edge.md
  - ../02-architecture/PLAN-JSON-CONTRACT.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../03-adr/ADR-003-plan-json-not-sql.md
---

# Spec — Plan JSON v1.0 schema y validador

> **Fuente de verdad:** `../02-architecture/PLAN-JSON-CONTRACT.md`. Esta
> spec es la **bajada operativa** del contrato a tipos TypeScript y a
> una función de validación reutilizable cliente y server. Si esta spec
> diverge del contrato, gana el contrato — corregir esta spec.

## 1. Propósito

Definir el schema y la función `validatePlan(plan)` que tanto el
cliente (PWA) como el server (Edge Function `execute-plan`) usan para
validar Plan JSON. **Un único módulo compartido** evita drift entre
cliente y server, que es la fuente clásica de "el cliente lo aceptó
pero el server lo rechazó con mensaje confuso".

## 2. Alcance

**Cubre:**

- Tipos TypeScript del Plan JSON v1.0.
- Función `validatePlan(plan)` que retorna `{ valid, errors, kind }`.
- Reglas de negocio sobre `update`/`delete` (filters obligatorios).
- Detección de patrones SQL en valores escalares.
- Detección de subqueries anidadas en `filters[].value`.

**NO cubre:**

- Construcción del SQL parametrizado (eso vive en
  `spec-execute-plan-edge.md`).
- Lista de tablas allowlist (M2).
- Schema-summary de tablas reales (eso es input dinámico, no parte de
  Plan JSON).

## 3. Interfaces / API / Contratos

### 3.1 Tipos TypeScript

```ts
export type PlanOperation = 'select' | 'insert' | 'update' | 'delete';

export type FilterOp =
  | '=' | '!=' | '<' | '>' | '<=' | '>='
  | 'in' | 'not_in'
  | 'like' | 'ilike'
  | 'is_null' | 'is_not_null';

export type ScalarValue = string | number | boolean | null;

export interface PlanFilter {
  column: string;       // pattern: ^[a-z_][a-z0-9_.]*$
  op: FilterOp;
  value?: ScalarValue | ScalarValue[];
  // value es ignorado en is_null / is_not_null
  // value es array sólo en in / not_in
}

export interface PlanOrderBy {
  column: string;
  dir: 'asc' | 'desc';
}

export interface PlanJoin {
  type: 'inner';        // M1: solo inner
  table: string;        // pattern: ^[a-z_][a-z0-9_]*$
  on: { left: string; right: string };
}

export interface PlanJSON {
  version: '1.0';
  operation: PlanOperation;
  table: string;        // pattern: ^[a-z_][a-z0-9_]*$, max 63
  columns?: string[];   // en select: lista de columnas; vacío = '*' equivalente
  values?: Record<string, ScalarValue>;  // en insert/update
  filters?: PlanFilter[];                // obligatorio en update/delete
  order_by?: PlanOrderBy[];
  limit?: number;       // 1..1000; default 100 si select y no especificado
  joins?: PlanJoin[];   // M1: maxItems=1
  dry_run?: boolean;    // si true, no se ejecuta; sólo se audita la intención
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];           // mensajes en español listos para UX
  kind?: 'read' | 'write';    // 'read' para select, 'write' para insert/update/delete
}
```

### 3.2 Identificadores legales

| Campo                       | Patrón regex                  | Notas                                 |
|-----------------------------|-------------------------------|---------------------------------------|
| `table`                     | `^[a-z_][a-z0-9_]*$` max 63  | snake_case Postgres.                  |
| `joins[].table`             | `^[a-z_][a-z0-9_]*$` max 63  | idem.                                 |
| `columns[]`                 | `^[a-z_][a-z0-9_.]*$`        | permite `tabla.columna` por joins.   |
| `filters[].column`          | `^[a-z_][a-z0-9_.]*$`        | idem.                                 |
| `order_by[].column`         | `^[a-z_][a-z0-9_.]*$`        | idem.                                 |
| `joins[].on.left|right`     | `^[a-z_][a-z0-9_.]*$`        | idem.                                 |

### 3.3 Operaciones permitidas

```
select | insert | update | delete
```

Cualquier otro string en `operation` es rechazo inmediato.

### 3.4 Operaciones bloqueadas (rechazo a nivel de validador, antes de tocar SQL)

| Categoría        | Patrón detectado                                                        |
|------------------|-------------------------------------------------------------------------|
| Multi-statement  | Cualquier `value` (string) que matchee `/;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|COPY|DO)\b/i` |
| SQL crudo        | `value` con paréntesis + keyword SQL conocida (`/\([^)]*\b(SELECT|UNION|OR\s+1=1)\b/i`) — heurística conservadora |
| Subquery anidada | `filters[].value` que sea un objeto con shape de Plan JSON (tiene `version` y `operation`) |
| Tabla bloqueada  | `table === 'orion_audit'` (denylist M1) |

### 3.5 Operadores de filtro permitidos

```
= != < > <= >= in not_in like ilike is_null is_not_null
```

Reglas adicionales por operador:

| op             | `value` esperado                                  |
|----------------|---------------------------------------------------|
| `=`, `!=`, `<`, `>`, `<=`, `>=` | escalar (string | number | boolean | null) |
| `in`, `not_in` | array de escalares (no vacío)                     |
| `like`, `ilike`| string                                            |
| `is_null`, `is_not_null` | (ignorado; presente o ausente)            |

### 3.6 Reglas de negocio

| Regla                                          | Operación afectada                |
|------------------------------------------------|------------------------------------|
| `filters` obligatorio y no vacío               | `update`, `delete`                 |
| `values` obligatorio y no vacío                | `insert`, `update`                 |
| `columns` obligatorio (o se infiere `*`)       | `select`                           |
| `limit` se inyecta a 100 si falta              | `select`                           |
| `limit` no puede exceder 1000                  | todas                              |
| `joins` máximo 1                               | `select` (M1; M2 amplía)           |
| `joins` solo `inner`                           | `select` (M1)                      |
| `dry_run: true` admitido                       | todas (cancela ejecución, audita intención) |

### 3.7 Validador — pseudocódigo

```ts
export function validatePlan(plan: unknown): ValidationResult {
  const errors: string[] = [];

  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['El plan no es un objeto JSON válido.'] };
  }
  const p = plan as Partial<PlanJSON>;

  // 1. version
  if (p.version !== '1.0') {
    errors.push(`Versión de plan no soportada: ${p.version}. Esperado 1.0.`);
  }

  // 2. operation
  if (!p.operation || !['select', 'insert', 'update', 'delete'].includes(p.operation)) {
    errors.push(`Operación inválida: ${p.operation}.`);
  }

  // 3. table
  if (!p.table || !isValidIdent(p.table, 63)) {
    errors.push(`Tabla inválida: ${p.table}.`);
  }
  if (p.table === 'orion_audit') {
    errors.push('Operaciones sobre orion_audit no permitidas vía Plan JSON.');
  }

  // 4. filters obligatorios en write destructivo
  if (p.operation === 'update' || p.operation === 'delete') {
    if (!p.filters || p.filters.length === 0) {
      errors.push(`${p.operation.toUpperCase()} requiere al menos un filtro.`);
    }
  }

  // 5. values obligatorio en insert / update
  if (p.operation === 'insert' || p.operation === 'update') {
    if (!p.values || Object.keys(p.values).length === 0) {
      errors.push(`${p.operation.toUpperCase()} requiere al menos un campo en values.`);
    } else {
      for (const [col, val] of Object.entries(p.values)) {
        if (!isValidIdent(col, 63)) errors.push(`Columna inválida en values: ${col}.`);
        if (!isScalar(val)) errors.push(`Valor no escalar en values.${col}.`);
        if (containsSqlInjection(val)) errors.push(`Valor sospechoso (multi-statement) en values.${col}.`);
      }
    }
  }

  // 6. filters
  if (p.filters) {
    for (const [i, f] of p.filters.entries()) {
      if (!isValidIdent(f.column, 63)) errors.push(`filters[${i}].column inválido.`);
      if (!ALLOWED_OPS.includes(f.op)) errors.push(`filters[${i}].op inválido: ${f.op}.`);
      if (f.op === 'in' || f.op === 'not_in') {
        if (!Array.isArray(f.value) || f.value.length === 0 || !f.value.every(isScalar)) {
          errors.push(`filters[${i}] requiere array de escalares no vacío.`);
        }
      } else if (f.op === 'is_null' || f.op === 'is_not_null') {
        // value ignorado
      } else {
        if (!isScalar(f.value)) errors.push(`filters[${i}] requiere valor escalar.`);
      }
      if (looksLikeNestedPlan(f.value)) errors.push(`filters[${i}] subquery anidada no permitida.`);
      if (containsSqlInjection(f.value)) errors.push(`filters[${i}] valor sospechoso (multi-statement).`);
    }
  }

  // 7. order_by
  if (p.order_by) {
    for (const [i, o] of p.order_by.entries()) {
      if (!isValidIdent(o.column, 63)) errors.push(`order_by[${i}].column inválido.`);
      if (!['asc', 'desc'].includes(o.dir)) errors.push(`order_by[${i}].dir inválido.`);
    }
  }

  // 8. limit
  if (p.limit !== undefined) {
    if (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 1000) {
      errors.push(`limit fuera de rango (1..1000): ${p.limit}.`);
    }
  }

  // 9. joins
  if (p.joins) {
    if (p.joins.length > 1) errors.push('Máximo 1 join en M1.');
    for (const [i, j] of p.joins.entries()) {
      if (j.type !== 'inner') errors.push(`joins[${i}].type debe ser 'inner' en M1.`);
      if (!isValidIdent(j.table, 63)) errors.push(`joins[${i}].table inválido.`);
      if (!j.on || !j.on.left || !j.on.right) errors.push(`joins[${i}].on incompleto.`);
    }
  }

  const valid = errors.length === 0;
  const kind = (p.operation === 'select') ? 'read' : 'write';
  return { valid, errors, kind: valid ? kind : undefined };
}

// Helpers
const ALLOWED_OPS = ['=', '!=', '<', '>', '<=', '>=', 'in', 'not_in', 'like', 'ilike', 'is_null', 'is_not_null'];

function isValidIdent(s: string, maxLen: number): boolean {
  return typeof s === 'string' && s.length <= maxLen && /^[a-z_][a-z0-9_.]*$/.test(s);
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function containsSqlInjection(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|COPY|DO)\b/i.test(v);
}

function looksLikeNestedPlan(v: unknown): boolean {
  return !!v && typeof v === 'object' && 'version' in (v as object) && 'operation' in (v as object);
}
```

## 4. Comportamiento esperado

### 4.1 Plan válido SELECT

Input:
```json
{ "version": "1.0", "operation": "select", "table": "tareas", "columns": ["id", "titulo"], "limit": 50 }
```
Output: `{ valid: true, errors: [], kind: 'read' }`.

### 4.2 Plan válido UPDATE con filtros

Input:
```json
{ "version": "1.0", "operation": "update", "table": "tareas",
  "values": { "estado": "hecha" },
  "filters": [{ "column": "id", "op": "=", "value": "abc-123" }] }
```
Output: `{ valid: true, errors: [], kind: 'write' }`.

### 4.3 Plan inválido — DELETE sin filtros

Input:
```json
{ "version": "1.0", "operation": "delete", "table": "tareas" }
```
Output:
```
{
  valid: false,
  errors: ["DELETE requiere al menos un filtro."]
}
```

### 4.4 Plan inválido — multi-statement

Input:
```json
{ "version": "1.0", "operation": "select", "table": "tareas",
  "filters": [{ "column": "estado", "op": "=",
    "value": "activa'); DROP TABLE tareas; --" }] }
```
Output: error `filters[0] valor sospechoso (multi-statement).`

### 4.5 Plan inválido — subquery anidada

Input:
```json
{ "version": "1.0", "operation": "select", "table": "tareas",
  "filters": [{ "column": "categoria_id", "op": "in",
    "value": { "version": "1.0", "operation": "select", "table": "categorias" } }] }
```
Output: error `filters[0] subquery anidada no permitida.` + `filters[0] requiere array de escalares no vacío.`

## 5. Estados / lifecycle

Stateless. `validatePlan` es función pura: mismo input → mismo output.

## 6. Errores y manejo

Esta spec es validación; el "manejo" del error vive en quien la
invoca:

- **Cliente (PWA)**: si `valid: false`, no envía a Edge; muestra los
  `errors` al usuario (lista en español) y propone reformular.
- **Server (Edge)**: si `valid: false`, retorna 422 con `errors` en el
  body. Igualmente registra el intento en `orion_audit` con `error =
  errors.join('; ')`.

## 7. Restricciones M1

- **Joins solo `inner`** y máximo 1 (alineado con PLAN-JSON-CONTRACT
  §6).
- **Sin transacciones**. Una operación = un Plan = una sentencia.
- **Sin batch**. `insert` mete una fila a la vez.
- **Sin RETURNING**. M1 devuelve `rows_affected`; M2 puede agregar
  `returning: ['id']`.
- **Sin allowlist de tablas en validador**: el validador acepta
  cualquier tabla snake_case excepto la denylist (`orion_audit`). La
  allowlist real (M2) vivirá en server o en config.
- **Heurísticas de detección de SQL crudo son conservadoras**
  intencionalmente. Pueden tener falsos positivos (ej: nombre de
  empresa con `;`). Aceptado como tradeoff: mejor rechazar input raro
  que dejar pasar inyección.

## 8. Criterios de aceptación verificables

- [ ] El módulo `validatePlan` exporta los tipos TS del §3.1.
- [ ] Tabla de tests unitarios cubre los 5 casos del §4 (válido SELECT,
      válido UPDATE, DELETE sin filtros, multi-statement, subquery
      anidada).
- [ ] Tests adicionales: `update` sin `values`, `insert` sin `values`,
      `limit > 1000`, `joins.length > 1`, `operation: 'drop_table'`,
      `table: 'orion_audit'`, `column` con espacios, `value` no
      escalar (objeto/array fuera de `in`).
- [ ] Mismo módulo se importa sin modificar desde Deno (Edge) y desde
      el bundler de la PWA.
- [ ] `validatePlan(null)`, `validatePlan(undefined)`, `validatePlan('')`
      no crashean; retornan `{ valid: false, errors: [...] }`.
- [ ] Plans válidos retornan `kind` correcto (`read` para select,
      `write` para resto).

## 9. Dependencias

- Ninguna externa. Función pura, sin librerías (Zod opcional como
  alternativa de implementación pero no requerido por esta spec — el
  esquema es chico y vale más mantenerlo sin dependencia para
  Deno/PWA).

## 10. Referencias

- `../02-architecture/PLAN-JSON-CONTRACT.md` (autoritativo)
- `../02-architecture/SECURITY-MODEL.md`
- `../03-adr/ADR-003-plan-json-not-sql.md`
- `./spec-execute-plan-edge.md`
- `./spec-gemini-client.md`
