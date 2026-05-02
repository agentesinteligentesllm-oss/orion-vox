---
title: PWA Shell — manifest, service worker, atajos Android
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
supersedes: []
related:
  - ./SPEC-INDEX.md
  - ./spec-voice-input.md
  - ./spec-config-ui.md
  - ../02-architecture/COMPONENTS.md
  - ../02-architecture/OVERVIEW.md
  - ../03-adr/ADR-006-pure-pwa-no-kotlin.md
  - ../03-adr/ADR-001-plan-f-plus-architecture.md
---

# Spec — PWA Shell

## 1. Propósito

La PWA Shell es la carcasa instalable de Orion Vox en el Cubot KK9. Su
rol es triple: presentar la app como instalable y "nativa" (sin barra de
navegador), permitir el atajo de Gemini sistema ("OK Google, abrí Orion
Vox"), y arrancar con el micrófono pre-armado cuando el usuario entra
por un atajo de modo voz. NO contiene lógica de dominio; orquesta
arranque, ciclo de vida del Service Worker y entry points.

## 2. Alcance

**Cubre:**

- Web App Manifest (`manifest.webmanifest`).
- Registro y ciclo de vida del Service Worker (`sw.js`).
- Estrategias de cache (assets vs llamadas a APIs).
- Entry points por query string (`?mode=voice`, `?mode=config`,
  `?mode=audit`).
- Shortcuts del manifest para atajos en el launcher Android.
- Manejo del prompt de instalación (`beforeinstallprompt`).

**NO cubre:**

- UI de captura de voz → `spec-voice-input.md`.
- UI de configuración → `spec-config-ui.md`.
- Llamadas HTTP a Edge Functions ni a Gemini.
- Cifrado de credenciales → `spec-credentials-storage.md`.

## 3. Interfaces / API / Contratos

### 3.1 `manifest.webmanifest`

```json
{
  "name": "Orion Vox",
  "short_name": "Orion",
  "description": "Puente de voz a tu Supabase, en español.",
  "id": "/?source=pwa",
  "start_url": "/?mode=voice",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "lang": "es",
  "dir": "ltr",
  "theme_color": "#0E1116",
  "background_color": "#0E1116",
  "categories": ["productivity", "utilities"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ],
  "shortcuts": [
    {
      "name": "Modo voz",
      "short_name": "Voz",
      "description": "Arranca con el micrófono activo",
      "url": "/?mode=voice",
      "icons": [{ "src": "/icons/shortcut-voice.png", "sizes": "96x96" }]
    },
    {
      "name": "Configuración",
      "short_name": "Config",
      "url": "/?mode=config",
      "icons": [{ "src": "/icons/shortcut-config.png", "sizes": "96x96" }]
    },
    {
      "name": "Auditoría",
      "short_name": "Audit",
      "url": "/?mode=audit",
      "icons": [{ "src": "/icons/shortcut-audit.png", "sizes": "96x96" }]
    }
  ]
}
```

**Notas.**

- `name: "Orion Vox"` es **clave**: el atajo "OK Google, abrí Orion
  Vox" del asistente nativo busca exactamente ese label.
- `start_url: /?mode=voice` hace que abrir la PWA desde el icono home
  arranque directo en modo voz (mismo flujo que el shortcut "Voz").
- Iconos `maskable` para que Android los recorte correctamente con el
  tema del launcher.
- `share_target` se considera para M3 (entrar al sistema desde "compartir
  con Orion Vox" un texto seleccionado). NO en M1.

### 3.2 Service Worker

Archivo `sw.js` registrado en root con `scope: '/'`. Estrategias:

| Recurso                                  | Estrategia        | Cache name             | Notas                                         |
|------------------------------------------|-------------------|------------------------|-----------------------------------------------|
| HTML shell (`/`, `/index.html`)          | network-first     | `shell-v{N}`           | Fallback a cache si offline.                  |
| JS / CSS / fuentes / iconos (versionados)| cache-first       | `assets-v{N}`          | Versionado por hash en nombre de archivo.     |
| Llamadas a Gemini API                    | **NO cachear**    | —                      | Pasar siempre a network. Sin fallback offline.|
| Llamadas a Edge Functions                | **NO cachear**    | —                      | Pasar siempre a network. Sin fallback offline.|
| `manifest.webmanifest`                   | network-first     | `shell-v{N}`           | Cambios deben propagarse.                     |

**Lifecycle.**

- `install`: pre-cachea shell y assets críticos del bundle actual.
- `activate`: borra caches viejos (`shell-v(N-1)`, `assets-v(N-1)`).
- `fetch`: aplica la tabla anterior por origen y path.
- `message`: acepta `{ type: 'SKIP_WAITING' }` para forzar activación
  cuando el usuario acepta el banner "Hay una nueva versión disponible".

### 3.3 Entry points (query string)

| Query                | Comportamiento del shell                                            |
|----------------------|---------------------------------------------------------------------|
| `/` (sin query)      | Modo voz por default (igual que `?mode=voice`).                     |
| `/?mode=voice`       | Render UI de Voice Input. **Auto-listen activado.**                 |
| `/?mode=config`      | Render UI de configuración. Sin auto-listen.                        |
| `/?mode=audit`       | Render UI de auditoría (M2 completa, M1 stub o redirect a config).  |
| `/?source=pwa`       | Marker informativo (instancia abierta como app instalada).          |

`?mode` y `?source` son ortogonales y pueden combinarse.

### 3.4 Auto-listen

Cuando `mode=voice`, el shell debe:

1. Renderizar la UI base de Voice Input.
2. Verificar permisos de micrófono (sin pedirlos todavía si nunca fueron
   concedidos — eso lo gestiona Voice Input al primer tap).
3. Si los permisos ya están concedidos en una sesión previa, **disparar
   automáticamente** `start()` de Voice Input apenas la UI esté lista.
4. Si los permisos no están concedidos, mostrar la UI con CTA grande
   "Tocá para hablar" — sin auto-listen.

Esto soporta el flujo: "OK Google, abrí Orion Vox" → PWA arranca → 1.5s
después el micrófono ya está escuchando, sin tap adicional.

## 4. Comportamiento esperado

### 4.1 Golden path — primer arranque (instalación)

1. Usuario abre la URL del bundle desde Chrome Android.
2. Service Worker se registra (`navigator.serviceWorker.register('/sw.js')`).
3. Después de ~30s o un par de pageviews, Chrome dispara
   `beforeinstallprompt`. El shell captura el evento y muestra un CTA
   "Instalar Orion Vox".
4. Usuario acepta → la PWA se instala, queda como icono en home, y
   abrirla la lleva a `/?mode=voice` con `display: standalone`.

### 4.2 Golden path — arranque por shortcut "Modo voz"

1. Usuario mantiene presionado el icono de Orion en home → menú de
   shortcuts → "Modo voz".
2. Shell carga `/?mode=voice`.
3. SW responde shell desde cache (cache-first si versión actual coincide,
   network-first para detectar updates).
4. Auto-listen arranca el micrófono.

### 4.3 Update del SW

1. Nueva versión del bundle se publica con assets versionados (hash en
   nombre).
2. Próxima carga de la PWA, el SW detecta nuevo `sw.js` y entra en
   `installing`.
3. Cuando termina install y entra en `waiting`, el shell muestra banner
   "Hay una nueva versión, tocá para actualizar".
4. Usuario acepta → shell envía `{ type: 'SKIP_WAITING' }` al SW →
   `activate` corre, limpia caches viejos, recarga la página.

### 4.4 Edge cases

- **Sin conexión al primer arranque.** Si nunca se cacheó nada, la
  PWA muestra una pantalla mínima "Sin conexión, no puedo cargar Orion
  Vox por primera vez. Conectate y volvé a intentar."
- **Sin conexión después de instalada.** El shell carga desde cache; el
  resto del flujo (Gemini, Edge) fallará en su capa con mensaje de error
  específico (ver `spec-error-handling.md`).
- **Permisos de micrófono denegados.** Auto-listen no dispara. UI muestra
  CTA y mensaje "Necesito permiso de micrófono para escuchar. Tocá y
  concedé permiso".

## 5. Estados / lifecycle

```
[install pendiente] ──acepta──▶ [instalada]
       │                            │
       │ (rechaza)                  │
       ▼                            │
[en navegador]                      │
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                   [SW installing]       [SW activated]
                          │                    │
                          ▼                    │
                   [SW waiting] ──skip──────▶  │
                                       activate│
                                               ▼
                                       [SW controlling]
```

## 6. Errores y manejo

| Situación                                        | Comportamiento                                                                                        |
|--------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Registro de SW falla                             | Log a consola; PWA sigue funcionando como web normal (sin offline). No bloquea uso.                   |
| `beforeinstallprompt` nunca dispara              | No se muestra CTA. La PWA sigue siendo usable desde el navegador.                                     |
| Bundle nuevo pero `activate` falla               | Mantener SW anterior activo. Banner persistente "Falló la actualización, tocá para reintentar".       |
| Storage lleno (`QuotaExceededError`) al cachear  | Continuar sin cache; loguear; mostrar warning suave.                                                  |

## 7. Restricciones M1

- **Sin Workbox** ni librerías de PWA pesadas. SW vanilla cortito (~150
  líneas estimadas). Justificación: keep-it-simple para auditar a mano y
  no acoplarse a una API que después cambia.
- **Sin `share_target`** (M3).
- **Sin Quick Tile / lockscreen widget de Android.** El icono home y los
  shortcuts del manifest son el único surface en M1. Quick Tiles
  requieren componente nativo (descartado por ADR-006).
- **Sin push notifications** (M3, requiere backend).
- **Sin background sync.** Toda interacción es foreground.

## 8. Criterios de aceptación verificables

- [ ] El manifest valida contra el spec de W3C (`web-app-manifest-validator`).
- [ ] Lighthouse PWA score >= 90.
- [ ] El shortcut "Modo voz" en el launcher Android abre la PWA y
      dispara auto-listen en < 2.5s desde el tap (con SW cacheado).
- [ ] Una vez instalada, abrir desde el icono home muestra `display:
      standalone` (sin URL bar).
- [ ] El SW cachea correctamente assets versionados y los sirve offline.
- [ ] Llamadas a Gemini y a Edge Functions **nunca** son interceptadas
      por el SW (verificable en DevTools Network).
- [ ] Update flow: publicar v2 con cambio visible, abrir PWA, ver banner,
      aceptar update, ver v2 sin recarga manual del navegador.
- [ ] Borrar caches viejas en `activate` deja IndexedDB intacto
      (credenciales no se pierden por update).

## 9. Dependencias

- **Voice Input** (`spec-voice-input.md`) — recibe el control en
  `mode=voice`.
- **Config UI** (`spec-config-ui.md`) — recibe el control en
  `mode=config`.
- **IndexedDB cifrado** (`spec-credentials-storage.md`) — el shell debe
  preservarlo durante updates de SW.

## 10. Referencias

- `../02-architecture/COMPONENTS.md` §1
- `../02-architecture/OVERVIEW.md`
- `../03-adr/ADR-006-pure-pwa-no-kotlin.md`
- `../03-adr/ADR-001-plan-f-plus-architecture.md`
- W3C Web App Manifest spec
- Chrome Service Worker docs
