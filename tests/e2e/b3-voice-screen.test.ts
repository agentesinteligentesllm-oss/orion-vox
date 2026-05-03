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
    },
  },
}));

vi.mock('../../src/lib/voice/recognition.ts', () => {
  class VoiceInputController {
    private _handlers: Record<string, ((v: unknown) => void)[]> = {};
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    cancel = vi.fn();
    resetToIdle = vi.fn();
    getState = vi.fn().mockReturnValue('idle');
    constructor() {
      (VoiceInputController as unknown as Record<string, unknown>)._lastInst = this;
    }
    on(event: string, cb: (v: unknown) => void): void {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(cb);
    }
  }
  return { VoiceInputController };
});

vi.mock('../../src/lib/voice/synthesis.ts', () => {
  class TtsOutputController {
    speak = vi.fn().mockResolvedValue(undefined);
    cancel = vi.fn();
    on = vi.fn();
    selectVoiceForLang = vi.fn();
    isAvailable = vi.fn().mockReturnValue(false);
    setDefaultOptions = vi.fn();
    constructor() {
      (TtsOutputController as unknown as Record<string, unknown>)._lastInst = this;
    }
  }
  return { TtsOutputController };
});

vi.mock('../../src/lib/api/plan-intent-client.ts', () => {
  class PlanIntentClientError extends Error {
    code: string;
    constructor(params: { code: string; message: string }) {
      super(params.message);
      this.name = 'PlanIntentClientError';
      this.code = params.code;
    }
  }
  return {
    PlanIntentClientError,
    requestPlanIntent: vi.fn().mockResolvedValue({
      ok: true,
      kind: 'plan',
      plan: { version: '1.0', operation: 'select', table: 'tareas', limit: 100 },
      schema_hash: 'hash-test-abc',
      plan_intent_audit_id: 'audit-id-001',
      duration_ms: 80,
    }),
    buildClarifiedPrompt: vi.fn((a: string, b: string) => `${a}\n\nAclaración del usuario: ${b}`),
    PLAN_INTENT_CLIENT_VERSION: '0.0.0',
    PLAN_INTENT_REFRESH_SCHEMA_SETTING: 'planIntent.refreshSchemaNext',
  };
});

import type { Session } from '@supabase/supabase-js';
import VoiceScreen from '../../src/components/VoiceScreen.svelte';
import { requestPlanIntent } from '../../src/lib/api/plan-intent-client.ts';
import { authStore } from '../../src/lib/auth-store.svelte.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';
import { VoiceInputController } from '../../src/lib/voice/recognition.ts';

function getRecognition(): ReturnType<typeof vi.fn> & { start: ReturnType<typeof vi.fn> } {
  return (VoiceInputController as unknown as Record<string, unknown>)._lastInst as ReturnType<
    typeof vi.fn
  > & { start: ReturnType<typeof vi.fn> };
}

const mockSession = {
  user: { id: 'test-uid-abcdef12', email: 'test@orion.dev' },
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as unknown as Session;

afterEach(cleanup);

beforeEach(async () => {
  await localStore.wipeAll();
  authStore.session = mockSession;
  router.mode = 'voice';
  router.firstTime = false;
  vi.clearAllMocks();
  // Reset navigator.permissions to unavailable (manual tap flow)
  Object.defineProperty(navigator, 'permissions', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

describe('B3 — VoiceScreen UI + voice flow', () => {
  it('idle: shows "Listo para escucharte." and mic button', async () => {
    render(VoiceScreen);
    expect(screen.getByText('Listo para escucharte.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hablar' })).toBeTruthy();
  });

  it('keyboard fallback: "Usar teclado" button reveals text input', async () => {
    render(VoiceScreen);
    expect(screen.queryByPlaceholderText('Escribí tu comando…')).toBeNull();
    fireEvent.click(screen.getByText('Usar teclado'));
    await waitFor(() => expect(screen.getByPlaceholderText('Escribí tu comando…')).toBeTruthy());
  });

  it('keyboard submit: llama a plan-intent con el texto ingresado (B4.2)', async () => {
    render(VoiceScreen);
    fireEvent.click(screen.getByText('Usar teclado'));
    const input = await screen.findByPlaceholderText('Escribí tu comando…');
    fireEvent.input(input, { target: { value: 'listar clientes' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(requestPlanIntent).toHaveBeenCalledWith(
        expect.objectContaining({ userPrompt: 'listar clientes' }),
      ),
    );
  });

  it('gear icon navigates to config', async () => {
    render(VoiceScreen);
    fireEvent.click(screen.getByRole('button', { name: 'Configuración' }));
    expect(router.mode).toBe('config');
  });

  it('no auto-listen when navigator.permissions unavailable', async () => {
    render(VoiceScreen);
    // Let any async effects settle
    await new Promise((r) => setTimeout(r, 50));
    expect(getRecognition().start).not.toHaveBeenCalled();
  });

  it('permission prompt: shows activation education text', async () => {
    const mockStatus = { state: 'prompt' as PermissionState, onchange: null };
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue(mockStatus) },
      writable: true,
      configurable: true,
    });
    render(VoiceScreen);
    await waitFor(() => expect(screen.getByText('Tocá para activar el micrófono.')).toBeTruthy());
    expect(screen.getByText(/pedirá permiso/)).toBeTruthy();
  });

  it('permission denied: shows denied message and auto-enables keyboard', async () => {
    const mockStatus = { state: 'denied' as PermissionState, onchange: null };
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue(mockStatus) },
      writable: true,
      configurable: true,
    });
    render(VoiceScreen);
    await waitFor(() => expect(screen.getByText(/Permiso de micrófono denegado/)).toBeTruthy());
    expect(screen.getByPlaceholderText('Escribí tu comando…')).toBeTruthy();
  });

  it('permission granted: auto-listen calls recognition.start', async () => {
    const mockStatus = { state: 'granted' as PermissionState, onchange: null };
    Object.defineProperty(navigator, 'permissions', {
      value: { query: vi.fn().mockResolvedValue(mockStatus) },
      writable: true,
      configurable: true,
    });
    render(VoiceScreen);
    await waitFor(() => expect(getRecognition().start).toHaveBeenCalledOnce());
  });
});
