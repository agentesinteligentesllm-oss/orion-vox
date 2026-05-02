---
title: Credentials Storage — sesión Supabase Auth + cache local no sensible
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-auth-flow.md
  - ./spec-config-ui.md
  - ./spec-plan-intent-edge.md
  - ./spec-execute-plan-edge.md
  - ./spec-error-handling.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../02-architecture/COMPONENTS.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
  - ../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md
---

# Spec — Credentials Storage

## 1. Propósito

Definir **qué se guarda y qué NO se guarda** en el almacenamiento local
de la PWA tras la reforma de seguridad de M1. Tras esta reforma, **el
cliente ya no custodia secretos**: la Gemini API key vive en
`plan-intent` (env var server-side), el `service_role` vive en las Edge
Functions (env var server-side), y la única autenticación es la sesión
Supabase Auth manejada por `@supabase/supabase-js`.

Este spec documenta:

1. La **sesión Supabase Auth** (manejada por el SDK; no es un secreto
   propio de Orion Vox).
2. Los **datos no sensibles** que la PWA cachea (schema, audit mirror,
   settings).

## 2. Alcance

**Cubre:**

- Layout de stores en IndexedDB para datos no sensibles.
- Política de persistencia de la sesión Supabase Auth (delegada al SDK).
- Borrado total al hacer logout.

**NO cubre:**

- Credenciales sensibles (Gemini key, service_role): ya **no existen
  en cliente**. Ver `spec-plan-intent-edge.md` y `spec-execute-plan-edge.md`.
- Login flow (`spec-auth-flow.md`).
- UI de configuración (`spec-config-ui.md`).

## 3. Lo que el cliente NO almacena (innegociable)

| Item                          | Dónde vive                                      |
|-------------------------------|-------------------------------------------------|
| `GEMINI_API_KEY`              | Env var de la Edge Function `plan-intent`.      |
| `SUPABASE_SERVICE_ROLE_KEY`   | Env var de las Edge Functions Supabase.         |
| `ORION_ALLOWED_USER_ID`       | Env var server-side.                            |
| `ORION_ALLOWED_TABLES`        | Env var server-side.                            |
| `ORION_REDACTED_COLUMNS`      | Env var server-side.                            |

La PWA **nunca** ve, recibe ni envía estos valores. Si alguno aparece
en el bundle compilado o en una request saliente, es un bug de seguridad
de severidad alta.

## 4. Lo que el cliente sí almacena

### 4.1 Sesión Supabase Auth (delegada al SDK)

`@supabase/supabase-js` v2 persiste la sesión por default en
`localStorage` bajo la clave `sb-<project-ref>-auth-token`. Contiene:

- `access_token` (JWT, expira en ~1h)
- `refresh_token` (rota; expira en ~30 días)
- `expires_at`
- `user` (perfil mínimo: id, email)

**Decisiones M1:**

- Se acepta el storage default del SDK (`localStorage`). Es legible por
  cualquier código same-origin, pero la PWA no carga código de terceros
  ni renderiza contenido externo, así que el vector XSS es bajo.
- M2 puede mover el storage a uno custom (IndexedDB encrypted o cookies
  httpOnly) si el modelo de amenaza lo requiere.

La PWA **no** maneja manualmente `access_token` / `refresh_token`: el
SDK lo hace.

### 4.2 IndexedDB — datos no sensibles

Database name: `orion_vox_v1`. Stores (sin cifrado):

| Store           | Key             | Value (forma)                                      |
|-----------------|-----------------|----------------------------------------------------|
| `schema_cache`  | `string`        | `{ markdown, schema_hash, generated_at, ttl_seconds }` |
| `audit_mirror`  | `string` (UUID) | `{ ts, user_prompt, plan_json, error, ... }`       |
| `settings`      | `string`        | `{ value: any }`                                   |

**Notas:**

- `schema_cache` mantiene el último `schema-summary` recibido para
  ahorrar round-trip cuando es válido (TTL default 24h).
- `audit_mirror` mantiene los últimos N (default 200) registros de
  `orion_audit` para acceso offline. La fuente de verdad sigue siendo
  server-side; este mirror es conveniencia.
- `settings` mantiene preferencias UX (voz TTS, idioma, toggles
  client-side de seguridad como "modo solo lectura").

**Sin cifrado**: nada acá es secreto. El schema-summary es información
del propio proyecto del director (no PII de terceros), el audit mirror
es histórico de las propias acciones del director, settings son
preferencias.

Si en el futuro alguno de estos stores empezara a contener datos
sensibles (ej: copia local de filas con PII), se necesita un nuevo
spec y posiblemente cifrado en reposo.

## 5. Interfaces / API / Contratos

### 5.1 API expuesta a la app

```ts
interface LocalStorageAPI {
  // Schema cache
  getSchemaCache(): Promise<SchemaCacheEntry | null>;
  putSchemaCache(entry: SchemaCacheEntry): Promise<void>;
  clearSchemaCache(): Promise<void>;

  // Audit mirror
  appendAuditMirror(entry: AuditMirrorEntry): Promise<void>;
  listAuditMirror(opts?: { limit?: number; since?: string }): Promise<AuditMirrorEntry[]>;
  clearAuditMirror(): Promise<void>;

  // Settings
  getSetting<T>(key: string): Promise<T | null>;
  putSetting<T>(key: string, value: T): Promise<void>;
  deleteSetting(key: string): Promise<void>;

  // Wipe total (logout)
  wipeAll(): Promise<void>;
}
```

### 5.2 `wipeAll` — borrado total al logout

```ts
async function wipeAll() {
  await deleteIndexedDB('orion_vox_v1');
  // La sesión Supabase Auth se limpia con supabase.auth.signOut()
  // en el flujo de logout (ver spec-auth-flow §5.4).
}

function deleteIndexedDB(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

> **Nota implementación:** `indexedDB.deleteDatabase()` retorna `IDBOpenDBRequest` (callback-based),
> **NO** una `Promise`. Hacer `await indexedDB.deleteDatabase(...)` directamente resuelve el request
> sin esperar su completion. El wrapper `deleteIndexedDB` es obligatorio para `await` semántico correcto.

## 6. Comportamiento esperado

### 6.1 Primera ejecución

1. PWA arranca → `supabase.auth.getSession()` → null.
2. Redirige a pantalla de login (ver `spec-auth-flow.md`).
3. Tras login exitoso, IndexedDB sigue vacío (sin schema_cache ni
   audit_mirror todavía).
4. Primera llamada a `plan-intent` traerá schema-summary fresco vía
   server; PWA lo cachea.

### 6.2 Sesión normal

1. SDK Supabase recupera sesión persistida.
2. PWA lee `schema_cache` para evitar round-trip si TTL no expiró.
3. PWA lee/escribe `audit_mirror` para vista offline de últimas
   ejecuciones.

### 6.3 Logout

Ver `spec-auth-flow.md §5.4`. Pasos:

1. `await supabase.auth.signOut()` (limpia `localStorage`).
2. `await wipeAll()` (limpia IndexedDB).
3. Vuelta a login.

## 7. Estados / lifecycle

```
[no logueado] ──login Supabase──▶ [logueado, IndexedDB vacío]
                                          │
                                          ▼
                                    [uso normal: cache schema + mirror audit]
                                          │
                                          ▼
                                    [logout] ──▶ [no logueado, IndexedDB vacío]
```

## 8. Errores y manejo

| Caso                              | Comportamiento                                                |
|-----------------------------------|---------------------------------------------------------------|
| IndexedDB no disponible           | PWA degrada: sin cache schema (cada call al server), sin     |
|                                   | mirror audit (sólo server). No bloquea uso.                   |
| Quota IndexedDB excedida          | Truncar `audit_mirror` a últimas 50 entradas y reintentar.    |
| Sesión Supabase corrupta          | Forzar logout + reset (vuelve a pantalla de login).           |

## 9. Restricciones M1

- **No se cifra nada client-side** porque ya **no hay secretos** que
  cifrar. La reforma de seguridad eliminó la necesidad.
- **Sesión Supabase en `localStorage`** (default SDK). Aceptable bajo
  el modelo de amenaza single-user con dispositivo personal y sin
  contenido de terceros.
- **Audit mirror sin paginación server-driven**: la PWA pide los
  últimos N por timestamp directo a `orion_audit`. Aceptable para
  M1 single-user.
- **Sin sync entre dispositivos**: cada device tiene su propio mirror
  cache. Single user típicamente usa un solo Cubot.

## 10. Criterios de aceptación verificables

- [ ] El bundle compilado de la PWA **no contiene** las strings:
      `service_role`, `SERVICE_ROLE`, `GEMINI_API_KEY`,
      `gemini_api_key`, `AIza` (prefijo de keys Google), ni ningún
      string que matchee un service_role JWT.
- [ ] No existen stores `secrets` ni `meta` en IndexedDB
      `orion_vox_v1` (verificable con DevTools → Application →
      IndexedDB).
- [ ] Tras login exitoso, `localStorage['sb-<ref>-auth-token']`
      contiene la sesión y se renueva automáticamente.
- [ ] `wipeAll()` deja la base `orion_vox_v1` borrada (verificable con
      `indexedDB.databases()`).
- [ ] `signOut()` limpia `localStorage['sb-<ref>-auth-token']`.
- [ ] `schema_cache` respeta el `ttl_seconds` y dispara refresh cuando
      vence.
- [ ] `audit_mirror` no excede el tamaño configurado (default 200
      entradas).
- [ ] Toda call saliente desde la PWA usa el header
      `Authorization: Bearer <SUPABASE_AUTH_JWT>` y nunca un
      service_role.

## 11. Dependencias

- `@supabase/supabase-js` v2 (sesión Auth).
- IndexedDB (cache schema + mirror audit + settings).
- `localStorage` (delegado al SDK Supabase para sesión).

## 12. Referencias

- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2)
- `../02-architecture/COMPONENTS.md` §8
- `./spec-auth-flow.md`
- `./spec-plan-intent-edge.md` (custodia Gemini key)
- `./spec-execute-plan-edge.md` (custodia service_role)
- `../03-adr/ADR-005-gemini-key-client-m1-server-m2.md`
- `../03-adr/ADR-004-service-role-m1-dedicated-role-m2.md`
