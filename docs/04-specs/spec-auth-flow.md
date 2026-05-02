---
title: Auth Flow — Supabase Auth + JWT + ORION_ALLOWED_USER_ID
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-execute-plan-edge.md
  - ./spec-schema-summary-edge.md
  - ./spec-plan-intent-edge.md
  - ./spec-credentials-storage.md
  - ./spec-config-ui.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
---

# Spec — Auth Flow (Supabase Auth + JWT, single-user)

## 1. Propósito

Definir el modelo de autenticación de M1. Orion Vox es **single-user**:
exactamente un humano (el director) usa el sistema desde su Cubot KK9.
Aun así, **no se acepta `anon_key` como mecanismo de autenticación**: la
`anon_key` es pública por diseño y no identifica a nadie. Toda llamada
a las Edge Functions (`plan-intent`, `execute-plan`, `schema-summary`)
viaja con un **JWT real de Supabase Auth** y se valida server-side
contra `ORION_ALLOWED_USER_ID`.

## 2. Alcance

**Cubre:**

- Modelo de autenticación M1 (Supabase Auth con magic link, password
  como fallback).
- Validación single-user vía env var `ORION_ALLOWED_USER_ID` server-side.
- Lifecycle de sesión (login, refresh, logout).
- Manejo de errores de auth user-facing.
- Setup operativo (cómo el director crea su cuenta y la "ata" a la
  instancia).

**NO cubre:**

- Cifrado de credenciales locales (Gemini key ya no vive en cliente;
  ver `spec-credentials-storage.md` para lo que sí queda).
- DDL de tablas Supabase Auth (las administra Supabase).
- Edge Functions detalladas (cada una en su propio spec; este doc
  describe sólo el contrato de auth que comparten).

## 3. Modelo de autenticación

### 3.1 Stack

- **Supabase Auth** del propio proyecto del director.
- **Método primario**: magic link al email del director.
- **Método fallback**: email + password (sólo si el director lo prefiere
  por UX o no recibe el magic link en su Cubot).
- **Provider**: `@supabase/supabase-js` v2 en la PWA. Se encarga de
  parseo del token de la URL del callback, persistencia de la sesión y
  refresh automático.

### 3.2 Single-user — ¿por qué `ORION_ALLOWED_USER_ID`?

El proyecto Supabase del director puede tener otros usuarios (familiares,
testers, etc.). Orion Vox NO debe responder a ninguno excepto al
director. La forma más simple y robusta:

- El director crea su cuenta una sola vez (vía PWA).
- Anota su `user.id` (UUID) — visible en Supabase dashboard
  → Authentication → Users.
- Lo configura como variable de entorno **server-side** en las Edge
  Functions: `ORION_ALLOWED_USER_ID=<uuid>`.
- Cada Edge Function valida `user.id == ORION_ALLOWED_USER_ID` antes
  de procesar la request. Si no matchea, devuelve **403 `forbidden_user`**.

Esto **no** depende de RLS, **no** depende de otros toggles. Es una
verificación dura y explícita.

## 4. Interfaces / API / Contratos

### 4.1 Header común a todas las Edge Functions

```
Authorization: Bearer <SUPABASE_AUTH_JWT>
```

Donde `<SUPABASE_AUTH_JWT>` es el `access_token` de la sesión Supabase
del director, obtenido tras login con magic link.

### 4.2 Validación server-side (pseudocódigo)

```ts
import { createClient } from 'jsr:@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,    // sólo para getUser
  { auth: { persistSession: false } }
);

const ALLOWED_USER_ID = Deno.env.get('ORION_ALLOWED_USER_ID')!;

async function authGuard(req: Request): Promise<{ user_id: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 });
  }
  if (data.user.id !== ALLOWED_USER_ID) {
    return new Response(JSON.stringify({ error: 'forbidden_user' }), { status: 403 });
  }
  return { user_id: data.user.id };
}
```

`SUPABASE_SERVICE_ROLE_KEY` se usa **internamente** por la Edge para
poder llamar `auth.getUser(token)` con privilegios de validación. Vive
solo en `Deno.env`, **nunca** sale al cliente.

### 4.3 Códigos de error de auth (compartidos)

| HTTP | `error`              | Cuándo                                                |
|------|----------------------|-------------------------------------------------------|
| 401  | `unauthorized`       | No hay header `Authorization`.                        |
| 401  | `invalid_token`      | El JWT no parsea, está expirado, o no es de este proyecto. |
| 403  | `forbidden_user`     | JWT válido pero `user.id != ORION_ALLOWED_USER_ID`.   |

## 5. Lifecycle de sesión

### 5.1 Primera ejecución (setup operativo)

1. Director instala PWA, abre por primera vez.
2. PWA detecta sesión Supabase ausente → muestra pantalla de login.
3. Director ingresa su email → tap "Enviar enlace".
4. PWA llama `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`.
5. Director abre el email en el Cubot KK9 → tap el magic link → callback
   en la PWA.
6. PWA parsea el token de la URL (`@supabase/supabase-js` lo hace
   automáticamente vía `detectSessionInUrl: true`).
7. Sesión guardada (storage default de `@supabase/supabase-js`,
   típicamente `localStorage`; en M1 no es secreto: el JWT expira y se
   refresca solo).
8. PWA continúa al flujo de voz.

**Setup post-login (fuera de la PWA, una sola vez):**

- Director va a Supabase dashboard → Authentication → Users → copia su
  `user.id`.
- Lo configura como env var `ORION_ALLOWED_USER_ID` en las Edge
  Functions del proyecto (Supabase dashboard → Edge Functions →
  Settings → Secrets).

### 5.2 Sesión normal (cada arranque)

1. PWA arranca → `supabase.auth.getSession()` recupera la sesión
   persistida.
2. Si la sesión existe y el `access_token` no expiró → continúa al
   flujo de voz.
3. Si el `access_token` expiró pero hay `refresh_token` → el SDK lo
   refresca automáticamente en background.
4. Si no hay sesión válida → vuelve a pantalla de login.

### 5.3 Llamadas a Edge

```ts
const { data: { session } } = await supabase.auth.getSession();
if (!session) throw new Error('no_session');

const res = await fetch(`${SUPABASE_URL}/functions/v1/plan-intent`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ user_prompt, client_version }),
});
```

### 5.4 Logout

1. Director tap "Cerrar sesión" en Config UI.
2. PWA ejecuta:
   ```ts
   await supabase.auth.signOut();
   await indexedDB.deleteDatabase('orion_vox_v1');  // wipe schema_cache, audit_mirror, settings
   ```
3. PWA vuelve a pantalla de login.

### 5.5 Lock automático (UX)

- M1 no implementa lock automático tras inactividad (la sesión Supabase
  expira sola; refresh dura ~30 días por default y eso es el límite
  efectivo).
- M2 puede agregar bloqueo PIN/biometría por encima de la sesión para
  protección adicional al uso (no de credenciales — ya no las hay).

## 6. Errores y manejo

| Caso                                              | UX en la PWA                                                              |
|---------------------------------------------------|---------------------------------------------------------------------------|
| Email no válido (regex falla)                     | "Ingresá un email válido."                                                |
| Magic link expirado (Supabase devuelve `otp_expired`) | "El link expiró. Pedí uno nuevo."                                       |
| Magic link ya usado                               | "Este link ya se usó. Pedí uno nuevo."                                    |
| `forbidden_user` desde Edge (403)                 | "Tu cuenta no está autorizada para usar esta instancia. Pedí al director que configure `ORION_ALLOWED_USER_ID`." |
| `invalid_token` desde Edge (401)                  | Forzar re-login (sesión inválida o proyecto Supabase distinto).           |
| Sin red al hacer login                            | "No hay conexión. Probá cuando vuelvas a tener internet."                 |
| `auth.getUser` falla server-side por timeout      | 500 `internal` desde la Edge; PWA muestra "Error de autenticación, reintentá." |

## 7. Restricciones M1

- **Single user duro vía env var**. Sin tabla de allowlist multi-user
  (M3 podría agregar si Orion Vox se vuelve multi-tenant; M1 y M2 no).
- **Sin MFA**. La protección está en (a) magic link al email del
  director y (b) el dispositivo personal con bloqueo del SO. Aceptable
  para el modelo de amenaza declarado.
- **Sin SSO con Google / Apple**. Magic link cubre el caso. SSO sumaría
  superficie sin beneficio claro para single-user.
- **Sin rotación automática del `ORION_ALLOWED_USER_ID`**. Si el
  director necesita reset, recrea cuenta y reconfigura env var. M1 no
  cubre rotación in-place.
- **`@supabase/supabase-js` persiste sesión en `localStorage` por
  default**. Un atacante con XSS sobre la PWA podría exfiltrar el
  `access_token`. Mitigación M1: sin XSS conocido (la PWA no renderiza
  contenido de terceros). M2 puede mover a almacenamiento custom o
  cookies httpOnly.

## 8. Criterios de aceptación verificables

- [ ] Primera carga sin sesión Supabase redirige a pantalla de login.
- [ ] Login con magic link válido completa la sesión y redirige al
      flujo de voz.
- [ ] Llamada a `plan-intent` sin header `Authorization` retorna 401
      `unauthorized`.
- [ ] Llamada con JWT inválido (expirado o de otro proyecto) retorna
      401 `invalid_token`.
- [ ] Llamada con JWT válido de un usuario distinto al
      `ORION_ALLOWED_USER_ID` retorna 403 `forbidden_user`.
- [ ] Llamada con JWT válido del director matcheando
      `ORION_ALLOWED_USER_ID` retorna 200 (o el código de negocio
      correspondiente).
- [ ] Logout limpia la sesión Supabase y borra IndexedDB local.
- [ ] Tras logout, las llamadas a Edge devuelven 401 (no hay token).
- [ ] El `access_token` se refresca automáticamente cuando está cerca
      de expirar (verificable observando el header en requests
      sucesivas a lo largo de > 1 hora).
- [ ] El `service_role` **nunca** aparece en el bundle PWA, ni en
      requests salientes desde el cliente (verificable inspeccionando
      Network tab y bundle compilado).

## 9. Dependencias

- `@supabase/supabase-js` v2 (cliente).
- Supabase Auth habilitado en el proyecto (default en cualquier
  proyecto Supabase).
- Edge Functions con env vars `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ORION_ALLOWED_USER_ID` configuradas.
- Email del director con acceso desde el Cubot KK9 (para abrir el
  magic link).

## 10. Referencias

- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2)
- `./spec-execute-plan-edge.md` §3.1 (header `Authorization`)
- `./spec-schema-summary-edge.md` §3.1
- `./spec-plan-intent-edge.md`
- `./spec-credentials-storage.md` (qué queda en cliente tras esta reforma)
- Supabase Auth docs (magic link, JWT lifecycle)
