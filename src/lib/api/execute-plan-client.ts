import type { Plan } from '../contracts/plan-schema.ts';

export const EXECUTE_PLAN_CLIENT_VERSION = '0.0.0';

function resolveEndpoint(supabaseUrl?: string): string {
  const base = supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  if (!base) {
    throw new Error('Falta configurar VITE_SUPABASE_URL para execute-plan.');
  }
  return `${base.replace(/\/$/, '')}/functions/v1/execute-plan`;
}

export interface AuditCancelOptions {
  supabaseUrl?: string;
  userPrompt?: string;
  schemaHash?: string;
}

export function auditCancel(plan: Plan, accessToken: string, opts?: AuditCancelOptions): void {
  let url: string;
  try {
    url = resolveEndpoint(opts?.supabaseUrl);
  } catch (err) {
    console.warn('audit cancel: no endpoint configured', err);
    return;
  }
  fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plan,
      user_prompt: opts?.userPrompt ?? '',
      client_version: EXECUTE_PLAN_CLIENT_VERSION,
      schema_hash: opts?.schemaHash ?? '',
      rejected_by_user: true,
    }),
  }).catch((err) => console.warn('audit cancel failed', err));
}
