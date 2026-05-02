---
title: Uso día a día — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - INSTALLATION-CUBOT.md
  - ../02-architecture/PROMPT-ENGINEERING.md
  - ../02-architecture/SCHEMA-SUMMARY.md
  - TROUBLESHOOTING.md
  - OBSERVABILITY.md
---

# Uso día a día — Orion Vox

Cómo usar Orion Vox en el día a día: qué frases funcionan bien, qué
frases NO funcionan bien, cuándo usar voz vs teclado, cuándo refrescar
el schema, cómo revisar la auditoría, tips de prompting.

---

## 1. Frases que funcionan BIEN (10 ejemplos)

Estilo: específico, en español rioplatense, mencionando nombres de
tablas o conceptos del schema cuando hay ambigüedad.

| # | Frase                                                                | Por qué funciona                                                   |
|---|---------------------------------------------------------------------|--------------------------------------------------------------------|
| 1 | "mostrame las tareas activas"                                       | Tabla clara, filtro implícito por estado                           |
| 2 | "dame las últimas 10 notas"                                          | Operación clara, límite explícito                                  |
| 3 | "creá una tarea: comprar pilas, categoría casa"                     | Insert con valores explícitos                                      |
| 4 | "marcá como hecha la tarea con id abc-123"                          | Update con filtro por id (lo más seguro)                           |
| 5 | "borrá las tareas archivadas hace más de 90 días"                   | Delete con filtros estrictos (estado + fecha)                      |
| 6 | "cuántos libros tengo en estado leyendo"                             | Select con count, filtro claro                                     |
| 7 | "lista las categorías"                                               | Select sin filtros, tabla pequeña                                  |
| 8 | "actualizá la nota con id 42 y poné el título 'reunión postergada'" | Update con id + value único                                        |
| 9 | "mostrame las tareas de la categoría finanzas con su nombre"        | Select con join inferido por FK                                    |
| 10 | "dame las primeras 5 tareas de hoy"                                  | Select con order_by implícito + limit                              |

**Patrón común**: nombres concretos, filtros claros, una operación por
frase.

---

## 2. Frases que NO funcionan bien (5 ejemplos + por qué)

| # | Frase                                                | Por qué falla                                                                                |
|---|------------------------------------------------------|----------------------------------------------------------------------------------------------|
| 1 | "borrá todo lo viejo"                                | "Viejo" es ambiguo, "todo" sin filtros es destructivo. Dispara `request_clarification`.      |
| 2 | "mostrame los pedidos pendientes"                    | Si tu schema no tiene tabla `pedidos`, Gemini no sabe qué hacer. Dispara clarification.      |
| 3 | "creá 5 tareas y borrá las archivadas y mandalas a..." | Multi-operación en una frase. M1 solo soporta una operación por Plan JSON.                   |
| 4 | "dame las tareas con un join a categorías y otro a usuarios y otro a logs" | Joins limitados a 1 en M1. Schema rechaza múltiples.                                         |
| 5 | "ejecutá DROP TABLE tareas"                          | DDL bloqueado. Server rechaza con audit registrado. NO se ejecuta nada.                      |

**Patrón común**: ambigüedad, tablas inexistentes, multi-operación,
operaciones bloqueadas.

---

## 3. Voz vs teclado — cuándo usar cada uno

### 3.1 Voz (modo principal)

**Usá voz cuando:**

- Estás en movimiento, manos ocupadas, en el trabajo, etc.
- La frase es corta y clara.
- El contexto acústico es decente (sin ruido extremo).

**Tip**: hablá natural. La Web Speech API es buena con español
rioplatense. No exageres pronunciación.

### 3.2 Teclado (fallback)

**Usá teclado cuando:**

- Hay ruido fuerte (calle, máquinas, tránsito).
- Necesitás frases largas con valores específicos (ids UUID, fechas
  exactas).
- Querés revisar exactamente qué transcribiría la voz.
- El STT está fallando consistentemente (red lenta, micrófono tapado).

El input de teclado **siempre está disponible** debajo del botón de
voz.

### 3.3 Modo híbrido

- Empezá con voz para la mayor parte de la frase.
- Si el sistema transcribió mal una palabra clave (ej: un id), editá
  con teclado antes de enviar.

---

## 4. Cuándo refrescar el schema

El schema se cachea en cliente con TTL 24h (ver `SCHEMA-SUMMARY.md §5`).
**Refrescá manualmente cuando:**

- Migraste tu base Supabase (agregaste/quitaste tablas o columnas).
- Modificaste FKs.
- Cambiaste comentarios de tablas / columnas.
- Recibiste un error tipo "columna X no existe" en una operación que
  debería funcionar (señal de schema stale).
- Cambiaste la lista de tablas excluidas.

**Cómo refrescar:**

1. Orion Vox → Configuración → Schema.
2. Tocar "Refrescar schema".
3. Esperar (~1-2s).
4. Verificar el resumen visible.

**Refresh automático**: cuando la Edge detecta que tu cache está
desactualizado, dispara refresh automático en background (ver
`SCHEMA-SUMMARY.md §4.4`). En general no necesitás pensarlo.

---

## 5. Cómo revisar la auditoría

### 5.1 Espejo local (rápido)

- Orion Vox → Auditoría.
- Ver últimas N operaciones (default 200) sin tocar la red.
- Filtros básicos: por operación (select/insert/update/delete), por
  error, por fecha.

### 5.2 Auditoría completa server-side

Para queries más profundas (histórico, agregados, búsqueda en
`user_prompt`):

1. Supabase dashboard → SQL editor.
2. Usar las queries de `AUDIT-MODEL.md §6` o `OBSERVABILITY.md`.

Ejemplo rápido — ver últimas 20 operaciones:

```sql
select ts, plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       rows_affected, error,
       substring(user_prompt, 1, 60) as prompt
from orion_audit
order by ts desc
limit 20;
```

---

## 6. Tips de prompting

### 6.1 Sé específico con la tabla cuando hay ambigüedad

- ❌ "mostrame las activas"
- ✅ "mostrame las **tareas** activas"

### 6.2 Usá ids cuando los tengas

- ❌ "borrá la tarea de comprar pilas" (puede haber varias con
  títulos similares)
- ✅ "borrá la tarea con id abc-123" (filtro exacto)

### 6.3 Mencioná el filtro explícitamente

- ❌ "borrá las viejas"
- ✅ "borrá las tareas con estado archivada"

### 6.4 Una operación por frase

- ❌ "creá una tarea y después borrá las archivadas"
- ✅ Dos frases separadas, con confirmación entre cada una.

### 6.5 Usá hints semánticos para tu jerga

Si decís "agendá X" y querés que cree una tarea, agregá en hints:

> "Cuando digo 'agendá X', el usuario está pidiendo crear una tarea
> con título X y estado activa."

(Configuración → Hints semánticos)

### 6.6 Si dudás, pedí preview

- "decíme qué harías si pido borrar las archivadas" — Gemini
  responde con `request_clarification` o describe el plan, sin
  ejecutar.

(M2 puede formalizar un modo "dry run" explícito.)

---

## 7. Confirmación táctil — qué esperar

Cuando una operación es **insert / update / delete**, la PWA muestra
un modal:

- **Tabla destino** (ej: `tareas`).
- **Operación textual** (ej: "Vas a borrar 3 filas de `tareas`
  donde estado = 'archivada'").
- **Preview SQL** (informativo, lo que el cliente cree que se
  ejecutará).
- Botones grandes: **Confirmar** | **Cancelar**.

**Sin auto-cierre**. **Sin timeout**. **Sin atajo de teclado** (no
Enter = confirmar). El toque humano es deliberado.

Si cancelás: la operación NO se ejecuta y NO crea registro en
`orion_audit` server. Sí queda nota en `audit_mirror` local con
`was_confirmed = false` para tu estadística personal.

---

## 8. Errores y comportamientos esperados

| Error visible                                  | Qué pasó                                   | Qué hacer                                                |
|------------------------------------------------|--------------------------------------------|----------------------------------------------------------|
| "No entendí, reformulá la frase"               | Gemini devolvió `request_clarification`    | Leer el mensaje + responder con más detalle              |
| "La consulta tardó demasiado"                  | Postgres timeout (10s)                     | Frase muy amplia o falta índice; reformular o crear índice |
| "Operación no permitida"                       | Plan JSON tenía DDL u otra blocked         | Esperado — la operación es destructiva. NO insistir       |
| "Sin conexión"                                 | Cubot offline o Edge caída                  | Esperar; revisar wifi/4G                                  |
| "Cuota Gemini agotada"                         | Excediste free tier diario                 | Esperar reset (24h) o pasar a paid                        |
| "Schema desactualizado"                        | Edge detectó schema_hash distinto          | Refrescar schema (§4)                                    |
| "PIN incorrecto" (3 veces seguidas)            | Bloqueo escalonado activo                  | Esperar el delay; tras 3+ intentos, considera factory reset |

Detalle ampliado: `TROUBLESHOOTING.md`.

---

## 9. Backups y seguridad — recordatorios para uso diario

- **Tu base Supabase se respalda automáticamente** (en plan free es
  manual; ver `BACKUP-RECOVERY.md`).
- **Tu PIN protege las credenciales**: si lo olvidás, factory reset +
  re-ingresar credenciales.
- **Nunca compartas screenshots** que muestren la URL Supabase + el
  service_role visibles.
- **Si perdés el Cubot**: rotá Gemini key + Supabase service_role
  desde sus respectivos paneles, antes de hacer cualquier otra cosa.

---

## 10. Performance esperado

- Frase corta READ: ~5 segundos voz a respuesta hablada.
- Frase corta WRITE: ~6 segundos + tu pausa para confirmar.
- Frase larga / Gemini lento: hasta 13s en worst case (ver
  `DATA-FLOW.md §4`).

Si consistentemente toma >15s, abrir investigación (ver `RUNBOOK.md`).

---

## 11. Lo que Orion Vox NO hace (recordatorio)

Para evitar pedidos imposibles:

- **No ejecuta DDL** (DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE).
- **No ejecuta multi-statement** (un Plan JSON = una operación).
- **No accede a `orion_audit` desde Plan JSON** (M1 — denylist explícita).
- **No funciona offline** para operaciones (necesita Gemini + Edge online).
- **No crea triggers, funciones, vistas materializadas**.
- **No exporta CSV / archivos** (M1).
- **No ingiere archivos** (M1).
- **No envía notificaciones push** (M1).

Para todo eso: dashboard Supabase, psql, Supabase CLI.

---

## 12. Hábitos recomendados

- **Diaria**: usar Orion Vox para lo que use sea natural. Lo que se
  resista es feedback (mejorar prompt o agregar hint).
- **Semanal**: revisar `Auditoría` y ver patrones. ¿Qué fallé más?
  ¿Qué tablas toqué? Tomar nota de mejoras.
- **Mensual**: refrescar schema explícitamente (aunque haya cache),
  como sanity check.
- **Trimestral**: revisar la lista de hints, eliminar los obsoletos,
  agregar los emergentes.
