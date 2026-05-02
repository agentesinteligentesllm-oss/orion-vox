---
title: Deploy procedure — PWA Orion Vox
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/DEPLOYMENT-TOPOLOGY.md
  - ../02-architecture/TESTING-STRATEGY.md
  - ../03-adr/ADR-006-pure-pwa-no-kotlin.md
  - INSTALLATION-CUBOT.md
  - SETUP-SUPABASE.md
---

# Deploy procedure — PWA Orion Vox

Procedimiento de despliegue de la PWA Orion Vox al hosting estático.
Asume Vercel como default; pasos análogos en Netlify, Cloudflare Pages
o GitHub Pages.

> Tiempo estimado: 5-10 minutos por release.

---

## 1. Pre-requisitos

- [ ] PWA construida localmente y probada (ver `TESTING-STRATEGY.md`).
- [ ] Cuenta en hosting elegido (Vercel recomendado).
- [ ] CLI del hosting instalada y logueada (`vercel login`).
- [ ] Smoke manual del checklist `TESTING-STRATEGY.md §6` ejecutado.
- [ ] Bump de versión hecho en `package.json` y en service worker
      (ver §6).

---

## 2. Build local

El comando depende del framework PWA (decisión en ADR-012). Genérico:

```bash
npm install            # solo si cambió package.json
npm run build          # produce dist/ o build/ con assets estáticos
```

Verificar que el output incluye:

- `index.html`
- `manifest.webmanifest`
- `service-worker.js` (o equivalente)
- Assets JS/CSS bundlados con hashes de cache busting
- Iconos de la PWA (192x192, 512x512 mínimo, ver `INSTALLATION-CUBOT.md`)

---

## 3. Test local del bundle

Antes de deploy, servir el build localmente y validar:

```bash
npx serve dist/ -l 3000
```

Abrir `http://localhost:3000` en Chrome:

1. Devtools → Application → Manifest: validar que se parsea sin
   errores.
2. Devtools → Application → Service Workers: validar que se registra.
3. Lighthouse → PWA audit: idealmente todos verdes.
4. Mockear las llamadas a Edge si querés evitar tocar Supabase real.

Si algo falla acá, **NO deployar**. Arreglar primero.

---

## 4. Deploy a Vercel

### 4.1 Primer deploy (setup)

```bash
cd <proyecto-pwa>
vercel
```

Vercel CLI hace preguntas:

- **Setup and deploy "<dir>"?** Yes
- **Which scope?** tu cuenta personal
- **Link to existing project?** No (la primera vez)
- **What's your project's name?** `orion-vox`
- **In which directory is your code located?** `./`
- **Want to override the settings?** No (auto-detecta)

Vercel deploya y devuelve una URL: `https://orion-vox-<hash>.vercel.app`
(preview) y luego `https://orion-vox.vercel.app` (production tras
promoter).

### 4.2 Deploys subsiguientes

```bash
vercel --prod
```

Hace deploy directo a production. Tarda ~30-60 segundos.

**O** vinculá el proyecto a un repo Git: cada push a `main` deploya
automáticamente. Para single user puede ser overkill; queda a gusto.

---

## 5. HTTPS y dominio

- **HTTPS automático**: Vercel emite cert (Let's Encrypt) sin config.
- **Subdomain default**: `orion-vox.vercel.app`. Suficiente para M1.
- **Dominio propio (opcional)**: si querés `orion.tudominio.com`,
  configuralo en Vercel → Settings → Domains. El cert se renueva solo.

> Para "OK Google, abrí Orion Vox" funcionar bien, el nombre de la PWA
> en el manifest debe ser exactamente "Orion Vox". El dominio no
> importa para el atajo, importa el `name` y `short_name` del manifest.

---

## 6. Service Worker — versionado

El SW se actualiza con cada deploy si cambia su contenido. Para forzar
update sin cambios en SW (ej: cuando cambian assets), incluí una
constante de versión que se incremente en cada release:

```javascript
// service-worker.js
const CACHE_VERSION = 'orion-vox-v0.3.1';   // ← bump manual
const CACHE_NAME = `orion-vox-cache-${CACHE_VERSION}`;
```

Bumpear en cada release sirve para:

- Invalidar cache vieja en el cliente.
- Trazabilidad: `client_version` en `orion_audit` permite saber qué
  versión disparó cada operación.

**Convención semver:**

- **PATCH** (0.3.1 → 0.3.2): bug fix, sin cambio funcional.
- **MINOR** (0.3.x → 0.4.0): feature nueva, compatible.
- **MAJOR** (0.x → 1.0): cambio breaking (ej: nuevo prompt v2.0,
  nuevo Plan JSON v2.0).

Bumpear en `package.json` + en la constante del SW + en el manifest si
aplica.

---

## 7. Verificación post-deploy

```
[ ] Vercel dashboard: deploy status = Ready
[ ] Abrir URL pública en Chrome desktop → carga sin errores en consola
[ ] Lighthouse PWA score >= 90
[ ] Service Worker registrado (Application → Service Workers)
[ ] Manifest válido (Application → Manifest)
[ ] Iconos cargan
[ ] Llamada a Supabase Edge funciona (test "lista las tablas")
[ ] En el Cubot: abrir URL → trigger update del SW → verificar nueva versión activa
[ ] Smoke manual completo (TESTING-STRATEGY.md §6)
```

---

## 8. Rollback

### 8.1 Vercel — rollback inmediato

Vercel preserva todos los deploys. Para volver a uno previo:

```bash
vercel rollback <deployment-url>
```

O desde dashboard: Deployments → encontrar el deploy estable previo →
"..." → "Promote to Production".

Tiempo: 30 segundos.

### 8.2 Si la causa es un breaking change en Edge

Si el rollback de PWA no alcanza porque la Edge cambió incompatiblemente:

1. `cd orion-vox-supabase`
2. `git checkout <commit-anterior>`
3. `supabase functions deploy execute-plan --no-verify-jwt`
4. (idem para schema-summary si aplica)

---

## 9. Variables de entorno en hosting

La PWA NO necesita variables de entorno en el hosting porque:

- Las URLs y keys de Supabase / Gemini las ingresa el usuario en la PWA
  al instalarla.
- El bundle es 100% estático.

Si el framework PWA usa `import.meta.env.VITE_*` u otras, mantenelas
solo para defaults no sensibles (ej: `VITE_DEFAULT_LANG=es-MX`).

> **NUNCA** poner `service_role` ni Gemini key en variables de entorno
> del bundle. Eso es público. Las credenciales viven solo en el
> IndexedDB cifrado del usuario, ingresadas manualmente por él.

---

## 10. Hostings alternativos (procedimientos)

### 10.1 Netlify

```bash
npm install -g netlify-cli
netlify login
netlify init             # primera vez
netlify deploy --prod    # subsiguientes
```

### 10.2 Cloudflare Pages

```bash
npm install -g wrangler
wrangler login
wrangler pages deploy dist/
```

### 10.3 GitHub Pages

- Push del `dist/` a una branch `gh-pages`.
- Settings del repo → Pages → source = `gh-pages`.
- HTTPS automático.
- Limitación: paths a service worker pueden complicarse si no estás
  en root del subdomain.

---

## 11. Checklist final del deploy

```
[ ] Tests locales pasan (unit + integration)
[ ] Smoke manual TESTING-STRATEGY.md §6 pasa
[ ] Versión bumpeada en package.json + SW + manifest
[ ] Build local exitoso
[ ] Lighthouse PWA OK
[ ] vercel --prod ejecutado
[ ] Verificación post-deploy §7 completa
[ ] Cubot KK9: nueva versión activa (refresh manual o esperar SW update)
[ ] Test en hardware real: 1 read + 1 write con confirmación
[ ] orion_audit registra con client_version nueva
```

Si todo OK: release marcado como estable. Anotar versión en changelog
personal.

Si algo falla: rollback inmediato (§8) y abrir investigación.

---

## 12. Frecuencia esperada de deploys

- **M1 exploratorio**: 2-5 deploys por semana mientras se itera.
- **M1 estable**: 1-2 deploys por mes (bug fixes, mejoras menores).
- **M2**: depende del scope; probable burst de releases durante la
  migración.

No hay obligación de deployar — single user, tu pace.
