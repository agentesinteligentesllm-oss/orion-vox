import type { PlanIntentClientErrorCode } from './plan-intent-client.ts';

/**
 * Mensajes user-facing en español para cada código de error del cliente plan-intent.
 * Los 7 mensajes de servidor siguen el texto exacto del spec §6.3
 * (spec-plan-intent-edge.md). Los códigos client-only derivan de la misma voz.
 */
export const PLAN_INTENT_ERROR_MESSAGES: Record<PlanIntentClientErrorCode, string> = {
  // — errores de servidor (spec §6.3) —
  unauthorized: 'Sesión no válida. Volvé a iniciar sesión.',
  invalid_token: 'Sesión expirada. Volvé a iniciar sesión.',
  forbidden_user: 'Tu cuenta no está autorizada en esta instancia.',
  invalid_request: 'El comando no fue válido. Reformulá.',
  invalid_plan_from_llm: 'El asistente devolvió una respuesta que no entendí. Probá reformular.',
  gemini_unavailable: 'El asistente no responde. Probá en unos minutos.',
  gemini_timeout: 'El asistente tardó demasiado. Probá de nuevo.',
  gemini_quota_exceeded: 'Te quedaste sin cuota de Gemini. Probá más tarde.',
  schema_summary_failed: 'No pude leer el esquema de tu base. Revisá la conexión.',
  audit_insert_failed: 'No pude registrar la auditoría. Operación abortada.',
  internal: 'Error interno del servidor. Intentá de nuevo.',
  // — errores client-only —
  missing_token: 'Sesión no válida. Volvé a iniciar sesión.',
  network_error: 'Sin conexión. Revisá tu red e intentá de nuevo.',
  invalid_response: 'El asistente devolvió una respuesta inesperada. Intentá de nuevo.',
};

export function planIntentErrorToMessage(err: { code: PlanIntentClientErrorCode }): string {
  return PLAN_INTENT_ERROR_MESSAGES[err.code] ?? 'Error inesperado. Intentá de nuevo.';
}
