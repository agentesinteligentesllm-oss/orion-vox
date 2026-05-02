# Orion Vox — Puente de voz entre Gemini Android y Supabase

PWA personal de uso individual que actúa como puente entre el asistente Gemini en
Android y un proyecto Supabase del usuario, permitiendo conversar en español
natural con la base de datos: consultar registros, agregar filas, actualizar
estados y obtener respuestas habladas mediante síntesis de voz, todo sin
escribir SQL ni tocar la consola de Supabase.

## Stack

- **Frontend**: PWA (sideload, sin Play Store) con **Svelte 5 + Vite +
  TypeScript** (ADR-012). Web Speech API (es-MX) para reconocimiento y
  síntesis de voz.
- **Auth**: Supabase Auth + JWT + validación `user.id ==
  ORION_ALLOWED_USER_ID` server-side.
- **IA**: Gemini API con function calling, llamada **server-side** desde
  la Edge Function `plan-intent`, devolviendo Plan JSON estructurado
  (jamás SQL libre).
- **Backend**: Supabase — Postgres + **3 Edge Functions Deno**:
  `plan-intent` (custodia Gemini key), `execute-plan` (custodia
  `service_role`, valida allowlist y redacción, audita), `schema-summary`
  (autogenerada desde `pg_catalog`).
- **Persistencia**: Tabla `orion_audit` server-side desde el día uno
  (15 columnas en inglés). **Sin secretos en cliente**: Gemini key y
  `service_role` viven en env vars de las Edge Functions; el cliente
  sólo guarda Supabase URL + `anon_key` pública + sesión Supabase Auth.

## Estado actual

**Fase 0 — Documentación fundacional completa (post Wave 1, 2 y 3
de reformas tras auditoría Codex).** El proyecto está en estado
greenfield: la arquitectura, gobernanza, principios constitucionales,
12 ADRs, 14 specs y change `m1-mvp` están escritos y aprobados; la
implementación de M1 (MVP funcional + base segura) está pendiente de
arrancar (ver `openspec/changes/m1-mvp/tasks.md`, Bloque 0).

## Hardware target

Cubot KingKong 9 (Android stock con Gemini integrado, sin Bixby, sin Quick
Phrases, sin AppFunctions). El único atajo hands-free disponible es
"OK Google, abrí Orion Vox", que lanza la PWA con el micrófono ya activo.

## Quick links

- [docs/INDEX.md](docs/INDEX.md) — Índice navegable de toda la documentación.
- [CLAUDE.md](CLAUDE.md) — Contexto operativo para Claude y colaboradores IA.
- [openspec/README.md](openspec/README.md) — Workflow de cambios incrementales
  (proposals, specs, designs, tasks).
- [docs/00-constitution/CONSTITUTION.md](docs/00-constitution/CONSTITUTION.md)
  — Los 12 principios innegociables del proyecto.

## Licencia

Uso personal. No distribución. No publicación en stores. No multi-usuario.
