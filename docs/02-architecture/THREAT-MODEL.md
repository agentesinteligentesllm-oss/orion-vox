---
title: Modelo de amenazas (STRIDE) — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - SECURITY-MODEL.md
  - OVERVIEW.md
  - PLAN-JSON-CONTRACT.md
  - AUDIT-MODEL.md
  - ../00-constitution/CONSTITUTION.md
---

# Modelo de amenazas (STRIDE) — Orion Vox

Análisis STRIDE conciso de las amenazas concretas que enfrenta Orion Vox
en M1, con su mitigación actual y la brecha que cubre M2. Este documento
**complementa** `SECURITY-MODEL.md` (que cubre el modelo de seguridad por
milestone y el lethal trifecta); aquí se ordena el análisis por categoría
STRIDE para hacer auditable el razonamiento.

> **Alcance**: Orion Vox single-user, PWA sideload en Cubot KK9, base
> Supabase del propio usuario. Las amenazas y mitigaciones se evalúan
> bajo ese contexto. Para escenarios fuera de alcance ver §8.

---

## 1. Spoofing — Suplantación de identidad

### Amenazas concretas

| # | Vector                                                                                          | Impacto |
|---|-------------------------------------------------------------------------------------------------|---------|
| S1 | Atacante obtiene la **Gemini API key** del IndexedDB y la usa para consumir cuota del usuario | Medio (costo + cuota agotada) |
| S2 | Atacante obtiene el **Supabase service_role** y se conecta directo a Postgres saltando la Edge | Crítico (acceso total a la base) |
| S3 | Atacante hace pasar requests propios como provenientes de la PWA legítima                     | Alto (writes no auditados realísticamente) |

### Mitigación M1

- Secrets cifrados en IndexedDB con AES-GCM, clave derivada PBKDF2 del
  PIN del usuario (>=250000 iteraciones) o credencial WebAuthn cuando
  el dispositivo lo expone (ver `SECURITY-MODEL.md §7`).
- La clave maestra **nunca se persiste**, vive solo en memoria durante
  la sesión.
- Cifrado defiende contra **acceso casual al device storage**, no contra
  un atacante que obtiene tanto el dispositivo como el PIN.

### Brecha M2 (cómo se cierra)

- Gemini API key se mueve **server-side** a la Edge Function `plan-intent`
  (ADR-005). La PWA jamás conoce la key.
- `service_role` sale del cliente: la Edge usa `orion_vox_executor`
  dedicado y la PWA se autentica con un token rotativo emitido por
  Supabase (ver ADR-004, ADR-005).
- El `preview_id` firmado server-side (HMAC) cierra S3.

---

## 2. Tampering — Manipulación de datos en tránsito o reposo

### Amenazas concretas

| # | Vector                                                                                       | Impacto |
|---|----------------------------------------------------------------------------------------------|---------|
| T1 | MITM modifica el Plan JSON entre PWA y Edge Function                                       | Alto (operación inesperada) |
| T2 | Cliente comprometido inyecta un Plan JSON con `confirmed: true` saltando el modal           | Alto (write sin toque humano) |
| T3 | Atacante modifica el bundle PWA en el hosting estático y altera la lógica de validación     | Crítico (cualquier write malicioso) |
| T4 | Manipulación del schema-summary embebido en el bundle para inducir a Gemini a equivocar tabla | Medio (operación sobre tabla incorrecta) |
| T5 | Manipulación del registro `orion_audit` después de ocurrido el hecho                       | Alto (forense comprometido) |

### Mitigación M1

- **HTTPS obligatorio** en todas las fronteras (PWA → Gemini, PWA → Edge,
  Edge → Postgres). El hosting estático se sirve con TLS automático
  (Vercel / Netlify / Cloudflare Pages).
- **Validación dual** del Plan JSON: cliente (UX) + server (autoridad,
  re-valida con Zod, ver `PLAN-JSON-CONTRACT.md §7`). T2 se mitiga
  parcialmente: aunque `confirmed: true` no se valide criptográficamente
  en M1, la Edge sigue rechazando operaciones bloqueadas o malformadas.
- **Append-only por convención** sobre `orion_audit` (ver
  `AUDIT-MODEL.md §4`). El usuario sabe que no debe `UPDATE`/`DELETE`
  manual sobre la tabla.
- **Hosting confiable**: deploy desde un solo origen controlado por el
  usuario; el bundle se sirve con `Subresource Integrity` cuando el
  framework lo permita (decisión empírica al elegir framework en
  ADR-012).

### Brecha M2 (cómo se cierra)

- **Preview firmado HMAC server-side** (`SECURITY-MODEL.md §3`): el
  `confirmed: true` deja de ser un boolean del cliente y se convierte en
  `preview_id` firmado por la Edge con TTL de 60s. T2 cerrado.
- **Revocar `UPDATE`/`DELETE` sobre `orion_audit`** incluso para
  `orion_vox_executor` (ver `AUDIT-MODEL.md §4`). T5 cerrado a nivel
  permiso DB.
- Schema-summary server-side con `schema_hash` validado en cada request
  (ver §3, T4).

---

## 3. Repudiation — Negación de acciones

### Amenazas concretas

| # | Vector                                                                              | Impacto |
|---|-------------------------------------------------------------------------------------|---------|
| R1 | Usuario niega haber ejecutado una operación destructiva ("yo no borré eso")        | Bajo en single-user, alto en forense post-incidente |
| R2 | Operación ejecutada sin dejar rastro (ej: error en el INSERT inicial de audit)     | Crítico (perdida de cadena de custodia) |
| R3 | Plan JSON malformado o intento bloqueado no queda registrado                       | Alto (ataques no detectables) |

### Mitigación M1

- `orion_audit` con `ts` (`timestamptz`), `user_prompt` literal,
  `plan_json`, `sql_executed` parametrizado, `was_confirmed` flag,
  `client_version`. Cada registro es completo y enlazable al momento
  exacto del hecho (ver `AUDIT-MODEL.md §2`).
- **Sin audit no hay ejecución** (Regla de Oro 1, `AUDIT-MODEL.md §8`):
  si el INSERT pre-ejecución falla, la Edge aborta con 500 y NO toca
  Postgres. R2 cerrado por construcción.
- **Auditá el rechazo también** (Regla de Oro 2): plans inválidos,
  operaciones bloqueadas y intentos de DDL quedan en `orion_audit` con
  `error = '<motivo>'`. R3 cerrado.
- `id` UUID v4 inmutable + `ts` con tz: no hay forma honesta de "perder"
  un registro.

### Brecha M2 (cómo se cierra)

- Revoke de `UPDATE`/`DELETE` sobre `orion_audit` para todos los roles
  excepto migrations.
- Hash chain opcional entre registros (cada fila incluye hash del
  registro anterior) — pendiente de evaluación, no comprometido para M2.

---

## 4. Information disclosure — Fuga de información

### Amenazas concretas

| # | Vector                                                                                | Impacto |
|---|---------------------------------------------------------------------------------------|---------|
| I1 | El schema-summary expone nombres de tablas/columnas sensibles a Google (Gemini)     | Medio (depende del contenido del schema) |
| I2 | `user_prompt` contiene información personal y queda en `orion_audit`               | Bajo en single-user (vive en su propia base) |
| I3 | Logs de Edge Function (Supabase) capturan payloads con datos sensibles             | Medio |
| I4 | `result_summary` en `orion_audit` guarda snapshots de datos reales                 | Bajo (controlado: muestra de 3-5 filas + truncated) |
| I5 | El bundle PWA se sirve con la URL de Supabase visible en el código (no es secreto pero filtra el target) | Bajo |

### Mitigación M1

- **Allowlist manual del schema** (`SECURITY-MODEL.md §2`): el usuario
  mantiene un dump filtrado, excluye tablas que no quiere exponer a
  Gemini. Es deuda explícita; M2 lo automatiza server-side.
- **Single user**: `user_prompt` vive en la propia base del usuario
  (`AUDIT-MODEL.md §7`). No hay fuga a terceros excepto el envío a
  Gemini que ya pasó antes del audit.
- **`result_summary` con sample + truncated** (Regla de Oro 3,
  `AUDIT-MODEL.md §8`): no se duplican los datos completos en audit.
- Logs Supabase: retención corta (7 días free tier) y solo accesibles
  desde el dashboard del propio usuario.
- La URL Supabase no es secreto; el `service_role` sí lo es y nunca
  viaja en URLs (ver `SECURITY-MODEL.md §5`).

### Brecha M2 (cómo se cierra)

- **Allowlist server-side** en `schema-summary`: tabla de configuración
  o env var en Supabase define qué tablas se exponen a Gemini. La PWA
  no puede saltarla.
- Edge Function `plan-intent` server-side: el envío a Gemini sale del
  server, no del dispositivo, y se puede aplicar PII redaction sobre
  `user_prompt` antes de enviarlo si llega a hacer falta.

---

## 5. Denial of Service

### Amenazas concretas

| # | Vector                                                                                | Impacto |
|---|---------------------------------------------------------------------------------------|---------|
| D1 | Cuota Gemini agotada (free tier ~1500 RPD para Flash) → PWA inutilizable             | Alto (sistema cae) |
| D2 | Query muy pesada (sin LIMIT efectivo) bloquea el connection pool de Supabase        | Alto |
| D3 | `orion_audit` crece sin control y degrada performance                                | Bajo a Medio (M1) |
| D4 | Loop accidental de retries cliente-side satura la cuota                              | Medio |
| D5 | Atacante con la API key dispara llamadas hasta agotar la cuota                       | Alto (cubierto en S1) |

### Mitigación M1

- **Cache de schema-summary** en cliente (TTL 24h, ver
  `SCHEMA-SUMMARY.md`): reduce llamadas innecesarias a la Edge.
- **Retries con backoff exponencial** y máximo 3 intentos sobre Gemini
  (`COMPONENTS.md §3`). Cierra D4.
- **`statement_timeout = 10s`** forzado por sesión en Edge
  (`SECURITY-MODEL.md §1`). Cierra D2 a nivel query individual.
- **`LIMIT` por defecto 100, max 1000** en query builder
  (`PLAN-JSON-CONTRACT.md §2`).
- **Alertas de cuota**: el usuario monitorea Google AI Studio dashboard
  (ver `OBSERVABILITY.md`).
- **Volumen esperado bajo** (single user, decenas/cientos de operaciones
  por día): D3 no es problema en M1.

### Brecha M2 (cómo se cierra)

- Rol `orion_vox_executor` con límites por usuario en Postgres
  (`statement_timeout`, `idle_in_transaction_session_timeout`).
- Política de retención sobre `orion_audit` (configurable: 90 días, 1
  año, o por volumen, ver `AUDIT-MODEL.md §4`).
- Throttling client-side adicional si se detecta abuso (rate limit
  local).

---

## 6. Elevation of privilege

### Amenazas concretas

| # | Vector                                                                                | Impacto |
|---|---------------------------------------------------------------------------------------|---------|
| E1 | SQL injection vía valores del Plan JSON                                              | Crítico |
| E2 | Gemini hallucinated plan ejecuta DDL (DROP, ALTER, CREATE)                          | Crítico |
| E3 | Multi-statement injection (`...; DROP TABLE ...`)                                    | Crítico |
| E4 | Subquery anidada en `filters[].value` para escalar permisos                          | Alto |
| E5 | El cliente comprometido envía `confirmed: true` en operaciones destructivas         | Alto |
| E6 | El `service_role` permite TODO en Postgres (incluyendo DDL si pasa la Edge)          | Crítico (deuda M1 conocida) |

### Mitigación M1

- **Query builder con parametrización**, NUNCA concatenar strings
  (`COMPONENTS.md §9`). Cierra E1.
- **Operaciones bloqueadas hardcoded en la Edge** (cubierto por tests
  unitarios obligatorios antes de marcar M1 estable, ver
  `PLAN-JSON-CONTRACT.md §4`): DROP, TRUNCATE, ALTER, CREATE, GRANT,
  REVOKE, COPY, DO. Cierra E2.
- **Detección multi-statement**: regex sobre cada `value` busca `;` +
  keyword DDL/DML conocido. Rechazo incondicional con audit registrado
  (`PLAN-JSON-CONTRACT.md §4`). Cierra E3.
- **Subqueries explícitamente bloqueadas**: si `value` es un objeto con
  forma de Plan JSON, rechazo (`PLAN-JSON-CONTRACT.md §10.5`). Cierra E4.
- **Modal client-side + validación de operación server-side**: el server
  igual rechaza operaciones bloqueadas. E5 mitigado parcialmente (un
  delete legítimo con filtros sí pasaría sin toque humano si el cliente
  está comprometido).
- **Lethal trifecta** documentado y aceptado (`SECURITY-MODEL.md §6`):
  el `service_role` es deuda consciente que se paga en M2 con rol
  dedicado.

### Brecha M2 (cómo se cierra)

- **Rol `orion_vox_executor`** con grants mínimos: solo `SELECT, INSERT,
  UPDATE, DELETE` sobre tablas allowlisted. **Sin** `DROP`, `ALTER`,
  `CREATE`, `TRUNCATE`, `BYPASSRLS`. La defensa pasa de "la Edge
  rechaza" a "Postgres no permite": defensa en profundidad real.
- **Preview firmado HMAC** cierra E5: sin `preview_id` válido emitido
  por la Edge, no hay write.

---

## 7. Vectores explícitamente NO mitigados en M1

Estos son **riesgos aceptados** que viven en `SECURITY-MODEL.md §4`. Se
listan acá como recordatorio explícito de los huecos conocidos.

| Vector                                                       | Por qué no se mitiga en M1                                              | Cuándo se atiende |
|--------------------------------------------------------------|-------------------------------------------------------------------------|-------------------|
| Compromiso completo del dispositivo (root + extracción de PIN) | Fuera del modelo de amenazas: si el atacante tiene físico + PIN, gana | Nunca al 100% — M2 reduce blast radius moviendo secrets a server |
| Acceso físico al Cubot KK9 con dispositivo desbloqueado     | Single user, dispositivo personal — el usuario es responsable          | Mitigación parcial M2: PIN obligatorio, biometría WebAuthn |
| Atacante con acceso al hosting de la PWA reemplaza el bundle | Hosting confiable + integridad SRI; ataque de cadena de suministro     | M2 evalúa firmado del bundle |
| Side-channel timing attacks sobre el cifrado AES-GCM         | Fuera de threat model realista para single user                         | No se atiende |
| Compromiso del proveedor Supabase                            | Fuera de control del proyecto                                            | No se atiende |
| Compromiso de Google AI / Gemini API                         | Fuera de control del proyecto; solo se mitiga el alcance (allowlist)    | M2 con allowlist server-side |
| Coerción del usuario (rubber-hose cryptography)              | Modelo de amenazas no contempla atacante con control físico del usuario | Nunca |
| Plan JSON hallucinado pero válido sobre tabla incorrecta     | El usuario debe leer el modal antes de confirmar                        | M2 con preview semántico mejorado |

---

## 8. Fuera de alcance — escenarios que NO soporta Orion Vox

Repetido para que sea imposible de ignorar (alineado con
`SECURITY-MODEL.md §8`):

- **Bases con datos sensibles de terceros** (PII, GDPR, HIPAA, datos
  comerciales regulados) — esperar M2 mínimo.
- **Multi-tenant**: Orion Vox es single user por diseño constitucional
  (principio 1). No hay separación por `user_id`, no hay tabla de
  usuarios.
- **Operación pública en internet**: la PWA es sideload personal. No es
  una app de Play Store ni un servicio público.
- **Audit como evidencia legal**: `orion_audit` es forense personal del
  usuario, no admisible como evidencia en disputas legales sin pasos
  adicionales (notarización, hash chain, etc.) que no están en M1 ni M2.

---

## 9. Re-evaluación del threat model

Este documento se re-revisa:

- **Al final de cada milestone** (M1 → M2, M2 → M3): cada riesgo
  aceptado se re-pregunta si sigue siendo aceptable.
- **Al cambiar el contexto de uso** (ej: el usuario quiere usar Orion
  Vox sobre una base con datos de terceros).
- **Al detectar un incidente real** que el modelo no anticipó.
- **Al aparecer una clase nueva de amenaza** (nuevo tipo de prompt
  injection, nueva CVE en Gemini API, etc.).

Cada revisión actualiza `last-reviewed` en el frontmatter y deja un nota
breve en el changelog del proyecto.
