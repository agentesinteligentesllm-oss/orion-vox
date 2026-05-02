import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/supabase.ts', () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

import { performLogout } from '../../src/lib/logout.ts';
import { router } from '../../src/lib/router.svelte.ts';
import { localStore } from '../../src/lib/storage/local-store.ts';
import { supabase } from '../../src/lib/supabase.ts';

beforeEach(async () => {
  await localStore.wipeAll();
  router.mode = 'voice';
  router.firstTime = false;
  vi.clearAllMocks();
});

describe('performLogout', () => {
  it('calls supabase.auth.signOut', async () => {
    await performLogout();
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });

  it('wipes localStore before navigating', async () => {
    await localStore.putSetting('idioma', 'es-MX');
    await performLogout();
    expect(await localStore.getSetting('idioma')).toBeNull();
  });

  it('navigates to config+firstTime', async () => {
    await performLogout();
    expect(router.mode).toBe('config');
    expect(router.firstTime).toBe(true);
  });

  it('wipes data even when settings had multiple keys', async () => {
    await localStore.putSetting('readOnly', true);
    await localStore.putSetting('dryRun', false);
    await localStore.putSchemaCache({
      markdown: '# Schema',
      schema_hash: 'abc',
      generated_at: '2026-01-01T00:00:00.000Z',
      ttl_seconds: 86400,
    });
    await performLogout();
    expect(await localStore.getSetting('readOnly')).toBeNull();
    expect(await localStore.getSchemaCache()).toBeNull();
  });
});
