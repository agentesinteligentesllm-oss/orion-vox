import path from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: {
      $shared: path.resolve('./supabase/functions/_shared'),
    },
  },
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      // 'prompt': el shell muestra banner "nueva versión" antes de activar el SW nuevo.
      // Necesario para implementar el flow SKIP_WAITING del spec §4.3.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Orion Vox',
        short_name: 'Orion',
        description: 'Puente de voz a tu Supabase, en español.',
        id: '/?source=pwa',
        start_url: '/?mode=voice',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#0E1116',
        background_color: '#0E1116',
        categories: ['productivity', 'utilities'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Modo voz',
            short_name: 'Voz',
            description: 'Arranca con el micrófono activo',
            url: '/?mode=voice',
            icons: [{ src: '/icons/shortcut-voice.png', sizes: '96x96' }],
          },
          {
            name: 'Configuración',
            short_name: 'Config',
            url: '/?mode=config',
            icons: [{ src: '/icons/shortcut-config.png', sizes: '96x96' }],
          },
          {
            name: 'Auditoría',
            short_name: 'Audit',
            url: '/?mode=audit',
            icons: [{ src: '/icons/shortcut-audit.png', sizes: '96x96' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Gemini y Edge Functions: NUNCA cacheados — siempre a red (spec §3.2)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
