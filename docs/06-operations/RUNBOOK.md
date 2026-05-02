---
title: Runbook — incidentes y respuesta
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OBSERVABILITY.md
  - BACKUP-RECOVERY.md
  - TROUBLESHOOTING.md
  - ../02-architecture/AUDIT-MODEL.md
  - ../02-architecture/SECURITY-MODEL.md
---

# Runbook — incidentes y respuesta

Procedimientos operativos para incidentes comunes en Orion Vox M1.
Cada entrada: síntoma, diagnóstico, mitigación inmediata, fix
duradero.

> Single user: la "guardia" sos vos. Tener este documento accesible
> desde el Cubot (Drive / Obsidian / etc.) ayuda en momentos de
> apuro.

---

## INC-001: Gemini cae (5xx, quota, timeout)

### Síntoma

- PWA muestra "Gemini saturado" o "Gemini falló" tras retries.
- Última operación en `orion_audit` no se completa.
- Health check de Gemini en config falla.

### Diagnóstico

1. Verificar si es 429 (quota) o 5xx (servicio):
   - Devtools Chrome → Network → ver el response code de
     `generativelanguage.googleapis.com`.
2. Chequear status oficial: https://status.cloud.google.com
3. Mirar Google AI Studio → quota usage.

### Mitigación inmediata

- **Si quota agotada**:
  - Esperar reset (24h para RPD; 1 minuto para RPM).
  - Pasar temporalmente a `gemini-2.5-flash-8b` (menor costo, menor
    cuota usada por request).
  - Considerar paid tier si es recurrente.
- **Si 5xx servicio**:
  - Esperar (Google suele recuperarse rápido).
  - PWA con retries exponenciales ya hace lo suyo.
- **Workaround**: para tareas urgentes, ejecutar en SQL Editor del
  dashboard Supabase. NO bypassear Orion Vox para evitar audit.

### Fix duradero

- Si cuota se agota recurrentemente: pasar a Gemini paid tier.
- Si servicio inestable: agregar fallback a otro modelo (M3).

---

## INC-002: Plan JSON inválido recurrente

### Síntoma

- Múltiples entradas en `orion_audit` con `error like 'invalid_plan%'`.
- Usuario frustrado: las mismas frases dejaron de funcionar.

### Diagnóstico

```sql
select user_prompt, plan_json, error
from orion_audit
where error like 'invalid_plan%'
  and ts > now() - interval '24 hours'
order by ts desc;
```

Patrones comunes:

- **Schema stale**: Gemini referencia columnas/tablas que ya no existen.
- **Prompt drift**: cambiaste el prompt en último deploy y degradó.
- **Modelo Gemini cambió**: Google actualizó el modelo y se comporta
  distinto.

### Mitigación inmediata

1. **Refrescar schema** (`DAILY-USAGE.md §4`).
2. **Si refresh no soluciona**: revertir el último deploy (rollback,
   `DEPLOY-PROCEDURE-PWA.md §8`).
3. **Workaround**: usar fallback teclado con frases muy explícitas
   ("select id, titulo from tareas where estado = 'activa'" — no, no
   se acepta SQL libre, pero "lista las tareas con estado igual a
   activa" sí funciona).

### Fix duradero

- Identificar la causa raíz (schema, prompt, modelo).
- Si es prompt: incrementar versión + agregar few-shot que cubra el
  caso fallido (`PROMPT-ENGINEERING.md`).
- Si es schema: ya cubierto por refresh.
- Si es modelo: pinear versión exacta del modelo en config (ej:
  `gemini-2.5-flash-001` en lugar del alias).

---

## INC-003: Supabase rate-limita o conexiones agotadas

### Síntoma

- Edge Functions devuelven 503 o "too many connections".
- `orion_audit` tiene gaps temporales.
- Dashboard Supabase muestra alerta.

### Diagnóstico

1. Dashboard Supabase → Reports → Database → ver conexiones activas.
2. Ver `pg_stat_activity`:

```sql
select pid, state, query_start, substring(query, 1, 80)
from pg_stat_activity
where datname = 'postgres'
order by query_start;
```

3. Identificar query culpable o connection leak.

### Mitigación inmediata

- **Kill conexiones colgadas**:

```sql
select pg_terminate_backend(pid)
from pg_stat_activity
where state = 'idle in transaction'
  and (now() - state_change) > interval '5 minutes';
```

- Si la Edge tiene un connection leak: redeploy de la función fuerza
  reset de isolates.

### Fix duradero

- Revisar el código de la Edge para asegurar `client.release()` o
  uso de pool correctamente.
- Considerar pasar a Pro tier si free no alcanza.
- Crear índices en columnas frecuentemente filtradas (revisar `pg_stat_statements`).

---

## INC-004: Schema cambió y allowlist no se actualizó

### Síntoma

- `request_clarification` constante: "no encuentro tabla X" sobre
  tablas que sí existen.
- `orion_audit` con errores de "column does not exist".

### Diagnóstico

1. Comparar:

```sql
select table_name from information_schema.tables
where table_schema = 'public';
```

vs lo que devuelve `schema-summary` Edge.

2. Ver si la lista `SCHEMA_SUMMARY_EXCLUDED_TABLES` excluye lo que no
   debería excluir:

```bash
supabase secrets list
```

### Mitigación inmediata

1. Refrescar schema desde la PWA (Configuración → Refrescar schema).
2. Si la tabla está excluida por error, ajustar:

```bash
supabase secrets set SCHEMA_SUMMARY_EXCLUDED_TABLES="orion_audit"
supabase functions deploy schema-summary --no-verify-jwt
```

3. Refrescar de nuevo desde la PWA.

### Fix duradero

- M2: allowlist server-side estricta con UI de config para gestionarla
  (no env vars sueltas).
- Mientras tanto: documentar en notas personales qué se excluye y por
  qué.

---

## INC-005: Credenciales perdidas / olvidé el PIN

### Síntoma

- 3+ intentos fallidos al PIN; bloqueo escalonado.
- No te acordás del PIN ni tenés WebAuthn configurado.

### Diagnóstico

No hay diagnóstico — es un caso terminal del PIN.

### Mitigación inmediata

**Factory reset de la PWA**:

1. Chrome Android → menú → Settings → Site settings.
2. Buscar Orion Vox → Storage → "Clear data".
3. Abrir la PWA: arranca como primera vez.
4. Repetir setup inicial (`INSTALLATION-CUBOT.md §6`).
5. Re-ingresar credenciales desde password manager.

**Lo que NO se pierde** (vive en Supabase):

- Tablas del usuario.
- `orion_audit` completo.

**Lo que SE pierde** (vivía en IndexedDB):

- `audit_mirror` local (regenerable).
- `schema_cache` (regenerable).
- Hints semánticos (re-ingresar a mano).
- Settings UX personalizados.

### Fix duradero

- **PIN nuevo**: anotalo en password manager.
- **Configurar WebAuthn / biometría** si el dispositivo lo soporta:
  reduce dependencia del PIN.

---

## INC-006: `orion_audit` gigante / performance degradada

### Síntoma

- Inserts a `orion_audit` empiezan a tardar más.
- Queries a la tabla tardan segundos.
- Tabla pasa varios millones de filas.

### Diagnóstico

```sql
select pg_size_pretty(pg_total_relation_size('public.orion_audit')) as size,
       count(*) as rows
from public.orion_audit;
```

Threshold M1: si supera 1M filas o 500MB, abrir este incidente.

### Mitigación inmediata

1. **VACUUM ANALYZE** para recuperar performance:

```sql
vacuum analyze public.orion_audit;
```

2. **Reindex** si los índices están bloated:

```sql
reindex table public.orion_audit;
```

### Fix duradero

- **Política de retención** (M2): borrar registros > N meses.

```sql
-- Ejemplo: borrar > 90 días
delete from public.orion_audit
where ts < now() - interval '90 days';
vacuum analyze public.orion_audit;
```

- **Particionado por mes** si crece sostenidamente:

```sql
-- M2: convertir a tabla particionada por ts (rango mensual).
-- Documentar en spec dedicado.
```

- Antes de borrar, considerar exportar a archivo (audit histórico):

```bash
pg_dump --table=public.orion_audit --data-only \
  -h ... -U postgres -d postgres \
  -f audit-archive-pre-2026.sql
```

---

## INC-007: Sospecha de operación destructiva no autorizada

### Síntoma

- Datos faltantes en alguna tabla.
- Conteo distinto al esperado.
- "yo no borré eso".

### Diagnóstico — INMEDIATO

```sql
-- Ver últimas 4 horas de operaciones destructivas
select ts, plan_json->>'operation' as op,
       plan_json->>'table' as tbl,
       rows_affected, was_confirmed,
       user_prompt, sql_executed, sql_params
from orion_audit
where plan_json->>'operation' in ('insert','update','delete')
  and ts > now() - interval '4 hours'
order by ts desc;
```

### Mitigación inmediata

1. **Identificar el momento** del cambio sospechoso desde audit.
2. **Si fue desde Orion Vox**: el `user_prompt` te dice qué dijiste.
   - ¿Fue intencional? Caso cerrado.
   - ¿No fue intencional? El modal debería haber gateado. Si pasó,
     bug serio (escalar a investigación de seguridad).
3. **Si NO está en audit**: el cambio vino de fuera (dashboard, psql,
   otra app). Investigar logs de Supabase y herramientas externas.

### Restore

Si el cambio no se puede revertir manualmente:

1. Identificar el dump más reciente **anterior** al incidente.
2. Restaurar **solo la tabla afectada** (ver
   `BACKUP-RECOVERY.md §4.3`).
3. Re-aplicar manualmente los cambios legítimos posteriores al dump
   (usando audit como guía).

### Fix duradero

- Si el modal se saltó: investigar el código y agregar test de
  regresión.
- Si fue prompt injection: revisar el `user_prompt` original;
  considerar agregar regex de detección de patrones sospechosos en
  el prompt.
- M2: preview firmado HMAC cierra el vector cliente-comprometido.

---

## INC-008: PWA no se actualiza tras nuevo deploy

### Síntoma

- Deployaste nueva versión, el Cubot sigue mostrando la anterior.
- `client_version` en `orion_audit` no actualizó.

### Diagnóstico

1. Devtools Chrome remoto (USB debug del Cubot) → Application → SW.
2. Ver si SW está en estado "waiting" o "activated".
3. Verificar versión del bundle cargado.

### Mitigación inmediata

1. Forzar update:
   - Cerrar la PWA completamente (swipe out de recents).
   - Abrir de nuevo.
   - El SW debe detectar nueva versión y aplicar (o quedar en
     "waiting").
2. Si sigue: Chrome → menú → "Refresh" forzado (no funciona sobre SW
   ya cacheado).
3. Como último recurso: Site settings → Clear data (perdés
   IndexedDB).

### Fix duradero

- En el SW: implementar **skip waiting** + **claim clients** para
  forzar update inmediato:

```javascript
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
```

- Asegurar que `CACHE_VERSION` se bumpea en cada deploy (`DEPLOY-PROCEDURE-PWA.md §6`).

---

## INC-009: Service_role o Gemini key sospechosos de filtrado

### Síntoma

- Cuota Gemini consumida más rápido de lo esperado.
- Operaciones en `orion_audit` con horarios raros.
- Notificación de Google de actividad sospechosa.

### Mitigación inmediata — URGENTE

1. **Rotar Gemini API key** (https://aistudio.google.com/app/apikey →
   delete + create new).
2. **Rotar Supabase service_role** (Dashboard → Settings → API →
   "Reset service_role key").
3. Actualizar credenciales en la PWA del Cubot.
4. Revisar `orion_audit` por operaciones no familiares.

### Fix duradero

- Si la fuga ocurrió por error humano (commit accidental, etc.): post
  mortem + agregar pre-commit hooks que detecten secrets.
- Acelerar cronograma M2 (mover keys server-side).
- Si la fuga es del dispositivo: factory reset + considerar device
  nuevo.

---

## INC-010: Cubot KK9 perdido o robado

Ver `BACKUP-RECOVERY.md §4.1` para el procedimiento completo.

**Resumen**: rotar todas las keys → setup nuevo dispositivo → recovery
en 30-60 min sin pérdida de datos.

---

## INC-011: Web Speech API no funciona en Cubot KK9

> **Contexto**: Web Speech (Recognition + Synthesis) en Cubot KK9 NO
> está validado por el equipo (ver `INSTALLATION-CUBOT.md` §6.bis).
> Este incidente cubre el caso en que el smoke test pre-uso falla, o
> en que la voz deja de funcionar tras estar funcionando.

### Síntoma

- Tocar el botón "TOCÁ PARA HABLAR" no captura nada (mic no se activa
  o `onresult` nunca dispara).
- TTS no produce audio (silencio absoluto, aunque el volumen está
  arriba).
- `speechSynthesis.getVoices()` devuelve `[]` o sin voces `es-*`.
- `SpeechRecognition` lanza `error: 'service-not-allowed'` o
  `'not-allowed'` consistentemente.

### Diagnóstico

1. **Confirmar que es el browser, no la app**. Abrir Chrome DevTools
   remoto y correr el snippet del smoke test (`INSTALLATION-CUBOT.md`
   §6.bis). Si falla en consola pelada, no es bug de Orion Vox: es
   límite del dispositivo.
2. **Verificar Chrome version**: `chrome://version`. Versiones < 110
   suelen tener Web Speech roto en Android no-GMS.
3. **Verificar permisos**: Settings → Apps → Chrome → Permissions →
   Microphone debe estar en Allow (no "Ask every time", no Deny).
4. **Verificar TTS engine del sistema**: Settings → Accessibility →
   Text-to-speech output. Debe haber un engine instalado y al menos
   una voz español descargada.
5. **Verificar conectividad**: Web Speech Recognition en Chrome
   Android usa servicios cloud de Google — sin internet no funciona,
   y sin GMS completos puede no autenticar. Probar con WiFi diferente.

### Mitigación inmediata

1. **Chrome al día**: actualizar Chrome a la última versión disponible
   en el Cubot. Si Play Store no está, descargar APK oficial de Chrome
   desde `https://www.google.com/chrome/` (firma verificada).
2. **Permisos**: Settings → Apps → Chrome → Permissions → Microphone =
   Allow. Reiniciar Chrome.
3. **Voces TTS español**: Settings → Accessibility → Text-to-speech →
   "Google text-to-speech engine" → Install voice data → bajar
   "Spanish (Mexico)" o "Spanish (Spain)" como fallback. Reiniciar.
4. **Probar en otra red**: si funciona con WiFi pero no con 4G del
   Cubot (o viceversa), es problema de conectividad o resolver DNS.
5. **Fallback inmediato**: la PWA soporta input de **teclado** (escribir
   la frase) y lectura **visual** (leer el resultado en pantalla en
   lugar de escucharlo). Activar este modo desde Configuración →
   "Modo silencioso" mientras se diagnostica.

### Fix duradero

- Si el smoke test inicial falla **completamente** y ningún workaround
  reactiva Web Speech: documentar como **bloqueador del proyecto en
  este dispositivo**. Opciones:
  1. Probar en otro device (Pixel, Samsung con GMS) para descartar que
     es algo de la PWA.
  2. Considerar fallback definitivo: input de texto + TTS server-side
     (TTS hosted en una Edge Function). **Fuera de scope M1** — sería
     ADR nuevo y change OpenSpec.
  3. Cambiar el dispositivo target del proyecto (decisión del usuario).
- Si funciona pero con flakiness: documentar el patrón (qué hora del
  día, qué red, etc.) y considerar agregar retries + fallback
  automático a teclado en la PWA.

---

## Checklist post-incidente

Para cada incidente declarado, **siempre**:

```
[ ] Documentar en notas personales: fecha, síntoma, causa raíz, mitigación
[ ] Si la causa raíz es código: fix + test de regresión
[ ] Si la causa raíz es config: actualizar el setup doc relevante
[ ] Si la causa raíz es de seguridad: revisar SECURITY-MODEL.md y THREAT-MODEL.md
[ ] Si surgieron preguntas que este runbook no cubre: agregar entrada nueva acá
```

---

## Plantilla de entrada nueva

```markdown
## INC-NNN: <título>

### Síntoma
### Diagnóstico
### Mitigación inmediata
### Fix duradero
```

Mantener este documento vivo es lo que lo hace útil en momentos de
crisis.
