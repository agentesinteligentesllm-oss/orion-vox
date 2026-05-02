---
title: Checklist de principios — verificación por PR/change
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - CONSTITUTION.md
  - CHANGE-PROTOCOL.md
  - ../../openspec/README.md
---

# Checklist de principios

Esta checklist se ejecuta **en cada PR** y en **cada change OpenSpec antes
de pasar de `in-review` a `approved`**. Sirve para validar que el cambio
no viola ninguno de los 12 principios constitucionales ni los innegociables
de M1.

Marca `[x]` cada item explícitamente. Si un principio **no aplica** a este
cambio, marca `[N/A]` y agrega una línea de justificación. Si un principio
**se viola intencionalmente**, el PR no se mergea: se debe abrir un ADR de
suspensión primero (ver `CHANGE-PROTOCOL.md`).

---

## Checklist contra los 12 principios constitucionales

- [ ] **Principio 1 — Single user.** ¿El cambio mantiene single-user?
  ¿No introduce tablas de users, roles multi-tenant, JWT por sesión, ni
  cualquier insinuación de multi-cuenta?
- [ ] **Principio 2 — Plan JSON, NUNCA SQL libre.** ¿Toda ejecución contra
  Postgres pasa por Plan JSON validado? ¿Cero SQL crudo desde el LLM o
  desde el cliente?
- [ ] **Principio 3 — Auditoría server-side día 1.** ¿El cambio mantiene
  o agrega registro en `orion_audit`? ¿No bypassea la auditoría en ningún
  path (incluido errores)?
- [ ] **Principio 4 — Operaciones bloqueadas hardcoded.** ¿La allowlist
  sigue rechazando `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`,
  `REVOKE`, `COPY`, `DO`, multi-statement? ¿Hay tests que lo cubren?
- [ ] **Principio 5 — Confirmación táctil para writes.** ¿`UPDATE`,
  `DELETE`, `INSERT` siguen requiriendo modal de confirmación humano?
  ¿No se introdujo "ejecutar sin preguntar" para ningún caso?
- [ ] **Principio 6 — Roadmap modular M1→M2→M3.** ¿El cambio pertenece al
  milestone declarado? ¿No introduce features de M2 o M3 a M1 sin ADR?
- [ ] **Principio 7 — PWA pura.** ¿No introduce dependencias de Play
  Store, AppFunctions, código nativo Kotlin, o cualquier cosa que rompa
  el modelo sideload?
- [ ] **Principio 8 — Web Speech + atajo Android.** ¿El reconocimiento
  de voz sigue dentro de la PWA? ¿No intenta interceptar Gemini sistema
  ni implementar wake word global?
- [ ] **Principio 9 — Documentación viva.** ¿El cambio actualiza la doc
  afectada (ADR, spec, runbook) **en este mismo PR**? ¿No hay "doc
  pendiente para después"?
- [ ] **Principio 10 — Tribunal.** Si es decisión arquitectónica,
  ¿pasó por debate Claude+Codex+usuario? ¿Está el ADR linkeado?
- [ ] **Principio 11 — Español primario.** ¿UX, mensajes visibles y doc
  están en español? ¿Inglés solo en código y nombres técnicos?
- [ ] **Principio 12 — ADR para decisiones arquitectónicas.** Si hubo
  alguna decisión técnica con consecuencias estructurales, ¿está
  registrada como ADR?

---

## Checklist adicional para cambios de M1

Aplicar **además** de la anterior cuando el cambio toca el flujo
operativo del MVP.

- [ ] ¿Hay confirmación táctil explícita para `UPDATE`, `DELETE`,
  `INSERT`?
- [ ] ¿Cada ejecución (exitosa, fallida, rechazada) genera un registro
  en `orion_audit`?
- [ ] ¿Toda `SELECT` lleva `LIMIT` explícito? ¿Default 100, máximo 1000?
- [ ] ¿Las operaciones bloqueadas (DROP, etc.) están cubiertas por al
  menos un test que verifique el rechazo?
- [ ] ¿`statement_timeout` está configurado en 10s en la sesión de
  `execute-plan`?
- [ ] ¿La validación del Plan JSON ocurre **antes** de cualquier acceso
  a Postgres, no después?
- [ ] ¿El plan operativo asume `service_role` como deuda M1 documentada
  y NO introduce nuevas dependencias de service_role en código que
  debería usar `orion_vox_executor` en M2?
- [ ] ¿El secreto de Gemini sigue en IndexedDB cifrado con WebCrypto +
  PIN, sin loggearse a consola, sin enviarse a backends que no sean
  Gemini API?

---

## Checklist específica para cambios de seguridad

Aplicar cuando el PR toca: allowlist, validador de Plan JSON, manejo de
secretos, Edge Functions, RLS, roles Postgres, confirmaciones de UI.

- [ ] ¿La superficie de ataque **disminuyó** o se mantuvo? Si aumentó,
  ¿está el ADR explicándolo?
- [ ] ¿Tests de seguridad cubren los nuevos paths (rechazo de DROP,
  rechazo de Plan inválido, rechazo de tabla fuera de allowlist)?
- [ ] ¿Se agregó cualquier nuevo secreto al frontend? Si sí, ¿está
  cifrado en IndexedDB? ¿Está documentado en
  `docs/06-operations/SECRETS-MANAGEMENT.md`?
- [ ] ¿Se agregó algún path que ejecute SQL **sin pasar por la
  validación del Plan JSON**? Si sí, **rechazar el PR**.
- [ ] ¿Se introdujo logging que pueda exponer plan_json sensible o
  secrets en los logs del navegador o de Supabase? Si sí, sanitizar.

---

## Checklist específica para cambios de documentación

- [ ] ¿El frontmatter YAML está completo (`title`, `status`, `milestone`,
  `owner`, `last-reviewed`, `supersedes`, `related`)?
- [ ] ¿`last-reviewed` se actualizó a la fecha del cambio?
- [ ] ¿Los links relativos resuelven correctamente?
- [ ] ¿Si el doc supera o reemplaza a otro, está marcado `supersedes:` y
  el viejo está marcado `status: deprecated`?
- [ ] ¿Si el doc es promovido desde `openspec/changes/<id>/` a
  `docs/04-specs/`, se movió la carpeta de `openspec/changes/` a
  `openspec/archive/` en el mismo PR?

---

## Cómo se usa esta checklist

1. Copiar el bloque relevante (12 principios + adicionales que apliquen)
   en el cuerpo del PR o en el `state.yaml` del change.
2. Marcar item por item con justificación cuando sea `[N/A]`.
3. Si **algún** ítem queda sin marcar y sin justificación, el PR no se
   considera revisado y no se mergea.
4. La revisión la hace un miembro del tribunal distinto al autor.
