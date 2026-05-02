---
title: Referencias externas — documentación, especificaciones y fuentes
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/OVERVIEW.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../02-architecture/THREAT-MODEL.md
  - ../03-adr/ADR-INDEX.md
  - ./CHANGELOG.md
  - ./history/RESEARCH-LOG.md
---

# Referencias externas — Orion Vox

Curaduría de documentación oficial, especificaciones, artículos de
investigación y fuentes consultadas durante el diseño del proyecto.

> **Convención**: cada link incluye URL, una línea de contexto y la fecha
> de última revisión. Las URLs marcadas como **histórico** se conservan
> por trazabilidad de decisiones descartadas; **no son guía operativa
> vigente**.

---

## Supabase

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Documentación general | `https://supabase.com/docs` | Punto de entrada de toda la documentación oficial. | 2026-05-01 |
| Edge Functions (Deno) | `https://supabase.com/docs/guides/functions` | Runtime Deno donde corren `execute-plan` y `schema-summary`. | 2026-05-01 |
| Row Level Security | `https://supabase.com/docs/guides/auth/row-level-security` | Modelo RLS — bypaseado por `service_role` en M1, estricto en M2. | 2026-05-01 |
| API keys (anon, service_role) | `https://supabase.com/docs/guides/api/api-keys` | Diferencia entre `anon` y `service_role`; el segundo NUNCA va al cliente en M2. | 2026-05-01 |
| Securing your data | `https://supabase.com/docs/guides/database/secure-data` | Guía oficial de hardening de Postgres en Supabase — base de ADR-004. | 2026-05-01 |
| MCP Server (Supabase) | `https://supabase.com/docs/guides/getting-started/mcp` | **Histórico**: referencia del MCP server de Supabase. NO se usa en producción de Orion Vox por riesgo "lethal trifecta" (ver THREAT-MODEL). | 2026-05-01 |
| pg_meta / introspección | `https://supabase.com/docs/reference/javascript/rpc` | Acceso programático al schema, base del Edge `schema-summary`. | 2026-05-01 |

---

## Gemini API (Google AI)

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Google AI Studio | `https://aistudio.google.com/` | Consola para generar API keys de Gemini, probar prompts y function calling. | 2026-05-01 |
| Function calling (Gemini) | `https://ai.google.dev/gemini-api/docs/function-calling` | Mecanismo central por el que Gemini devuelve Plan JSON estructurado. Base de ADR-003. | 2026-05-01 |
| Modelos disponibles | `https://ai.google.dev/gemini-api/docs/models/gemini` | Tabla de modelos (Flash, Pro, etc.), capacidades y context windows. | 2026-05-01 |
| Pricing | `https://ai.google.dev/pricing` | Costos por token input/output por modelo — entrada para `COST-TRACKING`. | 2026-05-01 |
| Rate limits | `https://ai.google.dev/gemini-api/docs/rate-limits` | Límites de RPM/RPD por tier — relevante para retries y backoff. | 2026-05-01 |
| JS SDK (`@google/generative-ai`) | `https://www.npmjs.com/package/@google/generative-ai` | SDK oficial JavaScript usado desde la PWA en M1 (cliente directo). | 2026-05-01 |

---

## Web Speech API

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| `SpeechRecognition` (MDN) | `https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition` | API de reconocimiento de voz usada para STT en `es-MX`. | 2026-05-01 |
| `SpeechSynthesis` (MDN) | `https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis` | API de síntesis de voz usada para TTS en `es-MX` / `es-AR`. | 2026-05-01 |
| Web Speech API (overview) | `https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API` | Documento general; incluye `SpeechGrammar` (no usado). | 2026-05-01 |
| Browser support (caniuse) | `https://caniuse.com/speech-recognition` | Estado de soporte — Chrome Android es el target real. | 2026-05-01 |
| BCP-47 language codes | `https://datatracker.ietf.org/doc/html/rfc5646` | Códigos `es-MX`, `es-AR`, `es-ES` para el campo `lang`. | 2026-05-01 |

---

## PWA (Progressive Web Apps)

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Web App Manifest | `https://web.dev/articles/add-manifest` | Estructura del `manifest.json` para sideload e icono home. | 2026-05-01 |
| Service Workers | `https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API` | Base para cache offline (deuda M2/M3, M1 mínimo). | 2026-05-01 |
| Install criteria (Chrome) | `https://web.dev/articles/install-criteria` | Requisitos para que Chrome ofrezca instalación de la PWA. | 2026-05-01 |
| MDN PWA guide | `https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps` | Guía de referencia general de PWA. | 2026-05-01 |
| `display: standalone` | `https://developer.mozilla.org/en-US/docs/Web/Manifest/display` | Modo de presentación elegido para Orion Vox (sin chrome del navegador). | 2026-05-01 |

---

## Android — Custom Intents y AppFunctions (histórico, descartado)

> Esta sección documenta los caminos investigados y **descartados**.
> Conservados por trazabilidad de las decisiones (ver ADR-002 y RESEARCH-LOG).

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Custom Intents (App Actions) | `https://developer.android.com/guide/app-actions/custom-intents` | **Histórico**. Doc oficial confirma `en-US` exclusivo y máx. 2 text params. Bloquea uso en español + sideload. | 2026-02-26 |
| App Actions (overview) | `https://developer.android.com/guide/app-actions/overview` | **Histórico**. BIIs disponibles, todos en inglés. | 2026-02-26 |
| AppFunctions | `https://developer.android.com/ai/appfunctions` | **Histórico**. Early Access Program gated, Android 16+, Pixel 10 / Galaxy S26. No accesible para Cubot KK9. | 2026-02-26 |
| TWA query parameters | `https://developer.chrome.com/docs/android/trusted-web-activity/query-parameters` | **Histórico**. Mecanismo de paso de query strings a TWA — descartado por no proveer voz de respuesta. | 2026-05-01 |
| App Actions codelab | `https://codelabs.developers.google.com/codelabs/appactions` | **Histórico**. Tutorial oficial; refuerza la limitación a inglés y Play Store. | 2026-05-01 |
| Bubblewrap (TWA wrapper) | `https://github.com/GoogleChromeLabs/bubblewrap` | **Histórico**. Generador de TWA. Confirmado: NO genera capabilities/Custom Intents automáticos. | 2026-05-01 |

---

## Seguridad — CVE, advisories y blogs

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Lethal trifecta (Simon Willison) | `https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/` | Acuñación del término "lethal trifecta": LLM + entrada usuario + acceso a datos sensibles. Marco conceptual del THREAT-MODEL. | 2026-05-01 |
| Supabase MCP advisory (Willison) | `https://simonwillison.net/2025/Jul/6/supabase-mcp-lethal-trifecta/` | Análisis de los riesgos del MCP de Supabase con LLMs. **Razón principal de NO usar Supabase MCP en Orion Vox**. | 2026-05-01 |
| Pomerium — "When AI Has Root" | `https://www.pomerium.com/blog/when-ai-has-root-the-supabase-mcp-data-leak-and-the-future-of-database-access` | Caso de fuga de datos vía Supabase MCP. Refuerza la decisión de Plan JSON server-side autoritativo. | 2026-05-01 |
| General Analysis — Supabase MCP | `https://www.generalanalysis.com/blog/supabase-mcp-blog` | Análisis técnico del vector de ataque sobre MCP + LLM agentes. | 2026-05-01 |
| OWASP LLM Top 10 (2025) | `https://owasp.org/www-project-top-10-for-large-language-model-applications/` | Marco general de riesgos de aplicaciones con LLM. | 2026-05-01 |

---

## Postgres

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| `pg_catalog` (system catalogs) | `https://www.postgresql.org/docs/current/catalogs.html` | Fuente de verdad para introspección de schema en `schema-summary`. | 2026-05-01 |
| `information_schema` | `https://www.postgresql.org/docs/current/information-schema.html` | Vista estandarizada del schema (alternativa a `pg_catalog`). | 2026-05-01 |
| Row Security Policies | `https://www.postgresql.org/docs/current/ddl-rowsecurity.html` | Documentación de RLS nativa de Postgres — base de ADR-004 M2. | 2026-05-01 |
| `GRANT` / `REVOKE` | `https://www.postgresql.org/docs/current/sql-grant.html` | Sintaxis para crear el rol `orion_vox_executor` en M2. | 2026-05-01 |
| `statement_timeout` | `https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-STATEMENT-TIMEOUT` | Parámetro forzado por sesión para limitar queries del Edge en M2. | 2026-05-01 |

---

## Tooling

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| Vite | `https://vitejs.dev/` | Candidato a bundler de la PWA (decisión final en ADR-012, M1). | 2026-05-01 |
| Vercel (deploy) | `https://vercel.com/docs` | Hosting candidato para la PWA (estática). | 2026-05-01 |
| IndexedDB (MDN) | `https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API` | Storage cliente para credenciales cifradas y espejo de auditoría. | 2026-05-01 |
| Web Crypto API | `https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API` | Cifrado AES-GCM de credenciales con clave derivada del PIN local. | 2026-05-01 |
| Zod | `https://zod.dev/` | Validación de Plan JSON server-side en `execute-plan` (autoritativa). | 2026-05-01 |
| Deno (runtime Edge) | `https://deno.com/` | Runtime de las Supabase Edge Functions. | 2026-05-01 |

---

## Estándares y plantillas

| Recurso | URL | Contexto | Revisado |
|---------|-----|----------|----------|
| JSON Schema draft 2020-12 | `https://json-schema.org/draft/2020-12/schema` | Versión usada para describir formalmente el Plan JSON v1.0. | 2026-05-01 |
| ADR (Michael Nygard) | `https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions` | Plantilla original de Architecture Decision Records — base de los 11 ADRs del proyecto. | 2026-05-01 |
| Keep a Changelog | `https://keepachangelog.com/en/1.1.0/` | Convención de formato del `CHANGELOG.md`. | 2026-05-01 |
| Semantic Versioning 2.0 | `https://semver.org/` | Esquema de versionado de la documentación y eventuales releases. | 2026-05-01 |
| RFC 7519 (JWT) | `https://datatracker.ietf.org/doc/html/rfc7519` | Estándar de los tokens emitidos por Supabase Auth (relevante a M2 con JWT del usuario). | 2026-05-01 |

---

## Política de revisión

- Toda URL de esta página debe re-validarse al menos **una vez por
  milestone** (M1, M2, M3) y al cambiar el `last-reviewed` del archivo.
- Si una URL queda **rota o desactualizada**, no se elimina: se marca con
  `[ROTA YYYY-MM-DD]` y se reemplaza por archive.org cuando aplique.
- Las URLs marcadas como **histórico** no se eliminan aunque la API/feature
  haya muerto: la trazabilidad de la decisión vale más que el ahorro de
  bytes.
