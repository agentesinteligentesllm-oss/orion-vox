// Pure staleness check — extracted for cross-runtime contract testing.
// currentHash === null means schema-summary is unavailable → graceful pass-through.
export function isSchemaStale(clientHash: string, currentHash: string | null): boolean {
  return currentHash !== null && clientHash !== currentHash;
}
