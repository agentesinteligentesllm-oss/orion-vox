---
title: Modelo de costos — Orion Vox
status: draft
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/DEPLOYMENT-TOPOLOGY.md
  - SETUP-SUPABASE.md
  - SETUP-GEMINI-API.md
---

# Modelo de costos — Orion Vox

> **Status: draft.** Los precios de Gemini API y Supabase fluctúan.
> Este documento se revisa **trimestralmente** y se actualiza cuando
> haya cambio relevante.

Estimación de costos operativos de Orion Vox por escenario de uso.
M1 single user con uso personal típico cabe en free tier de todos los
servicios — costo objetivo: **$0/mes**.

---

## 1. Resumen rápido

| Escenario                           | Costo mensual estimado |
|-------------------------------------|------------------------|
| **M1 — uso personal típico**        | **$0**                 |
| M1 — uso intensivo personal         | $0 a $5                |
| Producción single-user con SLA      | $25 a $40              |
| Equipo pequeño (5-10 users)         | $50 a $100             |

---

## 2. Componentes de costo

### 2.1 Hosting PWA (Vercel free tier)

| Métrica                       | Free tier              | Uso M1 esperado |
|-------------------------------|------------------------|-----------------|
| Bandwidth                     | 100 GB/mes             | < 1 GB/mes      |
| Edge requests                 | 1M/mes                 | < 10k/mes       |
| Build minutes                 | 6000 min/mes           | < 60 min/mes    |
| Sites                         | Ilimitados             | 1               |

**Costo M1**: $0.

**Si te pasás del free tier**: Pro $20/mes.

**Alternativas igual gratis**:

- Netlify free: similar.
- Cloudflare Pages free: más generoso aún (500 builds/mes, unlimited
  bandwidth).
- GitHub Pages: ilimitado para sitios públicos.

### 2.2 Supabase

| Plan        | Costo mensual | Postgres | Storage | Edge invocations | Backups        |
|-------------|---------------|----------|---------|------------------|----------------|
| **Free**    | **$0**        | 500 MB   | 1 GB    | 500k/mes         | Manual (pg_dump) |
| Pro         | $25           | 8 GB     | 100 GB  | 2M/mes           | Daily auto, 7 días retención |
| Team        | $599          | -        | -       | -                | -              |

**Uso M1 esperado**:

| Métrica                 | Free tier     | Estimado M1 (5-20 ops/día)        |
|-------------------------|---------------|-----------------------------------|
| Postgres size           | 500 MB        | < 50 MB (incluye `orion_audit`)   |
| Edge invocations / mes  | 500k          | 300-1200/mes                      |
| Bandwidth               | 2 GB / mes    | < 100 MB/mes                      |
| Connections             | 60 max        | 1-3 simultáneas                   |

**Costo M1**: $0.

**Cuándo justificar Pro ($25/mes)**:

- Backups automáticos diarios con retención.
- > 500k Edge invocations/mes (uso muy intensivo).
- Postgres > 500 MB.
- Quiere SLA real.

### 2.3 Gemini API

> Precios de referencia 2026; verificar en https://ai.google.dev/pricing
> al hacer la estimación real.

#### gemini-2.5-flash (default M1)

| Tier        | Input ($/1M tokens) | Output ($/1M tokens) | Free tier RPD |
|-------------|--------------------|-----------------------|----------------|
| Free        | $0                 | $0                    | ~1500 RPD      |
| Paid        | ~$0.075            | ~$0.30                | mucho más alto |

#### gemini-2.5-pro

| Tier        | Input ($/1M tokens) | Output ($/1M tokens) | Free tier RPD |
|-------------|--------------------|-----------------------|----------------|
| Free        | $0                 | $0                    | ~50 RPD        |
| Paid        | ~$1.25             | ~$5.00                | mucho más alto |

#### Estimación uso M1 con Flash

| Variable                     | Valor típico                |
|------------------------------|-----------------------------|
| Operaciones por día          | 10                          |
| Schema-summary (input)       | ~3000 tokens                |
| User prompt (input)          | ~50 tokens                  |
| System prompt + few-shot     | ~2000 tokens                |
| Plan JSON output             | ~300 tokens                 |
| **Total tokens por op**      | **~5350 tokens** (5050 in + 300 out) |
| **Total tokens por día**     | ~53k                        |
| **Total tokens por mes**     | ~1.6M (1.5M in + 100k out)  |

Si fueras paid (no aplica en free tier):

- Input: 1.5M × $0.075 / 1M = **$0.11**
- Output: 100k × $0.30 / 1M = **$0.03**
- **Total: ~$0.15/mes** (con uso típico)

**En free tier: $0/mes.**

#### Estimación uso intensivo (50 ops/día)

- Total tokens / mes: ~8M (7.5M in + 0.5M out)
- En free tier: cabe (solo 50 RPD vs límite ~1500)
- **Costo: $0/mes**

#### Cuándo se sale del free tier de Flash

- > 1500 RPD consistentemente (uso muy heavy).
- Schema gigante que infla input tokens (10k+ per op).

En esos casos, paid tier de Flash sigue siendo barato (~$5-10/mes para
uso muy intenso).

### 2.4 Dominio (opcional)

- Subdomain del hosting: $0.
- Dominio propio: $10-15/año (Namecheap, Porkbun, etc.).

---

## 3. Escenarios completos

### 3.1 M1 uso personal típico (5-20 ops/día)

| Componente   | Plan      | Costo/mes |
|--------------|-----------|-----------|
| Vercel       | Free      | $0        |
| Supabase     | Free      | $0        |
| Gemini API   | Free tier | $0        |
| Dominio      | -         | $0        |
| **Total**    |           | **$0**    |

### 3.2 M1 uso intensivo personal (50-100 ops/día)

| Componente   | Plan        | Costo/mes      |
|--------------|-------------|----------------|
| Vercel       | Free        | $0             |
| Supabase     | Free        | $0             |
| Gemini API   | Free tier o paid Flash | $0 a $5  |
| Dominio      | -           | $0 a $1.25     |
| **Total**    |             | **$0 a $6**    |

### 3.3 Producción single user con SLA

| Componente   | Plan          | Costo/mes      |
|--------------|---------------|----------------|
| Vercel       | Pro           | $20            |
| Supabase     | Pro           | $25            |
| Gemini API   | Paid Flash    | $5-10          |
| Dominio      | propio        | $1.25          |
| **Total**    |               | **$50-60**     |

(Razones para subir: SLA, backups automáticos, múltiples devices,
respuesta más predecible.)

### 3.4 Equipo pequeño (5-10 users) — fuera de scope M1

> No soportado en M1 (single user). Acá solo como referencia para
> dimensionar si Orion Vox se generalizara.

| Componente   | Plan          | Costo/mes      |
|--------------|---------------|----------------|
| Vercel       | Pro           | $20            |
| Supabase     | Pro           | $25 + add-ons  |
| Gemini API   | Paid          | $30-80         |
| Dominio      | propio        | $1.25          |
| **Total**    |               | **~$80-130**   |

---

## 4. Estimación con `orion_audit` (proxy real)

Una vez Orion Vox esté en uso, podés estimar tu propio costo Gemini
con la auditoría:

```sql
-- Calls a Gemini en el último mes
select count(*) as calls
from orion_audit
where ts > now() - interval '30 days';
```

Multiplicar por costo unitario aproximado (~$0.0001 por call con Flash
en Paid tier) da un floor del costo.

> En Free tier el costo real es $0 hasta el límite. La estimación
> solo importa si pasás a paid.

---

## 5. Optimizaciones de costo

### 5.1 Reducir input tokens

- **Excluir tablas no usadas** del schema-summary (`SCHEMA-SUMMARY.md §2`).
- **Acortar hints semánticos** redundantes.
- **System prompt conciso** (`PROMPT-ENGINEERING.md`).

### 5.2 Reducir cantidad de calls

- **Cache agresivo del schema** (TTL 24h por default).
- **Confirmar antes de llamar a Gemini** si el usuario duda (no
  desperdiciar call).

### 5.3 Modelo correcto

- **Flash por default** (M1).
- **Pro solo si Flash falla calidad** (M3 evaluable; típicamente Flash
  alcanza para CRUD básico).

### 5.4 Hosting

- Para single user, free tiers de Vercel/Netlify/Cloudflare son más
  que suficientes.
- No deployar más de un proyecto innecesariamente.

---

## 6. Costos NO monetarios

Costos que no se ven en el bill pero existen:

- **Tiempo de setup inicial**: ~1.5 horas (Supabase + Gemini + PWA +
  Cubot).
- **Tiempo de mantenimiento mensual**: ~30 min (backups manuales,
  revisión audit).
- **Tiempo de aprendizaje del prompting**: días de uso casual hasta
  desarrollar intuición.
- **Curva de confianza con writes**: el modal protege, pero la
  primera vez que lo usás para un delete se siente raro. Aceptado.

---

## 7. Si querés evitar ALL costos

Configuración 100% gratis sostenible:

- Hosting: Cloudflare Pages (más generoso).
- Supabase: Free.
- Gemini: Free tier de Flash.
- Dominio: usar subdomain del hosting.
- Backups: manuales semanales con `pg_dump`.

Esto **siempre** funciona en M1 con uso personal.

---

## 8. Triggers para revisar este documento

- Cambio de pricing de Gemini API anunciado por Google.
- Cambio de plan de Supabase.
- Tu uso pasa de 50 ops/día sostenido.
- Migración a M2 (introduce `plan-intent` que duplica calls Gemini =
  recalibra costos).
- Si tu Postgres pasa los 500 MB.

---

## 9. Roadmap del cost model

- **M1**: este documento, basado en estimación.
- **M2**: agregar costos de Edge `plan-intent` (más invocations,
  más bandwidth).
- **M3**: si se considera fine-tuning de Gemini, agregar costo de
  training + serving del modelo custom.
