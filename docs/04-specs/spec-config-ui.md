---
title: Config UI — pantallas de configuración inicial y corriente
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-pwa-shell.md
  - ./spec-credentials-storage.md
  - ./spec-schema-summary-edge.md
  - ./spec-confirmation-flow.md
  - ./spec-error-handling.md
  - ../02-architecture/SECURITY-MODEL.md
---

# Spec — Config UI

## 1. Propósito

Concentrar todo lo que el usuario necesita configurar para que Orion
Vox funcione: login Supabase Auth (magic link), idioma de voz, schema
gestionado y toggles de seguridad. Tres pantallas: setup inicial,
configuración corriente, editor de schema.

> **Importante (reforma seguridad M1):** la PWA **ya no pide** ni
> `service_role`, ni Gemini API key, ni `anon_key`. Esos secretos viven
> server-side en env vars de las Edge Functions. La única "credencial"
> que el director ingresa es su email para Supabase Auth. Ver
> `spec-auth-flow.md` y `spec-credentials-storage.md`.

## 2. Alcance

**Cubre:**

- Pantalla 1: Setup inicial (primera ejecución → login con magic link).
- Pantalla 2: Configuración corriente (acceso desde shortcut "Config").
- Pantalla 3: Editor del schema-summary (sólo hints, exclusiones se
  controlan server-side via `ORION_ALLOWED_TABLES`).
- Toggles globales de comportamiento.
- Validación de la sesión (probar conexión llamando a las Edge).
- Logout (limpia sesión Supabase + IndexedDB local).

**NO cubre:**

- Almacenamiento local físico → `spec-credentials-storage.md`.
- Login flow detallado → `spec-auth-flow.md`.
- Generación del schema-summary → `spec-schema-summary-edge.md`.
- Modal de confirmación → `spec-confirmation-flow.md`.

## 3. Interfaces / API / Contratos

### 3.1 Pantalla 1 — Setup inicial

Disparada cuando el usuario abre la PWA por primera vez (o tras logout
total). Bloquea cualquier otro flujo hasta completarse.

Campos:

| Campo                       | Tipo            | Validación                                        | Storage         |
|-----------------------------|-----------------|---------------------------------------------------|-----------------|
| Email del director          | email           | Regex email válido                                | usado para magic link, no se persiste por separado |
| Idioma de voz STT/TTS       | select          | enum `es-MX` (default) | `es-AR` | `es-ES`         | settings        |

Pasos secuenciales (wizard):

1. Bienvenida + descripción rápida ("Orion Vox es tu puente de voz a
   tu propia base Supabase. Vamos a iniciar sesión.")
2. Email del director.
3. Botón "Enviar enlace de acceso" → `supabase.auth.signInWithOtp({ email })`.
4. UI espera el callback: "Te mandamos un mail. Tap el link para
   continuar." (Si el director ya tiene la PWA abierta y el mail en
   el mismo Cubot, el link la reabre con el token.)
5. Tras callback Supabase Auth, sesión queda persistida por el SDK.
6. Idioma de voz (se guarda en `settings`).
7. Listo: redirect a `/?mode=voice`.

**Nota operativa fuera de la PWA (una sola vez):** después del primer
login, el director copia su `user.id` desde Supabase dashboard →
Authentication → Users y lo configura como env var
`ORION_ALLOWED_USER_ID` en las Edge Functions. Hasta que esto no se
haga, todas las llamadas a Edge devuelven 403 `forbidden_user`. Ver
`spec-auth-flow.md §5.1`.

### 3.2 Pantalla 2 — Configuración corriente

Acceso vía shortcut "Configuración" del manifest, o desde un menú
hamburger en `mode=voice`.

Secciones:

#### Sesión
- Mostrar email del director y `user.id` (formato corto, e.g.
  `f3a2…9b1c`).
- CTA "Cerrar sesión" → `supabase.auth.signOut()` + `wipeAll()`
  IndexedDB. Vuelve al wizard.
- CTA "Probar conexión" → ping a `plan-intent` con un prompt trivial
  ("ping") y espera 200 / `kind: 'plan'` o `kind: 'clarification'`.
  Sirve para verificar que la sesión es válida y que la Edge responde.

#### Idioma de voz
- Select `es-MX | es-AR | es-ES`.
- Preview button: ejecuta TTS de "Hola, soy Orion" en el idioma elegido.

#### Toggles de seguridad

| Toggle                        | Default | Efecto                                                                |
|-------------------------------|---------|-----------------------------------------------------------------------|
| **Modo solo lectura**         | off     | Bloquea cliente-side cualquier Plan JSON con `operation != 'select'`. La Edge lo rechazaría también si se respeta server-side; este toggle es feedback rápido. |
| **Modo dry_run global**       | off     | Cualquier Plan JSON envía con `dry_run: true`. Útil para entrenar sin tocar datos. |
| **Doble confirmación para DELETE** | on  | El modal de confirmación pide confirmar dos veces para `delete`.      |
| **Doble confirmación para UPDATE sin filtros estrictos** | on | Idem si update afecta > 100 filas estimadas. |

Estos toggles viven en `settings` store (sin cifrar; no son secretos).

#### Schema
- Botón "Refrescar schema" → llama a `schema-summary` Edge, actualiza cache.
- Mostrar `schema_hash` y `generated_at` actuales.
- Mostrar lista (read-only) de tablas devueltas por `schema-summary`
  con leyenda: "Tablas autorizadas server-side via
  `ORION_ALLOWED_TABLES`. Para cambiar la lista, editá la env var en
  Supabase Edge Function settings."
- CTA "Editar hints semánticos" → abre Pantalla 3.

#### Auditoría
- M1: link a Supabase dashboard (URL precomputada del proyecto).
- M2: UI nativa (otra spec, fuera de M1).

#### Zona peligrosa
- "Cerrar sesión y borrar caché local" → `supabase.auth.signOut()` +
  `wipeAll()` IndexedDB. Vuelve al wizard. Doble confirmación.

  No hay "cambiar PIN" porque ya **no hay credenciales locales que
  cifrar**. La sesión Supabase Auth es el único token y se rota sola.

### 3.3 Pantalla 3 — Editor de hints del schema-summary

**Propósito**: agregar hints semánticos al schema. **Las exclusiones de
tablas YA NO se editan desde la PWA** — viven en la env var
`ORION_ALLOWED_TABLES` (server-side). Esto es deliberado: un cliente
comprometido no puede ampliar el alcance de Gemini sobre la base.

Componentes:

- **Visualización del markdown autogenerado** (read-only render). La
  PWA lo recibe del Edge `schema-summary`.
- **Lista de tablas** (read-only) — sin checkboxes. Si el director
  quiere ocultar una tabla, edita `ORION_ALLOWED_TABLES` en Supabase
  dashboard.
- **Hints por tabla** (text area opcional): texto libre que se envía
  como campo `hints` en el body de `plan-intent`. Ej: `Hint: usar
  'estado' = 'activa' por defecto cuando no se especifique`.
- **Preview** del markdown final con hints anexados (informativo —
  el server arma el prompt definitivo).
- **Botón "Guardar"** → guarda hints en `settings` (IndexedDB, no
  cifrado). Próxima llamada a `plan-intent` los manda en el body.

### 3.4 Validación de la sesión y la cadena server

La PWA **no** prueba Supabase ni Gemini por separado: prueba la cadena
end-to-end llamando a `plan-intent` con un prompt trivial. Si la
cadena está sana, la respuesta llega.

```
POST ${SUPABASE_URL}/functions/v1/plan-intent
Headers: Authorization: Bearer ${supabase_jwt}
Body: { user_prompt: 'ping', client_version: '0.x.y' }
→ 200 con kind='plan' o kind='clarification' → todo OK
→ 401 invalid_token → re-login
→ 403 forbidden_user → ORION_ALLOWED_USER_ID mal configurado
→ 500 schema_summary_failed → revisar conexión a Postgres / env vars
→ 502/504 gemini_* → Gemini caído o sin cuota
```

Esta validación cubre auth + Edge + schema-summary + Gemini en una sola
call. Si falla, el código de error indica qué pieza investigar.

## 4. Comportamiento esperado

### 4.1 Golden path setup inicial

1. Usuario instala PWA → primera carga detecta sesión Supabase ausente.
2. Redirect forzado a `/?mode=config&first=true`.
3. Wizard pide email + idioma → `signInWithOtp`.
4. Director abre el magic link en el Cubot → callback Supabase.
5. PWA recibe sesión → guarda `idioma` en `settings`.
6. Redirect a `/?mode=voice`.

### 4.2 Cierre de sesión

1. Usuario tap "Cerrar sesión y borrar caché local" en Pantalla 2.
2. Doble confirmación con texto explícito ("Esto cierra sesión y borra
   el caché local de schema y auditoría. ¿Seguro?").
3. `await supabase.auth.signOut()` + `await wipeAll()`.
4. Redirect al wizard.

## 5. Estados / lifecycle

```
[primera carga] ──sesión Supabase ausente──▶ [setup wizard / login]
                                                    │
                                                    ▼
                                              [/?mode=voice]
                                                    │
                                  ┌─────────────────┴─────────────┐
                                  ▼                               ▼
                          [/?mode=voice uso]               [shortcut Config]
                                                                  │
                                                                  ▼
                                                       [Pantalla 2 corriente]
                                                                  │
                                                  ┌───────────────┼──────────────┐
                                                  ▼               ▼              ▼
                                              [hints]      [refresh schema]  [logout + wipe]
                                                                                  │
                                                                                  ▼
                                                                          [setup wizard]
```

## 6. Errores y manejo

| Situación                                       | Comportamiento                                                       |
|-------------------------------------------------|----------------------------------------------------------------------|
| Magic link no llega                             | "No te llegó el mail? Revisá spam o pedí otro link."                 |
| Magic link expirado                             | "El link expiró. Pedí uno nuevo."                                    |
| Probar conexión devuelve 401 `invalid_token`    | Forzar logout y mostrar wizard de login.                             |
| Probar conexión devuelve 403 `forbidden_user`   | "Tu cuenta no está autorizada. Configurá `ORION_ALLOWED_USER_ID` en las Edge Functions." |
| Probar conexión devuelve 502/504 `gemini_*`     | "Gemini no responde. Probá más tarde."                               |
| Schema-summary Edge no responde                 | "No pude refrescar el schema. Probá de nuevo o revisá la Edge."      |
| Wipe falla parcialmente                         | Reintento + mensaje "El borrado quedó incompleto, repetilo."         |

## 7. Restricciones M1

- **Sin import/export de configuración.** Settings son livianos
  (idioma + hints) y rehacerlos es trivial.
- **Sin gestión de PIN ni biometría client-side.** Ya no hay secretos
  locales que cifrar; la sesión Supabase es el único token y lo rota
  el SDK. M2 puede agregar PIN/biometría como capa de UX adicional al
  uso (no a credenciales).
- **Sin edición de allowlist desde la PWA.** Es deliberado: server-side
  via env var. Cambios requieren acceso al dashboard Supabase.
- **Idioma fijo es-XX.** Sin otros idiomas en M1.
- **Editor de hints no valida sintaxis** — texto libre.
- **Sin historial de cambios de configuración.** Cada save
  sobreescribe.

## 8. Criterios de aceptación verificables

- [ ] Primera carga sin sesión Supabase redirige al wizard de login.
- [ ] Wizard completa email + idioma y termina con sesión Supabase
      válida.
- [ ] "Probar conexión" llama a `plan-intent` y refleja el código de
      respuesta (200 / 401 / 403 / 5xx) con el mensaje user-facing
      correcto.
- [ ] Toggle "Modo solo lectura" bloquea client-side un Plan con
      `operation: 'delete'` antes de enviar a Edge.
- [ ] Toggle "dry_run global" inyecta `dry_run: true` en cada Plan.
- [ ] Editor de hints guarda en `settings` y los envía en el body de
      `plan-intent` en la próxima call.
- [ ] La lista de tablas mostrada en Pantalla 2 (sección Schema) es
      read-only y refleja exactamente lo devuelto por `schema-summary`
      (que filtra por `ORION_ALLOWED_TABLES`).
- [ ] "Cerrar sesión y borrar caché local" deja IndexedDB vacío,
      `localStorage` sin sesión Supabase, y vuelve al wizard.
- [ ] Todas las pantallas en español sin texto en otros idiomas.

## 9. Dependencias

- **Auth Flow** (`spec-auth-flow.md`) — login con magic link.
- **Credentials Storage** (`spec-credentials-storage.md`) — IndexedDB
  no cifrado para schema_cache, audit_mirror, settings.
- **Plan Intent Edge** (`spec-plan-intent-edge.md`) — endpoint para
  "Probar conexión".
- **Schema Summary Edge** (`spec-schema-summary-edge.md`) — refresh.
- **PWA Shell** (`spec-pwa-shell.md`) — entry points `?mode=config`.
- **Confirmation Flow** (`spec-confirmation-flow.md`) — toggles afectan
  sus reglas.

## 10. Referencias

- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2)
- `./spec-auth-flow.md`
- `./spec-credentials-storage.md`
- `./spec-schema-summary-edge.md`
- `./spec-plan-intent-edge.md`
