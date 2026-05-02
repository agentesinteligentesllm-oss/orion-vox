export type Idioma = 'es-MX' | 'es-AR' | 'es-ES';

export interface SchemaCacheEntry {
  markdown: string;
  schema_hash: string;
  generated_at: string;
  ttl_seconds: number;
}

export interface AuditMirrorEntry {
  id: string;
  ts: string;
  user_prompt: string;
  plan_json: unknown;
  error: string | null;
}

export interface LocalStorageAPI {
  getSchemaCache(): Promise<SchemaCacheEntry | null>;
  putSchemaCache(entry: SchemaCacheEntry): Promise<void>;
  clearSchemaCache(): Promise<void>;

  appendAuditMirror(entry: AuditMirrorEntry): Promise<void>;
  listAuditMirror(opts?: { limit?: number; since?: string }): Promise<AuditMirrorEntry[]>;
  clearAuditMirror(): Promise<void>;

  getSetting<T>(key: string): Promise<T | null>;
  putSetting<T>(key: string, value: T): Promise<void>;
  deleteSetting(key: string): Promise<void>;

  wipeAll(): Promise<void>;
}
