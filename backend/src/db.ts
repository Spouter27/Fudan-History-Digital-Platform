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

export class StoreError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

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
  async countUsers(): Promise<number> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return (this.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n as number);
    }
    const result = await pgPool.query('SELECT COUNT(*) AS n FROM users');
    return Number(result.rows[0].n);
  }

  async seed(catalog: Catalog, users: SeedUser[]): Promise<void> {
    if (process.env.DB_DRIVER !== 'sqlite') {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const countResult = await client.query('SELECT COUNT(*) AS n FROM catalog_items');
        if (Number(countResult.rows[0].n) === 0) {
          for (const kind of ['events', 'people', 'relations', 'sources'] as const)
            for (const item of catalog[kind])
              await client.query('INSERT INTO catalog_items (kind, id, payload, published) VALUES ($1,$2,$3,1)', [kind, item.id, JSON.stringify(item)]);
        }
        for (const user of users) {
          const exist = await client.query('SELECT id FROM users WHERE email=$1', [user.email.toLowerCase()]);
          if (!exist.rows.length)
            await client.query('INSERT INTO users (id, email, name, role, password_hash) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), user.email.toLowerCase(), user.name, user.role, hashPassword(user.password)]);
        }
        await client.query('COMMIT');
        return;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    this.transaction(() => {
      if (!(this.db.prepare('SELECT COUNT(*) AS n FROM catalog_items').get()!.n as number)) {
        for (const kind of ['events', 'people', 'relations', 'sources'] as const)
          for (const item of catalog[kind]) this.db.prepare('INSERT INTO catalog_items VALUES (?,?,?,1)').run(kind, item.id, JSON.stringify(item));
      }
      for (const user of users) if (!this.db.prepare('SELECT id FROM users WHERE email=?').get(user.email))
        this.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(randomUUID(), user.email.toLowerCase(), user.name, user.role, hashPassword(user.password));
    });
  }
  async catalogFromPg(): Promise<Catalog> {
    const result: Catalog = { events: [], people: [], relations: [], sources: [] };
    const rows = await pgPool.query('SELECT kind,payload FROM catalog_items WHERE published=1 ORDER BY kind, id');
    for (const row of rows.rows) {
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

  async catalog(): Promise<Catalog> {
    if (process.env.DB_DRIVER === 'sqlite') return this.catalogFromSqlite();
    return this.catalogFromPg();
  }

  catalogFromSqlite(): Catalog {
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
  async listPublicSubmissions(): Promise<SubmissionRow[]> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT * FROM submissions WHERE status=? ORDER BY created_at DESC,id DESC').all('approved') as SubmissionRow[];
    }
    const result = await pgPool.query('SELECT * FROM submissions WHERE status=$1 ORDER BY created_at DESC,id DESC', ['approved']);
    return result.rows as SubmissionRow[];
  }

  async listSubmissionsByOwner(ownerId: string): Promise<SubmissionRow[]> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT * FROM submissions WHERE owner_id=? ORDER BY created_at DESC,id DESC').all(ownerId) as SubmissionRow[];
    }
    const result = await pgPool.query('SELECT * FROM submissions WHERE owner_id=$1 ORDER BY created_at DESC,id DESC', [ownerId]);
    return result.rows as SubmissionRow[];
  }

  async listAllSubmissions(): Promise<SubmissionRow[]> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT * FROM submissions ORDER BY created_at DESC,id DESC').all() as SubmissionRow[];
    }
    const result = await pgPool.query('SELECT * FROM submissions ORDER BY created_at DESC,id DESC');
    return result.rows as SubmissionRow[];
  }

  async createSubmission(id: string, ownerId: string, title: string, year: number, body: string, author: string, now: string): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      this.db.prepare('INSERT INTO submissions VALUES (?,?,?,?,?,?,1,?,?,?,?)').run(id, ownerId, title, year, body, author, 'pending', now, now, '');
      return;
    }
    await pgPool.query('INSERT INTO submissions (id, owner_id, title, year, body, author, consent, status, created_at, updated_at, review_note) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10)', [id, ownerId, title, year, body, author, 'pending', now, now, '']);
  }

  async findSubmissionById(id: string): Promise<SubmissionRow | undefined> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT * FROM submissions WHERE id=?').get(id) as SubmissionRow | undefined;
    }
    const result = await pgPool.query('SELECT * FROM submissions WHERE id=$1', [id]);
    return result.rows[0] as SubmissionRow | undefined;
  }

  async reviewSubmission(id: string, action: 'approve' | 'reject' | 'withdraw', note: string, userId: string): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      try {
        this.db.exec('BEGIN IMMEDIATE');
        const item = this.db.prepare('SELECT * FROM submissions WHERE id=?').get(id) as SubmissionRow | undefined;
        if (!item || (action === 'withdraw' && item.owner_id !== userId)) throw new StoreError(404, '记录不存在。');
        if (action === 'withdraw' ? item.status === 'withdrawn' : item.status !== 'pending') throw new StoreError(409, '记录状态已改变，请刷新。');
        const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'withdrawn';
        const now = new Date().toISOString();
        const changed = this.db.prepare('UPDATE submissions SET status=?,review_note=?,updated_at=? WHERE id=? AND status=?').run(status, action === 'withdraw' ? item.review_note : note, now, item.id, item.status);
        if (!changed.changes) throw new StoreError(409, '记录状态已改变，请刷新。');
        this.db.prepare('INSERT INTO review_logs VALUES (?,?,?,?,?,?)').run(randomUUID(), item.id, userId, action, action === 'withdraw' ? '' : note, now);
        this.db.exec('COMMIT');
        return;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const itemResult = await client.query('SELECT * FROM submissions WHERE id=$1', [id]);
      const item = itemResult.rows[0] as SubmissionRow | undefined;
      if (!item || (action === 'withdraw' && item.owner_id !== userId)) throw new StoreError(404, '记录不存在。');
      if (action === 'withdraw' ? item.status === 'withdrawn' : item.status !== 'pending') throw new StoreError(409, '记录状态已改变，请刷新。');
      const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'withdrawn';
      const now = new Date().toISOString();
      const changed = await client.query('UPDATE submissions SET status=$1,review_note=$2,updated_at=$3 WHERE id=$4 AND status=$5', [status, action === 'withdraw' ? item.review_note : note, now, item.id, item.status]);
      if (!changed.rowCount) throw new StoreError(409, '记录状态已改变，请刷新。');
      await client.query('INSERT INTO review_logs (id, submission_id, actor_id, action, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), item.id, userId, action, action === 'withdraw' ? '' : note, now]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteSubmission(id: string, userId: string): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      try {
        this.db.exec('BEGIN IMMEDIATE');
        const item = this.db.prepare('SELECT * FROM submissions WHERE id=? AND owner_id=?').get(id, userId) as SubmissionRow | undefined;
        if (!item) throw new StoreError(404, '记录不存在。');
        this.db.prepare('UPDATE review_logs SET submission_id=NULL,actor_id=NULL,note=? WHERE submission_id=?').run('', item.id);
        this.db.prepare('INSERT INTO review_logs VALUES (?,NULL,NULL,?,?,?)').run(randomUUID(), 'delete', '', new Date().toISOString());
        this.db.prepare('DELETE FROM submissions WHERE id=? AND owner_id=?').run(item.id, userId);
        this.db.exec('COMMIT');
        return;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    }
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const itemResult = await client.query('SELECT * FROM submissions WHERE id=$1 AND owner_id=$2', [id, userId]);
      const item = itemResult.rows[0] as SubmissionRow | undefined;
      if (!item) throw new StoreError(404, '记录不存在。');
      await client.query('UPDATE review_logs SET submission_id=NULL,actor_id=NULL,note=$1 WHERE submission_id=$2', ['', item.id]);
      await client.query('INSERT INTO review_logs (id, submission_id, actor_id, action, note, created_at) VALUES ($1,NULL,NULL,$2,$3,$4)', [randomUUID(), 'delete', '', new Date().toISOString()]);
      await client.query('DELETE FROM submissions WHERE id=$1 AND owner_id=$2', [item.id, userId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async findUserByEmail(email: string): Promise<UserRow | undefined> {
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT * FROM users WHERE email=?').get(email) as UserRow | undefined;
    }
    const result = await pgPool.query('SELECT * FROM users WHERE email=$1', [email]);
    return result.rows[0] as UserRow | undefined;
  }

  async session(token?: string): Promise<UserRow | undefined> {
    if (!token) return undefined;
    const tokenHash = hashToken(token);
    if (process.env.DB_DRIVER === 'sqlite') {
      return this.db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash, Date.now()) as UserRow | undefined;
    }
    const result = await pgPool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2', [tokenHash, Date.now()]);
    return result.rows[0] as UserRow | undefined;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: number): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(tokenHash, userId, expiresAt);
      return;
    }
    await pgPool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [tokenHash, userId, expiresAt]);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
      return;
    }
    await pgPool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]);
  }

  async deleteExpiredSessions(now: number): Promise<void> {
    if (process.env.DB_DRIVER === 'sqlite') {
      this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      return;
    }
    await pgPool.query('DELETE FROM sessions WHERE expires_at<=$1', [now]);
  }
  close() { this.db.close(); }
}
export function publicUser(user: UserRow) { return { id: user.id, email: user.email, name: user.name, role: user.role }; }
export function serializeSubmission(row: SubmissionRow, isPublic = false) {
  return { id: row.id, title: row.title, year: row.year, body: row.body, author: row.author,
    consent: row.consent === 1, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    reviewNote: isPublic ? '' : row.review_note };
}

import pg from 'pg';

export const pgPool = new pg.Pool({
  database: 'fudan_history',
  user: 'postgres',
  password: process.env.PGPASSWORD,
  host: '127.0.0.1',
  port: 5432,
});
