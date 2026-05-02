// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase.ts', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

vi.mock('../../src/lib/logout.ts', () => ({
  performLogout: vi.fn().mockResolvedValue(undefined),
}));

import type { Session } from '@supabase/supabase-js';
import App from '../../src/App.svelte';
import LoginWizard from '../../src/components/LoginWizard.svelte';
import Settings from '../../src/components/Settings.svelte';
import { authStore } from '../../src/lib/auth-store.svelte.ts';
import { performLogout } from '../../src/lib/logout.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';

const mockSession = {
  user: { id: 'test-uid-abcdef12', email: 'test@orion.dev' },
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as unknown as Session;

afterEach(cleanup);

beforeEach(async () => {
  await localStore.wipeAll();
  authStore.session = null;
  authStore.loading = false;
  router.mode = 'voice';
  router.firstTime = false;
  vi.clearAllMocks();
});

describe('B2 — auth + config + logout flows', () => {
  it('no session → login wizard shown', async () => {
    router.mode = 'config';
    router.firstTime = true;
    render(App);
    await waitFor(() => screen.getByText('Enviar enlace de acceso'));
  });

  it('OTP submit → shows sent state', async () => {
    render(LoginWizard);
    const emailInput = screen.getByPlaceholderText('tu@email.com');
    fireEvent.input(emailInput, { target: { value: 'test@orion.dev' } });
    fireEvent.submit(emailInput.closest('form') as HTMLFormElement);
    await waitFor(() => screen.getByText('Revisá tu email'));
  });

  it('session arrives → voice screen shown', async () => {
    authStore.session = mockSession;
    router.mode = 'config';
    router.firstTime = true;
    render(App);
    await waitFor(() => screen.getByText('Listo para escucharte.'), { timeout: 3000 });
  });

  it('existing session → voice screen direct', async () => {
    authStore.session = mockSession;
    router.mode = 'voice';
    render(App);
    screen.getByText('Listo para escucharte.');
  });

  it('logout → performLogout called after confirmation', async () => {
    authStore.session = mockSession;
    render(Settings);
    fireEvent.click(screen.getByText('Cerrar sesión y borrar caché local'));
    const confirmBtn = await screen.findByRole('button', { name: 'Cerrar sesión' });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(performLogout).toHaveBeenCalledOnce());
  });
});
