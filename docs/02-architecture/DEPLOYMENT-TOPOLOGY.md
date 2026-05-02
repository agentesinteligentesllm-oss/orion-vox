---
title: Topología de despliegue — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - SECURITY-MODEL.md
  - ../06-operations/SETUP-SUPABASE.md
  - ../06-operations/DEPLOY-PROCEDURE-PWA.md
  - ../06-operations/INSTALLATION-CUBOT.md
---

# Topología de despliegue — Orion Vox

Cómo se despliegan los componentes en infraestructura real, qué
hostings usa cada pieza, y cuáles son las fronteras de seguridad entre
nodos.

---

## 1. Diagrama topológico — M1

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   CUBOT  KINGKONG  9   (Android, Chrome 120+, hardware del usuario)      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │   PWA  Orion Vox  (instalada vía Add to Home Screen, sideload)     │  │
│  │   ────────────────────────────────────────────────────────────     │  │
│  │   - Bundle estático cacheado por Service Worker                    │  │
│  │   - Sesión Supabase Auth en localStorage (manejada por SDK)        │  │
│  │   - IndexedDB sin cifrado (no hay secretos client-side)            │  │
│  │     · stores: schema_cache, audit_mirror, settings                 │  │
│  │   - Permisos: micrófono                                            │  │
│  │                                                                    │  │
│  └─────────────────────────────────────┬──────────────────────────────┘  │
└────────────────────────────────────────┼──────────────────────────────────┘
                                         │ HTTPS (TLS 1.3)
                                         │ POST /auth/v1/* (Supabase Auth, magic link)
                                         │ POST /functions/v1/plan-intent
                                         │ POST /functions/v1/execute-plan
                                         │ Authorization: Bearer <supabase_jwt>
                                         ▼
                                   ┌──────────────────────────────────────────────┐
                                   │                                              │
                                   │   SUPABASE  CLOUD                            │
                                   │   (region elegida por usuario,               │
                                   │    típicamente AWS us-east-1)                │
                                   │                                              │
                                   │  ┌────────────────────────────────────────┐  │
                                   │  │ Supabase Auth (GoTrue)                 │  │
                                   │  │ - magic link / OTP por email           │  │
                                   │  │ - emite JWT (access + refresh)         │  │
                                   │  └────────────────────────────────────────┘  │
                                   │                                              │
                                   │  ┌────────────────────────────────────────┐  │
                                   │  │ Edge Functions (Deno V8 isolates)      │  │
                                   │  │  ┌───────────────┐                     │  │
                                   │  │  │ plan-intent   │── HTTPS ──▶ Gemini  │  │
                                   │  │  │ (env:         │             API     │  │
                                   │  │  │  GEMINI_KEY)  │                     │  │
                                   │  │  └──────┬────────┘                     │  │
                                   │  │         │ invocación interna           │  │
                                   │  │         ▼                              │  │
                                   │  │  ┌───────────────┐                     │  │
                                   │  │  │schema-summary │                     │  │
                                   │  │  └───────────────┘                     │  │
                                   │  │  ┌───────────────┐                     │  │
                                   │  │  │ execute-plan  │                     │  │
                                   │  │  │ (env:         │                     │  │
                                   │  │  │  service_role,│                     │  │
                                   │  │  │  ORION_*)     │                     │  │
                                   │  │  └──────┬────────┘                     │  │
                                   │  └─────────┼──────────────────────────────┘  │
                                   │            │ TCP/TLS (intra-VPC)             │
                                   │            ▼                                  │
                                   │  ┌────────────────────────────────────────┐  │
                                   │  │ Postgres                                │  │
                                   │  │ - tablas del usuario                    │  │
                                   │  │ - orion_audit                           │  │
                                   │  │ - extensión pgcrypto                    │  │
                                   │  │ rol exec: service_role (M1) / executor M2│  │
                                   │  └────────────────────────────────────────┘  │
                                   └──────────────────────────────────────────────┘

                                   ┌──────────────────────────────────────────────┐
                                   │                                              │
                                   │   Google AI / Gemini API                     │
                                   │   - Endpoint: generativelanguage.googleapis.com
                                   │   - Modelo M1: gemini-2.5-flash              │
                                   │   - Auth: x-goog-api-key (env de Edge        │
                                   │     plan-intent — NUNCA en cliente)          │
                                   │                                              │
                                   └──────────────────────────────────────────────┘

         ┌──────────────────────────────────────────────────────┐
         │                                                      │
         │   HOSTING ESTÁTICO  (Vercel / Netlify / CF Pages)    │
         │                                                      │
         │   - Bundle PWA: HTML, JS, CSS, manifest, SW          │
         │   - HTTPS automático (Let's Encrypt)                 │
         │   - CDN edge global                                  │
         │   - Free tier suficiente (single user)               │
         │                                                      │
         │   ◀───── Cubot baja el bundle de acá la 1ra vez ────│
         │         (después: Service Worker cache-first)        │
         │                                                      │
         └──────────────────────────────────────────────────────┘
```

---

## 2. Componentes por nodo

### 2.1 Cubot KingKong 9

| Componente               | Detalle                                              |
|--------------------------|------------------------------------------------------|
| OS                       | Android (versión que el Cubot KK9 trae de fábrica)   |
| Navegador                | Chrome (Chromium) Android                            |
| Voz STT                  | Web Speech API (Google bajo el capó)                 |
| Voz TTS                  | Web Speech Synthesis API                             |
| Storage                  | IndexedDB sin cifrado (no hay secretos client-side); sesión Supabase Auth en `localStorage` (manejada por SDK) |
| Atajo de invocación      | "OK Google, abrí Orion Vox" (asistente nativo Gemini) |
| Permisos requeridos      | Micrófono                                            |
| Conectividad             | 4G / WiFi (online obligatorio para Supabase Auth + Edge Functions) |

**Estado de la PWA en el dispositivo.**

- Service Worker registrado, estrategia cache-first para assets,
  network-first para llamadas a Edge.
- IndexedDB persistente (sobrevive a reinicios, no a `clear data`).
- Sin notificaciones push (M1; M2 puede evaluar).
- Sin background sync (no hace falta, todo es interactivo).

### 2.2 Hosting estático (PWA)

| Aspecto                  | Detalle                                              |
|--------------------------|------------------------------------------------------|
| Recomendado M1           | **Vercel** (DX simple, CLI, deploy automático)       |
| Alternativas             | Netlify, Cloudflare Pages, GitHub Pages              |
| Tipo                     | Sitio estático (HTML/JS/CSS, sin SSR)                |
| HTTPS                    | Automático (Let's Encrypt o cert del proveedor)      |
| CDN                      | Edge global (latencia < 100ms desde LATAM)           |
| Costo                    | $0 (free tier cubre easy single user)                |
| Dominio                  | M1: subdomain del proveedor (ej: `orion-vox.vercel.app`) |
|                          | M2 opcional: dominio propio                          |
| Auth para deploy         | Token CLI del usuario                                |

**Por qué hosting estático (no servidor).**

- La PWA no necesita backend propio: todo va a Edge Functions de
  Supabase.
- Más barato, más simple, menos superficie de ataque.
- Compatible con cualquier framework PWA (Svelte, SolidJS, vanilla;
  decisión en ADR-012).

### 2.3 Supabase Cloud

| Componente               | Detalle                                              |
|--------------------------|------------------------------------------------------|
| Plan                     | Free tier M1 (suficiente single user)                |
| Region                   | Elegida por el usuario, recomendado el más cercano   |
| Postgres                 | v15+ (lo que provea Supabase al momento)             |
| Edge Functions runtime   | Deno (V8 isolates compartidos, cold start ~100ms)    |
| Connection pool          | PgBouncer (managed por Supabase)                     |
| Storage                  | NO se usa en M1 (PWA no maneja archivos)             |
| Auth                     | **SÍ desde M1** — Supabase Auth (GoTrue) emite JWT al usuario único autorizado vía magic link. La Edge valida `user.id == ORION_ALLOWED_USER_ID`. |
| Realtime                 | NO se usa en M1                                      |

**Recursos en Supabase.**

- **3 Edge Functions**: `plan-intent` (custodia Gemini API key y hace
  function calling server-side), `execute-plan` (valida y ejecuta Plan
  JSON contra Postgres), `schema-summary` (genera el resumen del schema
  filtrado por allowlist; invocada internamente por `plan-intent`).
- **Variables de entorno por Edge** (configuradas en dashboard):
  `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORION_ALLOWED_USER_ID`,
  `ORION_ALLOWED_TABLES`, `ORION_REDACTED_COLUMNS`.
- 1 tabla creada por Orion Vox: `orion_audit` + sus índices.
- N tablas del usuario (las que ya tenga o que cree fuera de Orion
  Vox), filtradas server-side por `ORION_ALLOWED_TABLES`.
- Extensión `pgcrypto` habilitada (para `gen_random_uuid`).

### 2.4 Google AI / Gemini API

| Aspecto                  | Detalle                                              |
|--------------------------|------------------------------------------------------|
| Servicio                 | Google AI (Gemini API)                               |
| Endpoint                 | `https://generativelanguage.googleapis.com`          |
| Modelo M1                | `gemini-2.5-flash`                                   |
| Auth                     | API key del usuario, **almacenada en env var de la Edge `plan-intent`** (`GEMINI_API_KEY`). NUNCA en cliente. |
| Quota free tier (2026)   | ~1500 RPD para Flash                                 |
| Costo M1                 | $0 (uso personal cabe en free tier)                  |
| Latencia típica          | 1-3s por request                                     |
| Quien la invoca          | **Sólo** la Edge Function `plan-intent`              |

---

## 3. Fronteras de seguridad

| Frontera                                  | Protocolo  | Auth                                            | TLS    |
|-------------------------------------------|------------|-------------------------------------------------|--------|
| Hosting → Cubot (descarga inicial bundle) | HTTPS      | Pública                                         | TLS 1.3 |
| Cubot ↔ Service Worker (intra-device)     | local      | N/A                                             | N/A    |
| Cubot → Supabase Auth                     | HTTPS      | Pública (magic link) / `refresh_token`          | TLS 1.3 |
| Cubot → Supabase Edge (`plan-intent`, `execute-plan`) | HTTPS | Header `Authorization: Bearer <supabase_jwt>` (M1 y M2) | TLS 1.3 |
| Edge `plan-intent` → Gemini API           | HTTPS      | Header `x-goog-api-key` (env var Edge)          | TLS 1.3 |
| Edge `plan-intent` → Edge `schema-summary`| invocación interna | `service_role` env (intra-Supabase)     | TLS    |
| Edge → Postgres (intra-Supabase)          | TCP/TLS    | `service_role` env (M1) / `orion_vox_executor` M2 | TLS  |
| Cubot → IndexedDB (intra-device)          | local      | N/A (sin secretos almacenados)                  | N/A    |

**Observaciones críticas.**

- **Toda comunicación cross-network es HTTPS sin excepción.** El Cubot
  KK9 no acepta `http:` plano para PWAs (browser requirement).
- **Sin CDN entre PWA y Edge**: las llamadas van directo, no hay
  proxy/CDN intermedio que vea payloads.
- **`service_role` y `GEMINI_API_KEY` jamás viajan al cliente.** Viven
  en variables de entorno de las Edge Functions (`Deno.env`),
  configuradas en el dashboard de Supabase. El cliente sólo presenta
  `Bearer <supabase_jwt>` (token de sesión rotado por el SDK).
- La Edge `plan-intent` es el único componente que puede invocar a
  Gemini. Si la API key se compromete, se rota en una sola variable
  de entorno y no requiere actualizar el bundle PWA.

---

## 4. Topología M1 vs M2

### 4.1 M1 (este documento — post reforma de seguridad Wave 1)

```
Cubot ──▶ Supabase Auth (magic link / refresh)
       ──▶ Supabase Edge ──┬──▶ plan-intent ──▶ Gemini API (env key)
                           │                  └─▶ schema-summary (interna)
                           └──▶ execute-plan ──▶ Postgres (service_role env)
```

- **1 solo destino externo desde el Cubot**: Supabase Cloud (Auth +
  Edges). El Cubot NO conoce ni Gemini ni el `service_role` de
  Postgres.
- Cubot autentica con **JWT de Supabase Auth** (magic link en alta;
  refresh automático por el SDK).
- `GEMINI_API_KEY` y `service_role` viven en **env vars** de las Edge
  Functions. Si se comprometen, se rotan en el dashboard sin tocar el
  cliente.
- **Allowlists server-side** (`ORION_ALLOWED_USER_ID`,
  `ORION_ALLOWED_TABLES`) y **redacción** (`ORION_REDACTED_COLUMNS`)
  son env vars desde el día 1.

### 4.2 M2 (hardening incremental)

```
Cubot ──▶ Supabase Auth (igual que M1)
       ──▶ Supabase Edge ──┬──▶ plan-intent (igual)
                           └──▶ execute-plan ──▶ Postgres (orion_vox_executor)
```

- Mismo modelo de auth y mismo aislamiento de secretos que M1.
- **Cambio principal**: el rol Postgres pasa de `service_role` (todo
  poder) a `orion_vox_executor` (rol dedicado con `GRANT` mínimo a
  tablas allowlisted). RLS estricta sobre `orion_audit`.
- M2 también introduce UI admin para gestionar
  `ORION_ALLOWED_TABLES` con audit, en vez de editar la env var a mano.

---

## 5. Hostings — comparación rápida

| Proveedor          | DX  | Free tier        | Edge global | HTTPS auto | Recomendación |
|--------------------|-----|------------------|-------------|------------|---------------|
| **Vercel**         | ⭐⭐⭐ | Generoso         | Sí          | Sí         | **Recomendado M1** |
| Netlify            | ⭐⭐⭐ | Generoso         | Sí          | Sí         | Excelente alternativa |
| Cloudflare Pages   | ⭐⭐  | Muy generoso     | Sí (best CDN) | Sí        | Si el usuario ya usa Cloudflare |
| GitHub Pages       | ⭐⭐  | Ilimitado        | Sí          | Sí         | OK pero menos features (sin redirects custom fáciles) |
| Auto-hosted        | ⭐   | Tu costo         | Depende     | Manual     | Innecesario para single user |

Decisión recomendada: **Vercel** por DX y CLI fluida. La PWA es
agnóstica al hosting; cambiar es trivial (solo `vercel deploy` vs
`netlify deploy`).

---

## 6. Costos de la topología

Estimación M1 con uso personal típico (5-20 invocaciones/día,
mostly reads):

| Componente               | Plan      | Costo mensual |
|--------------------------|-----------|---------------|
| Hosting PWA (Vercel)     | Free      | $0            |
| Supabase                 | Free      | $0            |
| Gemini API               | Free tier | $0            |
| Dominio (opcional)       | -         | $0 - $15/año  |
| **Total**                |           | **$0/mes**    |

Detalle completo: ver `COST-MODEL.md`.

---

## 7. Disponibilidad y SLA

**M1 — sin SLA propio.** La disponibilidad depende de:

- Vercel free tier: 99.99% típico (sin compromiso contractual).
- Supabase free tier: best effort, sin SLA garantizado.
- Gemini API: 99.9% típico (sin SLA garantizado en free tier).
- Conectividad del Cubot: depende del usuario.

Para single user, esto es **suficiente**. Si Orion Vox cae unas horas,
el usuario espera.

**Para producción / M2+** con datos críticos, considerar:

- Supabase Pro ($25/mes) con SLA y backups automáticos diarios.
- Gemini paid tier con SLA.
- Hosting con SLA contractual.

---

## 8. Recovery topology

Si el Cubot se pierde, se rompe o se resetea:

```
Nuevo dispositivo
       │
       ▼
Bajar PWA del hosting estático       ← (URL pública)
       │
       ▼
Login Supabase Auth con email autorizado
       │  - Recibir magic link en el email
       │  - Tappear el link → sesión nueva en el dispositivo
       │  - El SDK persiste el JWT en localStorage
       ▼
Refrescar schema desde Edge schema-summary
       │
       ▼
Listo. orion_audit en Postgres preserva todo el historial.
```

El estado **importante** vive en Supabase (Postgres + env vars de las
Edge Functions). Lo que vive en el Cubot (`audit_mirror`,
`schema_cache`, `settings`) es:

- `audit_mirror`: regenerable desde `orion_audit` server.
- `schema_cache`: regenerable desde `schema-summary`.
- `settings`: preferencias UX (rate TTS, etc.); valores por defecto si
  se pierden.

**No hay secretos a recuperar en el cliente**: ni `service_role` ni
`GEMINI_API_KEY` viven en el Cubot. Si el dispositivo se pierde, el
único acceso recuperable es la sesión Supabase Auth, que se obtiene de
nuevo por magic link al email autorizado.

Detalle de recovery: ver `BACKUP-RECOVERY.md`.

---

## 9. Versionado de despliegues

- **PWA**: cada deploy a Vercel queda en historial; rollback con un
  comando (`vercel rollback`).
- **Edge Functions**: cada `supabase functions deploy` reemplaza la
  versión anterior; sin rollback automático. Mitigación: tags en git +
  re-deploy de versión anterior si hace falta.
- **DB schema**: migrations versionadas en `supabase/migrations/` (M1
  manual; M2 con Supabase CLI más estricto).

---

## 10. Roadmap

- **M1** (este documento, post reforma de seguridad Wave 1): 3 Edge
  Functions (`plan-intent`, `execute-plan`, `schema-summary`),
  Supabase Auth con magic link, `GEMINI_API_KEY` y `service_role` solo
  server-side, allowlists y redacción por env vars.
- **M2**: rol Postgres dedicado `orion_vox_executor` reemplaza
  `service_role` en `execute-plan`. RLS estricta sobre `orion_audit`.
  UI admin para `ORION_ALLOWED_TABLES` con audit (en vez de editar env
  var manualmente).
- **M3**: evaluar self-hosting de Supabase (irrelevante para single
  user; relevante si Orion Vox se generaliza). Evaluar dominio propio
  para PWA.
