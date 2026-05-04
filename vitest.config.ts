import path from 'node:path';
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    },
    resolve: {
      conditions: ['browser'],
      alias: {
        // virtual:pwa-register es un módulo virtual de vite-plugin-pwa que no existe
        // en el entorno de tests. Este stub evita errores de resolución en Vitest.
        'virtual:pwa-register': path.resolve('./src/__mocks__/pwa-register.ts'),
      },
    },
  }),
);
