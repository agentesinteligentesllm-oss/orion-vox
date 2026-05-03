import { describe, expect, it, vi } from 'vitest';
import {
  buildClarifiedPrompt,
  PLAN_INTENT_CLIENT_VERSION,
  PLAN_INTENT_REFRESH_SCHEMA_SETTING,
  PlanIntentClientError,
  requestPlanIntent,
} from '../../src/lib/api/plan-intent-client.ts';
import type {
  AuditMirrorEntry,
  LocalStorageAPI,
  SchemaCacheEntry,
} from '../../src/lib/storage/types.ts';

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeStorage(schemaCache: SchemaCacheEntry | null = null): LocalStorageAPI {
  const settings = new Map<string, unknown>();
  let cache = schemaCache;
  const audit: AuditMirrorEntry[] = [];

  return {
    async getSchemaCache() {
      return cache;
    },
    async putSchemaCache(entry) {
      cache = entry;
    },
    async clearSchemaCache() {
      cache = null;
    },
    async appendAuditMirror(entry) {
      audit.push(entry);
    },
    async listAuditMirror() {
      return audit;
    },
    async clearAuditMirror() {
      audit.length = 0;
    },
    async getSetting<T>(key: string) {
      return settings.has(key) ? (settings.get(key) as T) : null;
    },
    async putSetting<T>(key: string, value: T) {
      settings.set(key, value);
    },
    async deleteSetting(key: string) {
      settings.delete(key);
    },
    async wipeAll() {
      cache = null;
      settings.clear();
      audit.length = 0;
    },
  };
}

const PLAN_BODY = {
  ok: true,
  kind: 'plan',
  plan: {
    version: '1.0',
    operation: 'select',
    table: 'tareas',
    limit: 100,
  },
  schema_hash: 'hash-current',
  plan_intent_audit_id: 'audit-1',
  duration_ms: 42,
};

describe('requestPlanIntent', () => {
  it('sends prompt, client version, and JWT bearer header to plan-intent', async () => {
    const fetcher = vi.fn(async () => makeJsonResponse(PLAN_BODY));

    await requestPlanIntent({
      accessToken: 'jwt-123',
      userPrompt: ' mostrame las tareas ',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher,
      storage: makeStorage(),
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://example.supabase.co/functions/v1/plan-intent');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer jwt-123',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      user_prompt: 'mostrame las tareas',
      client_version: PLAN_INTENT_CLIENT_VERSION,
    });
  });

  it('does not send conversation_id in M1', async () => {
    const fetcher = vi.fn(async () => makeJsonResponse(PLAN_BODY));

    await requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'mostrame algo',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher,
      storage: makeStorage(),
    });

    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body.conversation_id).toBeUndefined();
  });

  it('maps clarification responses without requiring a schema hash', async () => {
    const fetcher = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        kind: 'clarification',
        clarification: { question: '¿A que tarea te referis?', reason: 'ambiguous_task' },
        plan_intent_audit_id: 'audit-2',
        duration_ms: 21,
      }),
    );

    const result = await requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'borra eso',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher,
      storage: makeStorage(),
    });

    expect(result).toEqual({
      ok: true,
      kind: 'clarification',
      clarification: { question: '¿A que tarea te referis?', reason: 'ambiguous_task' },
      plan_intent_audit_id: 'audit-2',
      duration_ms: 21,
    });
  });

  it('maps gemini_unavailable and gemini_timeout as separate server errors', async () => {
    const unavailable = requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'mostrar tareas',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher: vi.fn(async () =>
        makeJsonResponse(
          { ok: false, error: 'gemini_unavailable', message: 'El asistente no responde.' },
          502,
        ),
      ),
      storage: makeStorage(),
    });

    await expect(unavailable).rejects.toMatchObject({
      code: 'gemini_unavailable',
      status: 502,
    });

    const timeout = requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'mostrar tareas',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher: vi.fn(async () =>
        makeJsonResponse(
          { ok: false, error: 'gemini_timeout', message: 'El asistente tardo demasiado.' },
          504,
        ),
      ),
      storage: makeStorage(),
    });

    await expect(timeout).rejects.toMatchObject({
      code: 'gemini_timeout',
      status: 504,
    });
  });

  it('notifies unauthorized handler for 401 responses', async () => {
    const onUnauthorized = vi.fn();

    await expect(
      requestPlanIntent({
        accessToken: 'jwt-expired',
        userPrompt: 'mostrar tareas',
        endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
        fetcher: vi.fn(async () =>
          makeJsonResponse(
            { ok: false, error: 'invalid_token', message: 'Tu sesion expiro.' },
            401,
          ),
        ),
        storage: makeStorage(),
        onUnauthorized,
      }),
    ).rejects.toMatchObject({ code: 'invalid_token', status: 401 });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized.mock.calls[0][0]).toBeInstanceOf(PlanIntentClientError);
  });

  it('invalidates local schema cache on schema_hash change and refreshes the next call', async () => {
    const storage = makeStorage({
      markdown: '# old',
      schema_hash: 'hash-old',
      generated_at: '2026-05-02T00:00:00.000Z',
      ttl_seconds: 300,
    });
    const fetcher = vi.fn(async () => makeJsonResponse(PLAN_BODY));

    await requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'mostrar tareas',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher,
      storage,
    });

    expect(await storage.getSchemaCache()).toBeNull();
    expect(await storage.getSetting<boolean>(PLAN_INTENT_REFRESH_SCHEMA_SETTING)).toBe(true);

    await requestPlanIntent({
      accessToken: 'jwt',
      userPrompt: 'mostrar tareas',
      endpoint: 'https://example.supabase.co/functions/v1/plan-intent',
      fetcher,
      storage,
    });

    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ 'X-Refresh-Schema': '1' });
    expect(await storage.getSetting<boolean>(PLAN_INTENT_REFRESH_SCHEMA_SETTING)).toBeNull();
  });
});

describe('buildClarifiedPrompt', () => {
  it('uses the director-approved exact concatenation format', () => {
    expect(buildClarifiedPrompt('borra eso', 'las tareas archivadas')).toBe(
      'borra eso\n\nAclaración del usuario: las tareas archivadas',
    );
  });
});
