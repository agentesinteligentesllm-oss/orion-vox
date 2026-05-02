import { type IDBPDatabase, openDB } from 'idb';
import type { AuditMirrorEntry, LocalStorageAPI, SchemaCacheEntry } from './types.ts';

const DB_NAME = 'orion_vox_v1';
const DB_VERSION = 1;

let cachedDb: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (cachedDb) return cachedDb;
  cachedDb = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('schema_cache')) db.createObjectStore('schema_cache');
      if (!db.objectStoreNames.contains('audit_mirror'))
        db.createObjectStore('audit_mirror', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    },
    blocking() {
      cachedDb?.close();
      cachedDb = null;
    },
  });
  return cachedDb;
}

function deleteIndexedDB(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export const localStore: LocalStorageAPI = {
  async getSchemaCache() {
    const db = await getDB();
    const val = await db.get('schema_cache', 'current');
    return (val as SchemaCacheEntry | undefined) ?? null;
  },

  async putSchemaCache(entry) {
    const db = await getDB();
    await db.put('schema_cache', entry, 'current');
  },

  async clearSchemaCache() {
    const db = await getDB();
    await db.clear('schema_cache');
  },

  async appendAuditMirror(entry) {
    const db = await getDB();
    await db.put('audit_mirror', entry);
    const all = (await db.getAll('audit_mirror')) as AuditMirrorEntry[];
    if (all.length > 200) {
      all.sort((a, b) => a.ts.localeCompare(b.ts));
      const toDelete = all.slice(0, all.length - 200);
      await Promise.all(toDelete.map((e) => db.delete('audit_mirror', e.id)));
    }
  },

  async listAuditMirror(opts) {
    const db = await getDB();
    let entries = (await db.getAll('audit_mirror')) as AuditMirrorEntry[];
    if (opts?.since !== undefined) {
      const since = opts.since;
      entries = entries.filter((e) => e.ts > since);
    }
    entries.sort((a, b) => a.ts.localeCompare(b.ts));
    if (opts?.limit !== undefined) entries = entries.slice(-opts.limit);
    return entries;
  },

  async clearAuditMirror() {
    const db = await getDB();
    await db.clear('audit_mirror');
  },

  async getSetting<T>(key: string) {
    const db = await getDB();
    const row = await db.get('settings', key);
    return row !== undefined ? (row as { value: T }).value : null;
  },

  async putSetting<T>(key: string, value: T) {
    const db = await getDB();
    await db.put('settings', { value }, key);
  },

  async deleteSetting(key) {
    const db = await getDB();
    await db.delete('settings', key);
  },

  async wipeAll() {
    cachedDb?.close();
    cachedDb = null;
    await deleteIndexedDB(DB_NAME);
  },
};
