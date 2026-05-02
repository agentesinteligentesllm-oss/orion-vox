---
title: "ADR-006: PWA pura, sin componente nativo Kotlin"
status: stable
milestone: constitutional
owner: orion-vox
last-reviewed: 2026-05-01
decision-date: 2026-05-01
decision-status: accepted
superseded-by: null
related:
  - ADR-001-plan-f-plus-architecture.md
  - ADR-002-discard-ok-google-native.md
  - ADR-007-web-speech-api-internal-voice-mode.md
  - ../00-constitution/CONSTITUTION.md
---

# ADR-006: PWA pura, sin componente nativo Kotlin

## Contexto

En los rounds tempranos del tribunal se evaluó si Orion Vox debía tener
un componente Android nativo (Kotlin) además o en lugar de la PWA. Las
razones que originalmente justificaban Kotlin eran:

1. **App Actions / Custom Intents** — requieren app publicada en Play
   Store (descartado en ADR-002).
2. **AppFunctions** — requiere app Kotlin nativa, Android 16+, hardware
   Pixel/Galaxy y acceso al EAP (descartado en ADR-002).
3. **TWA (Trusted Web Activity)** — wrapper Android para PWA que permite
   integraciones nativas selectas (descartado en ADR-002 al caer Custom
   Intents).
4. **Wake word en background con foreground service Kotlin** —
   considerado y descartado en ADR-002 por consumo de batería y por
   exceder el alcance de M1.
5. **Acceso a APIs nativas no expuestas a la web** (notificaciones
   ricas, integraciones con calendario nativo, etc.) — para M1 no son
   necesarias; el caso de uso central es voz + Postgres.

Una vez descartados los puntos 1-4, **la justificación arquitectónica
para Kotlin desaparece**. Mantenerlo "por si acaso" sería over-engineering
contradictorio con la Constitución.

## Decisión

Orion Vox es **PWA pura**. Cero Kotlin. Cero APK. Cero TWA. Cero proceso
de build Android.

- **Distribución**: instalación PWA estándar vía "Add to Home Screen"
  desde el navegador del Cubot KingKong 9, apuntando a un endpoint
  propio del usuario (servido desde Supabase Storage, GitHub Pages,
  Vercel, o equivalente — a definir en M1).
- **Iconografía / lockscreen widget / Quick Tile**: implementados con
  los mecanismos web estándar (`manifest.webmanifest` con `shortcuts`,
  `display: standalone`, theme color, splash screen). Lo que no esté
  disponible en web se acepta como limitación.
- **Service Worker**: para offline shell, caching de assets, y
  background sync cuando aplique. Sin background voice listening.

El framework concreto (Vite + React, SvelteKit, Next.js, Astro, etc.)
queda **explícitamente sin decidir** y será materia de ADR-012 al
arrancar M1 — depende de prototipos rápidos y de cuál se sienta mejor
para el equipo en ese momento.

## Alternativas consideradas

- **TWA wrapper liviano**: rechazado. Sin Custom Intents (ADR-002), TWA
  no aporta nada que la PWA pura no tenga, y agrega ciclo de release
  Android (signing, Play Store policies si se subiera, etc.).
- **App Kotlin minimal con WebView embebido + bridge JS**: rechazado.
  Reintroduce todo el costo de Android nativo (Studio, Gradle, signing,
  versionado, distribución del APK) sin desbloquear capacidades reales.
  Es lo peor de los dos mundos.
- **App Kotlin completa nativa (sin PWA)**: rechazado por contradecir el
  Plan F+ (ADR-001) y por reintroducir el problema de iteración lenta
  que la PWA viene a resolver.
- **Cordova / Capacitor / Tauri Mobile**: rechazado. Capas extra de
  build y de mantenimiento sin beneficio claro en este caso de uso.
- **Flutter / React Native**: rechazado. Cambia de stack sin resolver
  el problema central (la voz de sistema sigue cerrada — ADR-002).

## Consecuencias

**Positivas**:

- Iteración inmediata: cambio de código → `git push` → deploy → recargar
  PWA en el celu. No hay APK build, no hay store review.
- Stack único (TypeScript + HTML + CSS + Edge Functions Deno). Cero
  context switching entre lenguajes / IDEs.
- Cero dependencia de gatekeepers (Play Store, EAP de AppFunctions,
  certificados de firma de Android).
- Onboarding de un colaborador es instalar Node + clonar repo. Sin SDKs
  ni emuladores Android.

**Negativas / deuda asumida**:

- Imposibilidad de implementar wake word en background (ya aceptada en
  ADR-002).
- Notificaciones push en Chrome Android funcionan pero con limitaciones
  (heads-up condicional al engagement, no foreground services).
- Si en algún momento aparece una capability nativa que justifique TWA
  o Kotlin (ej. AppFunctions liberada para Cubot), habría que rever esta
  decisión y crear un ADR superseder.
- Algunos atajos del sistema (lockscreen widget completo, Quick Settings
  tile real) son en web aproximaciones, no equivalentes 1:1 a un
  componente nativo.

**Neutrales**:

- La PWA puede instalarse o desinstalarse desde el navegador, sin paso
  por la pantalla de "Apps" del sistema con el mismo flujo que una app
  nativa. Para single-user es indistinguible en uso diario.

## Aplicabilidad

- Aplica a **M1, M2 y M3**.
- Revisión condicional: si una API web crítica (ej. Web Speech `es-MX`
  fiable) deja de existir, o si Google libera AppFunctions a Cubot, se
  reabre.

## Referencias

- ADR-001 — Plan F+ que codifica PWA como única superficie cliente.
- ADR-002 — descarte de las integraciones nativas que justificaban
  Kotlin.
- ADR-007 — Web Speech API como suplente de la voz de sistema.
- `docs/00-constitution/CONSTITUTION.md` § 7 (PWA pura, sin componente
  nativo Kotlin).
- Glosario: `PWA`, `TWA`, `AppFunctions`, `Sideload`.
