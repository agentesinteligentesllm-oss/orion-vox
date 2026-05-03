// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// VoiceInputController: stores handlers + exposes _lastInst for test control.
// Patrón B4.4: _handlers público (no private) para que emit() acceda a ellos.
vi.mock('../../src/lib/voice/recognition.ts', () => {
  class VoiceInputController {
    _handlers: Record<string, ((v: unknown) => void)[]> = {};
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    cancel = vi.fn();
    resetToIdle = vi.fn(); // no-op en tests — emitir 'state','idle' manualmente cuando se necesite
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

// TtsOutputController: stores handlers + exposes _lastInst.
// tts.cancel() en producción emite 'error' con code:'interrupted' (no 'end').
vi.mock('../../src/lib/voice/synthesis.ts', () => {
  class TtsOutputController {
    _handlers: Record<string, ((v: unknown) => void)[]> = {};
    speak = vi.fn().mockResolvedValue(undefined);
    cancel = vi.fn();
    selectVoiceForLang = vi.fn();
    isAvailable = vi.fn().mockReturnValue(true);
    setDefaultOptions = vi.fn();
    constructor() {
      (TtsOutputController as unknown as Record<string, unknown>)._lastInst = this;
    }
    on(event: string, cb: (v: unknown) => void): void {
      if (!this._handlers[event]) this._handlers[event] = [];
      this._handlers[event].push(cb);
    }
  }
  return { TtsOutputController };
});

vi.mock('../../src/lib/supabase.ts', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

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
    requestPlanIntent: vi.fn(),
    buildClarifiedPrompt: vi.fn((a: string, b: string) => `${a}\n\nAclaración del usuario: ${b}`),
    PLAN_INTENT_CLIENT_VERSION: '0.0.0',
    PLAN_INTENT_REFRESH_SCHEMA_SETTING: 'planIntent.refreshSchemaNext',
  };
});

// ─── Imports post-mock ────────────────────────────────────────────────────────
import type { Session } from '@supabase/supabase-js';
import VoiceScreen from '../../src/components/VoiceScreen.svelte';
import { PlanIntentClientError, requestPlanIntent } from '../../src/lib/api/plan-intent-client.ts';
import { authStore } from '../../src/lib/auth-store.svelte.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';
import { VoiceInputController } from '../../src/lib/voice/recognition.ts';
import { TtsOutputController } from '../../src/lib/voice/synthesis.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────
type MockInst = { _handlers: Record<string, ((v: unknown) => void)[]> };

function getRecognition(): MockInst & {
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} {
  return (VoiceInputController as unknown as Record<string, unknown>)._lastInst as MockInst & {
    start: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

function getTts(): MockInst & {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
} {
  return (TtsOutputController as unknown as Record<string, unknown>)._lastInst as MockInst & {
    speak: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

function emit(inst: MockInst, event: string, value?: unknown): void {
  for (const cb of inst._handlers[event] ?? []) cb(value);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
// PlanPreview con esta respuesta renderiza: 'Voy a buscar 100 registros en "ventas"'
const PLAN_RESPONSE = {
  ok: true as const,
  kind: 'plan' as const,
  plan: { version: '1.0', operation: 'select' as const, table: 'ventas', limit: 100 },
  schema_hash: 'hash-abc',
  plan_intent_audit_id: 'audit-plan-001',
  duration_ms: 85,
};

const CLARIF_RESPONSE = {
  ok: true as const,
  kind: 'clarification' as const,
  clarification: { question: '¿De qué fecha querés ver las ventas?' },
  plan_intent_audit_id: 'audit-clarif-001',
  duration_ms: 90,
};

const MOCK_SESSION = {
  user: { id: 'test-uid', email: 'test@orion.dev' },
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as unknown as Session;

// ─── Setup / teardown ─────────────────────────────────────────────────────────
afterEach(cleanup);

beforeEach(async () => {
  await localStore.wipeAll();
  authStore.session = MOCK_SESSION;
  router.mode = 'voice';
  router.firstTime = false;
  vi.clearAllMocks();
  // navigator.permissions indefinido → auto-listen no se activa → flujo de tap manual
  Object.defineProperty(navigator, 'permissions', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('B4.5 — E2E: voice → plan-intent → PlanPreview / clarification', () => {
  it('[B4.5.1] golden path voz → plan SELECT → PlanPreview visible', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    // usuario habla → callPlanIntent se ejecuta
    emit(rec, 'result', 'muéstrame las ventas');

    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledOnce());

    // recognition.resetToIdle() es no-op en mock → emitir 'idle' para que PlanPreview sea visible
    // (planResponse visible sólo cuando voiceState === 'idle' || clarificationOriginalPrompt !== null)
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText('Voy a buscar 100 registros en "ventas"')).toBeTruthy();
    });
  });

  it('[B4.5.2] keyboard fallback → plan SELECT → PlanPreview visible', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    // revelar teclado
    fireEvent.click(screen.getByText('Usar teclado'));
    const input = await screen.findByPlaceholderText('Escribí tu comando…');

    // tipear y enviar
    fireEvent.input(input, { target: { value: 'listar clientes' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(requestPlanIntent).toHaveBeenCalledWith(
        expect.objectContaining({ userPrompt: 'listar clientes' }),
      ),
    );

    // resetToIdle no-op → emitir idle
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText('Voy a buscar 100 registros en "ventas"')).toBeTruthy();
    });
  });

  it('[B4.5.3] clarification E2E completo: voz → clarificación → TTS → re-listen → respuesta → PlanPreview', async () => {
    vi.mocked(requestPlanIntent)
      .mockResolvedValueOnce(CLARIF_RESPONSE)
      .mockResolvedValueOnce(PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();
    const tts = getTts();

    // ── turno 1: prompt inicial → clarificación ──────────────────────────────
    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() =>
      expect(tts.speak).toHaveBeenCalledWith('¿De qué fecha querés ver las ventas?'),
    );

    // resetToIdle no-op → emitir idle para que la card de clarificación sea visible
    emit(rec, 'state', 'idle');

    // ── TTS termina → recognition.start() automático ─────────────────────────
    emit(tts, 'end');
    expect(rec.start).toHaveBeenCalledOnce();

    // ── turno 2: usuario responde → segundo callPlanIntent con prompt concatenado ──
    emit(rec, 'result', 'de este mes');

    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(requestPlanIntent).mock.calls[1][0]).toMatchObject({
      userPrompt: 'muéstrame las ventas\n\nAclaración del usuario: de este mes',
    });

    // resetToIdle no-op → emitir idle para que PlanPreview sea visible
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText('Voy a buscar 100 registros en "ventas"')).toBeTruthy();
    });
  });

  it('[B4.5.4] error de red → card de error visible en español', async () => {
    vi.mocked(requestPlanIntent).mockRejectedValueOnce(
      new PlanIntentClientError({ code: 'network_error', message: 'Sin conexión.' }),
    );
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');

    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledOnce());

    // resetToIdle no-op → emitir idle para que planError sea visible
    // (planError visible sólo cuando voiceState === 'idle')
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText('Sin conexión. Revisá tu red e intentá de nuevo.')).toBeTruthy();
    });
  });

  it('[B4.5.5] cancel durante processing → cards desaparecen → estado vuelve a idle', async () => {
    // promise que nunca resuelve → mantiene voiceState='processing' → botón Cancelar visible
    vi.mocked(requestPlanIntent).mockReturnValue(new Promise(() => {}));
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');

    // voiceState='processing' → botón Cancelar visible
    await waitFor(() => {
      expect(screen.getByText('Cancelar')).toBeTruthy();
    });

    screen.getByText('Cancelar').click();

    // simular que recognition.cancel() → estado idle
    // (en producción recognition.cancel() termina el stream y emite 'idle')
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      // planResponse=null → PlanPreview no renderizado
      expect(screen.queryByText(/Voy a buscar/)).toBeNull();
      // botón Cancelar sólo visible en listening|processing → ahora oculto
      expect(screen.queryByText('Cancelar')).toBeNull();
      // lastResult='muéstrame las ventas' (truthy) → label 'Tocá para continuar.'
      expect(screen.getByText('Tocá para continuar.')).toBeTruthy();
    });
  });
});
