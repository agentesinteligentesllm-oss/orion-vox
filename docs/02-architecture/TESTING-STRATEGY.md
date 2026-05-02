---
title: Estrategia de testing — Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - OVERVIEW.md
  - COMPONENTS.md
  - PLAN-JSON-CONTRACT.md
  - PROMPT-ENGINEERING.md
  - ../04-specs/spec-execute-plan-edge.md
---

# Estrategia de testing — Orion Vox

Estrategia de testing pragmática para un proyecto **single-user
exploratorio** en M1. Sin sobre-ingeniería, pero con cobertura mínima
en los puntos críticos del lethal trifecta.

---

## 1. Niveles de testing

### 1.1 Unit tests

**Cobertura.**

| Componente / módulo                       | Qué se testea                                                                 | Prioridad |
|-------------------------------------------|-------------------------------------------------------------------------------|-----------|
| Plan JSON Validator (Zod)                 | Schema acepta plans válidos, rechaza los del `PLAN-JSON-CONTRACT.md §10`      | **CRÍTICA** |
| Query Builder (Plan JSON → SQL parametrizado) | Cada operación (select/insert/update/delete) genera SQL correcto + params correctos | **CRÍTICA** |
| Detector de operaciones bloqueadas        | DDL, multi-statement, COPY, DO, etc. — todos rechazados                       | **CRÍTICA** |
| Detector de subqueries en `value`         | Objeto con forma de Plan JSON anidado → rechazo                                | **CRÍTICA** |
| Schema-summary parser (cliente)           | Markdown → estructura interna esperada                                         | Alta      |
| Cifrado AES-GCM (`encrypt`/`decrypt`)     | Roundtrip, IV aleatorio, derivación PBKDF2 reproducible                        | Alta      |
| Espejo de auditoría (cliente)             | INSERT/READ/list correctos sobre IndexedDB                                     | Media     |
| Voice Input wrapper                       | Manejo de eventos, errores, fallback teclado                                   | Media     |
| TTS Output wrapper                        | Selección de voz, cancel, fallback                                             | Baja      |

**Frameworks.**

- **Cliente PWA**: Vitest (cuando el framework PWA esté elegido en
  ADR-012). Suite rápida, ejecutable en watch mode.
- **Edge Functions Deno**: `Deno.test` nativo (built-in, sin
  dependencias).

### 1.2 Integration tests

**Cobertura.**

| Integración                                 | Qué se testea                                                                  | Prioridad |
|---------------------------------------------|--------------------------------------------------------------------------------|-----------|
| Edge `execute-plan` ↔ Postgres real         | Cada operación CRUD funciona end-to-end + audit registrado                     | **CRÍTICA** |
| Edge `execute-plan` rechaza operaciones bloqueadas | DDL bloqueado + audit con `error` registrado                              | **CRÍTICA** |
| Edge `execute-plan` con timeout             | `statement_timeout` 10s funciona; audit registra `error = 'timeout'`           | Alta      |
| Edge `execute-plan` con `confirmed: false` para writes | Rechazo + audit (M2)                                                  | Alta      |
| Edge `schema-summary` ↔ Postgres real       | Markdown generado coincide con schema real; allowlist excluye correctamente    | Alta      |
| Audit insert pre-ejecución bloquea ejecución si falla | Si INSERT a `orion_audit` falla, no hay execute                       | **CRÍTICA** |

**Stack.**

- **Supabase local con Docker** (`supabase start`): Postgres + Edge
  Functions runtime locales, idénticos al cloud.
- Setup de fixtures de DB: script `tests/setup-db.sql` que crea tablas
  de prueba (`tareas_test`, `categorias_test`) y la `orion_audit`.
- Cleanup entre tests: `TRUNCATE` de las tablas de prueba (no de
  `orion_audit` — se valida el contenido).

### 1.3 End-to-end tests

**Cobertura.**

- Flujo completo PWA → Gemini (mockeado) → Edge → Postgres → respuesta.
- Modal de confirmación se dispara solo en writes.
- Cancelar en modal NO ejecuta.
- Refresh manual de schema funciona.

**Stack.**

- **Playwright** sobre Chromium (replica el navegador del Cubot KK9 de
  forma aproximada).
- Gemini **mockeado** con fixtures (ver §3): no se gasta cuota real en
  CI.
- Supabase local con Docker.

### 1.4 Smoke manual en hardware target

Pre-deploy, **siempre**, a mano sobre el Cubot KK9 real:

1. Voz captura: dictar "lista las tareas activas" → ver transcripción.
2. Gemini responde: ver Plan JSON en consola devtools.
3. Plan JSON válido: sin errores en validador.
4. Read pasa sin modal.
5. Write dispara modal con preview correcto.
6. Confirmación ejecuta y `orion_audit` registra.
7. Cancelación NO ejecuta y `orion_audit` NO registra.
8. TTS habla la respuesta.
9. Error provocado (apagar wifi) → mensaje claro de "sin conexión".

Tiempo aprox: 10 minutos por release. Sin shortcut.

---

## 2. Mocks de Gemini

### 2.1 Estrategia

Gemini API se **mockea** en unit + integration + E2E. Solo el smoke
manual usa Gemini real. Razones:

- Cuota real: limitada y no determinista.
- Tests rápidos: mock responde en 1ms vs 1500ms real.
- Reproducibilidad: misma entrada, misma salida garantizada.
- CI sin secrets: no hace falta Gemini API key en pipelines.

### 2.2 Implementación

```
tests/
├── fixtures/
│   ├── plans/
│   │   ├── valid/
│   │   │   ├── select-simple.json
│   │   │   ├── select-with-join.json
│   │   │   ├── insert.json
│   │   │   ├── update-with-filter.json
│   │   │   └── delete-with-filter.json
│   │   └── invalid/
│   │       ├── delete-no-filters.json
│   │       ├── ddl-attempt.json
│   │       ├── multi-statement.json
│   │       ├── subquery-in-value.json
│   │       └── limit-exceeded.json
│   └── prompts/
│       ├── tareas-activas.txt → maps to plans/valid/select-simple.json
│       └── ...
└── mocks/
    └── gemini.ts   # función que matchea user_prompt → fixture
```

**Función mock.**

```typescript
// tests/mocks/gemini.ts (pseudocódigo)
export function mockGemini(prompt: string, schemaSummary: string) {
  const fixture = loadFixtureFor(prompt);
  if (!fixture) {
    throw new Error(`No fixture for prompt: ${prompt}`);
  }
  return {
    functionCall: {
      name: 'execute_plan',
      args: fixture.expectedPlan,
    },
  };
}
```

### 2.3 Fixtures Plan JSON — directorio `tests/fixtures/plans/`

Cada fixture es un JSON con un Plan JSON canónico (válidos) o malformado
(inválidos). Los válidos cubren los ejemplos del
`PLAN-JSON-CONTRACT.md §9`. Los inválidos cubren `§10`.

Casos a cubrir como mínimo (M1):

**Válidos (5).**

- SELECT simple con filtros + order + limit.
- SELECT con INNER JOIN.
- INSERT con todos los campos.
- UPDATE con filtros y values.
- DELETE con filtros.

**Inválidos (10).**

- DELETE sin filters.
- UPDATE sin filters.
- LIMIT > 1000.
- LIMIT < 1.
- `version` distinto de "1.0".
- `operation` no en enum.
- Subquery anidada en value.
- Multi-statement injection (`value` con `;` + DDL).
- DDL como `operation` (`drop_table`).
- JOIN con type distinto de "inner".

---

## 3. Tests de Edge Functions (Deno)

### 3.1 Estructura

```
supabase/functions/
├── execute-plan/
│   ├── index.ts
│   ├── validator.ts
│   ├── builder.ts
│   ├── audit.ts
│   └── tests/
│       ├── validator.test.ts
│       ├── builder.test.ts
│       ├── audit.test.ts
│       └── integration.test.ts
└── schema-summary/
    ├── index.ts
    └── tests/
        └── ...
```

### 3.2 Comandos

```bash
# Unit + integration de Edge Functions
deno test --allow-net --allow-env supabase/functions/

# Solo unit (sin Postgres)
deno test --allow-env supabase/functions/execute-plan/tests/validator.test.ts

# Integration (requiere supabase start corriendo)
deno test --allow-net --allow-env supabase/functions/execute-plan/tests/integration.test.ts
```

### 3.3 Setup local de Supabase

```bash
supabase start          # arranca Postgres + Edge runtime
supabase db reset       # aplica migrations + seed data
deno test --allow-net --allow-env supabase/functions/
supabase stop
```

---

## 4. Coverage objetivo

| Nivel        | Coverage M1 | Razón                                                      |
|--------------|-------------|------------------------------------------------------------|
| Unit         | **80%**     | Validador y query builder son CRÍTICOS, debe ser exhaustivo |
| Integration  | **60%**     | Cubrir flujo principal + casos de rechazo                   |
| E2E          | **happy path + 3 sad paths** | Lo justo para no regresionar              |
| Manual       | **100% del checklist §1.4** | Innegociable                                |

M1 es exploratorio: 60% global está bien. M2 sube a 80% global.

---

## 5. CI / CD

### 5.1 M1

**Sin pipeline de CI automatizado.** Razones:

- Single user, single device.
- El código puede vivir en repo privado o local.
- Smoke manual es la última barrera.

**Lo que sí se hace.**

- Pre-commit hook local: `vitest run` + `deno test` (unit).
- Antes de cada deploy: integration tests + E2E + smoke manual.
- Resultados se guardan en `tests/last-run.log` para audit personal.

### 5.2 M2

Si el código se publica en repo público (GitHub), considerar:

- **GitHub Actions**: workflow `test.yml` que corre unit + integration
  en cada push.
- **Sin secrets reales**: Gemini mockeado, Supabase local con Docker
  via `supabase/setup-cli@v1`.
- **E2E** opcional (depende de tiempo de pipeline).

---

## 6. Manual checklist pre-deploy

> **OBLIGATORIO** antes de cada release a producción del usuario.

```
[ ] Voz: dictar frase corta → transcripción correcta es-MX
[ ] Voz: dictar frase con ruido de fondo → fallback a teclado funciona
[ ] Gemini: prompt válido → Plan JSON dentro de los 8s
[ ] Gemini: prompt ambiguo → request_clarification con candidates
[ ] Validador cliente: rechaza Plan JSON con LIMIT 9999 (test manual con devtools)
[ ] Modal: aparece en delete con filtros
[ ] Modal: NO aparece en select
[ ] Modal: cancelar NO ejecuta y NO crea registro en orion_audit
[ ] Modal: confirmar ejecuta y crea registro en orion_audit
[ ] Audit: nuevo registro tiene user_prompt, plan_json, sql_executed, sql_params
[ ] Audit: registro de error tiene error != null y rows_affected = NULL
[ ] Schema: refresh manual funciona desde UI
[ ] Schema: hash distinto en respuesta de execute-plan dispara refresh
[ ] Error handling: Gemini quota agotada → mensaje claro, sin retry loop
[ ] Error handling: Edge timeout → mensaje claro
[ ] Error handling: Postgres timeout (10s+) → mensaje claro + audit
[ ] TTS: respuesta hablada en es-MX
[ ] TTS: cancela si dispara nueva consulta
[ ] PIN: 3 intentos fallidos → bloqueo escalonado
[ ] PIN: descifrado correcto recupera secrets
[ ] Sin red: PWA muestra audit_mirror local
[ ] Sin red: queda claro que no se puede ejecutar
```

---

## 7. Tests de regresión por categoría STRIDE

Por cada riesgo del `THREAT-MODEL.md`, un test que prueba la
mitigación:

| Test                                                        | Mitigación que valida                                  |
|-------------------------------------------------------------|--------------------------------------------------------|
| `validator.test.ts: rejects DDL operations`                | E2 (Gemini hallucinated DDL)                           |
| `validator.test.ts: rejects multi-statement in values`     | E3 (multi-statement injection)                         |
| `validator.test.ts: rejects subquery objects in value`     | E4 (subquery escalation)                               |
| `builder.test.ts: never concatenates user input as string` | E1 (SQL injection)                                     |
| `audit.test.ts: insert audit fails → execute aborts`       | R2 (operación sin rastro)                              |
| `audit.test.ts: rejected plan also creates audit record`   | R3 (intentos no auditables)                            |
| `crypto.test.ts: AES-GCM roundtrip with PBKDF2`            | S1, S2 (secrets en cliente)                            |
| `integration.test.ts: statement_timeout fires at 10s`      | D2 (queries pesadas DoS)                               |

Estos tests **no se borran** ni se modifican sin ADR. Son la red de
seguridad del sistema.

---

## 8. Performance y latencia

No hay tests automatizados de performance en M1. Latencias esperadas
están en `DATA-FLOW.md §4`. Si en smoke manual una operación supera
consistentemente el worst-case, se investiga (Gemini, red, Edge,
Postgres) y se documenta.

M2 puede agregar:

- Benchmark de query builder (debe traducir Plan JSON → SQL en < 50ms).
- Benchmark de validador (debe procesar plan en < 80ms).
- Histograma de latencias de Edge en `orion_audit.duration_ms` con
  alertas si p95 > target.

---

## 9. Tests que NO se hacen en M1

Listar lo excluido es tan importante como listar lo incluido:

- **Load testing**: single user, no aplica.
- **Security pentesting profesional**: el threat model M1 está
  declarado; pen test es M2 si el sistema se abre a más usuarios.
- **Cross-browser testing**: solo Chrome Android del Cubot KK9 es
  target.
- **Accessibility audit completo**: M3, después de validar usabilidad
  básica.
- **Localización a otros idiomas**: ADR-011 fija español; no se testea
  i18n.
- **Tests de UI visual** (snapshot/screenshot): excesivo para single
  screen.

Si alguno de estos se vuelve necesario, gatilla revisión del threat
model y/o constitución.
