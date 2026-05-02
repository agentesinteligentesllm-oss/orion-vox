import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { localStore } from '../../src/lib/storage/local-store.ts';
import type { AuditMirrorEntry, SchemaCacheEntry } from '../../src/lib/storage/types.ts';

const CACHE_ENTRY: SchemaCacheEntry = {
  markdown: '# Schema\n## users\n- id: uuid',
  schema_hash: 'abc123def456',
  generated_at: '2026-01-01T00:00:00.000Z',
  ttl_seconds: 86400,
};

const AUDIT_ENTRY: AuditMirrorEntry = {
  id: '11111111-0000-0000-0000-000000000001',
  ts: '2026-01-01T00:00:01.000Z',
  user_prompt: 'mostrar usuarios',
  plan_json: { operation: 'select', table: 'users', limit: 10 },
  error: null,
};

beforeEach(async () => {
  await localStore.wipeAll();
});

describe('schema_cache', () => {
  it('returns null when empty', async () => {
    expect(await localStore.getSchemaCache()).toBeNull();
  });

  it('puts and gets', async () => {
    await localStore.putSchemaCache(CACHE_ENTRY);
    expect(await localStore.getSchemaCache()).toEqual(CACHE_ENTRY);
  });

  it('overwrites on second put', async () => {
    await localStore.putSchemaCache(CACHE_ENTRY);
    const newer: SchemaCacheEntry = {
      ...CACHE_ENTRY,
      schema_hash: 'xyz789',
      generated_at: '2026-02-01T00:00:00.000Z',
    };
    await localStore.putSchemaCache(newer);
    expect(await localStore.getSchemaCache()).toEqual(newer);
  });

  it('clears', async () => {
    await localStore.putSchemaCache(CACHE_ENTRY);
    await localStore.clearSchemaCache();
    expect(await localStore.getSchemaCache()).toBeNull();
  });
});

describe('settings', () => {
  it('returns null for unknown key', async () => {
    expect(await localStore.getSetting('idioma')).toBeNull();
  });

  it('puts and gets a string setting', async () => {
    await localStore.putSetting('idioma', 'es-MX');
    expect(await localStore.getSetting('idioma')).toBe('es-MX');
  });

  it('puts and gets a boolean setting', async () => {
    await localStore.putSetting('readOnly', true);
    expect(await localStore.getSetting('readOnly')).toBe(true);
  });

  it('overwrites existing setting', async () => {
    await localStore.putSetting('idioma', 'es-MX');
    await localStore.putSetting('idioma', 'es-AR');
    expect(await localStore.getSetting('idioma')).toBe('es-AR');
  });

  it('deletes a setting', async () => {
    await localStore.putSetting('idioma', 'es-ES');
    await localStore.deleteSetting('idioma');
    expect(await localStore.getSetting('idioma')).toBeNull();
  });

  it('delete is idempotent for unknown key', async () => {
    await expect(localStore.deleteSetting('nonexistent')).resolves.toBeUndefined();
  });
});

describe('audit_mirror', () => {
  it('returns empty array when empty', async () => {
    expect(await localStore.listAuditMirror()).toEqual([]);
  });

  it('appends and lists in ts order', async () => {
    const e2: AuditMirrorEntry = { ...AUDIT_ENTRY, id: 'id-2', ts: '2026-01-01T00:00:02.000Z' };
    await localStore.appendAuditMirror(AUDIT_ENTRY);
    await localStore.appendAuditMirror(e2);
    const list = await localStore.listAuditMirror();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(AUDIT_ENTRY.id);
    expect(list[1].id).toBe(e2.id);
  });

  it('filters by since', async () => {
    await localStore.appendAuditMirror(AUDIT_ENTRY);
    const later: AuditMirrorEntry = {
      ...AUDIT_ENTRY,
      id: 'id-late',
      ts: '2026-06-01T00:00:00.000Z',
    };
    await localStore.appendAuditMirror(later);
    const result = await localStore.listAuditMirror({ since: '2026-03-01T00:00:00.000Z' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id-late');
  });

  it('respects limit (returns latest N)', async () => {
    for (let i = 1; i <= 5; i++) {
      await localStore.appendAuditMirror({
        ...AUDIT_ENTRY,
        id: `id-${i}`,
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      });
    }
    const result = await localStore.listAuditMirror({ limit: 3 });
    expect(result).toHaveLength(3);
    expect(result[2].id).toBe('id-5');
  });

  it('truncates to 200 entries on append', async () => {
    for (let i = 0; i < 205; i++) {
      await localStore.appendAuditMirror({
        ...AUDIT_ENTRY,
        id: `id-${String(i).padStart(3, '0')}`,
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      });
    }
    expect((await localStore.listAuditMirror()).length).toBe(200);
  });

  it('clears', async () => {
    await localStore.appendAuditMirror(AUDIT_ENTRY);
    await localStore.clearAuditMirror();
    expect(await localStore.listAuditMirror()).toEqual([]);
  });
});

describe('wipeAll', () => {
  it('wipes all stores', async () => {
    await localStore.putSchemaCache(CACHE_ENTRY);
    await localStore.putSetting('idioma', 'es-MX');
    await localStore.appendAuditMirror(AUDIT_ENTRY);
    await localStore.wipeAll();
    expect(await localStore.getSchemaCache()).toBeNull();
    expect(await localStore.getSetting('idioma')).toBeNull();
    expect(await localStore.listAuditMirror()).toEqual([]);
  });
});
