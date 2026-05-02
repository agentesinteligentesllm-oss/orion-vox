import { isSchemaStale } from '../_shared/schema-stale.ts';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected)
    throw new Error(
      `${label}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`,
    );
}

Deno.test('[schema-stale] Case A: returns false when client hash matches current hash', () => {
  assertEqual(isSchemaStale('abc123def456', 'abc123def456'), false, 'matching hashes → not stale');
});

Deno.test('[schema-stale] Case B: returns true when client hash differs from current hash', () => {
  assertEqual(isSchemaStale('abc123def456', 'xyz789uvw012'), true, 'different hashes → stale');
});

Deno.test('[schema-stale] returns false when currentHash is null (graceful fallback)', () => {
  assertEqual(
    isSchemaStale('abc123def456', null),
    false,
    'null currentHash → not stale (fallback)',
  );
});

Deno.test('[schema-stale] returns true for empty client hash vs non-empty current hash', () => {
  assertEqual(isSchemaStale('', 'somehash'), true, 'empty client hash → stale');
});
