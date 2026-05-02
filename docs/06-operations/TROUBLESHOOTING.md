---
title: Troubleshooting — problemas comunes y soluciones
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - RUNBOOK.md
  - OBSERVABILITY.md
  - DAILY-USAGE.md
  - INSTALLATION-CUBOT.md
  - SETUP-SUPABASE.md
  - SETUP-GEMINI-API.md
---

# Troubleshooting — problemas comunes

Catálogo de problemas frecuentes con causa, diagnóstico y solución.
Estructurado por área. Para incidentes mayores, ver `RUNBOOK.md`.

---

## 1. Voz / STT (Web Speech API)

### 1.1 "El micrófono no funciona"

**Síntoma**: tocás el botón de voz y no pasa nada, o muestra error
"not-allowed".

**Causas posibles**:

- Permiso denegado al micrófono.
- Navegador no es Chrome (Samsung Browser, Firefox).
- Micrófono físicamente tapado o roto.

**Solución**:

1. Chrome → menú → Settings → Site settings → Microphone → buscar
   Orion Vox → Allow.
2. Verificar que estás en Chrome (la URL debe abrirse en el icono PWA
   que apunta a Chrome).
3. Probar dictar en otra app para descartar hardware.

### 1.2 "Transcripción mala / palabras incorrectas"

**Síntoma**: hablaste claro pero el texto transcripto es distinto.

**Causas posibles**:

- Ruido de fondo.
- Acento muy marcado vs `es-MX` configurado.
- Conexión lenta (Web Speech necesita red).
- Léxico técnico (ids, columnas con nombres raros).

**Solución**:

- Hablar más cerca del micrófono.
- Probar en `es-AR` (Configuración → Voz) si el resultado es
  consistentemente mejor.
- Para palabras técnicas (UUIDs, identificadores), usar fallback
  teclado.
- Si es recurrente: anotar palabras problemáticas en hints semánticos
  ("cuando digo 'cubot' me refiero a 'kubot'", etc.).

### 1.3 "STT corta antes de terminar"

**Síntoma**: dejás de hablar un momento y el sistema procesa la frase
incompleta.

**Causa**: `SpeechRecognition` con `continuous: false` cierra al detectar
silencio.

**Solución M1**: hablar de corrido, sin pausas largas. Si hace falta
pensar, escribir con teclado.

**M2 evaluable**: hacer `continuous: true` con commit manual (botón
"listo").

---

## 2. Gemini API

### 2.1 "Gemini no me entiende"

**Síntoma**: response es `request_clarification` recurrente, o Plan
JSON no es lo esperado.

**Causas**:

- Frase ambigua.
- Schema stale (Gemini no conoce tablas/columnas nuevas).
- Hints insuficientes para tu jerga.

**Solución**:

1. Refrescar schema (`DAILY-USAGE.md §4`).
2. Ser más específico (mencionar tabla, usar id, etc., ver
   `DAILY-USAGE.md §6`).
3. Agregar hint semántico para el patrón problemático.
4. Mirar `orion_audit` del intento (`OBSERVABILITY.md §7`).

### 2.2 "Cuota Gemini agotada"

Ver `RUNBOOK.md INC-001`.

### 2.3 "API key inválida"

**Síntoma**: error 403 o "invalid API key".

**Causas**:

- Key copiada con espacios.
- Key revocada / rotada en Google AI Studio.
- Key restringida a referrer que no matchea.

**Solución**:

1. Verificar la key en https://aistudio.google.com/app/apikey.
2. Re-pegar en la PWA (Configuración → Credenciales → Gemini).
3. Si tiene restricción de referrer, agregar el dominio del hosting.

### 2.4 "Latencia Gemini > 5s consistente"

**Causas**:

- Modelo equivocado (`gemini-2.5-pro` en lugar de Flash).
- Schema-summary muy grande.

**Solución**:

- Verificar modelo en Configuración (debe ser `gemini-2.5-flash`).
- Reducir schema-summary excluyendo tablas no usadas.

---

## 3. Supabase / Edge Functions

### 3.1 "Edge Function timeout"

**Síntoma**: PWA muestra "La consulta tardó demasiado" tras ~12s.

**Causas**:

- Query muy compleja (sin índice, full table scan en tabla grande).
- `statement_timeout` 10s saltó.
- Connection pool saturado (raro en single user).

**Solución**:

1. Mirar `orion_audit` para ver el `sql_executed`:

```sql
select sql_executed, sql_params, error
from orion_audit
where error like '%timeout%'
order by ts desc limit 5;
```

2. Ejecutar el SQL manualmente en SQL Editor con `EXPLAIN ANALYZE`:

```sql
explain analyze select ... from ... where ...;
```

3. Si hay full scan, agregar índice:

```sql
create index idx_<table>_<column> on public.<table> (<column>);
```

4. Re-intentar en Orion Vox.

### 3.2 "Auth failed con Supabase"

**Síntoma**: 401 desde Edge.

**Causas**:

- `service_role` mal copiado.
- `service_role` rotado en dashboard.

**Solución**:

1. Dashboard → Settings → API → copiar `service_role`.
2. Configuración PWA → Credenciales Supabase → re-pegar.
3. Health check.

### 3.3 "Edge Function not found"

**Síntoma**: 404 en `/functions/v1/execute-plan`.

**Causa**: función no deployada en este proyecto.

**Solución**:

```bash
cd <orion-vox-supabase>
supabase link --project-ref <project-ref>
supabase functions deploy execute-plan --no-verify-jwt
supabase functions deploy schema-summary --no-verify-jwt
```

### 3.4 "Permission denied for table orion_audit"

**Síntoma**: Edge falla al insertar en audit con "permission denied".

**Causas**:

- RLS habilitada sin política para `service_role`.
- Tabla creada en schema diferente.

**Solución**: aplicar RLS de `SETUP-SUPABASE.md §6`:

```sql
alter table public.orion_audit enable row level security;
create policy orion_audit_service_role_all
  on public.orion_audit
  for all to service_role
  using (true) with check (true);
```

---

## 4. PWA / Cubot KK9

### 4.1 "PWA no se instala"

**Síntoma**: Chrome no muestra prompt "Add to Home screen".

**Causas**:

- HTTPS faltante (PWA sin TLS no es instalable).
- Manifest inválido.
- Service Worker no registrado.
- Ya estaba instalada (Chrome no re-pregunta).

**Solución**:

1. Verificar URL: debe ser `https://`, no `http://`.
2. Devtools desktop → Application → Manifest → ver errores.
3. Devtools → Application → Service Workers → debe estar "activated".
4. Si ya está instalada: desinstalar primero (long press en home →
   Uninstall) y volver a instalar.

### 4.2 "Confirmación táctil no aparece en write"

**Síntoma**: ejecutaste un delete/update y no apareció el modal.

**Causas posibles**:

- Bug en el cliente (no detectó que `operation in [insert, update,
  delete]`).
- El plan generado por Gemini fue un `select` aunque pediste write.

**Diagnóstico**:

```sql
select plan_json->>'operation' as op, was_confirmed, user_prompt
from orion_audit
order by ts desc limit 5;
```

- Si `op = select` pero pediste delete: problema de prompt o de
  intención.
- Si `op = delete` y `was_confirmed = false` pero ejecutó: BUG SERIO,
  abrir investigación.

**Solución temporaria**: NO usar Orion Vox para writes hasta resolver.

### 4.3 "PIN incorrecto" / bloqueo

**Síntoma**: 3 intentos fallidos → delay escalonado.

**Solución**:

1. Esperar el delay (5s, 30s, 5min, etc., según implementación).
2. Si realmente lo olvidaste: factory reset (`RUNBOOK.md INC-005`).

### 4.4 "PWA muestra versión vieja tras deploy"

Ver `RUNBOOK.md INC-008`.

### 4.5 "Audit_mirror local no muestra operaciones nuevas"

**Causa**: bug de sincronización o IndexedDB lleno.

**Solución**:

- Configuración → "Resincronizar audit" (debe llamar a Edge para
  traer últimos 50).
- Si no hay opción, factory reset solo del store `audit_mirror`
  (Configuración → Avanzado → "Limpiar caché").

---

## 5. TTS

### 5.1 "TTS no habla"

**Síntoma**: respuesta visible pero sin audio.

**Causas**:

- Volumen bajo / silencioso.
- Voz `es-MX` no disponible en el dispositivo.
- Permiso de audio.

**Solución**:

1. Subir volumen del Cubot.
2. Configuración → Voz → seleccionar otra voz disponible (`es-AR`,
   `es-ES`, etc.).
3. Si ninguna voz `es-*` aparece: instalar pack de voces de Google TTS
   en Settings → Languages → Text-to-speech.

### 5.2 "TTS habla en otro idioma"

**Causa**: la voz seleccionada por default no es es-MX.

**Solución**: Configuración → Voz → seleccionar explícitamente `es-MX`
o `es-AR`.

---

## 6. Schema-summary

### 6.1 "schema-summary muy grande"

Ver `SCHEMA-SUMMARY.md §7`.

**Solución**: agregar tablas a `SCHEMA_SUMMARY_EXCLUDED_TABLES`:

```bash
supabase secrets set SCHEMA_SUMMARY_EXCLUDED_TABLES="logs,audit_external,_temp_*"
supabase functions deploy schema-summary --no-verify-jwt
```

Refrescar schema desde la PWA.

### 6.2 "Tabla X no aparece en schema"

**Causas**:

- Tabla está en schema distinto a `public`.
- Tabla está en denylist (`orion_audit`, schemas internos Supabase).
- Tabla está en exclude list configurado.

**Solución**:

- Mover a `public` o ajustar Edge para incluir otros schemas.
- Si está en exclude list, removerla.
- `orion_audit` NUNCA aparece (denylist hardcoded).

### 6.3 "schema_hash distinto pero schema igual visualmente"

**Causa**: cambios no visibles (comentarios, defaults, orden de
columnas).

**Solución**: aceptar y refrescar. No es problema; el hash es estricto
por diseño.

---

## 7. Conectividad

### 7.1 "Sin conexión"

**Síntoma**: PWA muestra error "Sin conexión / Edge caído".

**Causas**:

- Cubot offline (wifi/4G).
- Supabase Cloud caída.
- DNS issue local.

**Diagnóstico**:

1. Probar abrir google.com en Chrome → si falla, problema de
   conectividad.
2. Si red OK: probar `curl https://<project-ref>.supabase.co` desde
   otra máquina.
3. Status oficial: https://status.supabase.com

**Solución**:

- Cambiar de wifi/4G.
- Esperar si Supabase está caída.
- En modo offline, la PWA permite consultar `audit_mirror` local.

---

## 8. IndexedDB / Storage

### 8.1 "Datos cifrados no descifran"

**Síntoma**: ingresás PIN correcto y el sistema dice "no se puede
descifrar".

**Causas**:

- Salt corrupto o cambiado.
- IndexedDB parcialmente borrado.
- Bug en upgrade de versión del store.

**Solución**:

- Factory reset (`RUNBOOK.md INC-005`).
- Re-ingresar credenciales.

### 8.2 "Storage lleno"

**Síntoma**: Chrome muestra "QuotaExceededError".

**Causa**: `audit_mirror` creció demasiado (raro en M1) o Chrome
restringió quota del sitio.

**Solución**:

- Configuración → Avanzado → "Limpiar audit mirror" (mantiene
  últimos 50 en lugar de 200).
- Chrome → Site settings → Storage → ver cuánto usa Orion Vox.

---

## 9. Errores específicos por código

| Código HTTP | Origen        | Significado                                  | Solución                                  |
|-------------|---------------|----------------------------------------------|-------------------------------------------|
| 401         | Supabase Edge | service_role inválido                        | Re-pegar key                              |
| 403         | Supabase Edge | Operación no permitida                       | Esperado para DDL; revisar plan           |
| 404         | Supabase Edge | Función no deployada                         | `supabase functions deploy`               |
| 422         | Supabase Edge | Plan JSON inválido (validación schema)       | Refrescar schema, mejorar prompt          |
| 504         | Supabase Edge | Postgres timeout                             | Optimizar query / agregar índice          |
| 403         | Gemini        | API key inválida o restringida                | Verificar key + restricciones              |
| 429         | Gemini        | Cuota agotada                                | Esperar reset                             |
| 500         | Cualquiera    | Error interno                                | Logs Edge / status del proveedor          |

---

## 10. Cuándo escalar a `RUNBOOK.md`

Escalar cuando:

- El problema afecta múltiples áreas (Gemini + Supabase caídos).
- Hay sospecha de seguridad (rotación de credenciales).
- Los datos están en riesgo (corrupción, restore).
- Este TROUBLESHOOTING no resuelve y necesitás procedimiento formal.

---

## 11. Cuándo abrir issue / mejora

Si el problema:

- No está en este documento.
- No está en `RUNBOOK.md`.
- Es reproducible.

Anotarlo en notas personales con:

- Síntoma exacto.
- Pasos para reproducir.
- Audit relevante.
- Workaround temporal (si encontraste).

Y abrir mejora en backlog del proyecto. Si te encontraste con esto, lo
más probable es que te lo encuentres de nuevo.
