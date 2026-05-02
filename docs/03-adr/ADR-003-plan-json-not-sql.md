---
title: "ADR-003: Plan JSON estructurado, NUNCA SQL libre"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-004-service-role-m1-dedicated-role-m2.md
  - ADR-008-server-side-audit-from-m1.md
  - ../00-constitution/CONSTITUTION.md
  - ../02-architecture/THREAT-MODEL.md
---

# ADR-003: Plan JSON estructurado, NUNCA SQL libre

## Contexto

El núcleo de Orion Vox es invocar a Gemini con un mensaje en lenguaje
natural ("agregá una tarea para mañana de comprar pan") y traducirlo a una
operación contra el Postgres del usuario. Hay dos formas obvias de hacer
esto:

1. **SQL libre desde el LLM**: pedirle a Gemini que devuelva
   `INSERT INTO tareas (descripcion, vence) VALUES ('comprar pan', ...)`
   y ejecutarlo directamente.
2. **Plan JSON estructurado** (v1.0, una operación por request):
   pedirle a Gemini que devuelva
   `{ version: '1.0', operation: 'insert', table: 'tareas', values: {...} }`,
   validarlo contra un schema, y construir el SQL parametrizado del lado
   del servidor.

La opción 1 es más simple de implementar pero abre la puerta a la
**lethal trifecta** (CVE jul-2025, documentado en
`docs/02-architecture/THREAT-MODEL.md`):

- (a) un LLM con acceso a herramientas (Gemini llamando a Postgres),
- (b) entrada controlada por usuario o por contenido externo (lo que el
  usuario habla, lo que Gemini "infiere"),
- (c) acceso a datos sensibles o capacidad de mutarlos (todo Postgres).

Con SQL libre, una alucinación de Gemini puede producir
`DROP TABLE tareas`, `TRUNCATE tareas`, o un `DELETE FROM tareas` sin
`WHERE`. Una inyección indirecta vía contenido externo (ej. el usuario
diciendo "anotá la nota: '; DROP TABLE --") puede pasar al SQL si el
modelo no escapa correctamente. Es una superficie de ataque inaceptable
incluso para un proyecto single-user.

Codex argumentó duro en favor de Plan JSON ya en round 2; Claude lo
aceptó en round 3 cambiando posición; el usuario lo ratificó en round 4.

## Decisión

Gemini **jamás** devuelve SQL crudo. Devuelve un **Plan JSON estructurado**
con forma estricta:

```
{
  "operations": [
    {
      "type": "select" | "insert" | "update" | "delete",
      "table": "<nombre_tabla>",
      "columns": { ... } | ["..."],
      "filters": [{ "column": "...", "op": "...", "value": ... }],
      "limit": <int>,
      "order_by": [{ "column": "...", "dir": "asc" | "desc" }]
    }
  ]
}
```

El Plan JSON es validado **dos veces**:

1. **Cliente** (PWA): validación rápida con Zod (o equivalente) antes de
   enviar a la Edge Function. Falla rápido en errores triviales.
2. **Servidor** (Edge Function `execute-plan`): validación canónica contra
   el mismo schema. **Esta es la que cuenta.** El cliente puede ser
   bypaseado; el servidor no.

Tras validar, la Edge Function traduce el Plan JSON a SQL parametrizado
mediante un **query builder propio** (no concatenación de strings),
ejecuta con el rol correspondiente al milestone (ver ADR-004), y audita
el resultado en `orion_audit` (ver ADR-008).

Operaciones bloqueadas hardcoded (ver Constitución § 4):
`DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `DO`,
y cualquier multi-statement.

## Alternativas consideradas

- **SQL libre con allowlist de comandos**: rechazado. Una allowlist
  textual ("acepto sólo SELECT/INSERT/UPDATE/DELETE") es frágil ante
  ofuscación, comentarios `/* */`, codificaciones, multi-statement
  separado por `;`, y no protege contra `DELETE` sin `WHERE`. Mover el
  parsing al servidor implicaría reescribir un parser SQL completo, que es
  exactamente lo que un Plan JSON evita.
- **RPC pre-definidas (Postgres functions con argumentos tipados)**:
  rechazado por inflexibilidad. Orion Vox debe poder responder a queries
  arbitrarias del usuario ("mostrame las últimas 10 tareas con vence
  pasado") sin requerir crear una RPC nueva por cada caso. Se perdería
  el valor exploratorio del producto.
- **SQL libre con LLM second-pass de validación**: rechazado. Pedirle al
  mismo (u otro) LLM que valide el SQL del primer paso es agregar más
  superficie de ataque, no menos. Dos LLMs encadenados pueden alucinar de
  forma correlacionada.
- **SQL libre + sandbox Postgres con rol mínimo**: parcialmente válido,
  pero se mantiene como **defensa en profundidad** (ver ADR-004), no como
  sustituto del Plan JSON. La defensa primaria sigue siendo el Plan JSON.

## Consecuencias

**Positivas**:

- Superficie de ataque acotada: la Edge Function sólo ejecuta SQL que
  pasó por su propio query builder, con parámetros separados de la
  estructura.
- Las operaciones inválidas (DROP, etc.) son **inexpresables** en el
  schema del Plan JSON. No pueden escabullirse por error de un check
  textual.
- Auditoría limpia: el `orion_audit` guarda el `plan_json` (declarativo) y
  el `sql_ejecutado` (resultado del query builder). Ambos comparables y
  auditables.
- Si Gemini cambia de modelo o se reemplaza por otro LLM (M3), el contrato
  Plan JSON se mantiene. Cambia el cliente, no la Edge Function.

**Negativas / deuda asumida**:

- Hay que mantener un schema de Plan JSON suficientemente expresivo
  (joins, agrupaciones, subqueries — qué se soporta y qué no). Cada
  capability nueva es trabajo de spec + implementación + tests.
- Queries que requieran SQL "exótico" (`WITH RECURSIVE`, window functions
  complejas) no son expresables en M1. Se aceptan como deuda; se
  agregarán al schema Plan JSON cuando aparezca el caso real.
- El system prompt para Gemini debe documentar el schema Plan JSON con
  ejemplos suficientes para que el modelo lo respete consistentemente.
  Function calling de Gemini ayuda pero no garantiza al 100%.

**Neutrales**:

- El query builder propio es un componente nuevo a mantener. Riesgo
  acotado: el universo de operaciones es chico (4 tipos × N tablas) y
  está cubierto por tests.

## Aplicabilidad

- Aplica a **M1, M2 y M3**. Es uno de los **innegociables** de la
  Constitución (§ 2). No se puede suspender sin un ADR explícito de
  excepción firmado por el usuario y aprobado por el tribunal.

## Referencias

- ADR-001 — Plan F+ donde Plan JSON es la pieza central del flujo.
- ADR-004 — rol Postgres dedicado como defensa en profundidad.
- ADR-008 — auditoría server-side que registra Plan JSON + SQL.
- `docs/00-constitution/CONSTITUTION.md` § 2 (Plan JSON, NUNCA SQL libre)
  y § 4 (Operaciones bloqueadas hardcoded).
- `docs/02-architecture/THREAT-MODEL.md` — análisis completo de la lethal
  trifecta y mitigaciones.
- CVE jul-2025 (lethal trifecta pattern, referenciado en threat model).
