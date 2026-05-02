---
title: Instalación en Cubot KingKong 9
status: stable
milestone: M1
owner: orion-vox
last-reviewed: 2026-05-01
related:
  - ../02-architecture/DEPLOYMENT-TOPOLOGY.md
  - ../02-architecture/SECURITY-MODEL.md
  - ../03-adr/ADR-006-pure-pwa-no-kotlin.md
  - SETUP-SUPABASE.md
  - SETUP-GEMINI-API.md
  - DAILY-USAGE.md
---

# Instalación de la PWA en el Cubot KingKong 9

Guía de instalación de Orion Vox en el dispositivo target: Cubot
KingKong 9 con Android, Chrome moderno, sin Play Store.

> Tiempo estimado: 10-15 minutos (asumiendo Supabase + Gemini ya
> configurados).

---

## 1. Pre-requisitos

- [ ] Cubot KK9 con Android (versión que viene de fábrica).
- [ ] Chrome Android instalado y actualizado (versión >= 120
      recomendada).
- [ ] Cuenta Google configurada en el Cubot (la misma del Gemini API
      Studio idealmente).
- [ ] Conexión a internet (4G o WiFi).
- [ ] PWA deployada en hosting estático (ver `DEPLOY-PROCEDURE-PWA.md`).
- [ ] Datos anotados de Supabase y Gemini:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE`
  - `GEMINI_API_KEY`
- [ ] PIN nuevo decidido (4-8 dígitos, NO el del bloqueo del celular).

---

## 2. Abrir la PWA en Chrome

1. Abrir Chrome Android en el Cubot.
2. Navegar a la URL de la PWA (ej: `https://orion-vox.vercel.app`).
3. Esperar carga completa (primer carga: hasta 5s mientras descarga
   bundle + service worker).
4. Verificar que se ve la pantalla principal de Orion Vox (botón de
   micrófono grande, indicador de estado).

---

## 3. Instalar como PWA (Add to Home Screen)

### 3.1 Vía prompt automático

Si Chrome detecta una PWA bien configurada, muestra automáticamente:

> "Add Orion Vox to Home screen?"

Tocar **"Add"** o **"Install"**.

### 3.2 Vía menú manual

Si el prompt no aparece:

1. Chrome Android → menú de tres puntos (arriba derecha).
2. **"Add to Home screen"** o **"Install app"**.
3. Confirmar nombre = "Orion Vox".
4. Tocar **"Add"**.

### 3.3 Verificación

- Volver al home screen del Cubot.
- Buscar el icono de Orion Vox.
- Tocarlo: debe abrirse en modo standalone (sin barra de Chrome).

---

## 4. Configurar atajos del sistema

### 4.1 "OK Google, abrí Orion Vox"

**No requiere config explícita.** Funciona si:

- La cuenta Google del Cubot tiene Asistente Google activo.
- El nombre de la PWA en el manifest es exactamente "Orion Vox".
- El icono está en home screen (Asistente lo usa para resolver el
  intent).

Probar:

1. "OK Google" (esperar feedback).
2. "Abrí Orion Vox" (o "Abrir Orion Vox").
3. La PWA debe abrirse.

Si Google abre el navegador en Google Search, el nombre puede no estar
suficientemente reconocible. Probar variantes ("abrí la app Orion
Vox") o renombrarla por algo más distintivo.

### 4.2 Lockscreen widget (opcional)

Algunas versiones de Android permiten un widget en lockscreen para
acceso directo:

1. Long press en lockscreen → Widgets.
2. Buscar Orion Vox (si Android lo expone).
3. Arrastrar al lockscreen.

> Cubot KK9 puede no soportar widgets de PWA en lockscreen. Si no
> aparece, saltá este paso. El atajo "OK Google" es suficiente.

### 4.3 Quick Tile (opcional)

Si Chrome / Android lo expone:

1. Bajar barra de notificaciones → editar tiles.
2. Arrastrar el tile de Orion Vox a la zona activa.

Cubot KK9 con su Android stock puede no exponer esto. Saltable.

### 4.4 Botón físico personalizable (Cubot rugged)

El Cubot KK9 viene con un botón programable lateral. Configurarlo en:

1. Settings → Buttons (o equivalente del firmware Cubot).
2. Action: launch app → seleccionar Orion Vox.

Esto es lo más rápido en uso real (no requiere voz para invocar).

---

## 5. Conceder permisos

Al primer uso de cada feature, Chrome pide permiso. Conceder:

| Permiso              | Cuándo se pide                 | Necesario para         |
|----------------------|--------------------------------|------------------------|
| Micrófono            | Al tocar el botón de voz       | Voice Input (STT)      |
| Notificaciones       | (M1: NO se piden)              | -                      |
| Storage / IndexedDB  | Implícito al primer write      | Cifrado local de secrets |
| Bloquear cierre      | Implícito en standalone mode   | UX                     |

**Si negás micrófono accidentalmente**: Chrome → menú → Site settings
→ buscar Orion Vox → Permissions → Microphone → Allow.

---

## 6. Setup inicial (primera vez)

Al abrir la PWA por primera vez, debe mostrar un **wizard de setup**:

### 6.1 Paso 1 — Fijar PIN

- Ingresar PIN (4-8 dígitos).
- Confirmar el PIN.
- (Opcional, si el dispositivo lo expone) Habilitar WebAuthn /
  biometría como alternativa al PIN.

> **Importante**: este PIN es **independiente** del PIN de bloqueo del
> Cubot. Se usa solo para descifrar las credenciales en IndexedDB. Si
> lo olvidás, el único camino es factory reset de la PWA (ver
> `RUNBOOK.md`) y re-ingresar credenciales.

### 6.2 Paso 2 — Credenciales Supabase

- **URL del proyecto**: `https://<project-ref>.supabase.co`
- **Service role key**: pegar la key completa.

La PWA hace un health check:

- `GET ${SUPABASE_URL}/rest/v1/` con el header de auth.
- Si falla: muestra error, no avanza al siguiente paso.
- Si OK: marca como configurado.

### 6.3 Paso 3 — Credenciales Gemini

- **API key**: pegar la key (`AIzaSy...`).
- **Modelo**: default `gemini-2.5-flash`. No cambiar salvo razón
  específica.

Health check:

- POST a `generateContent` con un prompt mínimo de prueba.
- Si falla: muestra error.
- Si OK: marca como configurado.

### 6.4 Paso 4 — Refrescar schema

- Tocar "Cargar schema desde Supabase".
- La PWA llama a `GET /functions/v1/schema-summary`.
- Recibe markdown del schema.
- Muestra al usuario el schema cargado para validación visual.

Si querés agregar **hints semánticos** (ver `SCHEMA-SUMMARY.md §6`):

- Editar el bloque "Hints semánticos" con notas en español sobre tu
  base.
- Guardar.

### 6.5 Paso 5 — Test de smoke

La PWA invita a probar:

> "Decí: 'lista las tareas activas'"

- Tocar botón de voz (o usar fallback teclado).
- Dictar / escribir la frase.
- Esperar respuesta.

Resultado esperado:

- Indicador pasa por: escuchando → procesando → respondiendo.
- Aparece el resultado en pantalla.
- TTS habla la respuesta.

Si todo OK: setup completo.

---

## 6.bis Smoke test pre-uso — Web Speech en Cubot KK9

> **WARNING**: Web Speech API (Recognition + Synthesis) en Cubot
> KingKong 9 **NO ha sido validada** por el equipo. El Cubot trae un
> Android "alternativo" (no AOSP puro, no GMS Pixel) y los servicios
> Google de voz pueden no estar completos. Este smoke test es
> **OBLIGATORIO antes de uso real** — sin él, la PWA puede quedar
> instalada pero inservible para el modo voz, único modo de
> interacción primaria del proyecto. Si falla, ver
> `RUNBOOK.md` → INC-011.

Checklist de smoke test (todos los items deben pasar):

- [ ] **Permiso de micrófono concedido** — Chrome → Site settings →
      Orion Vox → Microphone = Allow.
- [ ] **Web Speech Recognition (es-MX) funciona**. Conectar el Cubot
      por USB y abrir Chrome DevTools remoto (`chrome://inspect` desde
      desktop). En la consola del tab Orion Vox, ejecutar:
      ```js
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      r.lang = 'es-MX';
      r.onresult = (e) => console.log('OK:', e.results[0][0].transcript);
      r.onerror = (e) => console.error('ERR:', e.error);
      r.start();
      // hablar: "hola probando"
      ```
      Verificar que dispara `onresult` con transcripción razonable.
- [ ] **Web Speech Synthesis (es-MX) funciona** — desde la misma
      consola:
      ```js
      const voices = speechSynthesis.getVoices();
      const esMX = voices.filter(v => v.lang.startsWith('es-MX') || v.lang.startsWith('es'));
      console.log('voces es:', esMX.map(v => v.name + '/' + v.lang));
      const u = new SpeechSynthesisUtterance('hola, esta es una prueba');
      u.lang = 'es-MX';
      speechSynthesis.speak(u);
      ```
      Verificar que `getVoices()` retorna al menos una voz `es-*` y
      que `speak()` emite audio audible.
- [ ] **Latencia de captura razonable (< 2s)** — desde fin de frase
      hasta `onresult` debe tomar menos de 2 segundos. Si tarda más,
      la UX hands-free se vuelve frustrante.

Si los 4 ítems pasan: continuar con uso normal. Si alguno falla,
detener el rollout y abrir `RUNBOOK.md` → INC-011.

---

## 7. Estructura de la primera pantalla en uso normal

```
┌─────────────────────────────────────┐
│  Orion Vox                          │
│  ─────────                          │
│                                     │
│   [estado: idle | listening | ...]  │
│                                     │
│      ┌───────────────────┐          │
│      │                   │          │
│      │  🎤  TOCÁ PARA    │          │
│      │      HABLAR       │          │
│      │                   │          │
│      └───────────────────┘          │
│                                     │
│   [transcripción en vivo]           │
│                                     │
│   [respuesta / resultado]           │
│                                     │
│   ─────────                         │
│   ⚙ Configuración                   │
│   📋 Auditoría                      │
└─────────────────────────────────────┘
```

---

## 8. Troubleshooting de instalación

| Síntoma                                       | Causa probable                            | Solución                                                  |
|-----------------------------------------------|-------------------------------------------|-----------------------------------------------------------|
| No aparece prompt de "Add to Home screen"     | PWA mal configurada o ya instalada         | Verificar Lighthouse PWA + chequear si ya está en home    |
| El icono no se ve en home screen              | Instalación silenciosa o falla del SW      | Reinstalar; verificar manifest válido                     |
| Al tocar el icono se abre Chrome con barra    | No instalado como PWA, abrió como bookmark | Reinstalar via "Install app" del menú                     |
| "OK Google, abrí Orion Vox" no funciona       | Asistente no reconoce el nombre            | Probar variantes; renombrar PWA si es necesario           |
| Micrófono no responde                         | Permiso denegado o navegador no es Chrome  | Site settings → permitir micrófono; usar Chrome (no Samsung Browser) |
| Health check de Supabase falla                | URL o service_role mal copiados            | Re-pegar desde password manager                           |
| Health check de Gemini falla                  | API key inválida o quota agotada           | Verificar en Google AI Studio; rotar si hace falta        |
| schema-summary devuelve markdown vacío        | No hay tablas o todas excluidas            | Crear tabla de prueba (SETUP-SUPABASE.md §5)              |
| TTS no habla                                  | Voz es-MX no disponible o volumen bajo     | Settings → voz; subir volumen                             |

---

## 9. Re-instalación (después de factory reset PWA)

Si en algún momento "limpiás los datos" de la PWA (Chrome → Site
settings → Clear data):

- Se borran IndexedDB, secrets, schema_cache, audit_mirror.
- Se queda el bundle del SW.

Para volver a usar:

1. Abrir la PWA.
2. Detectar que está en estado "no configurado".
3. Repetir wizard del §6 (PIN nuevo, credenciales, schema).
4. **Listo**: el `orion_audit` server-side preservó todo el historial,
   solo se reconstruye el espejo local.

---

## 10. Checklist final

```
[ ] PWA instalada vía Add to Home Screen
[ ] Icono presente en home screen del Cubot
[ ] Apertura desde icono lanza modo standalone (sin barra Chrome)
[ ] "OK Google, abrí Orion Vox" funciona
[ ] (Opcional) Botón físico Cubot configurado
[ ] Permiso de micrófono concedido
[ ] PIN fijado (no es el del bloqueo del celular)
[ ] Credenciales Supabase configuradas y health check OK
[ ] Credenciales Gemini configuradas y health check OK
[ ] Schema cargado y visible en config
[ ] (Opcional) Hints semánticos agregados
[ ] Smoke test "lista las tareas activas" OK
[ ] TTS habla la respuesta en es-MX
```

Si todo OK: PWA lista para uso diario. Ver `DAILY-USAGE.md`.
