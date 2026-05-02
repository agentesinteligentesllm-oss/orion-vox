---
title: Setup Gemini API — guía paso a paso
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/PROMPT-ENGINEERING.md
  - ../03-adr/ADR-005-gemini-key-client-m1-server-m2.md
  - SETUP-SUPABASE.md
  - INSTALLATION-CUBOT.md
  - COST-MODEL.md
---

# Setup Gemini API — guía paso a paso

Setup de Google AI / Gemini API para Orion Vox M1: cuenta, API key,
quotas, restricciones, prueba con curl, estimación de costos.

> Tiempo estimado: 10-15 minutos.

---

## 1. Crear cuenta en Google AI Studio

1. Ir a https://aistudio.google.com
2. Login con cuenta Google. **Recomendado**: usar la misma cuenta
   Google que tenés en el Cubot KK9 (simplifica configuración del
   atajo "OK Google, abrí Orion Vox").
3. Aceptar términos de uso.

**Costo**: la cuenta es gratis. El consumo de Gemini API tiene free
tier (ver §3).

---

## 2. Generar API key

1. Aistudio.google.com → menú izquierdo → "Get API key" (o
   directamente https://aistudio.google.com/app/apikey).
2. "Create API key in new project" o seleccioná un proyecto Google
   Cloud existente.
3. Se genera una key tipo: `AIzaSy...` (39 caracteres).
4. **Copiarla y guardarla en password manager INMEDIATAMENTE**. Una
   vez que cerrás el modal, no podés volver a ver la key completa
   (solo regenerarla).

---

## 3. Quotas y free tier (verificación 2026)

> Los números cambian. Confirmar al momento del setup en
> https://ai.google.dev/pricing

**Free tier típico (al 2026) para `gemini-2.5-flash`:**

| Métrica           | Límite free tier                |
|-------------------|---------------------------------|
| Requests por día  | ~1500 RPD                       |
| Requests por minuto | ~15 RPM                       |
| Tokens por minuto | ~1M TPM                         |
| Tokens por día    | depende de TPM, suele alcanzar  |

**Para `gemini-2.5-pro`** los límites son menores (free tier más
restrictivo). M1 usa Flash por default; Pro queda como evaluación M3.

**Estimación uso real Orion Vox.**

| Métrica            | Estimado típico (5-20 ops/día)         |
|--------------------|----------------------------------------|
| Requests/día       | 5-20                                   |
| Tokens por request | ~5000-15000 (schema + user + plan out) |
| Tokens/día         | 25k-300k                               |

→ **Cabe muy holgado en free tier.** Si llegás a topear, ya estás
usando Orion Vox como herramienta principal de tu día.

---

## 4. Restricciones de la API key (opcional, recomendado)

Si tu cuenta Google Cloud lo expone (típicamente sí), podés restringir
la key:

1. https://console.cloud.google.com/apis/credentials
2. Seleccioná la API key generada.
3. Sección "Application restrictions":
   - **HTTP referrers**: poner el dominio del hosting de la PWA, ej:
     `https://orion-vox.vercel.app/*`
     - **OJO**: esto rompe el uso de la key desde otros orígenes (ej:
       curl). Útil cuando ya está todo en producción y querés limitar
       blast radius si la key se filtra.
   - **None** (default): cualquier origen puede usar la key. Más
     simple para M1.
4. Sección "API restrictions":
   - Restringir a "Generative Language API" (la API de Gemini).
5. Save.

> **Para M1 exploratorio**: dejá sin restricciones de referrer hasta
> tener la PWA estable. Limitá API a "Generative Language API" desde
> el día 1 (no afecta funcionamiento, sí limita scope si la key se
> filtra).

---

## 5. Probar con curl

```bash
GEMINI_KEY="AIzaSy..."

curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GEMINI_KEY" \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Respondé en español: ¿qué es Postgres?"
      }]
    }]
  }'
```

Respuesta esperada (200): JSON con `candidates[0].content.parts[0].text`
que contiene una explicación en español de Postgres.

### 5.1 Probar function calling (lo que usa Orion Vox)

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GEMINI_KEY" \
  -d '{
    "system_instruction": {
      "parts": [{
        "text": "Sos Orion Vox. Traducí la frase del usuario a un Plan JSON. Schema disponible: tabla `tareas` con columnas id, titulo, estado."
      }]
    },
    "contents": [{
      "role": "user",
      "parts": [{ "text": "mostrame las tareas activas" }]
    }],
    "tools": [{
      "function_declarations": [{
        "name": "execute_plan",
        "description": "Ejecutá un Plan JSON",
        "parameters": {
          "type": "object",
          "properties": {
            "version": { "type": "string" },
            "operation": { "type": "string" },
            "table": { "type": "string" },
            "filters": { "type": "array" },
            "limit": { "type": "integer" }
          }
        }
      }]
    }],
    "tool_config": {
      "function_calling_config": {
        "mode": "ANY",
        "allowed_function_names": ["execute_plan"]
      }
    }
  }'
```

Respuesta esperada: `candidates[0].content.parts[0].functionCall` con
`name: "execute_plan"` y `args` con un Plan JSON válido (operation:
"select", table: "tareas", filters con estado = "activa").

---

## 6. Estimación de costos

Ver `COST-MODEL.md` para el detalle. Resumen:

| Escenario                              | Modelo           | Costo mensual estimado |
|----------------------------------------|------------------|------------------------|
| Uso típico Orion Vox M1 (5-20 ops/día)| gemini-2.5-flash | **$0** (cabe en free tier) |
| Uso intensivo (50-100 ops/día)         | gemini-2.5-flash | $0 a $5/mes (depende del input size) |
| Uso con Pro en lugar de Flash          | gemini-2.5-pro   | ~10x el costo de Flash  |

**Variables que afectan costo:**

- Tamaño del schema-summary (input tokens en cada request).
- Verbosidad del usuario (input tokens).
- Tamaño del Plan JSON output (típicamente chico, < 500 tokens).
- Modelo elegido (Flash vs Pro).

---

## 7. Datos a anotar para configurar la PWA

```
GEMINI_API_KEY:    AIzaSy... (39 chars)
GEMINI_MODEL:      gemini-2.5-flash
GEMINI_PROJECT:    <nombre del proyecto Google Cloud creado>
```

Se ingresan en la PWA durante `INSTALLATION-CUBOT.md` — paso "Setup
inicial".

---

## 8. Rotar la API key

Si sospechás que la key se filtró:

1. https://aistudio.google.com/app/apikey
2. Botón "Delete" sobre la key comprometida.
3. "Create API key" para generar una nueva.
4. Actualizar la PWA en el Cubot:
   - Abrir Orion Vox → Configuración → Credenciales.
   - Reemplazar la Gemini API key.
   - Guardar (la PWA re-cifra con el PIN).

Tiempo total: < 5 minutos.

> En M2, la key vive solo server-side: rotar es un `supabase secrets
> set GEMINI_API_KEY=...` y un redeploy de la Edge Function. La PWA no
> se entera.

---

## 9. Checklist final

```
[ ] Cuenta Google AI Studio activa
[ ] API key generada y guardada en password manager
[ ] (Opcional) Restricción API a "Generative Language API"
[ ] Quotas verificadas en https://ai.google.dev/pricing
[ ] Test curl básico OK (respuesta en español)
[ ] Test curl con function calling OK (recibe functionCall execute_plan)
[ ] API key, modelo y proyecto anotados para setup PWA
```

---

## 10. Troubleshooting común

| Síntoma                                         | Causa probable                            | Solución                                                           |
|-------------------------------------------------|-------------------------------------------|--------------------------------------------------------------------|
| `403 PERMISSION_DENIED`                         | API key inválida o restringida             | Verificar key + restricciones en console.cloud.google.com          |
| `429 RESOURCE_EXHAUSTED`                        | Cuota agotada (RPM o RPD)                  | Esperar reset o pagar; ver dashboard quotas                        |
| `400 INVALID_ARGUMENT` con function calling     | Schema de la function malformado           | Validar JSON Schema; confirmar `mode: ANY` para forzar function call |
| Respuesta en inglés cuando se pidió español     | System prompt débil                        | Reforzar regla 9 del prompt (ver `PROMPT-ENGINEERING.md §2.2`)     |
| Latencia consistente > 5s                       | Modelo o región                            | Verificar que es `gemini-2.5-flash`, no `gemini-2.5-pro`           |
| Function calling devuelve text en lugar         | `tool_config` no forzado                   | `mode: ANY` con `allowed_function_names`                           |

Detalle adicional: ver `TROUBLESHOOTING.md`.
