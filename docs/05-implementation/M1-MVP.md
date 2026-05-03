---
title: M1 — Base segura funcional Plan F+
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./ROADMAP.md
  - ./TECHNICAL-DEBT.md
  - ./M2-HARDENING.md
  - ../03-adr/ADR-001-plan-f-plus-architecture.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
  - ../03-adr/ADR-009-modular-roadmap-m1-m2-m3.md
  - ../03-adr/ADR-012-framework-pwa.md
  - ../01-product/PRD.md
  - ../01-product/USER-STORIES.md
  - ../04-specs/SPEC-INDEX.md
  - ../04-specs/spec-auth-flow.md
  - ../04-specs/spec-plan-intent-edge.md
  - ../../openspec/changes/m1-mvp/proposal.md
---

# M1 — Base segura funcional Plan F+

Resumen ejecutivo del milestone M1 de Orion Vox. El detalle accionable
día a día vive en el change OpenSpec
[`openspec/changes/m1-mvp/`](../../openspec/changes/m1-mvp/).

> **Reforma de seguridad 2026-05-01.** Tras la auditoría Codex, el
> alcance M1 incorpora desde día 1: Supabase Auth + JWT, Gemini key
> server-side en `plan-intent`, allowlist server-side, política de
> redacción server-side y separación de Edge Functions. La versión
> previa de M1 dejaba `service_role` y Gemini key en el cliente —
> descartada por riesgo. Ver ADR-009 (reescrito) y ADR-005 (reescrito).

---

## Objetivo M1

> **Plan F+ funcional end-to-end con base segura desde día 1.**

M1 valida las hipótesis fundacionales del proyecto (Gemini sigue Plan
JSON, Web Speech `es-MX` usable en Cubot, UX voz + táctil + auditoría
fluye sin fricción) **sobre una arquitectura defendible**. El sistema
nace con auth real, secretos server-side y allowlist explícita. La
métrica primaria de éxito es **usabilidad real del director sobre su
propio Supabase, sin ventanas críticas de exposición**.

---

## Alcance funcional

Flujo end-to-end implementado en M1:

```
"OK Google, abrí Orion Vox"
        │
        ▼
   PWA arranca → ¿sesión Supabase válida?
        │
        ├── no ──▶ Login magic link → callback → sesión activa
        │
        ▼ sí
   Web Speech Recognition (es-MX) captura frase
        │
        ▼
   Cliente plan-intent (fetch + JWT header)
        │
        ▼
   Edge Function plan-intent (Deno)
        ├── valida JWT (auth.getUser → user.id == ORION_ALLOWED_USER_ID)
        ├── llama internamente schema-summary
        ├── llama Gemini (GEMINI_API_KEY env, server-side)
        └── devuelve Plan JSON v1.0 (o Clarification)
        │
        ▼
   PWA valida Plan JSON cliente (Zod, mismo módulo que server)
        │
        ▼
   ¿Es write?  ──si──▶  Modal confirmación táctil + preview SQL
        │                       │
        no                  Confirmar / Cancelar
        │                       │
        ▼                       ▼
   Edge Function execute-plan (Deno)
        ├── valida JWT (mismo check ORION_ALLOWED_USER_ID)
        ├── valida Plan JSON contra ORION_ALLOWED_TABLES (env)
        ├── ejecuta con service_role (server-side, env)
        ├── aplica ORION_REDACTED_COLUMNS a sql_params, result, TTS
        └── INSERT en orion_audit (siempre, incluso fallos / cancels)
        │
        ▼
   Resultado al cliente
        │
        ▼
   Web Speech Synthesis (es-MX) + render en pantalla
```

### Componentes a construir en M1

1. **PWA** en Svelte 5 + Vite + TypeScript (ADR-012).
2. **Supabase Auth con magic link** (single user) + sesión persistente
   + callback handling.
3. **Edge Function `plan-intent`** (Deno): proxy Gemini server-side
   con JWT validation y allowlist en consulta a `schema-summary`. Ver
   `spec-plan-intent-edge.md`.
4. **Edge Function `execute-plan`** (Deno): ejecutor Plan JSON con
   JWT validation, allowlist, redacción y auditoría. Ver
   `spec-execute-plan-edge.md`.
5. **Edge Function `schema-summary`** (Deno): autogenerada server-side
   con allowlist y redacción. Llamada interna por `plan-intent`. Ver
   `spec-schema-summary-edge.md`.
6. **Tabla `orion_audit`** + DDL versionada como migración Supabase.
7. **Web Speech Recognition** `es-MX` y **Web Speech Synthesis**
   `es-MX` con voz configurable.
8. **Modal de confirmación táctil** para writes con preview SQL
   legible y doble confirmación para `delete sin filtro`.
9. **Modo voz auto-listen** al abrir desde shortcut PWA
   (`?mode=voice`) + UI básica config + UI básica audit espejo
   IndexedDB.
10. **Validador Plan JSON v1.0** compartido cliente (Zod) y server
    (Deno).

### Env vars Supabase requeridas

| Env var | Donde vive | Propósito |
|---------|------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Edge `execute-plan` (y `schema-summary`) | Ejecutar SQL del usuario y leer schema |
| `GEMINI_API_KEY` | Edge `plan-intent` | Llamar Gemini server-side |
| `ORION_ALLOWED_USER_ID` | Las 3 Edge Functions | Validar `user.id == este UUID` |
| `ORION_ALLOWED_TABLES` | Edge `execute-plan` y `schema-summary` | Allowlist explícita de tablas autorizadas |
| `ORION_REDACTED_COLUMNS` | Edge `execute-plan` y `schema-summary` | Política de redacción de columnas sensibles |

> Ninguna de estas vive en cliente. La PWA solo conoce la URL del
> proyecto Supabase y el `anon key` (públicos por diseño).

---

## Deuda explícita aceptada en M1

Cada item está documentado en
[`TECHNICAL-DEBT.md`](./TECHNICAL-DEBT.md) con su ID, ADR de origen y
milestone donde se paga.

| ID | Deuda | Cierre |
|------|-------|---------|
| TD-001-bis | `service_role` server-side con `BYPASSRLS` en `execute-plan` | M2 → rol dedicado `orion_vox_executor` (ADR-004) |
| TD-003 | Confirmación táctil sin preview firmado server-side | M2 → preview firmado HMAC con `preview_id` |
| TD-004 | Allowlist gestionada vía env var sin UI admin in-app | M2 → UI admin con re-login + audit de cambios |
| TD-005 | RLS deshabilitada en `orion_audit` (service_role bypassa igual) | M2 → RLS estricta una vez migrado el rol dedicado |

**Resueltas en M1 (ya no son deuda)**: TD-001 (`service_role` en
cliente), TD-002 (Gemini key en cliente), TD-006 (sin JWT), TD-007
(sin separación `plan-intent`/`execute-plan`).

> No es deuda silenciosa: las 4 deudas residuales están nombradas,
> referenciadas a ADRs cuando aplica, y tienen milestone de cierre.
> Si durante M1 se detecta una deuda nueva, se agrega a
> `TECHNICAL-DEBT.md` con su clasificación.

---

## Criterios de Done para cerrar M1

Lista verificable. Si alguno falla, M1 sigue abierto.

- [ ] **Login Supabase Auth funciona**: magic link recibido en email,
  callback URL activa la sesión, sesión persiste entre cierres de la
  PWA.
- [ ] **Edge `plan-intent` smoke**: con curl + JWT válido, recibe un
  prompt en español y devuelve Plan JSON validado o Clarification.
- [ ] **Edge `execute-plan` smoke**: con curl + JWT válido + Plan JSON
  válido, ejecuta sobre tabla allowlisted, audita, devuelve resultado.
- [ ] **Smoke E2E voz → Supabase** exitoso en Cubot KK9 (después de
  Web Speech smoke test inicial — ver `INSTALLATION-CUBOT.md` § smoke
  test).
- [ ] **Confirmación táctil bloquea writes**: ningún INSERT/UPDATE/DELETE
  se ejecuta sin tap explícito en "Confirmar" (verificado E2E).
- [ ] **Operaciones DDL bloqueadas**: `DROP`, `TRUNCATE`, `ALTER`,
  `CREATE`, `GRANT`, `REVOKE`, `COPY`, `DO` y multi-statement
  rechazadas server-side con error legible y entrada en
  `orion_audit`.
- [ ] **Allowlist server rechaza tablas no listadas con 403**:
  request a tabla fuera de `ORION_ALLOWED_TABLES` rechazada antes de
  ejecutar SQL, audit registra `bloqueado_por_allowlist`.
- [ ] **Política de redacción aplica**: columnas listadas en
  `ORION_REDACTED_COLUMNS` aparecen redactadas en `sql_params`,
  `result_summary` y en el TTS.
- [ ] **JWT inválido rechazado**: request sin Bearer o con JWT
  expirado / de otro `user.id` recibe 401, audit registra el intento.
- [ ] **Auditoría 100% cobertura**: toda ejecución (ok / error /
  bloqueado / rechazado por usuario) genera exactamente una entrada
  en `orion_audit`. Inspección manual sobre 20 invocaciones
  consecutivas.
- [ ] **Plan JSON válido ≥ 90 %**: en queries del set de pruebas
  representativas (PRD § 5).
- [ ] **Latencia end-to-end** de queries simples < 6 s p95.
- [ ] **Deploy live**: PWA accesible HTTPS en Vercel e instalable
  como PWA en Cubot KK9 (icono en home, manifest válido, atajo a
  Voice Mode).
- [ ] **Uso real**: 2 semanas de uso continuo del director sin
  pérdidas de datos en `orion_audit`.

---

## Métricas de éxito

Las métricas autoritativas viven en el [`PRD.md` § 5](../01-product/PRD.md).
Resumen rápido:

- Director puede consultar ≥ 3 tablas piloto con frase libre en
  español.
- INSERT / UPDATE / DELETE funcionando con confirmación sobre 2 tablas.
- Latencia end-to-end de queries simples < 6 s.
- Plan JSON válido ≥ 90 % en queries del set de pruebas.
- 100 % de cobertura de auditoría (innegociable).
- 0 ejecuciones de DDL o multi-statement (innegociable).
- 0 writes en modo read-only (innegociable).
- 0 secrets server-side filtrados al cliente (innegociable).

---

## Change OpenSpec activo

[`openspec/changes/m1-mvp/`](../../openspec/changes/m1-mvp/)

- `proposal.md` — qué cambia, por qué ahora, alcance, no incluye.
- `spec.md` — delta de specs introducidos por este change.
- `design.md` — decisiones técnicas operativas.
- `tasks.md` — checklist accionable agrupada en bloques.
- `state.yaml` — estado, owner, ADRs ligados, criterios de
  aceptación.

---

## Progreso de implementación (Wave 4 — 2026-05-02)

**Tests**: 168/168 Vitest verde. TypeScript estricto limpio. Biome 0 warnings.

| Bloque | Descripción | % completo | Estado |
|--------|-------------|------------|--------|
| B0 | Setup base | 100% | ✅ `45b0707` |
| B1 | Supabase backend (código) | ~80% | ✅ código done, ⚠️ T1.1/T1.2/T1.7/T1.9 requieren deploy Supabase real |
| B2 | PWA Auth & Config | 100% | ✅ `138f4e3` |
| B3-Voice | VoiceInputController + TtsOutputController + VoiceScreen | 100% | ✅ `5ebb458` |
| B4-PlanIntent | plan-intent-client.ts + PlanPreview + Clarification | 0% | 🔄 PAUSADO |
| B5 | Confirmation flow | 0% | ⏳ |
| B6 | Execute & Audit client | 0% | ⏳ |
| B7 | Atajos PWA | 0% | ⏳ |
| B8 | Deploy & Validación | 0% | ⏳ |

**M1 total**: ~40% completado.

### Criterios Done verificados

- [x] PWA shell levanta: `npm run dev` + `npm run build` limpios (B0)
- [x] Tailwind 4 funcional en componentes (B0)
- [x] TypeScript estricto + Biome verde (B0, mantenido en B1-B3)
- [x] `vite-plugin-pwa` produce manifest válido (B0)
- [x] Auth store reactivo (Svelte 5 runes) + routing guard (B2)
- [x] Login magic link: pantalla + estado + trigger `signInWithOtp` (B2)
- [x] Callback URL handling (B2)
- [x] Settings: idioma, read-only, dry-run persistidos en IndexedDB (B2)
- [x] Logout limpia sesión + IndexedDB + redirect (B2)
- [x] orion_audit DDL migrations 001 + 002 (B1)
- [x] plan-intent Edge Function código completo per spec (B1)
- [x] execute-plan Edge Function código completo per spec (B1)
- [x] schema-summary Edge Function código completo per spec (B1)
- [x] plan-schema Zod compartido PWA↔Deno, ADR-013 (B1)
- [x] VoiceInputController: es-MX, 4 estados, 7 errores con mensajes españoles (B3)
- [x] TtsOutputController: es-MX, truncación 300 chars, cancel-before-speak (B3)
- [x] VoiceScreen: auto-listen per permission state, UI 4 estados, keyboard fallback (B3)
- [x] Unit tests recognition (14) + synthesis (16) (B3)
- [x] E2E tests VoiceScreen (8 scenarios incl. permission states) (B3)

### Criterios Done pendientes

- [ ] plan-intent-client.ts con JWT Bearer, 11 error codes (B4)
- [ ] PlanPreview human-readable (B4)
- [ ] Clarification flow TTS + auto-restart (B4)
- [ ] Modal confirmación táctil para writes (B5)
- [ ] execute-plan client con manejo errores (B6)
- [ ] Vista auditoría espejo IndexedDB (B6)
- [ ] Smoke E2E voz→Supabase en Cubot KK9 (B8)
- [ ] Deploy Vercel + PWA install en Cubot (B8)
- [ ] Uso real 2 semanas sin pérdida de datos (post-deploy)

## Pre-requisitos

---

## Cláusula de cierre

> M1 ya no es "funcional con deuda crítica": es **funcional y
> defendible**. Si durante M1 emerge una deuda nueva, va a
> `TECHNICAL-DEBT.md` con su clasificación. Si la deuda toca el
> núcleo de seguridad (auth, secretos, allowlist, separación de
> Edges), bloquea M1 hasta resolverse — no se traslada a M2.
