import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Catalog } from './model.ts';

export function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const decoded = Buffer.from(expected, 'hex');
  return actual.length === decoded.length && timingSafeEqual(actual, decoded);
}
export type SeedUser = { email: string; name: string; password: string; role: 'member' | 'reviewer' };
export type UserRow = { id: string; email: string; name: string; role: 'member' | 'reviewer'; password_hash: string };
export type SubmissionRow = { id: string; owner_id: string; title: string; year: number; body: string; author: string; consent: number; status: string; created_at: string; updated_at: string; review_note: string };

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;');
    this.db.exec([
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN (\'member\',\'reviewer\')), password_hash TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS catalog_items (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id))',
      'CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, year INTEGER NOT NULL, body TEXT NOT NULL, author TEXT NOT NULL, consent INTEGER NOT NULL CHECK(consent=1), status TEXT NOT NULL CHECK(status IN (\'pending\',\'approved\',\'rejected\',\'withdrawn\')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, review_note TEXT NOT NULL DEFAULT \'\')',
      'CREATE TABLE IF NOT EXISTS review_logs (id TEXT PRIMARY KEY, submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL, note TEXT NOT NULL DEFAULT \'\', created_at TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS submissions_owner ON submissions(owner_id,created_at)',
      'CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status,created_at)',
      'PRAGMA user_version=1',
    ].join(';'));
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  seed(catalog: Catalog, users: SeedUser[]) {
    this.transaction(() => {
      // Seed only an entirely empty catalog. Restarting never republishes withdrawn/hidden records.
      if (!(this.db.prepare('SELECT COUNT(*) AS n FROM catalog_items').get()!.n as number)) {
        for (const kind of ['events', 'people', 'relations', 'sources'] as const)
          for (const item of catalog[kind]) this.db.prepare('INSERT INTO catalog_items VALUES (?,?,?,1)').run(kind, item.id, JSON.stringify(item));
      }
      for (const user of users) if (!this.db.prepare('SELECT id FROM users WHERE email=?').get(user.email))
        this.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(randomUUID(), user.email.toLowerCase(), user.name, user.role, hashPassword(user.password));
    });
  }
  catalog(): Catalog {
    const result: Catalog = { events: [], people: [], relations: [], sources: [] };
    for (const row of this.db.prepare('SELECT kind,payload FROM catalog_items WHERE published=1 ORDER BY rowid').all()) {
      const kind = row.kind as keyof Catalog;
      if (kind in result) (result[kind] as unknown[]).push(JSON.parse(row.payload as string));
    }
    result.sources = result.sources.filter(s => ['演示资料','已授权','可依法引用'].includes(s.authorization));
    const sourceIds = new Set(result.sources.map(s => s.id));
    const allowed = (item: { sourceIds: string[] }) => item.sourceIds.length > 0 && item.sourceIds.every(id => sourceIds.has(id));
    result.people = result.people.filter(allowed);
    const peopleIds = new Set(result.people.map(p => p.id));
    result.events = result.events.filter(allowed).map(e => ({ ...e, personIds: e.personIds.filter(id => peopleIds.has(id)) }));
    result.relations = result.relations.filter(r => allowed(r) && peopleIds.has(r.from) && peopleIds.has(r.to));
    return result;
  }
  session(token?: string) {
    if (!token) return undefined;
    return this.db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token), Date.now()) as UserRow | undefined;
  }
  close() { this.db.close(); }
}
export function publicUser(user: UserRow) { return { id: user.id, email: user.email, name: user.name, role: user.role }; }
export function serializeSubmission(row: SubmissionRow, isPublic = false) {
  return { id: row.id, title: row.title, year: row.year, body: row.body, author: row.author,
    consent: row.consent === 1, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    reviewNote: isPublic ? '' : row.review_note };
}
