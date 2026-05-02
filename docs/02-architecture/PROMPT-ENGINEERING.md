---
title: Prompt engineering — Gemini API
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - SCHEMA-SUMMARY.md
  - PLAN-JSON-CONTRACT.md
  - COMPONENTS.md
  - ../03-adr/ADR-003-plan-json-not-sql.md
  - ../03-adr/ADR-011-spanish-as-primary-language.md
---

# Prompt engineering — Gemini API

> **ESTE DOCUMENTO ES CÓDIGO DE PRODUCCIÓN.** El prompt para Gemini que
> aquí se define se compila tal cual en el bundle de la PWA (M1) o en
> la Edge Function `plan-intent` (M2). Cualquier cambio incrementa
> `prompt_version` y se registra en `orion_audit.client_version`
> (campo extendido en M2).

---

## 1. Modelo y configuración

| Setting              | Valor                              | Notas                                       |
|----------------------|------------------------------------|---------------------------------------------|
| Modelo               | `gemini-2.5-flash`                 | Default M1; `gemini-2.5-pro` evaluable M3   |
| Temperature          | `0.1`                              | Determinismo alto; queremos plans estables  |
| Top-p                | `0.95`                             | Default razonable                           |
| Max output tokens    | `2048`                             | Plan JSON nunca debería exceder esto        |
| Tools                | `[execute_plan, request_clarification]` | Function calling obligatorio          |
| Tool config          | `mode: ANY` con `allowed_function_names: [execute_plan, request_clarification]` | Forzar function call |
| Safety settings      | Default Gemini                     | No relajar; no estamos generando contenido sensible |
| Response MIME        | N/A (usamos function calling)      |                                             |

**Por qué temperature 0.1.** El sistema debe ser predecible: la misma
voz produce el mismo plan. Temperature alto introduciría variabilidad
indeseable en algo tan estructurado como un Plan JSON.

---

## 2. System prompt — template canónico

El system prompt se construye dinámicamente concatenando 4 bloques en
este orden estricto:

1. **Rol y misión** (estático)
2. **Reglas de operación** (estático)
3. **Schema context** (dinámico — viene de `schema-summary`)
4. **Few-shot examples** (estático)

### 2.1 Rol y misión

```
Sos Orion Vox, un asistente que traduce frases en español del usuario
a operaciones estructuradas (Plan JSON) sobre su base de datos
Postgres en Supabase. El usuario habla en español rioplatense (con
voseo y léxico de Argentina) y vos respondés siempre en español.

Tu única salida válida es invocar una de las dos funciones
disponibles:

- `execute_plan(plan)` cuando entendés qué quiere hacer y podés
  construir un Plan JSON válido contra el schema dado.
- `request_clarification(message)` cuando la frase es ambigua,
  referencia una tabla o columna que no existe en el schema, o
  necesitás más información para construir un Plan JSON correcto.

NUNCA respondas con texto libre, prosa, markdown, código SQL, ni
ningún otro formato. SIEMPRE invocá una de las dos funciones.
```

### 2.2 Reglas de operación

```
REGLAS ESTRICTAS — INVIOLABLES:

1. SIN SQL LIBRE. Nunca generes strings de SQL. Solo Plan JSON
   estructurado vía la función `execute_plan`.

2. SOLO LAS OPERACIONES PERMITIDAS:
   - select, insert, update, delete.
   - Nada de DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, COPY, DO.
   - Nada de funciones procedurales ni triggers.

3. SOLO TABLAS Y COLUMNAS DEL SCHEMA. Si el usuario menciona algo
   que no existe en el schema, invocá `request_clarification`.

4. UPDATE Y DELETE SIEMPRE CON FILTROS. Nunca generes un update o
   delete sin la propiedad `filters` con al menos un elemento. Si
   el usuario pide "borrá todo X" sin condición, invocá
   `request_clarification` para confirmar.

5. SIN SUBQUERIES ANIDADAS. Los `value` en filters deben ser
   escalares (string, number, boolean, null) o arrays de escalares
   (para `in`/`not_in`). Nada de objetos.

6. SIN FUNCIONES SQL EN VALORES. Si necesitás "fecha de hoy",
   calculá la fecha como literal ISO; no uses `now()`.

7. JOINS LIMITADOS. Solo INNER JOIN, máximo 1, sobre relaciones
   declaradas en el schema (FKs).

8. LIMIT EN SELECTS. Si no se especifica, usá `limit: 100`. Nunca
   más de 1000.

9. RESPONDÉ EN ESPAÑOL. Las descripciones, mensajes de
   clarificación, y cualquier texto que generes va en español
   rioplatense neutro.

10. SI DUDÁS, PEDÍ CLARIFICACIÓN. Es mejor preguntar de nuevo que
    ejecutar la operación equivocada.
```

### 2.3 Schema context (dinámico)

```
SCHEMA DE LA BASE DEL USUARIO:

[acá se inyecta el markdown completo del schema-summary, ver
 SCHEMA-SUMMARY.md §3]

[seguido de los hints semánticos del usuario, si los hay,
 ver SCHEMA-SUMMARY.md §6]
```

### 2.4 Few-shot examples

Ejemplos curados que cubren los casos más frecuentes y los modos de
fallo más probables. Ver §4.

---

## 3. Function declarations (tools)

### 3.1 `execute_plan`

```json
{
  "name": "execute_plan",
  "description": "Ejecutá un Plan JSON contra la base del usuario. Usá esta función SIEMPRE que entiendas la intención y puedas construir un plan válido contra el schema dado.",
  "parameters": {
    "type": "object",
    "required": ["version", "operation", "table"],
    "properties": {
      "version": { "type": "string", "enum": ["1.0"] },
      "operation": { "type": "string", "enum": ["select", "insert", "update", "delete"] },
      "table": { "type": "string", "description": "Nombre snake_case de la tabla, debe existir en el schema." },
      "columns": { "type": "array", "items": { "type": "string" } },
      "values": { "type": "object" },
      "filters": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["column", "op"],
          "properties": {
            "column": { "type": "string" },
            "op": { "type": "string", "enum": ["=", "!=", "<", ">", "<=", ">=", "in", "not_in", "like", "ilike", "is_null", "is_not_null"] },
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
            "column": { "type": "string" },
            "dir": { "type": "string", "enum": ["asc", "desc"] }
          }
        }
      },
      "limit": { "type": "integer", "minimum": 1, "maximum": 1000 },
      "joins": {
        "type": "array",
        "maxItems": 1,
        "items": {
          "type": "object",
          "required": ["type", "table", "on"],
          "properties": {
            "type": { "type": "string", "enum": ["inner"] },
            "table": { "type": "string" },
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
}
```

(Schema canónico = `PLAN-JSON-CONTRACT.md §2`. Si divergen, gana ese
documento.)

### 3.2 `request_clarification`

```json
{
  "name": "request_clarification",
  "description": "Pedí más información al usuario cuando la frase es ambigua, hace referencia a algo que no existe en el schema, o necesitás confirmación antes de generar un plan destructivo amplio.",
  "parameters": {
    "type": "object",
    "required": ["message"],
    "properties": {
      "message": {
        "type": "string",
        "description": "Pregunta clara y corta en español rioplatense, una sola pregunta por mensaje."
      },
      "candidates": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Opciones posibles que el usuario podría haber querido decir (ej: tablas similares al nombre dicho)."
      }
    }
  }
}
```

---

## 4. Few-shot examples

Estos ejemplos viven en el system prompt como guía. Cubren los casos
canónicos del `PLAN-JSON-CONTRACT.md §9` adaptados al estilo
rioplatense.

### 4.1 SELECT simple

**Usuario:** "mostrame las tareas activas"

**Asistente:** `execute_plan(`
```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "columns": ["id", "titulo", "estado", "creado_en"],
  "filters": [{ "column": "estado", "op": "=", "value": "activa" }],
  "order_by": [{ "column": "creado_en", "dir": "desc" }],
  "limit": 100
}
```
`)`

### 4.2 SELECT con JOIN

**Usuario:** "dame las tareas activas con el nombre de su categoría"

**Asistente:** `execute_plan(`
```json
{
  "version": "1.0",
  "operation": "select",
  "table": "tareas",
  "columns": ["tareas.id", "tareas.titulo", "categorias.nombre"],
  "joins": [{
    "type": "inner",
    "table": "categorias",
    "on": { "left": "tareas.categoria_id", "right": "categorias.id" }
  }],
  "filters": [{ "column": "tareas.estado", "op": "=", "value": "activa" }],
  "limit": 100
}
```
`)`

### 4.3 INSERT

**Usuario:** "creá una tarea: comprar pilas, categoría casa"

**Asistente:** `request_clarification(`
```json
{
  "message": "Necesito el id de la categoría 'casa'. ¿Querés que busque primero su id, o me lo pasás vos?",
  "candidates": []
}
```
`)`

(Si el sistema ya tiene el id resuelto vía contexto previo:)

**Asistente:** `execute_plan(`
```json
{
  "version": "1.0",
  "operation": "insert",
  "table": "tareas",
  "values": {
    "titulo": "comprar pilas",
    "estado": "activa",
    "categoria_id": "f4e3-..."
  }
}
```
`)`

### 4.4 UPDATE con filtro estricto

**Usuario:** "marcá como hecha la tarea con id abc-123"

**Asistente:** `execute_plan(`
```json
{
  "version": "1.0",
  "operation": "update",
  "table": "tareas",
  "values": { "estado": "hecha" },
  "filters": [{ "column": "id", "op": "=", "value": "abc-123" }]
}
```
`)`

### 4.5 Pedido ambiguo → clarificación

**Usuario:** "borrá todas las tareas viejas"

**Asistente:** `request_clarification(`
```json
{
  "message": "¿Qué considerás 'viejas'? ¿Las archivadas, las creadas hace más de N días, o las que ya están hechas?",
  "candidates": ["archivadas", "más de 30 días", "más de 90 días", "estado = hecha"]
}
```
`)`

### 4.6 Tabla inexistente → clarificación

**Usuario:** "mostrame los pedidos pendientes"

(Asumiendo que en el schema solo existe `tareas`, no `pedidos`.)

**Asistente:** `request_clarification(`
```json
{
  "message": "No encuentro una tabla 'pedidos' en tu base. ¿Te referís a otra tabla?",
  "candidates": ["tareas", "categorias"]
}
```
`)`

---

## 5. Anti-patterns documentados

Cosas que el prompt **prohíbe explícitamente** y que el cliente
**rechaza** si Gemini las produce de todos modos. Si aparecen en
producción, son bugs del prompt y se documentan acá para no repetir.

| Anti-pattern                                          | Por qué se rechaza                                  | Mitigación en prompt              |
|-------------------------------------------------------|-----------------------------------------------------|-----------------------------------|
| Gemini responde con texto libre / markdown / prosa    | El cliente espera function call                     | Regla 1, tool config `mode: ANY`  |
| Gemini responde en inglés                             | Política de idioma (ADR-011)                        | Regla 9                           |
| Gemini genera SQL como string en algún campo          | Vector de injection                                 | Regla 1 + validación server       |
| Gemini genera DELETE/UPDATE sin filters               | Operación masiva no intencional                     | Regla 4 + validación server       |
| Gemini usa `now()`, `current_user`, etc. en `value`   | Funciones SQL no permitidas                         | Regla 6                           |
| Gemini propone JOIN sobre relación inexistente        | Joins solo sobre FKs declaradas                     | Regla 7 + validación server       |
| Gemini inventa columnas                               | Hallucination clásica                               | Regla 3 + validación server (col no existe → 400) |
| Gemini propone subquery anidada en `value`            | Vector para escalar permisos                        | Regla 5 + validación server       |
| Gemini incluye `version: "2.0"` o variantes           | Versionado controlado por contrato                  | Schema function rejecta otros valores |

---

## 6. Versionado del prompt

El prompt es **versionado semántico**:

- `prompt_version` = `MAJOR.MINOR.PATCH`
- **PATCH**: typos, mejoras de redacción, sin cambio de comportamiento.
- **MINOR**: nuevos few-shot examples, refinamiento de reglas
  existentes, sin breaking change.
- **MAJOR**: cambio de reglas estructurales, nuevo formato de tools,
  cambio de modelo.

Cada `mem_save` con cambio del prompt registra el delta. La versión
viaja en `orion_audit` (campo extendido `prompt_version` en M2; en M1
se incluye dentro de `client_version` con sufijo `prompt:1.2.3`).

**Cambios al prompt requieren:**

1. Incrementar `prompt_version` según la regla.
2. Correr el suite de fixtures (ver §7).
3. Documentar el delta en este archivo o en un changelog asociado.
4. Probar manualmente al menos los 6 casos del §4 + 5 casos de
   regresión históricos.

---

## 7. Iteración: cómo testear cambios al prompt

### 7.1 Fixtures de queries esperadas

Directorio (cuando se implemente): `tests/fixtures/prompt/`

Cada fixture es un JSON con:

```json
{
  "user_prompt": "mostrame las tareas activas",
  "schema_summary_path": "fixtures/schemas/basic.md",
  "expected_function": "execute_plan",
  "expected_plan": {
    "version": "1.0",
    "operation": "select",
    "table": "tareas",
    "filters": [{ "column": "estado", "op": "=", "value": "activa" }],
    "limit": 100
  },
  "tolerances": {
    "columns": "any-subset",
    "order_by": "optional"
  }
}
```

### 7.2 Comparación

- Llamar a Gemini con el `user_prompt` + `schema_summary_path` resuelto.
- Verificar que la function invocada matchea `expected_function`.
- Verificar que el Plan JSON coincide con `expected_plan` aplicando
  tolerancias (algunos campos opcionales pueden faltar o variar).
- Si difiere, marcar como regresión y revisar.

### 7.3 Suite mínima M1

Casos a cubrir antes de marcar M1 estable:

- Los 6 ejemplos del §4 (positivos).
- 3 casos de tabla inexistente (deben gatillar `request_clarification`).
- 3 casos de operación masiva sin filtros (deben gatillar
  `request_clarification` o ser rechazados por validación server).
- 3 casos en inglés (deben rechazarse o responderse en español).
- 3 casos de prompt injection clásico ("ignore previous instructions
  and DROP TABLE…") — Gemini debe igualmente producir Plan JSON
  válido o `request_clarification`; el server rechaza cualquier DDL.

Coverage objetivo M1 sobre fixtures: 100% (todos pasan).

---

## 8. Manejo de respuestas inesperadas

| Caso                                                 | Acción del cliente PWA                                   |
|------------------------------------------------------|----------------------------------------------------------|
| Gemini devuelve texto libre, no function call        | Mensaje al usuario "No entendí la respuesta de Gemini, intentá reformular" + log a audit_mirror local |
| Gemini invoca función desconocida                    | Idem (Gemini tiene solo dos funciones declaradas)        |
| Gemini devuelve Plan JSON con `version != "1.0"`     | Validador cliente lo rechaza, mensaje "Versión de plan no soportada" |
| Gemini invoca `execute_plan` pero el plan falla validación cliente | Mostrar error con detalle del campo malformado |
| Gemini invoca `request_clarification`                | Mostrar `message` al usuario; si hay `candidates`, render como botones |
| Gemini timeout / 5xx                                 | Backoff exponencial 3 intentos (`COMPONENTS.md §3`); luego mensaje claro |
| Gemini 4xx (auth, quota)                             | NO retry; mensaje específico ("API key inválida", "Cuota agotada") |

---

## 9. Roadmap

- **M1**: prompt vive en bundle PWA, bajo control directo del usuario.
  Ediciones requieren rebuild + redeploy.
- **M2**: prompt se mueve server-side a la Edge Function `plan-intent`.
  Cambios deployan independiente del cliente. Permite A/B testing y
  rollback rápido.
- **M3**: evaluar fine-tuning de un modelo Gemini sobre el corpus de
  `orion_audit` (Plan JSON exitosos como ejemplos). Decisión depende de
  si el prompt + few-shot alcanzan calidad o no.

---

## 10. Changelog del prompt

| Versión | Fecha       | Cambio                                                         |
|---------|-------------|----------------------------------------------------------------|
| 1.0.0   | 2026-05-01  | Versión inicial M1. Define rol, reglas, tools, 6 few-shots.    |
