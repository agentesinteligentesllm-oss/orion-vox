import { describe, expect, it } from 'vitest';
import type { PlanIntentClientErrorCode } from '../../src/lib/api/plan-intent-client.ts';
import {
  PLAN_INTENT_ERROR_MESSAGES,
  planIntentErrorToMessage,
} from '../../src/lib/api/plan-intent-messages.ts';

const ALL_CLIENT_CODES: PlanIntentClientErrorCode[] = [
  // server codes (spec §3.5)
  'unauthorized',
  'invalid_token',
  'forbidden_user',
  'invalid_request',
  'invalid_plan_from_llm',
  'gemini_unavailable',
  'gemini_timeout',
  'gemini_quota_exceeded',
  'schema_summary_failed',
  'audit_insert_failed',
  'internal',
  // client-only codes
  'missing_token',
  'network_error',
  'invalid_response',
];

describe('PLAN_INTENT_ERROR_MESSAGES', () => {
  it('cubre los 14 códigos de error del cliente', () => {
    expect(Object.keys(PLAN_INTENT_ERROR_MESSAGES)).toHaveLength(ALL_CLIENT_CODES.length);
    for (const code of ALL_CLIENT_CODES) {
      expect(PLAN_INTENT_ERROR_MESSAGES).toHaveProperty(code);
    }
  });

  it('todos los mensajes son strings no vacíos', () => {
    for (const msg of Object.values(PLAN_INTENT_ERROR_MESSAGES)) {
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe('planIntentErrorToMessage', () => {
  it('retorna el mensaje correcto para cada código', () => {
    for (const code of ALL_CLIENT_CODES) {
      expect(planIntentErrorToMessage({ code })).toBe(PLAN_INTENT_ERROR_MESSAGES[code]);
    }
  });

  it('retorna fallback para código desconocido', () => {
    const msg = planIntentErrorToMessage({ code: '__unknown__' as PlanIntentClientErrorCode });
    expect(msg).toBe('Error inesperado. Intentá de nuevo.');
  });

  // mensajes de spec §6.3 — verificación literal
  it('gemini_unavailable usa texto exacto del spec §6.3', () => {
    expect(planIntentErrorToMessage({ code: 'gemini_unavailable' })).toBe(
      'El asistente no responde. Probá en unos minutos.',
    );
  });

  it('gemini_timeout usa texto exacto del spec §6.3', () => {
    expect(planIntentErrorToMessage({ code: 'gemini_timeout' })).toBe(
      'El asistente tardó demasiado. Probá de nuevo.',
    );
  });

  it('audit_insert_failed usa texto exacto del spec §6.3', () => {
    expect(planIntentErrorToMessage({ code: 'audit_insert_failed' })).toBe(
      'No pude registrar la auditoría. Operación abortada.',
    );
  });

  it('network_error menciona conexión', () => {
    expect(planIntentErrorToMessage({ code: 'network_error' })).toContain('conexión');
  });

  it('missing_token y unauthorized comparten semántica de sesión no válida', () => {
    const missing = planIntentErrorToMessage({ code: 'missing_token' });
    const unauth = planIntentErrorToMessage({ code: 'unauthorized' });
    expect(missing).toContain('Sesión');
    expect(unauth).toContain('Sesión');
  });
});
