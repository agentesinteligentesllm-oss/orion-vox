// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// VoiceInputController: stores handlers + exposes _lastInst for test control.
vi.mock('../../src/lib/voice/recognition.ts', () => {
  class VoiceInputController {
    _handlers: Record<string, ((v: unknown) => void)[]> = {};
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

// TtsOutputController: stores handlers + exposes _lastInst for test control.
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
import { requestPlanIntent } from '../../src/lib/api/plan-intent-client.ts';
import { authStore } from '../../src/lib/auth-store.svelte.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';
import { VoiceInputController } from '../../src/lib/voice/recognition.ts';
import { TtsOutputController } from '../../src/lib/voice/synthesis.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────
type MockInst = { _handlers: Record<string, ((v: unknown) => void)[]> };

function getRecognition(): MockInst & { start: ReturnType<typeof vi.fn> } {
  return (VoiceInputController as unknown as Record<string, unknown>)._lastInst as MockInst & {
    start: ReturnType<typeof vi.fn>;
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
const CLARIF_RESPONSE = {
  ok: true as const,
  kind: 'clarification' as const,
  clarification: { question: '¿De qué fecha querés ver las ventas?' },
  plan_intent_audit_id: 'audit-clarif-001',
  duration_ms: 90,
};

const PLAN_RESPONSE = {
  ok: true as const,
  kind: 'plan' as const,
  plan: { version: '1.0', operation: 'select' as const, table: 'ventas', limit: 100 },
  schema_hash: 'hash-abc',
  plan_intent_audit_id: 'audit-plan-001',
  duration_ms: 85,
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
  Object.defineProperty(navigator, 'permissions', {
    value: undefined,
    writable: true,
    configurable: true,
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('B4.4 — Clarification flow: TTS + re-listen + buildClarifiedPrompt', () => {
  it('[B4.4.1] TTS habla la pregunta cuando la respuesta es una clarificación', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');

    await waitFor(() => {
      expect(getTts().speak).toHaveBeenCalledWith('¿De qué fecha querés ver las ventas?');
    });
  });

  it('[B4.4.2] recognition.start() se llama cuando el TTS emite end', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    emit(getTts(), 'end');

    expect(rec.start).toHaveBeenCalledOnce();
  });

  it('[B4.4.3] recognition.start() se llama cuando el TTS emite error no-interrupted', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    emit(getTts(), 'error', { code: 'unknown', message: '' });

    expect(rec.start).toHaveBeenCalledOnce();
  });

  it('[B4.4.4] recognition.start() NO se llama cuando el TTS emite error interrupted', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    emit(getTts(), 'error', { code: 'interrupted', message: '' });

    expect(rec.start).not.toHaveBeenCalled();
  });

  it('[B4.4.5] segundo requestPlanIntent recibe el prompt con formato buildClarifiedPrompt', async () => {
    vi.mocked(requestPlanIntent)
      .mockResolvedValueOnce(CLARIF_RESPONSE)
      .mockResolvedValueOnce(PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    // primer turno → clarificación
    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    // TTS termina → auto-listen → usuario responde
    emit(getTts(), 'end');
    emit(rec, 'result', 'de este mes');

    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledTimes(2));
    expect(vi.mocked(requestPlanIntent).mock.calls[1][0]).toMatchObject({
      userPrompt: 'muéstrame las ventas\n\nAclaración del usuario: de este mes',
    });
  });

  it('[B4.4.6] card de clarificación persiste mientras recognition escucha la respuesta', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    // TTS termina → start llamado → simular que recognition pasa a listening
    emit(getTts(), 'end');
    emit(rec, 'state', 'listening');

    // card con la pregunta debe seguir visible
    await waitFor(() => {
      expect(screen.getByText('¿De qué fecha querés ver las ventas?')).toBeTruthy();
    });
  });

  it('[B4.4.7] hint "Respondé con tu voz" aparece durante el auto-listen', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    // TTS aún hablando → awaitingClarificationListen = true → hint visible
    await waitFor(() => {
      expect(screen.getByText(/Respondé con tu voz/)).toBeTruthy();
    });

    // TTS termina → recognition activo → hint sigue visible (clarificationOriginalPrompt != null)
    emit(getTts(), 'end');
    emit(rec, 'state', 'listening');

    await waitFor(() => {
      expect(screen.getByText(/Respondé con tu voz/)).toBeTruthy();
    });
  });

  it('[B4.4.8] handleCancel limpia el estado de clarificación y cancela TTS', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();
    const tts = getTts();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(tts.speak).toHaveBeenCalled());

    // simular cancel tap — el botón solo es visible en listening/processing
    // lo disparamos directamente via emission de cancel
    emit(rec, 'state', 'listening');

    // apretar cancelar (el botón está visible en voiceState=listening)
    const cancelBtn = screen.getByText('Cancelar');
    cancelBtn.click();

    await waitFor(() => {
      // TTS debe haberse cancelado
      expect(tts.cancel).toHaveBeenCalled();
      // card desaparece
      expect(screen.queryByText('¿De qué fecha querés ver las ventas?')).toBeNull();
    });

    // después de cancel, un nuevo recognition.start no debe dispararse desde TTS end
    emit(tts, 'end');
    expect(rec.start).not.toHaveBeenCalled();
  });

  it('[B4.4.9] mic tap durante awaitingClarificationListen cancela TTS y arranca recognition', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();
    const tts = getTts();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(tts.speak).toHaveBeenCalled());

    // callPlanIntent llama recognition.resetToIdle() en finally (mocked → no-op).
    // Simulamos el efecto: voiceState vuelve a 'idle' para que el botón quede habilitado.
    emit(rec, 'state', 'idle');
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Hablar' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    const micBtn = screen.getByRole('button', { name: 'Hablar' });
    micBtn.click();

    await waitFor(() => {
      expect(tts.cancel).toHaveBeenCalled();
      expect(rec.start).toHaveBeenCalledOnce();
    });

    // TTS end DESPUÉS del tap NO debe disparar un segundo recognition.start
    emit(tts, 'end');
    expect(rec.start).toHaveBeenCalledOnce(); // sigue siendo 1
  });

  it('[B4.4.10] label "Escuchá la pregunta…" aparece cuando awaitingClarificationListen=true', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(CLARIF_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'muéstrame las ventas');
    await waitFor(() => expect(getTts().speak).toHaveBeenCalled());

    // callPlanIntent llama recognition.resetToIdle() en finally (mocked → no-op).
    // Simulamos el efecto para que voiceState=idle y la label condicional sea visible.
    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText('Escuchá la pregunta…')).toBeTruthy();
    });
  });
});
