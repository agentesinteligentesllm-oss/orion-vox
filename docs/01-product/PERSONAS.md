---
title: Personas — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - PRD.md
  - USE-CASES.md
  - USER-STORIES.md
  - ../00-constitution/CONSTITUTION.md
  - ../00-constitution/NON-GOALS.md
---

# Personas

Orion Vox tiene **una sola persona**: el director del proyecto, único
usuario humano del sistema. Este documento la describe en detalle, no
porque la audiencia sea ambigua, sino porque las decisiones de diseño
dependen del perfil concreto del operador (tolerancia técnica, tipo de
datos, patrones de uso, tolerancia al riesgo).

> **Importante:** no se diseñan personas adicionales. Cualquier
> "futuro usuario" o "integración con equipo" cae fuera de alcance
> (ver `NON-GOALS.md`, sección "Producto y alcance"). Si en algún
> momento aparece una segunda persona, el proyecto se reevalúa de
> cero — no se "extiende".

---

## Persona única: El Director

### Identificación

| Campo | Valor |
|-------|-------|
| Alias en el proyecto | El director (operador único) |
| Email registrado | `aimoneyguyfx@gmail.com` |
| Rol en el proyecto | Único usuario, único decisor, dueño del proyecto Supabase operado |
| Cantidad de usuarios análogos esperados | 1 (uno) |

### Contexto técnico

- **Profesión**: ingeniero / desarrollador de software fullstack.
- **Familiaridad con SQL**: alta. Lee y escribe SQL sin asistencia,
  conoce diferencias entre `JOIN`, agregaciones, filtros, índices.
- **Familiaridad con Supabase**: alta. Diseñó y mantiene su propio
  proyecto, conoce el dashboard, las Edge Functions, los roles
  (`anon`, `authenticated`, `service_role`), RLS.
- **Familiaridad con LLMs y function calling**: alta. Entiende qué
  significa "Plan JSON con schema garantizado", la diferencia con
  "texto libre", y los riesgos de inyección desde un LLM.
- **Familiaridad con PWAs**: media-alta. Conoce manifest, service
  worker, instalación, sideload.
- **Familiaridad con voz (Web Speech API)**: media. Conoce los
  conceptos básicos pero no ha implementado un flujo end-to-end
  conversacional antes.

Implicaciones de diseño:

- No hay que esconder conceptos técnicos en la UI. Mostrar el SQL
  generado en el preview de writes es un feature, no un riesgo de
  confusión.
- Mensajes de error pueden referirse a entidades técnicas (tabla,
  columna, tipo de operación) sin parafrasearlas.
- El usuario puede leer y entender `orion_audit` directamente; no es
  necesaria una capa de visualización amigable en M1.

### Hardware

- **Smartphone primario**: Cubot KingKong 9 (Android stock con Gemini
  integrado).
  - Sin Bixby (no es Samsung).
  - Sin Quick Phrases (no es Pixel).
  - Sin acceso a AppFunctions EAP (requiere app publicada y
    aprobada, ver `NON-GOALS.md`).
  - Único atajo de voz hands-free disponible: "OK Google, abrí
    `<nombre de app>`".
- **Conexión típica**: WiFi en interiores, datos móviles en
  exteriores. No se asume conectividad estable de alta velocidad.
- **Computadora**: usada para desarrollar y mantener el proyecto, no
  para operar Orion Vox día a día.

Implicaciones de diseño:

- El target de UX es **móvil first y único**. Sin layout desktop.
- Latencia debe absorber redes 4G razonables (la métrica de < 6 s
  end-to-end asume conectividad común, no fibra ideal).
- Toques grandes, micrófono prominente, sin gestos complejos.

### Idiomas

- **Primario**: español (mezcla rioplatense y mexicano según
  contexto).
- **Secundario para terminología técnica**: inglés (lee documentación,
  acepta nombres en inglés en código y mensajes de log internos).

Implicaciones de diseño:

- UI, voz (entrada y salida), mensajes de error visibles y
  documentación: español.
- Identificadores técnicos (`orion_audit`, `execute-plan`, `Plan JSON`,
  `service_role`): se mantienen en su forma original; no se traducen.
- Reconocimiento de voz configurado en `es-MX` (mejor cobertura
  general que `es-AR` en Chrome Android, validable en M1).
- TTS configurado idealmente en `es-AR` o el español más natural
  disponible en el dispositivo (a probar y decidir en M1).

### Frustraciones que motivan el proyecto

Razones concretas por las que el director construye Orion Vox:

1. **Dashboard de Supabase en móvil es lento.** Abrir el navegador,
   loguearse, navegar al table editor, filtrar — son demasiados taps
   para una consulta de 5 segundos.
2. **Clientes SQL móviles son incómodos.** Teclear `SELECT * FROM
   ventas WHERE fecha = CURRENT_DATE LIMIT 10` con teclado de
   pantalla, en movimiento, es fricción pura.
3. **Esperar a estar frente a la computadora rompe el flujo.** Las
   tareas de "registrar algo rápido" pierden su valor si hay que
   diferirlas.
4. **Las apps de notas no integran con la base.** Anotar "vendí 3
   cafés a Juan" en una app de notas no se convierte solo en una fila
   en `ventas`; queda en un limbo que después hay que copiar
   manualmente.
5. **No hay solución existente que combine voz + DB personal +
   español.** Los asistentes comerciales (Alexa, Gemini, Siri) no
   tienen acceso a una base Supabase personal; los clientes de DB no
   tienen voz.

Implicaciones de diseño:

- La velocidad percibida es prioridad. Cualquier paso intermedio
  (login, selección de tabla manual, configuración por consulta) es
  fricción y debe evitarse en M1.
- La frase libre no es opcional ni "nice to have" — es el corazón del
  valor.
- TTS de respuesta no es decorativo: cierra el loop sin obligar al
  usuario a mirar la pantalla.

### Patrones de uso esperados

Estimaciones del director para M1 (revisables con telemetría real
desde `orion_audit`):

| Dimensión | Estimación M1 |
|-----------|--------------|
| Invocaciones por día | 5 a 20 |
| Distribución read/write | ~ 70 % lecturas, ~ 30 % escrituras |
| Duración típica de la frase | 3 a 8 segundos |
| Tablas más consultadas | 3 a 10 (de un universo total mayor) |
| Sesiones por invocación | Una sola consulta, sin diálogo multi-turno |
| Hora del día | Distribuido durante todo el día, picos en horario laboral y noche |
| Contexto físico | Móvil, en movimiento, manos a veces ocupadas (de ahí el énfasis en hands-free de entrada) |

Implicaciones de diseño:

- El sistema **no necesita** soportar diálogos multi-turno con memoria
  conversacional en M1. Cada invocación es independiente.
- El schema summary puede ser pequeño (3–10 tablas), lo que mantiene
  el prompt a Gemini barato y rápido.
- La cuota de Gemini necesaria es modesta (5–20 llamadas/día) y
  cabe holgada en cualquier free tier vigente.

### Tolerancia al riesgo

Asimétrica por etapa:

- **Para M1 (funcional + base segura)**: tolera **sólo** la deuda
  residual nombrada (TD-001-bis, TD-003, TD-004, TD-005). El director
  acepta:
  - Edge `execute-plan` ejecutando con `service_role` server-side
    (env var, jamás en cliente). Migra a `orion_vox_executor` en M2.
  - Preview de writes generado client-side. M2 lo firma server-side
    con `preview_id`.
  - Allowlist y redacción configuradas por env var, sin UI admin en
    M1. M2 agrega UI admin.
  - RLS deshabilitada en `orion_audit` mientras el rol bypassea. M2
    habilita RLS estricta tras migrar de rol.
- **Para M2 (hardening)**: cero tolerancia a la deuda M1 residual. Se
  reemplaza `service_role` por `orion_vox_executor`, el preview se firma
  en la Edge, aparece la UI admin de allowlist/redacción y RLS estricta
  cubre las tablas operadas.
- **Para producción con datos sensibles regulados**: el proyecto **no
  está pensado para ese caso**. Si en algún momento el proyecto
  Supabase del director guardara PII de terceros, PHI o PCI, Orion
  Vox debe rediseñarse o no usarse para ese subset.

Implicaciones de diseño:

- M1 puede aceptar tradeoffs que serían inaceptables en M2.
- La deuda M1 está documentada explícitamente en cada lugar donde
  aparece (no es deuda silenciosa).
- El roadmap M2 no es opcional: es la condición para que Orion Vox
  siga vivo más allá del experimento.

---

## No-personas (explícito)

Para evitar dudas durante el desarrollo, estas **no son personas** del
proyecto:

- **Otros desarrolladores que quisieran usar Orion Vox.** Si alguien
  quisiera hacerlo, debería forkear y operar su propio proyecto
  Supabase, su propia Gemini key y su propia PWA sideloaded. No hay
  multi-tenancy ni onboarding.
- **Usuarios no técnicos.** El producto asume conocimiento de SQL,
  Supabase y conceptos de LLM. No se diseñará una capa de
  abstracción para usuarios no técnicos.
- **Equipos / organizaciones.** No hay roles, permisos por usuario,
  workspaces compartidos.
- **Stakeholders comerciales.** No hay stakeholder distinto al
  director.

Estas no-personas existen en este documento solo para cerrar la puerta
a feature requests que asuman su existencia.
