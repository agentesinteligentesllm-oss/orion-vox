---
title: Backup y recovery — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/DEPLOYMENT-TOPOLOGY.md
  - ../02-architecture/AUDIT-MODEL.md
  - SETUP-SUPABASE.md
  - INSTALLATION-CUBOT.md
  - RUNBOOK.md
---

# Backup y recovery — Orion Vox

Estrategia de backup y recovery para Orion Vox M1: qué se respalda,
con qué frecuencia, cómo se restaura, qué se pierde si algo sale mal.

---

## 1. Qué hay que respaldar

| Activo                                 | Dónde vive                       | Crítico | Recuperable sin backup |
|----------------------------------------|----------------------------------|---------|------------------------|
| Tablas del usuario en Postgres         | Supabase Cloud                   | **SÍ**  | NO                     |
| Tabla `orion_audit`                    | Supabase Cloud                   | **SÍ** (forense)  | NO                     |
| Schema (DDL) de las tablas             | Supabase Cloud                   | SÍ      | Recuperable parcialmente vía dump anterior |
| Edge Functions code                    | Repo Git local del usuario       | SÍ      | Sí, si está en Git     |
| Configuración Supabase (RLS, ext.)     | Supabase Cloud + scripts SQL     | Medio   | Sí, si scripts están versionados |
| Bundle PWA                             | Hosting estático                 | Bajo    | Re-deployable desde repo Git |
| `secrets` cifrados (cliente)           | IndexedDB del Cubot              | Bajo    | Re-ingresables desde password manager del usuario |
| `audit_mirror` (cliente)               | IndexedDB del Cubot              | Bajo    | Regenerable desde `orion_audit` server |
| `schema_cache` (cliente)               | IndexedDB del Cubot              | Bajo    | Regenerable llamando `schema-summary` |

**Conclusión**: lo único realmente crítico que requiere backup activo
está en **Postgres / Supabase**. Todo lo demás se reconstruye.

---

## 2. Backups de Supabase

### 2.1 Free tier — backups manuales

El free tier de Supabase **no incluye backups automáticos garantizados**
con retención larga. Hacer backups manuales con `pg_dump`.

**Frecuencia recomendada**: semanal mientras Orion Vox sea exploratorio.
Mensual cuando esté estable.

**Comando** (desde tu máquina local):

```bash
# Conexión vía pooler (recomendado para dump completo)
PGPASSWORD='<DB_PASSWORD>' pg_dump \
  -h <project-ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  --schema=public \
  --no-owner --no-privileges \
  -f orion-vox-backup-$(date +%Y-%m-%d).sql
```

Ajustar `--schema=public` si tus tablas viven en otro schema.

**Output**: archivo SQL completo (`orion-vox-backup-2026-05-01.sql`)
con DDL + datos.

### 2.2 Pro tier — backups automáticos

Si pasás a Supabase Pro ($25/mes):

- Backups diarios automáticos.
- Retención 7 días por default.
- Point-in-time recovery (PITR) opcional con add-on.
- Restore con un click desde dashboard.

> Para single user M1 exploratorio, free tier + dump semanal manual es
> aceptable. Pro tier es razonable cuando Orion Vox se vuelve
> herramienta diaria.

### 2.3 Backup de `orion_audit` solo

Si querés exportar solo la auditoría (más liviano que el dump completo):

```bash
PGPASSWORD='<DB_PASSWORD>' pg_dump \
  -h <project-ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  --table=public.orion_audit \
  --no-owner --no-privileges \
  -f orion-audit-$(date +%Y-%m-%d).sql
```

**Tamaño esperado**: con cientos de registros, < 1 MB. Con miles,
algunos MB. Solo crece notablemente si lo usás muy intensivo.

### 2.4 Almacenamiento de los dumps

- **Local**: directorio versionado fuera de Git (los dumps tienen
  datos sensibles).
- **Cloud personal**: cifrado en Drive / Dropbox / etc.
- **Password manager**: `DB_PASSWORD` ya está ahí; los dumps no.

Mantener al menos los **últimos 4 dumps** (rotación mensual).

---

## 3. Backup de credenciales PWA

**M1: no se hace backup automatizado.** Razón:

- Las credenciales en IndexedDB son **regenerables**:
  - Gemini API key: se rota desde Google AI Studio.
  - Supabase URL: estable, lo tenés en password manager.
  - Supabase service_role: estable, también en password manager (o
    rotable).
  - PIN: el usuario lo elige.
- Si perdés el Cubot, rotás keys + setup nuevo Cubot.

**Lo que sí mantener al día**:

- **Password manager con**: SUPABASE_URL, SUPABASE_SERVICE_ROLE,
  GEMINI_API_KEY, DB_PASSWORD.
- **Git con**: código de Edge Functions, scripts SQL de schema, código
  de la PWA.

Esos dos lugares son la fuente de verdad para reconstruir todo.

---

## 4. Recovery — escenarios

### 4.1 Escenario A: pérdida del Cubot

**Impacto**: dispositivo físico perdido, IndexedDB con secrets
cifrados.

**Pasos**:

1. **Inmediato**: rotar Gemini API key (https://aistudio.google.com/app/apikey).
2. **Inmediato**: rotar Supabase service_role (Dashboard → Settings →
   API → "Reset service_role key"). **Cuidado**: esto invalida el
   role en cualquier otro sistema que lo use.
3. Comprar/conseguir nuevo dispositivo Android compatible.
4. Seguir `INSTALLATION-CUBOT.md` con las nuevas credenciales.
5. `audit_mirror` local se reconstruye automáticamente al consultar.

**Tiempo recovery**: 30-60 minutos (incluyendo setup nuevo device).
**Datos perdidos**: cero (todo lo importante está en Supabase).

### 4.2 Escenario B: corrupción de `orion_audit`

**Impacto**: tabla de auditoría perdida o corrupta.

**Pasos**:

1. Dashboard Supabase → SQL Editor.
2. `DROP TABLE public.orion_audit;` (si quedó algo a medias).
3. Re-crear con DDL de `SETUP-SUPABASE.md §4`.
4. Si tenés dump reciente: `psql -h ... -f orion-audit-YYYY-MM-DD.sql`.
5. Si no: aceptar pérdida del histórico previo.

**Tiempo recovery**: 5-10 minutos.
**Datos perdidos**: depende del dump más reciente.

### 4.3 Escenario C: corrupción de tablas del usuario

**Impacto**: una o más tablas del dominio perdidas o con datos
incorrectos (ej: alguien hizo un DELETE no intencional desde fuera de
Orion Vox).

**Pasos**:

1. **Diagnóstico**: SQL editor → query a `orion_audit` para ver qué
   pasó (si fue desde Orion Vox queda en audit; si fue desde
   dashboard, no).
2. Cargar dump más reciente:

```bash
PGPASSWORD='<DB_PASSWORD>' psql \
  -h <project-ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f orion-vox-backup-YYYY-MM-DD.sql
```

3. Si solo querés restaurar UNA tabla, editar el dump para incluir
   solo esa tabla, o dropear/recrear y luego importar.

**Tiempo recovery**: 10-30 minutos según tamaño del dump.
**Datos perdidos**: cambios desde el último dump.

### 4.4 Escenario D: pérdida total del proyecto Supabase

**Impacto**: el proyecto entero se eliminó (accidentalmente, o
Supabase tuvo incident catastrófico).

**Pasos**:

1. Crear proyecto Supabase nuevo (`SETUP-SUPABASE.md`).
2. Cargar el dump más reciente:

```bash
PGPASSWORD='<NEW_DB_PASSWORD>' psql \
  -h <new-project-ref>.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -f orion-vox-backup-YYYY-MM-DD.sql
```

3. Re-deployar Edge Functions (`supabase functions deploy ...`).
4. Actualizar la PWA en el Cubot con el nuevo URL + service_role.

**Tiempo recovery**: 60-120 minutos.
**Datos perdidos**: cambios desde el último dump.

### 4.5 Escenario E: pérdida del bundle PWA en hosting

**Impacto**: Vercel project eliminado o hosting caído.

**Pasos**:

1. `vercel deploy --prod` desde el repo Git.
2. Si la URL cambió, actualizar el icono del Cubot (eliminar e
   instalar de nuevo desde la nueva URL).

**Tiempo recovery**: 5-10 minutos.
**Datos perdidos**: cero (el bundle es 100% reproducible desde Git).

---

## 5. DR drill — prueba de restauración

**M1**: prueba semestral.
**M2**: trimestral.

**Procedimiento del drill**:

1. Crear un proyecto Supabase de prueba (separado del production).
2. Cargar el último dump como si fuera recovery real.
3. Verificar: tablas presentes, conteos correctos, `orion_audit` con
   últimos N registros.
4. Tomar nota de tiempo total + cualquier paso problemático.
5. Borrar el proyecto de prueba.

Documentar el resultado en notas personales. Si algún paso falló,
ajustar este documento.

---

## 6. Política de retención de backups

| Tipo                       | Retención mínima | Almacenamiento                      |
|----------------------------|------------------|-------------------------------------|
| Dump completo semanal      | 4 dumps (1 mes)  | Local + cloud personal cifrado      |
| Dump mensual               | 12 dumps (1 año) | Cloud personal cifrado              |
| Dump anual                 | indefinido       | Cloud personal cifrado              |
| Dump pre-cambio mayor      | indefinido       | Cloud personal cifrado, etiquetado  |

**Pre-cambio mayor**: antes de cualquier migración de schema, deploy
de versión major (1.x → 2.x), o experimento riesgoso, hacer dump y
guardarlo etiquetado (ej: `pre-migration-prompt-v2-2026-08-01.sql`).

---

## 7. `orion_audit` como herramienta de recovery

`orion_audit` no es solo forense; es también **fuente de verdad de
qué hizo el sistema**. En recovery permite:

- Saber si un cambio destructivo vino desde Orion Vox o de fuera.
- Reconstruir el orden de operaciones para entender el estado actual.
- Identificar el `user_prompt` que disparó algo no esperado (mejora
  futura del prompt).

Query útil — ver operaciones destructivas en las últimas 24h:

```sql
select ts, user_prompt, plan_json->>'operation' as op,
       plan_json->>'table' as tbl, rows_affected, error
from orion_audit
where plan_json->>'operation' in ('insert','update','delete')
  and ts > now() - interval '24 hours'
order by ts desc;
```

---

## 8. Lo que NO se respalda — recordatorio

- **Logs de Edge Functions**: retención 7 días (free tier). Si necesitás
  forense más larga, exportá manualmente o pasá a Pro.
- **Métricas de Gemini**: solo en Google AI Studio (no exportable
  fácilmente).
- **Tu PIN**: nunca se almacena, nunca se respalda. Si lo olvidás,
  factory reset.
- **Sesión actual del Cubot**: si forzás cierre con `clear data`, se
  pierde todo el estado local sin backup. Es by design.

---

## 9. Checklist semanal del usuario

```
[ ] Dump completo de Supabase (pg_dump)
[ ] Verificar que el dump no esté vacío (ls -lh, size > 0)
[ ] Subir a cloud personal cifrado
[ ] Rotar dumps si tenés más de 4 (mantener los últimos 4)
[ ] (Mensual) Marcar uno como "mensual" y mantenerlo separado
```

---

## 10. Roadmap

- **M1**: este documento. Backups manuales semanales.
- **M2**: scripts de backup automatizados (cron en alguna máquina del
  usuario). Posible add-on PITR si se pasa a Pro.
- **M3**: si Orion Vox se generalizara, considerar replication o
  read-only mirror para DR activo.
