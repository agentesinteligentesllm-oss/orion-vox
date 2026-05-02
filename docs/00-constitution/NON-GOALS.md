---
title: Non-Goals — lo que Orion Vox NO hace
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - CONSTITUTION.md
  - GLOSSARY.md
---

# Non-Goals

Lista deliberada de cosas que el proyecto **no** hace. Cada una está acá
porque en algún momento se evaluó (o se preverá que alguien la propondrá)
y se decidió excluirla.

Esta lista es tan importante como la de features: define los bordes del
alcance y previene scope creep.

## Producto y alcance

- **Multi-tenant / multi-usuario.**
  Diseñado para una sola persona (vos). Sin tabla de usuarios, sin
  autenticación de cuentas, sin separación lógica por workspace. Habilitar
  multi-usuario sería un proyecto distinto, no una evolución.

- **Producto comercial / SaaS.**
  No hay billing, no hay onboarding, no hay landing page de marketing.
  Es una herramienta personal.

- **Internacionalización (i18n).**
  Solo español. Sin archivos de traducción, sin selector de idioma, sin
  pluralizaciones complejas. La UX es es-MX/es-AR según lo que mejor
  reconozca Web Speech.

## Distribución

- **App nativa Kotlin / Java.**
  Excluido en ADR-004. La PWA cubre el caso de uso sin la complejidad de
  build/deploy nativo, sin Play Store, sin firma de APK, sin gatekeeping
  de Google.

- **Distribución por Play Store.**
  Sideload exclusivo. Esto cierra la puerta a App Actions y AppFunctions,
  y eso es deseable: elimina dependencia de un gatekeeper externo y
  acelera iteración.

- **TWA (Trusted Web Activity) + App Actions.**
  Excluido en ADR-002. Custom Intents son `en-US` only y requieren
  publicación en Play Store. Inviable para uso en español sin distribuir.

- **AppFunctions (Android 16+ EAP).**
  Excluido en ADR-003. Está en programa EAP gated, requiere app nativa
  publicada y aprobada. No es accesible para sideload personal.

## Plataforma y voz

- **Soporte Bixby.**
  El hardware (Cubot KingKong 9) no es Samsung. Bixby ni siquiera está
  presente.

- **Quick Phrases / wake words personalizados.**
  Quick Phrases es exclusivo de la línea Pixel. El Cubot no las soporta.

- **Wake word global hands-free desde Gemini sistema en español.**
  Investigado y descartado: el asistente Gemini sistema no expone API
  pública para registrar comandos personalizados en español sin pasar por
  AppFunctions o App Actions, ambas excluidas. El único atajo hands-free
  posible es "OK Google, abrí Orion Vox", que abre la app — el resto del
  flujo es Web Speech dentro de la PWA.

- **Soporte iOS / Safari.**
  El target es Android Cubot. iOS queda fuera. Si en el futuro se quisiera,
  habría que reevaluar Web Speech API support en Safari (que es limitado).

## Datos y operaciones

- **SQL libre desde el LLM.**
  Excluido categóricamente (Principio 2 de la Constitución). Toda
  ejecución pasa por Plan JSON estructurado.

- **Operaciones DDL (DROP, CREATE, ALTER, TRUNCATE, GRANT, REVOKE).**
  Bloqueadas hardcoded en `execute-plan`. Estas operaciones se hacen
  fuera de Orion Vox (consola de Supabase, migraciones manuales).

- **Multi-statement queries.**
  Cada Plan JSON ejecuta como máximo una operación SQL. No se permite
  encadenamiento por `;`.

- **Comandos predefinidos acotados (sin texto libre).**
  Se evaluó (TWA + Custom Intents lo habría requerido) y se descartó:
  perder la capacidad de hablar libre con la base de datos elimina la
  razón de ser del proyecto.

- **Sincronización offline compleja.**
  No hay cola de operaciones offline, no hay merge de conflictos, no hay
  CRDT. Si no hay conexión, la PWA muestra error y termina ahí.

- **Producción crítica con datos sensibles.**
  Orion Vox es **exploratorio** y opera sobre el proyecto Supabase
  personal del usuario. No es para datos regulados (PII de terceros,
  PHI, PCI). Si el proyecto Supabase guardara esos datos, los
  innegociables M1 no serían suficientes y habría que rediseñar.

## Funcionalidad

- **Búsqueda semántica / RAG sobre los datos.**
  No hay embeddings, no hay vector search. Las consultas son SQL
  estructurado sobre tablas relacionales.

- **Edición de schema desde la PWA.**
  Crear/modificar tablas se hace por fuera (consola Supabase o
  migraciones). Orion Vox solo opera sobre datos.

- **Visualizaciones complejas en M1.**
  Tablas y texto. Gráficos quedan para M3.

- **Plugins / extensiones de terceros.**
  No hay arquitectura de plugins. Funcionalidad nueva entra por código
  del proyecto, no por carga dinámica.

## Operación

- **Alta disponibilidad / SLA.**
  No hay uptime garantizado, no hay alertas de disponibilidad, no hay
  multi-región. Es uso personal: si falla, se diagnostica al rato.

- **Compliance formal (SOC2, ISO 27001, GDPR como controlador).**
  No aplica al ser uso personal sobre datos propios. Sí aplican buenas
  prácticas de seguridad (auditoría, allowlist, confirmación), pero no
  el aparato formal de compliance.

---

## Cómo cambiar un non-goal

Mover algo de esta lista al alcance del proyecto **requiere**:

1. ADR explícito justificando el cambio.
2. Revisión del tribunal completo.
3. Aprobación del usuario.
4. Actualización simultánea de `CONSTITUTION.md` si toca un principio.

Ver `CHANGE-PROTOCOL.md`.
