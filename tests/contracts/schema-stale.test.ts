import { describe, expect, it } from 'vitest';
import { isSchemaStale } from '$shared/schema-stale';

describe('isSchemaStale', () => {
  it('Case A: returns false when client hash matches current hash', () => {
    expect(isSchemaStale('abc123def456', 'abc123def456')).toBe(false);
  });

  it('Case B: returns true when client hash differs from current hash', () => {
    expect(isSchemaStale('abc123def456', 'xyz789uvw012')).toBe(true);
  });

  it('returns false when currentHash is null (graceful fallback — schema-summary unavailable)', () => {
    expect(isSchemaStale('abc123def456', null)).toBe(false);
  });

  it('returns true for empty string client hash vs non-empty current hash', () => {
    expect(isSchemaStale('', 'somehash')).toBe(true);
  });
});
