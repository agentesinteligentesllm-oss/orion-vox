import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Ensure no src/ file imports from supabase/functions/ except via $shared alias.
// Direct relative imports like '../../../supabase/functions/...' bypass the alias
// and would bundle Edge-only code into the PWA.

describe('import border: src/ must not import supabase/functions/ directly', () => {
  const srcFiles = globSync('src/**/*.{ts,svelte}');

  for (const file of srcFiles) {
    it(`${file} — no direct supabase/functions import`, () => {
      const content = readFileSync(file, 'utf-8');
      const forbidden = /from\s+['"][^'"]*supabase\/functions\/(?!_shared)/;
      expect(content).not.toMatch(forbidden);
    });
  }

  it('sanity: $shared alias imports are allowed', () => {
    const barrel = readFileSync('src/lib/contracts/plan-schema.ts', 'utf-8');
    expect(barrel).toMatch(/\$shared\/plan-schema/);
  });
});
