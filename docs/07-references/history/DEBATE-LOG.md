---
title: Bitácora del debate Claude ↔ Codex ↔ usuario — rounds 1 a 4
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ./RESEARCH-LOG.md
  - ../../00-constitution/GOVERNANCE.md
  - ../../03-adr/ADR-INDEX.md
  - ../../03-adr/ADR-001-plan-f-plus-architecture.md
  - ../../03-adr/ADR-002-discard-ok-google-native.md
---

# Bitácora del debate — Orion Vox

Síntesis de los **cuatro rounds de debate** del tribunal Claude ↔ Codex
↔ usuario que produjeron las decisiones arquitectónicas hoy fijadas en
los ADRs 001-011. **Este documento NO transcribe mensajes completos**:
captura, por round, posición inicial de cada parte, argumentos clave,
quién cedió en qué punto, resolución y ADR resultante.

> Las transcripciones largas viven en el historial de chat del usuario y
> en engram (búsquedas por topic). Este documento es la versión
> consolidada y honesta de cómo se construyó el consenso.

---

## Round 1 — Análisis arquitectónico inicial (2026-05-01)

### Posiciones iniciales
- **Claude** propuso **Plan F** (PWA pura sideloaded + Web Speech API +
  Gemini API directo). Argumento principal: máxima simplicidad, cero
  gatekeeping, iteración inmediata, español de punta a punta.
- **Codex** propuso **Plan D** (TWA + Custom Intents de App Actions +
  Edge Functions). Argumento principal: cumple la premisa "OK Google
  hands-free" del usuario, que Plan F traicionaba.
- **Usuario** aclaró que la **premisa central** del proyecto era
  precisamente "OK Google → texto en español → Supabase → respuesta por
  voz". Plan F la sacrificaba; eso era inaceptable.

### Argumentos clave
- Codex: "Plan F es PWA-first sin justificación técnica. El usuario no
  pidió una PWA, pidió un asistente de voz. PWA es un medio, no un fin."
- Claude: "Plan D depende de Custom Intents de Google y de su review
  manual; queda al gatekeeping de Play Store y a APIs cambiantes."
- Usuario: "No me importa pagar el costo de un wrapper Android si gano
  hands-free real. Pero no quiero traducir nada al inglés."

### Quién cedió y en qué
- **Claude cedió** en el sesgo "PWA pura es siempre la respuesta
  correcta". Reconoció que el sesgo arquitectónico ignoró la premisa
  central del usuario.
- **Codex cedió** en parte de la simplicidad (Plan D no era trivial:
  exigía Kotlin, build Android, review Google Play).

### Resolución
Sin consenso firme. Se acordó investigar a fondo los caminos reales del
puente Gemini ↔ apps Android antes de elegir. → derivó en Round 2.

### ADR resultante
Ninguno todavía (Round 1 fue exploración). Las decisiones reales
emergieron en rounds 3 y 4.

---

## Round 2 — Pivote a Plan D' híbrido + correcciones de Codex (2026-05-01)

### Posiciones iniciales
- Tras la investigación del Round 1 (ver
  [`RESEARCH-LOG.md`](./RESEARCH-LOG.md), Round 1), **Claude** aceptó
  que Plan F traicionaba la premisa y propuso pivotear a un híbrido.
- **Codex** propuso **Plan D'** (= **Plan G** en su nomenclatura
  interna): APK Kotlin **mínima** (3-5 App Actions, fulfillment
  activities, widget con TTS) + PWA + Edge Functions Supabase como capa
  autoritativa.
- **Usuario** aceptó la opción híbrida con la condición de que el
  componente nativo fuera realmente mínimo (cero lógica de negocio en
  Kotlin).

### Argumentos clave (correcciones de Codex que quedaron firmes)
- **Plan JSON estructurado**, NUNCA SQL libre: "si Gemini puede emitir
  SQL arbitrario, todo el sistema es un agujero de inyección por
  prompt."
- **Rol Postgres dedicado** para la Edge Function de ejecución, no
  `service_role` perpetuo: "service_role bypasea RLS y eso anula la
  seguridad de Postgres por completo."
- **Schema autogenerado** desde `pg_catalog`: "schema escrito a mano se
  desactualiza el primer día y Gemini empieza a alucinar nombres de
  columnas."
- **Auditoría server-side desde el día uno**: "si la auditoría vive
  solo en el cliente, cualquier cosa que pasó en el server sin pasar
  por el cliente es invisible."
- **Idempotencia y allowlist explícita** de RPCs: "default deny.
  Todo lo no permitido explícitamente, prohibido."

### Quién cedió y en qué
- **Claude cedió** en aceptar el componente nativo mínimo. Mantuvo dos
  matices: (a) "app mínima" requiere disciplina escrita (cero lógica),
  (b) Custom Intents implica review manual de Google Play (1-3 semanas).
- **Codex cedió** en el alcance de la APK: aceptó que fuera enrutadora
  pura, sin estado, sin lógica de dominio.

### Resolución
**Consenso temporal en Plan D'**. Se quedó vivo dos rounds (2 y 3
inicial). La arquitectura conceptual de tres capas (cliente → edge →
postgres) y todas las correcciones de Codex sobre seguridad
**sobrevivieron incluso al descarte posterior de Plan D'** y son hoy
parte del Plan F+ (ver ADRs 003, 004, 008, 010).

### ADR resultante (consolidado posteriormente)
- ADR-003 — Plan JSON estructurado, NUNCA SQL libre.
- ADR-004 — `service_role` en M1, rol dedicado en M2.
- ADR-008 — Auditoría server-side desde M1.
- ADR-010 — Schema Summary autogenerado, no manual.

---

## Round 3 — Cuestionamiento crítico de Custom Intents (2026-05-01)

### Posiciones iniciales
- **Codex** lanzó tres afirmaciones absolutas contra el propio Plan D'
  que él había propuesto: (1) Custom Intents son `en-US` only, (2)
  requieren Play Store, (3) máx 2 params text. Pidió validación.
- **Claude** quedó a cargo de la verificación. Hipótesis previa: alguna
  de las tres podría estar matizada por excepciones.
- **Usuario** explícito: "si las tres son ciertas, nada de esto cierra.
  Validalo bien antes de avanzar."

### Argumentos clave
- Codex: "antes de meter dos meses de Kotlin, confirmá que el wrapper
  vaya a registrar Custom Intents reconocibles por Gemini en español
  desde sideload. Si no, tirá Plan D' a la basura."
- Claude (post-research): "las tres afirmaciones se confirmaron 3 de 3.
  Sideload + español + texto libre + Custom Intents = imposible mayo
  2026."

### Quién cedió y en qué
- **Claude cedió** completamente: el plan que él había co-firmado en
  Round 2 (D') era inviable. Lo reconoció abiertamente.
- **Codex cedió** en la pretensión "OK Google hands-free completo".
  Aceptó que con el hardware Cubot y el idioma español, ese flujo no
  existía self-service.
- **Usuario cedió** en la **premisa central original** del proyecto.
  Aceptó que "OK Google → texto libre en español → app sideload" estaba
  cerrado en mayo 2026 y que perseguirlo significaba o (a) cambiar
  hardware, o (b) traducir la UX al inglés, o (c) esperar
  indefinidamente AppFunctions GA. Las tres opciones fueron rechazadas.

### Resolución
**La premisa "OK Google hands-free completo en español" se declaró
muerta** y el tribunal quedó libre para diseñar la mejor arquitectura
posible bajo las restricciones reales: PWA pura + Web Speech API + atajos
nativos + wake aproximado vía "OK Google, abrí Orion Vox".

### ADR resultante
- ADR-002 — Descarte de "OK Google" nativo hands-free en español.

---

## Round 4 — Convergencia final en Plan F+ (2026-05-01)

### Posiciones iniciales
- **Claude** propuso volver a **Plan F**, pero enriquecido con **todas
  las correcciones de Codex** del Round 2: Plan JSON, rol dedicado en M2,
  schema autogenerado, auditoría server-side, allowlist explícita,
  idempotencia. Bautizó la variante como **Plan F+**.
- **Codex** evaluó la variante y aceptó. Las correcciones suyas
  sobrevivían intactas; lo único que cambiaba era el entry point
  (PWA pura + wake aproximado en vez de APK Kotlin + Custom Intents).
- **Usuario** aclaró tres cosas adicionales que terminaron de definir el
  alcance:
  1. **Uso personal exploratorio**, single user. No multi-tenant.
  2. **Modular**: M1 funcional con deuda asumida, M2 hardening, M3
     features. No empaquetar todo en una entrega.
  3. **Seguridad después**: la deuda M1 (service_role en cliente, Gemini
     key en cliente) es aceptable porque el contexto es personal y la
     superficie de ataque mínima. M2 paga la deuda.

### Argumentos clave
- Claude: "Plan F+ recupera la simplicidad sin perder lo que ganamos
  en Round 2. Plan JSON y auditoría server-side están intactos. Lo único
  que sacrificamos es el wake hands-free completo, que ya sabemos que
  no es alcanzable de todos modos."
- Codex: "OK con F+ siempre que la deuda M1 esté **escrita y fechada**
  con plan de pago en M2. Si queda como 'lo arreglamos cuando podamos',
  M2 nunca llega."
- Usuario: "Aceptado. Quiero los ADRs antes de la primera línea de
  código. Y quiero el split M1/M2 explícito."

### Quién cedió y en qué
- Nadie cedió en este round; los tres convergieron porque cada uno había
  cedido lo necesario en los rounds previos. El Round 4 fue
  consolidación, no debate.

### Resolución
**Consenso firme en Plan F+** para los tres milestones (M1, M2, M3).

### ADRs resultantes (familia completa)
- ADR-001 — Adopción de Plan F+ como arquitectura base.
- ADR-005 — Gemini API key server-side desde M1 (env var de Edge `plan-intent`). [Reescrito en Wave 1 post-auditoría Codex; la versión previa que aceptaba la key cifrada en cliente quedó superseded.]
- ADR-006 — PWA pura, sin componente nativo Kotlin.
- ADR-007 — Web Speech API como modo voz interno.
- ADR-009 — Roadmap modular M1 → M2 → M3.
- ADR-011 — Español como idioma primario.
- (Más los heredados del Round 2: ADRs 003, 004, 008, 010.)

---

## Lecciones del proceso de debate

1. **Validar afirmaciones absolutas antes de cederles peso.** El Round 3
   funcionó porque Codex pidió validación de **sus propias** afirmaciones
   antes de seguir construyendo sobre ellas. Eso evitó que el tribunal se
   atornillara a Plan D' por meses.
2. **Separar "ideal arquitectónico" de "viable hoy".** Hubo dos rounds
   intentando que la arquitectura ideal (OK Google hands-free completo)
   coincidiera con lo viable. No coincidían. La salida sana fue declarar
   la premisa muerta y rediseñar bajo restricciones reales.
3. **Separar fases para no postergar todo.** Round 4 cerró por el split
   explícito M1 (con deuda) → M2 (hardening) → M3 (features). Sin ese
   split, el debate "queremos seguridad perfecta vs queremos algo
   funcional" hubiera bloqueado el proyecto entero.
4. **Reconocer errores propios sin ego.** Claude erró dos veces (Round 1
   recomendando Plan F sin justificar, Round 2 co-firmando D' sin
   verificar). Reconocerlo en el log no es debilidad, es la única forma
   de que el tribunal funcione: si las IAs maquillan sus errores, el
   usuario pierde la herramienta principal de calidad (la disidencia
   honesta).
5. **El consenso no es "todos felices", es "ninguno tiene objeción
   técnica restante".** Plan F+ no entusiasma a nadie tanto como un
   "OK Google hands-free real" hubiera entusiasmado. Pero ninguno tiene
   objeción técnica contra él. Ese es el umbral que importa.

---

## Cierre

Este proceso fue posible porque el modelo de gobernanza
([`../../00-constitution/GOVERNANCE.md`](../../00-constitution/GOVERNANCE.md))
asignó roles explícitos al tribunal de IAs y poder de veto al usuario.
Sin ese marco, los rounds hubieran derivado en posiciones congeladas o en
"Claude tiene la razón porque es el que escribe el código".

Las **once decisiones arquitectónicas** que emergieron de estos cuatro
rounds están documentadas, una por una, en
[`../../03-adr/ADR-INDEX.md`](../../03-adr/ADR-INDEX.md). Cada ADR cita
en su sección **Referencias** los memos de engram y los topics de
investigación que la sostienen, cerrando la trazabilidad
debate → research → ADR → código.

Que el próximo cambio arquitectónico siga el mismo proceso.
