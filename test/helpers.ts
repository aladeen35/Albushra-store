import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Env } from '../src/env';

/** Minimal D1 implementation on node:sqlite, enough for the queries this app runs. */
class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params);
  }
  private stmt() {
    return this.db.prepare(this.sql);
  }
  private args() {
    return this.params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) as never[];
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.stmt().get(...this.args()) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T>() {
    const rows = this.stmt().all(...this.args()) as T[];
    return { results: rows.map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() {
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = this.stmt().all(...this.args());
      return { results: rows, success: true, meta: { changes: rows.length, last_row_id: 0 } };
    }
    const r = this.stmt().run(...this.args());
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync() {
    return this.stmt().all(...this.args());
  }
}

export function createD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = join(import.meta.dirname, '..', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, file), 'utf8'));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(stmts: Statement[]) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => ({ results: s.runSync(), success: true, meta: {} }));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}

export function createR2(): R2Bucket & { objects: Map<string, { body: ArrayBuffer; contentType?: string }> } {
  const objects = new Map<string, { body: ArrayBuffer; contentType?: string }>();
  return {
    objects,
    async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body, contentType: opts?.httpMetadata?.contentType });
      return {};
    },
    async get(key: string) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: new Blob([o.body]).stream(), httpMetadata: { contentType: o.contentType }, httpEtag: '"x"' };
    },
  } as never;
}

export const ADMIN_TOKEN = 'test-admin-token';

export function createEnv(overrides: Partial<Env> = {}): Env & { MEDIA: ReturnType<typeof createR2> } {
  return {
    DB: createD1(),
    MEDIA: createR2(),
    STORE_NAME: 'البشرى',
    PUBLIC_URL: 'https://shop.test',
    ADMIN_TOKEN,
    ...overrides,
  } as never;
}

/** ExecutionContext that collects waitUntil promises so tests can await background work. */
export function createCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    flush: () => Promise.all(pending.splice(0)),
  };
}

export const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}`, 'content-type': 'application/json' };
export const json = { 'content-type': 'application/json' };
