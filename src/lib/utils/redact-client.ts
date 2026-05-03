const DEFAULT_REDACTED = new Set([
  'password',
  'password_hash',
  'token',
  'api_key',
  'secret',
  'refresh_token',
  'access_token',
  'private_key',
  'secret_key',
]);

function applyRedaction(value: unknown, cols: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => applyRedaction(item, cols));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        cols.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, applyRedaction(v, cols)],
      ),
    );
  }
  return value;
}

/**
 * Redacta campos sensibles de un resultado antes de mostrarlo en UI o almacenarlo.
 * Aplica la lista de columnas hardcodeada más cualquier columna extra (de settings del usuario).
 */
export function redactResult(result: unknown, extraColumns?: string[]): unknown {
  const cols = new Set(DEFAULT_REDACTED);
  for (const c of extraColumns ?? []) {
    const trimmed = c.toLowerCase().trim();
    if (trimmed) cols.add(trimmed);
  }
  return applyRedaction(result, cols);
}
