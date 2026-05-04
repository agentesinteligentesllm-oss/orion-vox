// @vitest-environment jsdom
/**
 * B7 — PWA Shell: install + update banners (ADR-014 cobertura mínima).
 * Golden path 1: banner de instalación aparece cuando beforeinstallprompt dispara.
 * Golden path 2: banner de actualización aparece cuando el SW tiene nueva versión.
 */
import 'fake-indexeddb/auto';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase.ts', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

// Importar pwa store y el mock del stub (virtual:pwa-register ya aliaseado en vitest.config)
import App from '../../src/App.svelte';
import { pwa } from '../../src/lib/pwa.svelte.ts';

describe('B7 — PWA Shell banners', () => {
  beforeEach(() => {
    pwa.canInstall = false;
    pwa.needsUpdate = false;
  });

  afterEach(() => cleanup());

  it('muestra banner de instalación cuando beforeinstallprompt dispara', async () => {
    render(App);

    // Simular que el browser disparó beforeinstallprompt
    const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    window.dispatchEvent(promptEvent);

    // El estado debe reflejarse
    expect(pwa.canInstall).toBe(true);

    // El banner de instalación debe estar visible
    const banner = await screen.findByText('Instalar Orion Vox');
    expect(banner).toBeTruthy();
  });

  it('muestra banner de actualización cuando needsUpdate es true', async () => {
    render(App);

    // Simular detección de nueva versión del SW
    pwa.needsUpdate = true;

    const banner = await screen.findByText('Nueva versión disponible');
    expect(banner).toBeTruthy();

    const btn = await screen.findByRole('button', { name: 'Actualizar' });
    expect(btn).toBeTruthy();
  });
});
