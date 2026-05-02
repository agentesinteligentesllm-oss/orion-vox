---
title: Casos de uso — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - PRD.md
  - PERSONAS.md
  - USER-STORIES.md
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/NON-GOALS.md
---

# Casos de uso

Casos representativos del uso real de Orion Vox por parte del director
(persona única, ver `PERSONAS.md`). Todos están redactados en español
natural — son frases que el usuario diría, no comandos formales.

Convención de cada caso:

- **Trigger** — la frase hablada disparadora.
- **Flujo** — qué hace el sistema, paso a paso.
- **Resultado** — lo que el usuario oye y/o ve al final.
- **Notas / edge cases** — qué puede salir distinto y cómo se maneja.

Las tablas usadas como ejemplo (`ventas`, `clientes`, `pedidos`,
`notas`, `productos`) son ilustrativas; las tablas reales del proyecto
Supabase del director se definen fuera de este documento.

---

## Caso 1 — Consulta simple

### Trigger
> *"Cuántas ventas tengo hoy."*

### Flujo
1. El usuario dice "OK Google, abrí Orion Vox".
2. La PWA arranca, pide permiso de micrófono si es la primera vez,
   activa `SpeechRecognition` en `es-MX`.
3. El usuario dice la frase.
4. La PWA envía la transcripción + el schema summary + el contrato del
   Plan JSON a Gemini API con function calling.
5. Gemini responde un Plan JSON conforme al contrato canónico
   (`PLAN-JSON-CONTRACT.md` v1.0): `{ "version": "1.0", "operation":
   "select", "table": "ventas", "columns": ["id"], "filters": [{
   "column": "fecha", "op": "=", "value": "2026-05-01" }], "limit":
   1000 }`. El conteo (`count(*)`) **no** existe en el contrato M1: el
   número final lo computa la PWA client-side como `result.length`
   sobre las filas devueltas. Si el conjunto excede `limit`, la PWA lo
   indica ("hay más de 1000, te muestro el conteo aproximado").
6. La PWA llama a `execute-plan` con ese plan.
7. `execute-plan` valida, traduce a SQL parametrizado, ejecuta, registra
   en `orion_audit`, devuelve el resultado.
8. La PWA cuenta las filas client-side y sintetiza el resultado por TTS.

### Resultado
> "Tenés 12 ventas hoy."

Y en pantalla, debajo, una fila con el número.

### Notas / edge cases
- Si el reconocimiento devuelve algo ambiguo ("contas ventas tengo
  hoy"), Gemini lo interpreta igual en la mayoría de los casos. Si no,
  ver Caso 8.
- Si la tabla `ventas` no está en el schema summary, Gemini debería
  pedir aclaración o devolver un Plan JSON inválido. Ver Caso 8.

---

## Caso 2 — Consulta agregada

### Trigger
> *"Cuál fue mi mejor mes este año."*

### Flujo
1. Lanzamiento por OK Google + activación de mic (idem Caso 1).
2. Gemini interpreta "mejor" como "mayor monto total de ventas" usando
   el contexto del schema summary (que incluye que `ventas` tiene una
   columna `monto`).
3. Plan JSON conforme al contrato v1.0 — el plan **trae las filas
   crudas del año** y la agrupación se hace client-side, porque el
   contrato M1 NO permite agregaciones server-side (`SUM`, `EXTRACT`,
   `group_by` no existen en el schema):
   ```json
   {
     "version": "1.0",
     "operation": "select",
     "table": "ventas",
     "columns": ["fecha", "monto"],
     "filters": [
       { "column": "fecha", "op": ">=", "value": "2026-01-01" },
       { "column": "fecha", "op": "<=", "value": "2026-12-31" }
     ],
     "limit": 1000
   }
   ```
4. `execute-plan` valida, ejecuta, audita, devuelve las filas.
5. La PWA agrupa por mes en JS (`Map<mes, sum>`), determina el máximo y
   sintetiza el resultado por TTS.

> Nota M1 → M2: las **agregaciones server-side** (`SUM`, `AVG`,
> `COUNT(*)`, `EXTRACT`, `group_by`) llegan en M2 con extensión del
> contrato Plan JSON v1.1. En M1 todo se resuelve trayendo el conjunto
> bajo `limit: 1000` y agregando en el cliente.

### Resultado
> "Tu mejor mes este año fue marzo, con un total de 145 mil pesos."

Y en pantalla, una pequeña tabla con `mes | total`.

### Notas / edge cases
- "Mejor" es ambiguo: podría significar más ventas en cantidad, mayor
  monto, mayor ticket promedio. Gemini elige una interpretación
  razonable según el schema summary; el usuario puede reformular si no
  era esa.
- Si Gemini intentara producir un `JOIN` complejo aquí, el contrato
  del Plan JSON debería rechazarlo (sólo single-table o joins simples
  documentados). Esto refuerza el principio "Plan JSON, NUNCA SQL
  libre".

---

## Caso 3 — Inserción con confirmación

### Trigger
> *"Registrame que vendí tres cafés a Juan."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta:
   - Tabla: `ventas`.
   - Columnas: `producto: "café"`, `cantidad: 3`, `cliente_nombre:
     "Juan"`, `fecha: CURRENT_DATE`.
3. Plan JSON v1.0: `{ version: "1.0", operation: "insert", table: "ventas",
   values: { ... } }`.
4. La PWA detecta que es un `insert` → **muestra el modal de
   confirmación táctil** con:
   - La tabla destino: `ventas`.
   - Los valores que se van a insertar (en formato legible).
   - El SQL parametrizado preview (para el ojo técnico del director).
   - Botones grandes: "Confirmar" / "Cancelar".
5. El usuario toca "Confirmar".
6. La PWA llama a `execute-plan`.
7. Ejecución, registro en `orion_audit`, respuesta.
8. TTS de confirmación.

### Resultado
> "Listo, registré 3 cafés vendidos a Juan."

### Notas / edge cases
- Si el usuario toca "Cancelar", la PWA aún registra en `orion_audit`
  el evento como "rechazado por usuario" (cumple el principio de
  auditoría server-side: incluso lo no ejecutado se audita).
- Si Gemini deduce mal alguno de los valores (ej. interpreta "Juan"
  como "Juana"), el preview lo expone antes de ejecutar. El usuario
  cancela y reformula.
- Si la tabla `ventas` tiene columnas obligatorias no provistas
  (ej. `precio_unitario`), `execute-plan` debería rechazar la
  operación con error claro de columna faltante. La PWA muestra el
  error y reproduce un TTS de fallo.

---

## Caso 4 — Actualización selectiva

### Trigger
> *"Marcar el pedido 42 como entregado."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta:
   - Tabla: `pedidos`.
   - Filtro: `id = 42`.
   - Set: `estado = "entregado"`.
3. Plan JSON conforme al contrato v1.0 (los valores nuevos van en
   `values`, NO en `columns`; `columns` solo aplica a `select`):
   ```json
   {
     "version": "1.0",
     "operation": "update",
     "table": "pedidos",
     "values": { "estado": "entregado" },
     "filters": [
       { "column": "id", "op": "=", "value": 42 }
     ]
   }
   ```
4. La PWA muestra el modal de confirmación con preview que incluye
   también las **filas afectadas estimadas** (1 en este caso, vía un
   conteo previo opcional).
5. El usuario confirma.
6. `execute-plan` ejecuta, audita, devuelve `filas_afectadas: 1`.
7. TTS.

### Resultado
> "Pedido 42 marcado como entregado."

### Notas / edge cases
- Si el filtro fuera ambiguo o vacío (ej. "marcar los pedidos como
  entregados" sin más), `execute-plan` rechaza por **filtro
  obligatorio en updates**. El preview del modal expone que se
  afectarían N filas, donde N es alto, y el usuario decide.
- Si el id no existe, `filas_afectadas: 0` y el TTS lo dice ("No
  encontré ningún pedido con ese número").

---

## Caso 5 — Eliminación con confirmación

### Trigger
> *"Borrar la nota número siete."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta:
   - Tabla: `notas`.
   - Filtro: `id = 7`.
3. Plan JSON conforme al contrato v1.0:
   ```json
   {
     "version": "1.0",
     "operation": "delete",
     "table": "notas",
     "filters": [
       { "column": "id", "op": "=", "value": 7 }
     ]
   }
   ```
4. La PWA detecta `delete` → modal de confirmación con énfasis visual
   adicional (botón "Confirmar" en color de advertencia, no en color
   primario).
5. Preview muestra: tabla, filtro, filas a borrar (1), y un resumen
   textual del contenido de la fila si está disponible.
6. El usuario toca "Confirmar".
7. Ejecución, auditoría, respuesta.

### Resultado
> "Listo, borré la nota número 7."

### Notas / edge cases
- `DELETE` sin filtros está bloqueado por contrato del Plan JSON
  (filtro obligatorio en `delete`). Si Gemini lo intentara,
  `execute-plan` rechaza y se audita el rechazo. Ver también Caso 9.
- En modo read-only, todo el flujo se aborta antes del modal con un
  mensaje claro. Ver Caso 10.

---

## Caso 6 — Consulta con filtro complejo

### Trigger
> *"Mostrame los clientes de Buenos Aires con saldo pendiente."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta:
   - Tabla: `clientes`.
   - Filtros: `provincia = "Buenos Aires"`, `saldo_pendiente > 0`.
   - Columnas: las relevantes (`nombre`, `saldo_pendiente`,
     posiblemente `telefono`).
   - Limit: el default razonable del contrato (ej. 50).
3. Plan JSON construido en consecuencia.
4. `execute-plan` valida, ejecuta, audita.
5. La PWA muestra una tabla con los resultados y produce un TTS de
   resumen ("Encontré 8 clientes en Buenos Aires con saldo
   pendiente.").

### Resultado
> "Encontré 8 clientes en Buenos Aires con saldo pendiente."

Tabla en pantalla con los 8 registros.

### Notas / edge cases
- Si el resultado es muy largo (> límite del contrato), el TTS lo
  indica ("son más de 50, te muestro los primeros") y la pantalla
  ofrece refinar.
- Si la columna `provincia` no existe, Gemini debería devolver Plan
  JSON inválido o pedir aclaración. Ver Caso 8.

---

## Caso 7 — Consulta multi-tabla (JOIN simple)

### Trigger
> *"Qué productos compró María el mes pasado."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta que se necesita cruzar `ventas` con `productos`
   filtrando por `cliente_id` (la PWA o un paso previo ya resolvió que
   "María" → `cliente_id: 14` consultando `clientes`) y por `fecha` del
   mes anterior.
3. El contrato del Plan JSON v1.0 soporta **un único INNER JOIN** sobre
   relaciones declaradas (FK conocida en el schema-summary). Plan
   resultante con dos tablas (`ventas` + `productos`):
   ```json
   {
     "version": "1.0",
     "operation": "select",
     "table": "ventas",
     "columns": ["productos.nombre", "ventas.cantidad"],
     "joins": [
       {
         "type": "inner",
         "table": "productos",
         "on": {
           "left": "ventas.producto_id",
           "right": "productos.id"
         }
       }
     ],
     "filters": [
       { "column": "ventas.cliente_id", "op": "=", "value": 14 },
       { "column": "ventas.fecha", "op": ">=", "value": "2026-04-01" }
     ],
     "limit": 50
   }
   ```
4. `execute-plan` valida que el join esté en la lista permitida (M1:
   un único INNER JOIN), ejecuta, audita.
5. Respuesta tabular + TTS de resumen.

> Para una versión que cruce **3 tablas** (`clientes` + `ventas` +
> `productos`) en un solo Plan se necesita M2 con JOINs múltiples
> permitidos por el contrato v1.x. En M1 se resuelve con dos
> consultas: primero resolver `cliente_id`, luego el SELECT con join
> simple de arriba.

### Resultado
> "María compró 4 productos el mes pasado: 2 cafés, 1 medialuna y un
> sándwich."

### Notas / edge cases
- Si hay múltiples "Marías", Gemini debería incluir un filtro adicional
  o devolver todas y dejar al usuario elegir. El contrato del Plan
  JSON debe permitir expresar "ambigüedad detectada" para que la PWA
  pida aclaración antes de ejecutar.
- Joins de más de 2 tablas, joins arbitrarios o subqueries quedan
  fuera del contrato M1. Si Gemini los devuelve, `execute-plan`
  rechaza.

---

## Caso 8 — Plan JSON inválido (recuperación de error)

### Trigger
> *"Decime cosas raras de la base."* (frase ambigua que Gemini no
> puede mapear a una operación válida)

### Flujo
1. Lanzamiento + mic.
2. Gemini intenta producir un Plan JSON pero, por la ambigüedad de la
   frase, devuelve algo que no encaja con el contrato (ej. un
   `select` sin tabla, o sin columnas, o con un tipo no soportado).
3. La PWA recibe la respuesta de Gemini y la valida client-side
   contra el schema del contrato antes incluso de llamar a
   `execute-plan` (defensa en profundidad).
4. La validación falla.
5. La PWA registra el intento en `orion_audit` (vía un endpoint de
   auditoría dedicado o en la próxima llamada agrupada).
6. La PWA produce un TTS de fallback.

### Resultado
> "No entendí bien qué querés consultar. ¿Podés ser más específico?"

Y en pantalla, una sugerencia: "Intentá con: '¿cuántas ventas tengo
hoy?' o 'mostrame los clientes de Buenos Aires'".

### Notas / edge cases
- El sistema **no debe ejecutar nada** ante un Plan JSON inválido. Es
  innegociable.
- Si el Plan llega válido al cliente pero `execute-plan` lo rechaza
  server-side (segunda capa de validación), idéntico tratamiento:
  TTS de fallback + auditoría del rechazo.
- Eventualmente (M3), el sistema podría re-pedirle a Gemini una
  reformulación automática. En M1 simplemente le pide al usuario
  reformular.

---

## Caso 9 — Operación bloqueada (DROP / TRUNCATE)

### Trigger
> *"Borrá toda la tabla de ventas."*

### Flujo
1. Lanzamiento + mic.
2. Gemini, idealmente, traduce "borrá toda la tabla" como un `delete
   from ventas` sin filtros (no como `DROP TABLE`). En ese caso, el
   contrato del Plan JSON ya rechaza por **filtro obligatorio en
   delete** (ver Caso 5).
3. Si por alguna razón Gemini intenta colar un Plan que sugiera DDL
   (ej. un campo `raw_sql` o un type fuera del enum permitido),
   `execute-plan` lo rechaza incondicionalmente: la lista de
   operaciones bloqueadas (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`,
   `GRANT`, `REVOKE`, `COPY`, `DO`, multi-statement) está hardcoded
   en el código de la Edge Function y cubierta por tests.
4. El rechazo se registra en `orion_audit` con razón explícita.
5. TTS de error.

### Resultado
> "No puedo hacer eso. Las operaciones de borrado masivo o de
> estructura están bloqueadas. Si querés borrar registros, pedímelo
> con un filtro."

### Notas / edge cases
- Este caso **no es** una limitación a explicar al usuario como bug:
  es un principio constitucional (Constitución, principio 4). El
  mensaje de error debe educar, no disculparse.
- Si en el futuro el director quiere ejecutar un DDL legítimo (una
  migración), se hace por fuera de Orion Vox (consola Supabase, CLI
  de migraciones).

---

## Caso 10 — Modo read-only activo

### Trigger
> Estado inicial: el toggle global "read-only" está **activado** en
> la PWA (decisión consciente del usuario, ej. mientras explora datos
> sin querer modificar nada por accidente).

> *"Registrame que vendí dos jugos a Pedro."*

### Flujo
1. Lanzamiento + mic.
2. Gemini interpreta y devuelve un Plan JSON con `type: "insert"`.
3. La PWA detecta que el plan es de escritura (`insert | update |
   delete`) **y** que el toggle read-only está activo.
4. La PWA aborta antes de mostrar el modal de confirmación.
5. La PWA registra en `orion_audit` el rechazo por modo read-only.
   (Idealmente vía una llamada a `execute-plan` con un flag, o vía
   un endpoint de auditoría dedicado, para no dejar al cliente como
   única fuente de la decisión).
6. TTS explicativo.

### Resultado
> "Estás en modo solo lectura. Si querés ejecutar esa escritura,
> desactivá el toggle desde la pantalla principal."

En pantalla, un banner persistente recuerda que el modo read-only
está activo, y un botón directo para desactivarlo.

### Notas / edge cases
- El modo read-only es **una capa adicional**, no la única defensa
  para writes (la confirmación táctil y el audit siguen siendo
  innegociables incluso con el toggle desactivado).
- Si el toggle está activo y el usuario hace una **lectura**, todo
  funciona normal. La restricción solo aplica a writes.
- En M2, el modo read-only debería poder forzarse server-side (ej.
  vía un flag en la sesión que `execute-plan` valide), no solo
  client-side. En M1 vive en el cliente como deuda documentada.

---

## Cláusula de cierre

> Estos 10 casos cubren los patrones representativos esperados en M1.
> No son la lista completa de lo que el sistema puede hacer — son los
> que se diseñan, prueban y documentan con prioridad. Casos atípicos
> que aparezcan en uso real se documentan en este mismo archivo o se
> escalan a issues si requieren cambio de contrato.
