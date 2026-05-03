/**
 * B6 — tests de integración execute-plan (ADR-014 excepción obligatoria).
 * Estos tests tocan Postgres real a través de la Edge Function execute-plan.
 *
 * Estado: BLOQUEADOS — proyecto Supabase no configurado.
 * Para desbloquear: proveer VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY en .env.local
 * y desplegar las Edge Functions (ver HANDOFF §9).
 */

import { describe, it } from 'vitest';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const INTEGRATION_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

describe('B6 — execute-plan integration (requiere Supabase real)', () => {
  it.skipIf(!INTEGRATION_ENABLED)(
    '[BLOQUEADA: proyecto Supabase no configurado] SELECT con plan válido retorna 200 + audit_id',
    async () => {
      // Este test requiere:
      // 1. VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY en .env.local
      // 2. Sesión activa del director (magic link completado)
      // 3. Edge Function execute-plan desplegada con env vars
      // 4. Al menos una tabla en ORION_ALLOWED_TABLES
      //
      // Cuando esté desbloqueado:
      // - Obtener JWT real con supabase.auth.getSession()
      // - Llamar executePlan() con un plan SELECT simple
      // - Verificar: result.ok === true, result.audit_id existe, fila en orion_audit
    },
  );

  it.skipIf(!INTEGRATION_ENABLED)(
    '[BLOQUEADA: proyecto Supabase no configurado] rejected_by_user retorna 200 sin SQL ejecutado',
    async () => {
      // Este test requiere las mismas precondiciones del test anterior.
      //
      // Cuando esté desbloqueado:
      // - Obtener JWT real
      // - Llamar auditCancel() con un plan de prueba
      // - Verificar en orion_audit: was_confirmed = false, error = 'rejected_by_user'
      // - Verificar que la tabla destino NO fue modificada
    },
  );
});
