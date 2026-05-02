---
title: User Stories — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - PRD.md
  - PERSONAS.md
  - USE-CASES.md
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/NON-GOALS.md
---

# User Stories

Historias de usuario en formato **"como `<X>` quiero `<Y>` para `<Z>`"**,
agrupadas por épica. Convención de IDs: `US-<EPICA>-<N>` donde `<EPICA>`
es un código de 3 letras y `<N>` un correlativo.

Prioridades:

- **M1** — funcional, requerido para cerrar M1.
- **M2** — hardening, parte del trabajo de M2.
- **M3** — features, parte del trabajo de M3.

Como la persona es única (ver `PERSONAS.md`), todas las historias dicen
"como **el director**". Mantener el formato es deliberado: facilita
revisar criterios de aceptación y prioridades sin tener que reinterpretar
cada vez quién es el actor.

---

## Épica 1 — Configuración inicial (CFG)

Setup mínimo para que Orion Vox sea operable contra el proyecto Supabase
del director.

### US-CFG-01 — Configurar URL del proyecto Supabase

**Como** el director
**quiero** ingresar la URL del proyecto Supabase (y la `anon_key`
pública para inicializar el SDK) desde la pantalla de configuración
**para** que la PWA pueda autenticarse contra Supabase Auth e invocar
las Edge Functions de mi proyecto.

- **Prioridad**: M1.
- **Criterios**:
  - Existe una pantalla de configuración accesible desde el menú.
  - Los valores se persisten localmente (`localStorage` o IndexedDB),
    sin cifrado (la `anon_key` es pública por diseño).
  - Sin URL configurada, la PWA muestra un estado vacío con CTA hacia
    configuración (no permite intentar consultas).
  - Se puede editar y reemplazar los valores.
  - **`anon_key` NO autentica**: la auth real es Supabase Auth con
    magic link → JWT en `Authorization: Bearer`.

### US-CFG-02 — Login con Supabase Auth (magic link)

**Como** el director
**quiero** loguearme con un magic link enviado a mi email
**para** que la PWA tenga un JWT válido contra el cual `plan-intent` y
`execute-plan` validan que `user.id == ORION_ALLOWED_USER_ID`.

- **Prioridad**: M1.
- **Criterios**:
  - Pantalla de login con input de email + botón "enviarme el link".
  - Tras tappear el link en el email, la sesión se persiste en
    `localStorage` (manejada por el SDK Supabase) y la PWA queda lista
    para invocar las Edges.
  - Sin sesión válida, la PWA bloquea consultas y muestra el login.
  - Logout disponible en menú (limpia sesión).
  - **No se ingresa Gemini API key en M1**: vive en la env var
    `GEMINI_API_KEY` de la Edge `plan-intent`. La pantalla de
    configuración del usuario **no la pide**.

### US-CFG-03 — Configurar idioma de voz

**Como** el director
**quiero** seleccionar el locale de reconocimiento (`es-MX`, `es-AR`,
etc.) y el de TTS
**para** ajustar la calidad del reconocimiento y la naturalidad de la
respuesta hablada según mi dispositivo.

- **Prioridad**: M1.
- **Criterios**:
  - Default: `es-MX` para reconocimiento, mejor voz `es-*` disponible
    para TTS.
  - El cambio aplica de inmediato (sin reiniciar la PWA).
  - Si el navegador no soporta el locale elegido, se muestra
    advertencia y se usa fallback.

### US-CFG-04 — Cargar el schema summary

**Como** el director
**quiero** pegar (o cargar) un schema summary curado de mi proyecto
Supabase
**para** que Gemini sepa qué tablas y columnas existen y produzca
Planes JSON pertinentes.

- **Prioridad**: M1 (con deuda: en M2 lo genera la Edge Function
  `schema-summary` con allowlist server-side).
- **Criterios**:
  - Hay un editor de texto en configuración para pegar el summary.
  - Se persiste localmente.
  - Se puede previsualizar el contenido tal como se enviará a Gemini.
  - Sin summary, la PWA bloquea consultas con mensaje claro.

### US-CFG-05 — Refrescar el schema summary

**Como** el director
**quiero** poder actualizar el schema summary cuando cambio mi base
**para** que Gemini siga produciendo Planes JSON válidos sin
referencias a tablas/columnas viejas.

- **Prioridad**: M1.
- **Criterios**:
  - Editar el summary lo reemplaza inmediatamente; la próxima
    consulta usa el nuevo.
  - Hay un timestamp visible de "última actualización".
  - (M2) un botón "Refrescar desde Supabase" llama a la Edge
    Function `schema-summary`.

### US-CFG-06 — Gestionar lista de tablas excluidas

**Como** el director
**quiero** definir qué tablas del summary se excluyen del alcance de
Orion Vox
**para** evitar que Gemini intente operar sobre tablas sensibles o
internas.

- **Prioridad**: M1 (al menos cliente-side); reforzado server-side en
  M2 vía allowlist en `execute-plan`.
- **Criterios**:
  - UI con checklist de tablas presentes en el summary.
  - Las tablas excluidas se filtran del prompt antes de enviarlo a
    Gemini.
  - Cualquier intento de operar sobre una tabla excluida (si Gemini
    la conoce por otra vía) es rechazado por `execute-plan` desde
    M2.

### US-CFG-07 — Resetear configuración

**Como** el director
**quiero** poder borrar toda la configuración local (keys, summary,
preferencias)
**para** poder reiniciar de cero o cambiar de proyecto Supabase sin
arrastrar estado viejo.

- **Prioridad**: M1.
- **Criterios**:
  - Botón "Resetear configuración" con confirmación táctil.
  - Borra: Supabase URL + `anon_key`, sesión Supabase Auth, schema
    summary cacheado, locale, historial cacheado client-side. **No
    borra** secretos server-side (Gemini key y `service_role` viven en
    env vars de las Edge Functions, no en cliente).
  - **No borra** `orion_audit` (vive server-side).

---

## Épica 2 — Voz e interacción (VOZ)

Captura de voz, interpretación, respuesta hablada.

### US-VOZ-01 — Invocar la app por OK Google

**Como** el director
**quiero** poder lanzar Orion Vox diciendo "OK Google, abrí Orion Vox"
**para** activar el flujo sin tocar la pantalla.

- **Prioridad**: M1.
- **Criterios**:
  - La PWA está instalada como app (sideload + manifest correcto)
    para que Gemini sistema la detecte por nombre.
  - Al abrir, la pantalla está lista para escuchar (mic activado o
    botón muy visible para activarlo si el navegador requiere
    interacción).
  - Documentación corta sobre cómo asegurar que el reconocimiento de
    "Orion Vox" funcione (entrenar el nombre si es necesario).

### US-VOZ-02 — Ver indicador de escucha

**Como** el director
**quiero** ver claramente cuándo el micrófono está escuchando
**para** saber si puedo hablar y si me está captando.

- **Prioridad**: M1.
- **Criterios**:
  - Icono prominente con estado: idle / escuchando / procesando /
    respondiendo.
  - Animación o color distinto para "escuchando".
  - Indicador de nivel de audio si la API lo permite (nice-to-have
    M1, requerido M2).

### US-VOZ-03 — Dictar una consulta libre en español

**Como** el director
**quiero** decir mi consulta en español natural sin formato
predefinido
**para** que el flujo se sienta como hablarle a una persona, no a un
formulario.

- **Prioridad**: M1.
- **Criterios**:
  - `SpeechRecognition` configurado en `es-MX` (o lo configurado en
    US-CFG-03).
  - La transcripción se muestra en pantalla mientras se habla
    (`interimResults`).
  - El sistema detecta fin de habla automáticamente y procede.

### US-VOZ-04 — Oír la respuesta por TTS

**Como** el director
**quiero** que el resultado se sintetice por voz
**para** poder cerrar el loop conversacional sin mirar la pantalla.

- **Prioridad**: M1.
- **Criterios**:
  - `SpeechSynthesis` activado por defecto.
  - El texto sintetizado es un resumen humano del resultado, no el
    JSON crudo.
  - Si el resultado es tabular grande, el TTS dice un resumen
    ("Encontré 8 registros, te los muestro en pantalla").

### US-VOZ-05 — Interrumpir el TTS

**Como** el director
**quiero** poder cortar el TTS con un toque
**para** no esperar respuestas largas que ya leí en pantalla.

- **Prioridad**: M1.
- **Criterios**:
  - Botón "stop" visible mientras el TTS habla.
  - Tap en cualquier parte de la zona del player corta el habla.

### US-VOZ-06 — Fallback a teclado

**Como** el director
**quiero** poder escribir mi consulta con el teclado si la voz falla
o no es práctico hablar
**para** no quedar bloqueado en contextos ruidosos o sin permisos de
micrófono.

- **Prioridad**: M1.
- **Criterios**:
  - Input de texto siempre disponible debajo del micrófono.
  - Submit por botón o tecla Enter.
  - El flujo posterior (Gemini → Plan JSON → execute-plan → TTS) es
    idéntico.

### US-VOZ-07 — Reintentar el reconocimiento

**Como** el director
**quiero** poder reintentar la captura de voz con un toque
**para** corregir frases mal reconocidas sin reiniciar la app.

- **Prioridad**: M1.
- **Criterios**:
  - Botón "volver a escuchar" disponible después de cada captura.
  - Reintento limpia la transcripción anterior.

---

## Épica 3 — Ejecución segura (SEC)

Innegociables: confirmación táctil para writes, operaciones bloqueadas,
modo read-only.

### US-SEC-01 — Ver preview antes de un write

**Como** el director
**quiero** ver un modal con la operación, los datos y el SQL
parametrizado antes de cualquier `INSERT`/`UPDATE`/`DELETE`
**para** confirmar que Gemini interpretó correctamente lo que dije.

- **Prioridad**: M1 (innegociable).
- **Criterios**:
  - El modal se muestra siempre antes de ejecutar un write.
  - Contenido: tabla, operación, valores/filtros, SQL preview, filas
    afectadas estimadas si es `update`/`delete`.
  - Botones "Confirmar" / "Cancelar" claramente diferenciados.

### US-SEC-02 — Confirmar un write con un toque

**Como** el director
**quiero** que ningún write se ejecute sin un toque humano explícito
en "Confirmar"
**para** evitar ejecuciones por interpretación errada de la voz.

- **Prioridad**: M1 (innegociable, principio 5 de la Constitución).
- **Criterios**:
  - El botón "Confirmar" requiere tap directo (no acepta gestos
    accidentales).
  - El toque envía el plan a `execute-plan` con un flag `confirmed:
    true`.
  - (M2) la confirmación va con un token firmado server-side.

### US-SEC-03 — Cancelar un write

**Como** el director
**quiero** poder cancelar el modal y que esa cancelación quede
auditada
**para** tener trazabilidad incluso de los writes no ejecutados.

- **Prioridad**: M1.
- **Criterios**:
  - "Cancelar" cierra el modal sin ejecutar nada.
  - Se registra en `orion_audit` un evento de tipo "rechazado por
    usuario" con el plan original.

### US-SEC-04 — Activar/desactivar modo read-only

**Como** el director
**quiero** un toggle global de "modo solo lectura" en la pantalla
principal
**para** poder explorar datos con la confianza de que no voy a
modificar nada por error.

- **Prioridad**: M1 (client-side); M2 lo hace server-side enforced.
- **Criterios**:
  - Toggle visible en la pantalla principal.
  - Cuando está activo, todo plan de tipo `insert`/`update`/`delete`
    se aborta antes del modal con mensaje explicativo.
  - El estado del toggle se persiste entre sesiones.
  - (M2) `execute-plan` valida un flag de sesión y rechaza writes
    aunque el cliente los envíe.

### US-SEC-05 — Ver razón de operación bloqueada

**Como** el director
**quiero** un mensaje claro cuando una operación es bloqueada (DDL,
multi-statement, filtro vacío en delete, tabla excluida, etc.)
**para** entender por qué no se ejecutó y, si corresponde, reformular
la consulta.

- **Prioridad**: M1.
- **Criterios**:
  - El mensaje cita la regla violada (ej. "operación DDL bloqueada",
    "delete sin filtros bloqueado", "tabla `X` excluida del
    alcance").
  - Se reproduce por TTS y se muestra en pantalla.
  - Se registra en `orion_audit` con código de razón.

### US-SEC-06 — Confirmar operaciones de alto impacto con doble toque

**Como** el director
**quiero** que `delete` con filtros que afecten N filas (umbral
configurable, default ej. > 5) requiera un segundo toque de
confirmación
**para** prevenir borrados masivos por error de interpretación.

- **Prioridad**: M2.
- **Criterios**:
  - El umbral se configura en una constante (M2) o en la pantalla de
    configuración.
  - El segundo toque está separado visualmente del primero (no se
    puede dar por accidente).

---

## Épica 4 — Auditoría y observabilidad (AUD)

Visibilidad sobre lo que el sistema hizo.

### US-AUD-01 — Ver historial de consultas

**Como** el director
**quiero** ver una lista de las consultas recientes (frase, plan,
resultado, latencia)
**para** revisar qué se ejecutó sin tener que ir a la consola de
Supabase.

- **Prioridad**: M1.
- **Criterios**:
  - Pantalla de historial accesible desde el menú.
  - Lista las últimas N (ej. 50) entradas de `orion_audit` ordenadas
    por fecha desc.
  - Por cada entrada: timestamp, frase original, tipo de operación,
    tabla, estado (ok / error / rechazado), latencia.
  - Tap en una entrada expande detalle (Plan JSON, SQL, resultado o
    error).

### US-AUD-02 — Filtrar el historial por fecha

**Como** el director
**quiero** filtrar el historial por rango de fechas
**para** encontrar una consulta puntual sin hacer scroll infinito.

- **Prioridad**: M2.
- **Criterios**:
  - Selector de rango (desde / hasta).
  - El filtro re-consulta `orion_audit` (no filtra solo en cliente).

### US-AUD-03 — Repetir una consulta anterior

**Como** el director
**quiero** poder volver a ejecutar una consulta del historial con un
toque
**para** revalidar resultados o repetir operaciones recurrentes sin
re-dictarlas.

- **Prioridad**: M2.
- **Criterios**:
  - Botón "repetir" en el detalle de cada entrada.
  - Si es un write, vuelve a pasar por el modal de confirmación.
  - Se registra como nueva entrada en `orion_audit` (no se modifica
    la original).

### US-AUD-04 — Exportar el audit log

**Como** el director
**quiero** poder exportar `orion_audit` a CSV o JSON
**para** archivarlo, analizarlo o compartirlo en caso de
investigación.

- **Prioridad**: M3.
- **Criterios**:
  - Botón "exportar" en historial.
  - Genera el archivo client-side desde la respuesta de la consulta
    a `orion_audit`.

### US-AUD-05 — Ver métricas básicas de uso

**Como** el director
**quiero** ver métricas agregadas (consultas/día, latencia promedio,
tasa de errores, tasa de Plan JSON inválido)
**para** medir si las métricas de éxito M1 se están cumpliendo en uso
real.

- **Prioridad**: M2.
- **Criterios**:
  - Pantalla de métricas con vistas resumidas (últimos 7 / 30 días).
  - Las métricas se calculan desde `orion_audit` (server-side ideal,
    client-side aceptable en M2).

---

## Épica 5 — Mantenimiento (MNT)

Operaciones de upkeep para que el proyecto siga vivo y honesto.

### US-MNT-01 — Refrescar schema cuando cambia Supabase

**Como** el director
**quiero** poder actualizar el schema summary con un flujo simple
cuando agrego/quito tablas o columnas en Supabase
**para** mantener a Gemini sincronizado con la realidad de la base.

- **Prioridad**: M1 (manual); M2 automatizado via Edge Function
  `schema-summary`.
- **Criterios**:
  - M1: editar el summary en configuración (cubierto por
    US-CFG-04 / US-CFG-05).
  - M2: botón "refrescar desde Supabase" que llama a
    `schema-summary` y reemplaza el summary local con el server-side
    allowlisted.

### US-MNT-02 — Ver versión del contrato Plan JSON

**Como** el director
**quiero** ver en algún lugar de la PWA la versión vigente del
contrato Plan JSON (ej. `v1`, `v1.1`)
**para** detectar discrepancias si Gemini empieza a devolver formas
no soportadas tras un cambio de prompt o de modelo.

- **Prioridad**: M2.
- **Criterios**:
  - Versión visible en pantalla "acerca de".
  - Cuando `execute-plan` rechaza por incompatibilidad de versión, el
    mensaje incluye la versión esperada y la recibida.

### US-MNT-03 — Ver deuda técnica pendiente

**Como** el director
**quiero** ver una lista de los items de deuda técnica M1 residual
(`service_role` con BYPASSRLS, preview client-side, allowlist sin UI
admin, RLS sobre `orion_audit` deshabilitada) con su estado
**para** no perder de vista qué falta cerrar antes de M2.

- **Prioridad**: M1 (documentado); M2 visible en la app.
- **Criterios**:
  - M1: la deuda está documentada en `PRD.md` sección 6.
  - M2: una pantalla "estado del proyecto" lista la deuda con su
    estado (`abierta / en progreso / cerrada`).

---

## Cláusula de cierre

> Estas user stories son la base de planificación de M1, M2 y M3. Su
> formato es deliberadamente conservador: cada historia tiene un actor
> único (el director), un valor claro y criterios verificables. Cambios
> de scope, divisiones o nuevas historias se documentan acá mismo o
> via ADR si tocan principios.
