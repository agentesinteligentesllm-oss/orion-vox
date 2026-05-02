---
title: "ADR-005: Gemini API key server-side desde M1 (Edge Function plan-intent)"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
supersedes:
  - "ADR-005 versión previa (decisión 2026-05-01 que dejaba la Gemini key cifrada en cliente para M1)"
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-003-plan-json-not-sql.md
  - ADR-004-service-role-m1-dedicated-role-m2.md
  - ADR-009-modular-roadmap-m1-m2-m3.md
  - ../00-constitution/CONSTITUTION.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../04-specs/spec-plan-intent-edge.md
  - ../04-specs/spec-auth-flow.md
---

# ADR-005: Gemini API key server-side desde M1

> **Nota.** Este ADR **supersede la versión previa con misma fecha
> (2026-05-01)** que aceptaba como deuda M1 mantener la Gemini key
> cifrada en cliente. El filename se conserva por estabilidad de links;
> el contenido cambia. Ver §"Historia" al final.

## Contexto

Para que Orion Vox use Gemini API con function calling y devuelva el
Plan JSON, alguien necesita autenticarse contra la API de Google AI con
una API key. La pregunta de tribunal fue: **¿la PWA llama directamente
a Gemini desde el cliente (con la key en el dispositivo, aunque
cifrada), o pasa siempre por una Edge Function intermedia que custodia
la key?**

En el round inicial (versión previa de este ADR) Codex argumentó por
server-side desde día 1; Claude pidió desdoblar en M1 con key cifrada
en cliente para acelerar el feedback loop de prototipado de prompts;
el usuario aceptó la versión client-side-cifrada para M1.

En el **round de auditoría posterior** (debate Claude↔Codex↔usuario,
2026-05-01), Codex levantó que cualquier key en cliente — incluso
cifrada con AES-GCM + PBKDF2 + PIN/biometría — sigue exponiendo:

- **Cuota y costo**: cualquier malware o XSS con la sesión desbloqueada
  exfiltra la key y consume cuota Gemini a costo del director.
- **Prompts del director**: si la key se filtra, también se filtra
  cualquier prompt enviado (los prompts pueden contener nombres de
  tablas, snippets de datos al re-formular, intenciones de negocio).
- **Contramedida débil**: el cifrado AES-GCM en reposo no protege
  contra runtime exposure. La key tiene que estar en plaintext en
  memoria al menos durante cada llamada a Gemini.
- **Rotación lenta**: la rotación de key requiere intervención del
  usuario en cada device.

Frente a esos argumentos, la postura "M1 con key cifrada client-side"
deja una superficie de ataque trivial de eliminar moviendo la key al
server. Como además la PWA va a tener una Edge `plan-intent` en M2 de
todas formas, **adelantar `plan-intent` a M1 cierra el problema sin
agregar trabajo neto** (la deuda se transforma en feature acelerada).

Esto reformuló M1 a ser **defendible desde día 1**, no MVP exploratorio
con deuda hardening después.

## Decisión

**M1 y M2 — Gemini API key vive server-side en env var de la Edge
Function `plan-intent`. NUNCA en cliente.**

Detalle:

- La Gemini API key se almacena como env var
  `Deno.env.get('GEMINI_API_KEY')` en la Edge Function `plan-intent`
  (Supabase Secrets, configurada vía dashboard o CLI).
- La PWA **no** habla con `generativelanguage.googleapis.com`
  directamente. Habla con `${SUPABASE_URL}/functions/v1/plan-intent`.
- La PWA autentica esa llamada con su JWT Supabase Auth
  (`Authorization: Bearer <supabase_jwt>`). La Edge valida el JWT y
  verifica `user.id == ORION_ALLOWED_USER_ID` (env var server-side).
  Detalles en `spec-auth-flow.md`.
- `plan-intent` arma el system prompt (con `schema-summary` filtrado
  por `ORION_ALLOWED_TABLES`), llama a Gemini con function calling
  restringido a las tools `execute_plan` y `request_clarification`,
  valida la respuesta server-side (Zod), y devuelve Plan JSON o una
  pregunta de aclaración.
- La PWA recibe el Plan JSON, dispara confirmación táctil si es write,
  y luego llama a `execute-plan` con el mismo Plan JSON.
- Detalles operativos en `docs/04-specs/spec-plan-intent-edge.md`.

**El cliente NO contiene:**

- La string `GEMINI_API_KEY` ni `gemini_api_key`.
- El SDK `@google/genai` ni equivalentes.
- Ningún material que matchee el prefijo de Google AI keys (`AIza`).

(Verificable con grep sobre el bundle compilado.)

## Alternativas consideradas

- **M1 con Gemini key cifrada client-side (postura previa de este
  ADR)**: rechazada en el round de auditoría. Razones:
  - El cifrado en reposo no protege contra exfiltración runtime
    (XSS, extensiones, malware con sesión activa).
  - La cuota Gemini queda expuesta a cualquier comprometido del
    cliente (costo financiero directo).
  - Mover a server-side en M2 implicaba el mismo trabajo que hacerlo
    en M1, sin beneficio neto de "iteración rápida del prompt" (el
    prompt se itera igual con redeploy de Edge — y el redeploy de
    una Edge Function de Supabase es de segundos).
- **Gemini key sin cifrar en localStorage / IndexedDB**: rechazada
  **sin excepción**. No es una opción en ningún milestone.
- **OAuth flow contra Google con tokens rotativos**: postergado.
  Gemini API key es el mecanismo soportado oficialmente; OAuth
  rotativo requiere infraestructura que excede M1/M2 para single
  user.
- **Service Worker proxy local que custodia la key**: rechazado. Un
  Service Worker no es una frontera de seguridad significativa contra
  malware local; es código del mismo origen.

## Consecuencias

**Positivas**:

- **Cuota y costo Gemini protegidos**: la key vive solo en env var
  server-side. Un cliente comprometido no puede consumirla.
- **Prompts no exfiltrables**: los prompts viajan dentro del request
  HTTPS a `plan-intent`, no se almacenan en cliente, no se exponen vía
  la key.
- **Rotación trivial**: rotar la key es editar la env var en Supabase
  dashboard. Sin pedirle al director que re-ingrese nada en su Cubot.
- **System prompt versionado en código del servidor**: testeable,
  auditable, no expuesto al cliente.
- **PWA más liviana**: ya no necesita el SDK de Gemini, ni la lógica
  de cifrado AES-GCM + PBKDF2, ni la UX de PIN/biometría obligatoria
  para descifrar secretos (el SDK Supabase maneja la sesión).
- **M1 nace defendible**: el sistema es seguro para uso real desde
  día 1 en bases del propio director (no solo "exploración con deuda
  documentada").

**Negativas / deuda asumida**:

- **Una Edge Function adicional** (`plan-intent`) que mantener,
  monitorear y deployar.
- **Latencia extra de ~50-150 ms** por hop adicional (PWA → Edge
  Supabase → Gemini → Edge → PWA, vs PWA → Gemini → PWA). Aceptable:
  el budget total de "voz → respuesta" sigue siendo < 10s.
- **Punto de fallo adicional**: si la Edge cae, la PWA no puede
  generar planes. Mitigación: error handling claro y fallback de UI
  (mostrar texto al usuario, no crash silencioso).

**Neutrales**:

- La UX de setup ya no incluye "ingresá tu Gemini API key + PIN +
  biometría". El director hace login con magic link Supabase y listo;
  el operador del deploy (que típicamente es el mismo director) ya
  configuró `GEMINI_API_KEY` server-side al crear las Edge Functions.

## Aplicabilidad

- Aplica a **M1, M2 y M3**. La key Gemini nunca vuelve a vivir en
  cliente en ningún milestone.
- Gate operativo M1: la Edge `plan-intent` debe estar deployada con
  `GEMINI_API_KEY` configurada antes de que la PWA pueda funcionar.

## Historia

| Fecha       | Evento                                                                  |
|-------------|-------------------------------------------------------------------------|
| 2026-05-01  | Versión previa (acepta key cifrada en cliente para M1, server-side en M2). |
| 2026-05-01  | Round de auditoría Claude↔Codex↔usuario. Codex levanta que el cifrado client-side no protege contra exfiltración runtime; cuota y prompts quedan expuestos. Decisión: adelantar `plan-intent` a M1, key vive server-side desde día 1. **Esta versión.** |

## Referencias

- `../02-architecture/SECURITY-MODEL.md` §1 (tabla M1 vs M2), §2
  (M1 defendible), §5 (riesgos innegociables).
- `../04-specs/spec-plan-intent-edge.md` (spec operativa de la Edge).
- `../04-specs/spec-auth-flow.md` (auth con JWT + ORION_ALLOWED_USER_ID).
- `../05-implementation/TECHNICAL-DEBT.md` (TD-002 marcada
  `resuelta-en-m1`).
- ADR-001 — Plan F+ (flujo de invocación a Gemini).
- ADR-004 — service_role server-side (mismo patrón de "secreto solo
  en env var de Edge").
- ADR-009 — roadmap modular con gates de migración.
- `docs/00-constitution/CONSTITUTION.md` § 6 (roadmap modular).
