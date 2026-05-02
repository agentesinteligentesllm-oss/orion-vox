import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

// ADR-013 mitigación 4: src/ only imports from _shared/plan-schema — never from other
// supabase/functions/ paths and never from $shared/* aliases other than plan-schema.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('PWA no importa de supabase/functions excepto $shared/plan-schema', () => {
  const tsFiles = walk('src').filter((f) => f.endsWith('.ts') || f.endsWith('.svelte'));
  const violations: string[] = [];

  for (const f of tsFiles) {
    const content = readFileSync(f, 'utf-8');

    // Direct path imports containing supabase/functions
    const directMatches = content.matchAll(/from\s+['"]([^'"]*supabase\/functions[^'"]*)['"]/g);
    for (const m of directMatches) {
      if (!m[1].endsWith('_shared/plan-schema') && !m[1].endsWith('_shared/plan-schema.ts')) {
        violations.push(`${f}: ${m[1]}`);
      }
    }

    // Alias $shared/* imports — only $shared/plan-schema is allowed
    const aliasMatches = content.matchAll(/from\s+['"](\$shared\/[^'"]*)['"]/g);
    for (const m of aliasMatches) {
      if (m[1] !== '$shared/plan-schema') {
        violations.push(`${f}: ${m[1]} (via alias)`);
      }
    }
  }

  expect(violations, `Border violations:\n${violations.join('\n')}`).toEqual([]);
});
