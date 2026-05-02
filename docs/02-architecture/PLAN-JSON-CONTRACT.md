---
title: Contrato Plan JSON v1.0
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - COMPONENTS.md
  - SECURITY-MODEL.md
  - AUDIT-MODEL.md
  - ../00-constitution/CONSTITUTION.md
---

# Plan JSON — contrato técnico v1.0

Plan JSON es la interfaz estructurada entre Gemini y la Edge Function
`execute-plan`. Es el **límite duro** que evita SQL libre desde el LLM
y que define qué operaciones pueden realmente atravesar el sistema.

Este documento es el contrato canónico. Si la implementación diverge
de este documento, **el documento gana** y la implementación debe
corregirse (o este documento debe actualizarse vía ADR si hay razón
deliberada para el cambio).

---

## 1. Propósito

Plan JSON resuelve tres problemas a la vez:

1. **Seguridad**: SQL libre desde un LLM es un agujero de inyección y
   destrucción. Una estructura declarativa con whitelist de operaciones
   y operadores cierra ese agujero.
2. **Auditabilidad**: un Plan JSON es legible por humanos, parseable,
   diffable. Un blob de SQL es opaco.
3. **Validación bilateral**: cliente y server validan contra el mismo
   schema. La autoridad es siempre el server, pero el cliente da
   feedback rápido.

Plan JSON **nunca** contiene strings de SQL crudo. La Edge Function
construye el SQL parametrizado a partir del plan, usando un query
builder seguro.

---

## 2. Schema formal v1.0

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OrionVoxPlanJSON",
  "version": "1.0",
  "type": "object",
  "required": ["version", "operation", "table"],
  "properties": {
    "version": {
      "const": "1.0"
    },
    "operation": {
      "enum": ["select", "insert", "update", "delete"]
    },
    "table": {
      "type": "string",
      "pattern": "^[a-z_][a-z0-9_]*$",
      "maxLength": 63
    },
    "columns": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z_][a-z0-9_.]*$"
      },
      "minItems": 0
    },
    "values": {
      "type": "object",
      "additionalProperties": {
        "type": ["string", "number", "boolean", "null"]
      }
    },
    "filters": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["column", "op"],
        "properties": {
          "column": {
            "type": "string",
            "pattern": "^[a-z_][a-z0-9_.]*$"
          },
          "op": {
            "enum": [
              "=", "!=", "<", ">", "<=", ">=",
              "in", "not_in",
              "like", "ilike",
              "is_null", "is_not_null"
            ]
          },
          "value": {}
        }
      }
    },
    "order_by": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["column", "dir"],
        "properties": {
          "column": {
            "type": "string",
            "pattern": "^[a-z_][a-z0-9_.]*$"
          },
          "dir": { "enum": ["asc", "desc"] }
        }
      }
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1000
    },
    "joins": {
      "type": "array",
      "maxItems": 1,
      "items": {
        "type": "object",
        "required": ["type", "table", "on"],
        "properties": {
          "type": { "const": "inner" },
          "table": {
            "type": "string",
            "pattern": "^[a-z_][a-z0-9_]*$"
          },
          "on": {
            "type": "object",
            "required": ["left", "right"],
            "properties": {
              "left": { "type": "string" },
              "right": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

**Notas sobre el schema.**

- `version` es `"1.0"` literal. Si la Edge recibe otra versión,
  rechaza.
- `table` y `column` siguen el patrón snake_case Postgres (max 63
  chars, identificador legal). Esto bloquea inyección por nombres
  exóticos.
- `values` admite solo escalares JSON (string, number, boolean,
  null). NO arrays, NO objetos, NO funciones SQL.
- `limit` es **obligatorio** en `select` (default 100 si no se
  especifica, max 1000) — la Edge lo inyecta si falta.
- `joins` en M1: solo INNER JOIN, máximo 1.

---

## 3. Operaciones permitidas

Solo CRUD básico:

- **`select`** — lectura.
- **`insert`** — inserción de un registro (M1: una fila a la vez).
- **`update`** — modificación con `filters` obligatorios.
- **`delete`** — borrado con `filters` obligatorios.

Para `update` y `delete`, **`filters` no puede estar vacío**. Un plan
sin filters para una operación destructiva se rechaza incondicionalmente
("operación masiva sin filtros: rechazada"). Si el usuario realmente
quiere `DELETE FROM tabla` sin filtros, debe hacerlo fuera de Orion Vox.

---

## 4. Operaciones BLOQUEADAS (hardcoded, cubiertas por tests)

La Edge Function rechaza incondicionalmente. La lista es **hardcoded
en código**, no configurable. Cubierta por tests unitarios obligatorios
antes de marcar M1 como estable.

| Categoría             | Bloqueado                                       |
|-----------------------|-------------------------------------------------|
| DDL                   | `CREATE`, `ALTER`, `DROP`, `TRUNCATE`           |
| DCL                   | `GRANT`, `REVOKE`                               |
| Bulk                  | `COPY`                                          |
| Procedural            | `DO`, funciones procedurales, triggers          |
| Multi-statement       | Cualquier `;` con segunda sentencia ejecutable  |
| SQL crudo             | Campos del Plan JSON con strings que parezcan SQL (regex de detección) |
| Otras tablas internas | Operaciones sobre `orion_audit` desde Plan JSON |

**Detección de multi-statement.** Cualquier valor (en `values`,
`filters[].value`, etc.) que contenga `;` seguido de una palabra clave
SQL conocida se rechaza. La validación se hace **antes** de pasar al
query builder.

**Operaciones sobre `orion_audit`.** La tabla de auditoría está en una
denylist explícita: ningún Plan JSON puede leer (en M1) ni mucho menos
escribir sobre ella. La PWA accede a la auditoría en M2 vía endpoint
dedicado, no por Plan JSON.

---

## 5. Operadores de filtro permitidos

| Op           | Significado                       | Notas                                       |
|--------------|-----------------------------------|---------------------------------------------|
| `=`          | igual                             |                                             |
| `!=`         | distinto                          |                                             |
| `<` `>`      | menor / mayor                     |                                             |
| `<=` `>=`    | menor o igual / mayor o igual     |                                             |
| `in`         | dentro de array                   | `value` debe ser array de escalares         |
| `not_in`     | fuera de array                    | idem                                        |
| `like`       | match patrón (case-sensitive)     | el `value` debe ser string                  |
| `ilike`      | match patrón (case-insensitive)   | el `value` debe ser string                  |
| `is_null`    | columna es NULL                   | `value` se ignora                           |
| `is_not_null`| columna NO es NULL                | `value` se ignora                           |

**Bloqueados explícitamente:**

- Subqueries en filtros (cualquier `value` que sea un objeto con forma
  de Plan JSON anidado: rechazado).
- Funciones arbitrarias (`now()`, `current_user`, etc.). Si se necesita
  filtrar por "filas de hoy", se calcula la fecha en cliente y se pasa
  como literal.
- Expresiones SQL en `value` (cualquier string con paréntesis +
  keywords: rechazado).

---

## 6. JOINs

**M1**: solo `INNER JOIN`, **máximo 1**, sobre relaciones declaradas
(idealmente FKs conocidas en el schema-summary). Sin self-joins.

```json
"joins": [
  {
    "type": "inner",
    "table": "categorias",
    "on": { "left": "tareas.categoria_id", "right": "categorias.id" }
  }
]
```

**M2**: ampliable a `LEFT JOIN`, hasta 2 joins, con la misma
restricción de relaciones declaradas. La validación server verifica
que la relación exista en el catálogo antes de aceptar el join.

---

## 7. Validación cliente vs server

| Aspecto                  | Cliente                          | Server                                  |
|--------------------------|----------------------------------|-----------------------------------------|
| Cuándo se ejecuta        | Antes de POST a Edge             | Siempre, antes de cualquier ejecución   |
| Qué valida               | Schema Zod completo              | Schema Zod completo + reglas de negocio |
| Autoridad                | NO — solo UX                     | SÍ — única autoridad                    |
| Si falla                 | Mensaje claro, no se envía       | 422 + detalle, no se ejecuta            |
| Schema fuente            | Módulo compartido                | Mismo módulo compartido                 |

**Schema compartido.** El schema vive en un único módulo (TypeScript
compatible con Deno y con el bundler de la PWA). Cliente y server lo
importan. Si divergen, la consecuencia es 422 desde el server con
mensaje confuso al usuario; por eso es crítico mantener sincronizados.

---

## 8. Versionado

- **v1.0** — versión inicial M1. Define este documento.
- **v1.x** — cambios menores compatibles: agregar nuevos operadores
  permitidos, aumentar límites, ampliar `joins` permitidos. La Edge
  acepta `1.0` y `1.x` con tolerancia hacia atrás.
- **v2.0** — cambios mayores incompatibles: nuevo formato (ej:
  `operations[]` plural, transactions). Requiere ADR + migración del
  cliente. La Edge soporta `1.x` y `2.x` durante un período de
  transición declarado en el ADR.

Cada incremento de versión documenta el delta y se añade un
`CHANGELOG.md` cuando exista versión nueva.

---

## 9. Ejemplos válidos

### 9.1 SELECT simple

Usuario: *"mostrame las tareas activas"*

```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "columns": ["id", "titulo", "estado", "creado_en"],
  "filters": [
    { "column": "estado", "op": "=", "value": "activa" }
  ],
  "order_by": [
    { "column": "creado_en", "dir": "desc" }
  ],
  "limit": 100
}
```

### 9.2 SELECT con JOIN

Usuario: *"mostrame las tareas activas con el nombre de su categoría"*

```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "columns": ["tareas.id", "tareas.titulo", "categorias.nombre"],
  "joins": [
    {
      "type": "inner",
      "table": "categorias",
      "on": { "left": "tareas.categoria_id", "right": "categorias.id" }
    }
  ],
  "filters": [
    { "column": "tareas.estado", "op": "=", "value": "activa" }
  ],
  "limit": 100
}
```

### 9.3 INSERT

Usuario: *"creá una tarea: 'comprar pilas', categoría 'casa'"*

```json
{
  "version": "1.0",
  "operation": "insert",
  "table": "tareas",
  "values": {
    "titulo": "comprar pilas",
    "estado": "activa",
    "categoria_id": "f4e3-…"
  }
}
```

### 9.4 UPDATE con filtro

Usuario: *"marcá como hecha la tarea con id abc-123"*

```json
{
  "version": "1.0",
  "operation": "update",
  "table": "tareas",
  "values": {
    "estado": "hecha",
    "completada_en": "2026-05-01T14:32:00Z"
  },
  "filters": [
    { "column": "id", "op": "=", "value": "abc-123" }
  ]
}
```

### 9.5 DELETE con filtro

Usuario: *"borrá las tareas archivadas de hace más de 90 días"*

```json
{
  "version": "1.0",
  "operation": "delete",
  "table": "tareas",
  "filters": [
    { "column": "estado", "op": "=", "value": "archivada" },
    { "column": "actualizada_en", "op": "<", "value": "2026-02-01T00:00:00Z" }
  ]
}
```

(Nota: la fecha relativa "hace 90 días" la calcula el cliente y la
inyecta como literal ISO; ver §5, prohibición de funciones arbitrarias.)

---

## 10. Ejemplos rechazados

### 10.1 SQL libre embebido

```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "filters": [
    { "column": "estado", "op": "=",
      "value": "activa'); DROP TABLE tareas; --" }
  ]
}
```

**Rechazo.** El `value` contiene `;` + keyword DDL. Detección por regex
multi-statement en validación server. El intento se loguea en
`orion_audit` con `error = 'multi-statement-detected'`.

### 10.2 Operación bloqueada

```json
{
  "version": "1.0",
  "operation": "drop_table",
  "table": "tareas"
}
```

**Rechazo.** `operation` no está en el enum `["select", "insert",
"update", "delete"]`. Falla validación Zod antes de cualquier
procesamiento. 422 al cliente.

### 10.3 DELETE sin filtros

```json
{
  "version": "1.0",
  "operation": "delete",
  "table": "tareas"
}
```

**Rechazo.** Regla de negocio: `delete` requiere `filters` no vacío.
Audit registra el intento. 403 al cliente con mensaje claro
("Operación masiva sin filtros: rechazada por seguridad").

### 10.4 LIMIT exagerado

```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "limit": 999999
}
```

**Rechazo.** `limit > 1000` falla schema. La Edge devuelve 422.

### 10.5 Subquery anidada en filtro

```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "filters": [
    { "column": "categoria_id", "op": "in",
      "value": { "version": "1.0", "operation": "select",
                 "table": "categorias", "columns": ["id"] } }
  ]
}
```

**Rechazo.** `value` debe ser escalar o array de escalares (en `in`).
Un objeto con forma de Plan JSON es subquery: rechazo explícito.
