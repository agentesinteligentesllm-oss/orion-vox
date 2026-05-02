---
title: "ADR-009: Roadmap modular M1 → M2 → M3, en ese orden"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
supersedes: previous version dated 2026-05-01 (this ADR was rewritten after Codex audit)
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-004-service-role-m1-dedicated-role-m2.md
  - ADR-005-gemini-key-client-m1-server-m2.md
  - ADR-008-server-side-audit-from-m1.md
  - ADR-010-schema-autogeneration.md
  - ADR-012-framework-pwa.md
  - ../00-constitution/CONSTITUTION.md
  - ../04-specs/spec-auth-flow.md
  - ../04-specs/spec-plan-intent-edge.md
---

# ADR-009: Roadmap modular M1 → M2 → M3, en ese orden

## Contexto

> **Reescritura 2026-05-01.** La versión original de este ADR distribuía
> el hardening de seguridad entre M1 (con deuda explícita: `service_role`
> en cliente, Gemini key cifrada en cliente, sin JWT, sin separación
> `plan-intent`/`execute-plan`) y M2 (cierre completo). Tras el round de
> auditoría Claude↔Codex la postura cambió: la deuda M1 original era
> **inaceptable** porque dejaba el `service_role` y la Gemini key en el
> dispositivo, con `BYPASSRLS` activo y sin identificación real del
> usuario. Un solo XSS o malware con la sesión desbloqueada
> comprometía todo. El tribunal acordó **mover el hardening crítico de
> M2 a M1**: auth real, Gemini server-side, allowlist y redacción
> server-side, separación de Edge Functions desde día 1. M2 queda
> reducido al endurecimiento secundario (rol Postgres dedicado, RLS
> estricta, preview firmado, UI admin).

Las dos posturas que originaron el ADR siguen siendo válidas:

- **Usuario / exploración**: necesidad de validar hipótesis
  fundacionales (Gemini sigue Plan JSON, Web Speech `es-MX` usable en
  Cubot, UX táctil + voz fluye) lo antes posible.
- **Codex / hardening**: cualquier deuda inicial es deuda acumulada
  que rara vez se paga.

La nueva síntesis: **el sistema nace defendible**. El hardening
crítico vive en M1 desde día 1. La validación de hipótesis sigue siendo
posible porque esos cambios (auth, server-side keys, allowlist) no
afectan la UX observable. Lo que se mueve a M2 es endurecimiento
secundario que sí agrega trabajo sin valor funcional inmediato.

## Decisión

El roadmap de Orion Vox tiene **tres milestones secuenciales**: M1,
M2, M3. **No se saltan fases.** Una feature de M3 no se adelanta porque
"es chica" si M2 todavía no está cerrado.

### M1 — Base segura funcional ("hace lo que prometí, defendible")

**Alcance funcional + seguridad crítica desde día 1**:

- PWA Svelte 5 + Vite + TypeScript instalada en Cubot (ADR-006,
  ADR-012).
- Web Speech API `es-MX` para captura y respuesta (ADR-007).
- **Supabase Auth con magic link**, sesión persistente, validación
  `user.id == ORION_ALLOWED_USER_ID` (env var server-side) en cada Edge
  Function (`spec-auth-flow.md`).
- **Edge Function `plan-intent`**: recibe `{user_prompt, client_version}`
  + JWT, llama internamente a `schema-summary`, llama a Gemini
  server-side con `GEMINI_API_KEY` (env var), devuelve Plan JSON
  validado o Clarification (`spec-plan-intent-edge.md`).
- **Edge Function `execute-plan`**: recibe Plan JSON + JWT, valida
  contra allowlist server-side `ORION_ALLOWED_TABLES`, ejecuta con
  `service_role` server-side, audita en `orion_audit`.
- **Edge Function `schema-summary`**: autogenerada server-side,
  filtrada por allowlist `ORION_ALLOWED_TABLES`, redacción aplicada
  según `ORION_REDACTED_COLUMNS`.
- **Política de redacción** server-side (env var `ORION_REDACTED_COLUMNS`)
  aplicada a `sql_params`, `result_summary` y TTS.
- Tabla `orion_audit` server-side desde día 1 (ADR-008).
- Confirmación táctil para writes (Constitución § 5).
- Operaciones bloqueadas hardcoded server-side (Constitución § 4).
- Plan JSON v1.0 estricto, validado tanto en cliente como en server.

**Deuda explícita aceptada en M1** (mucho menor que la versión
original, sin riesgo crítico):

- `service_role` server-side (no rol Postgres dedicado todavía —
  TD-001-bis, paga M2 con `orion_vox_executor`).
- Confirmación táctil sin preview firmado server-side
  (TD-003, paga M2 con `preview_id` HMAC).
- Allowlist gestionada vía env var sin UI admin in-app
  (TD-004, paga M2 con UI admin + audit de cambios).
- RLS deshabilitada en `orion_audit` (TD-005, paga M2 con RLS
  estricta cuando rol dedicado entra en juego).

### M2 — Polish + endurecimiento secundario ("ahora lo dejo cerca de producción")

**Mucho más chico que la versión original.** El hardening crítico ya
quedó en M1. M2 es endurecimiento secundario y mejoras operativas:

- **Rol Postgres dedicado `orion_vox_executor`** con grants mínimos
  por tabla / operación (cierra TD-001-bis y elimina `BYPASSRLS`).
- **Preview firmado server-side con `preview_id` HMAC**: el flujo se
  parte en (1) PWA pide preview a `plan-intent`, devuelve
  `preview_id` firmado; (2) modal muestra el preview, usuario confirma,
  PWA envía `preview_id` a `execute-plan`, valida la firma y ejecuta
  exactamente el plan firmado. Cierra TD-003.
- **UI admin in-app** para gestionar `ORION_ALLOWED_TABLES`,
  `ORION_REDACTED_COLUMNS` y hints semánticos del schema-summary, con
  re-login Supabase y audit de cambios. La env var sigue como
  fallback inicial. Cierra TD-004.
- **RLS estricta** en `orion_audit` y tablas operativas (posible
  ahora que el rol dedicado no bypassa RLS). Cierra TD-005.
- **`dry_run` con estimación visible de filas** en el modal de
  confirmación (extender `execute-plan` para devolver row count
  estimado antes de la ejecución real).
- **Métricas básicas de uso** (US-AUD-05): consultas por día,
  errores, latencias.
- **Doble confirmación** para deletes de alto impacto (US-SEC-06).
- **Política de retención formal** para `orion_audit`.

### M3 — Features de calidad de vida ("ahora lo hago lindo")

**Alcance funcional** (todo opcional, sólo si M2 está cerrado):

- **Multi-modelo LLM**: Claude / OpenAI como fallback o alternativa a
  Gemini, pluggable.
- **Multi-proyecto Supabase**: apuntar a varios proyectos distintos.
- **Exports** de auditoría (JSON, CSV, Markdown).
- **Gráficos** inline para responses agregadas.
- **Voice tuning**: voces customizables, macros de voz, atajos
  avanzados.
- Cualquier otra feature que surja de uso real.

## Alternativas consideradas

- **M1 con deuda de seguridad original (versión previa de este ADR)**:
  **descartado** tras la auditoría Codex. Dejaba `service_role` y
  Gemini key en el cliente, sin JWT, sin separación de endpoints. El
  blast radius de un solo XSS era total. La velocidad ganada no
  compensa el riesgo: la PWA está pensada para usarse en un dispositivo
  Android compartido, expuesto a ingeniería social y a otras apps.
- **Todo en M1 (M1 mega-milestone con M2 + M3 incluidos)**:
  **descartado por scope**. Multiplica el esfuerzo de M1 por ~2.5x,
  retrasa la validación de hipótesis fundacionales y mete trabajo
  invisible (rol dedicado, RLS estricta, métricas) que sólo es
  defendible una vez que el flujo end-to-end demostró funcionar.
- **Saltar M2 directo a M3 si M1 "anda bien"**: **rechazado sin
  excepción**. Es el patrón clásico de deuda permanente: M1 funciona,
  M3 es más visible y gratificante, M2 nunca llega. La Constitución
  (§ 6) lo prohíbe explícitamente. Con el nuevo M1 defendible, M2 deja
  de ser bloqueante para datos no-regulados, pero **sigue siendo
  obligatorio** para cerrar las cuatro deudas residuales.
- **Sin milestones, iteración continua**: rechazado por riesgo de
  perder de vista los puntos de revisión. Los milestones son la
  herramienta para hacer visibles los gates obligatorios.

## Consecuencias

**Positivas**:

- **El sistema nace defendible.** Auth real, Gemini server, allowlist
  server, redacción server, separación de Edge Functions desde día 1.
- **M2 deja de ser crítico**: pasa a ser opcional para datos
  no-regulados y obligatorio sólo si se introducen datos sensibles o
  si el director quiere endurecer aún más.
- **M3 puede esperar**: ya no hay urgencia de cerrar deuda crítica
  antes de pensar en features ricos.
- Las 4 deudas residuales M1→M2 (TD-001-bis, TD-003, TD-004, TD-005)
  están **explícitamente nombradas, acotadas y con plan de pago
  documentado** en `TECHNICAL-DEBT.md`.

**Negativas / deuda asumida**:

- **M1 toma más esfuerzo del estimado original.** Implementar
  Supabase Auth + magic link + JWT validation, `plan-intent` con
  Gemini server, allowlist y redacción server-side desde día 1
  agrega ~30-40% de trabajo a M1 vs la versión previa. Se acepta
  porque la alternativa es seguridad indefendible.
- M2 puede sentirse aún más invisible (es endurecimiento secundario
  sobre una base que ya es funcional y segura). Mitigación:
  documentar las 4 deudas residuales como entregables visibles en sí
  mismas.
- Ahora hay **3 Edge Functions** en M1 (`plan-intent`, `execute-plan`,
  `schema-summary`) en vez de 1. Mayor superficie operativa.

**Neutrales**:

- La duración calendario de cada milestone no se pre-define. M1
  termina cuando todos sus ítems funcionales están y los tests pasan;
  M2 termina cuando las 4 deudas residuales están cerradas; M3 es
  continuo.

## Reglas de transición

### M1 → M2

Para abrir M2 se requiere:

1. M1 cerrado con todas sus US M1 implementadas y validadas.
2. Uso real estable del director ≥ 2 semanas sobre Cubot KK9 con
   `orion_audit` sin pérdidas y sin operaciones bloqueadas violadas.
3. `TECHNICAL-DEBT.md` con las 4 deudas residuales (TD-001-bis,
   TD-003, TD-004, TD-005) explícitamente nombradas con plan de pago.
4. Tribunal aprueba la apertura de M2.

### M2 → M3

Para abrir M3 se requiere:

1. **Rol Postgres `orion_vox_executor` migrado** y `execute-plan`
   ya no usa `service_role` para ejecutar SQL del usuario.
2. **Preview firmado server-side** funcional, validado por
   `execute-plan` (rechazo de preview no firmado o con firma
   inválida).
3. **UI admin allowlist** funcional con audit de cambios.
4. **RLS estricta** activa en `orion_audit` y tablas operativas con
   tests demostrando que un rol distinto no puede leer.
5. Tests de integración para los 4 puntos anteriores en CI.
6. Tribunal aprueba el cierre de M2.

> Las reglas de transición ya **no** dicen "deuda M1 cerrada" en
> sentido amplio, porque la deuda crítica fue resuelta en M1. Dicen
> específicamente: rol dedicado migrado + preview firmado funcional +
> UI admin allowlist + RLS estricta.

## Aplicabilidad

- Aplica al **proyecto entero**.
- Es uno de los **principios constitucionales** (§ 6 — Roadmap modular
  M1 → M2 → M3, en ese orden).

## Referencias

- ADR-001 — Plan F+ es el destino arquitectónico que se completa al
  cerrar M2.
- ADR-004 — rol dedicado migrado en M2 (la deuda M1 quedó reducida a
  TD-001-bis: `service_role` server-side con `BYPASSRLS`).
- ADR-005 — reescrito: Gemini key vive server-side desde M1 en
  `plan-intent`.
- ADR-008 — auditoría desde M1 (no es deuda, es cimiento).
- ADR-010 — schema autogenerado server-side desde M1; UI admin en M2.
- ADR-012 — framework PWA (Svelte 5 + Vite + TypeScript) aprobado.
- `spec-auth-flow.md` — Supabase Auth + JWT desde M1.
- `spec-plan-intent-edge.md` — Edge Function nueva desde M1.
- `docs/00-constitution/CONSTITUTION.md` § 6 (Roadmap modular).
- `docs/05-implementation/TECHNICAL-DEBT.md` — 4 deudas residuales
  M1→M2 documentadas.
- Glosario: `M1 / M2 / M3`.
