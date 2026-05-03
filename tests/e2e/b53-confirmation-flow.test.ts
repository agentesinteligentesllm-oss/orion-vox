// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
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

vi.mock('../../src/lib/api/execute-plan-client.ts', () => ({
  auditCancel: vi.fn(),
  EXECUTE_PLAN_CLIENT_VERSION: '0.0.0',
}));

vi.mock('../../src/lib/storage/local-store.ts', () => ({
  localStore: {
    getSetting: vi.fn().mockResolvedValue(null),
    putSetting: vi.fn().mockResolvedValue(undefined),
    getSchemaCache: vi.fn().mockResolvedValue(null),
    putSchemaCache: vi.fn().mockResolvedValue(undefined),
    clearSchemaCache: vi.fn().mockResolvedValue(undefined),
    appendAuditMirror: vi.fn().mockResolvedValue(undefined),
    listAuditMirror: vi.fn().mockResolvedValue([]),
    clearAuditMirror: vi.fn().mockResolvedValue(undefined),
    deleteSetting: vi.fn().mockResolvedValue(undefined),
    wipeAll: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports post-mock ────────────────────────────────────────────────────────
import type { Session } from '@supabase/supabase-js';
import VoiceScreen from '../../src/components/VoiceScreen.svelte';
import { auditCancel } from '../../src/lib/api/execute-plan-client.ts';
import { requestPlanIntent } from '../../src/lib/api/plan-intent-client.ts';
import { authStore } from '../../src/lib/auth-store.svelte.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';
import { VoiceInputController } from '../../src/lib/voice/recognition.ts';

// ─── Helpers ──────────────────────────────────────────────────────────────────
type MockInst = { _handlers: Record<string, ((v: unknown) => void)[]> };

function getRecognition(): MockInst & { start: ReturnType<typeof vi.fn> } {
  return (VoiceInputController as unknown as Record<string, unknown>)._lastInst as MockInst & {
    start: ReturnType<typeof vi.fn>;
  };
}

function emit(inst: MockInst, event: string, value?: unknown): void {
  for (const cb of inst._handlers[event] ?? []) cb(value);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const INSERT_PLAN_RESPONSE = {
  ok: true as const,
  kind: 'plan' as const,
  plan: {
    version: '1.0' as const,
    operation: 'insert' as const,
    table: 'tareas',
    values: { titulo: 'tarea nueva' },
  },
  schema_hash: 'hash-abc',
  plan_intent_audit_id: 'audit-insert-001',
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
describe('B5.3 — E2E: confirmation modal golden paths', () => {
  it('[B5.3.1] plan write → modal visible → Confirmar → modal cierra', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(INSERT_PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'agrega una tarea nueva');
    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledOnce());

    // resetToIdle es no-op en mock → emitir idle manualmente
    emit(rec, 'state', 'idle');

    // Modal visible — header y botones
    await waitFor(() => {
      expect(screen.getByText(/CONFIRMAR INSERTAR/)).toBeTruthy();
      expect(screen.getByText('Confirmar')).toBeTruthy();
      expect(screen.getByText('Cancelar')).toBeTruthy();
    });

    // Tap Confirmar
    screen.getByText('Confirmar').click();

    // Modal cierra (planResponse = null → modal desmontado)
    await waitFor(() => {
      expect(screen.queryByText(/CONFIRMAR INSERTAR/)).toBeNull();
    });
  });

  it('[B5.3.2] plan write → modal visible → Cancelar → auditCancel llamado → modal cierra', async () => {
    vi.mocked(requestPlanIntent).mockResolvedValueOnce(INSERT_PLAN_RESPONSE);
    render(VoiceScreen);
    const rec = getRecognition();

    emit(rec, 'result', 'agrega una tarea nueva');
    await waitFor(() => expect(requestPlanIntent).toHaveBeenCalledOnce());

    emit(rec, 'state', 'idle');

    await waitFor(() => {
      expect(screen.getByText(/CONFIRMAR INSERTAR/)).toBeTruthy();
      expect(screen.getByText('Cancelar')).toBeTruthy();
    });

    // Tap Cancelar
    screen.getByText('Cancelar').click();

    // auditCancel llamado con plan correcto y token
    await waitFor(() => {
      expect(vi.mocked(auditCancel)).toHaveBeenCalledOnce();
      expect(vi.mocked(auditCancel)).toHaveBeenCalledWith(
        INSERT_PLAN_RESPONSE.plan,
        MOCK_SESSION.access_token,
        expect.objectContaining({ schemaHash: INSERT_PLAN_RESPONSE.schema_hash }),
      );
    });

    // Modal cierra
    expect(screen.queryByText(/CONFIRMAR INSERTAR/)).toBeNull();
  });
});
