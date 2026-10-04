import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { posts as seedPosts } from "./data";

/**
 * SQLite database (a real, file-backed SQL database; data survives restarts).
 * Uses `better-sqlite3` (production) and falls back to Node's built-in `node:sqlite` (Node 22+).
 * Both expose the same prepare().run/get/all API, which is all this file relies on.
 * Everything else in the app goes through this module, so moving to Postgres later is contained.
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = process.env.DATABASE_FILE || path.join(DATA_DIR, "taxtrax.db");

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Stmt = { run(...p: unknown[]): { changes: number | bigint }; get(...p: unknown[]): any; all(...p: unknown[]): any[] };
export type Db = { exec(sql: string): void; prepare(sql: string): Stmt };

function open(): Db {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const nodeRequire: NodeRequire = eval("require"); // avoids bundling the native module
  let db: Db;
  try {
    const Database = nodeRequire("better-sqlite3");
    db = new Database(DB_FILE);
  } catch (e) {
    try {
      const { DatabaseSync } = nodeRequire("node:sqlite");
      db = new DatabaseSync(DB_FILE);
    } catch {
      throw new Error("No SQLite driver found. Run `npm install` (installs better-sqlite3) or use Node 22+. Original error: " + (e as Error).message);
    }
  }
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
     password_hash TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT);
   CREATE TABLE profiles (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', updated_at TEXT);
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_used_at TEXT NOT NULL,
     ip TEXT, user_agent TEXT);
   CREATE INDEX idx_sessions_user ON sessions(user_id);
   CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
   CREATE TABLE documents (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     file_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
     tag TEXT NOT NULL, tax_year INTEGER NOT NULL, uploaded_at TEXT NOT NULL);
   CREATE INDEX idx_documents_user ON documents(user_id);
   CREATE TABLE checklist_items (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     key TEXT, label TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('Pending','Needs Action','Completed')),
     tax_year INTEGER NOT NULL, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
   CREATE INDEX idx_checklist_user ON checklist_items(user_id);
   CREATE TABLE signatures (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     doc_key TEXT NOT NULL, typed_name TEXT NOT NULL, signed_at TEXT NOT NULL, ip TEXT, user_agent TEXT,
     UNIQUE (user_id, doc_key));
   CREATE TABLE records (id TEXT PRIMARY KEY, collection TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
   CREATE INDEX idx_records_col ON records(collection, created_at);
   CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2: privacy-friendly website analytics (no IP addresses stored)
  `CREATE TABLE page_views (
     id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, day TEXT NOT NULL, path TEXT NOT NULL,
     country TEXT NOT NULL, visitor TEXT NOT NULL, referrer TEXT, device TEXT);
   CREATE INDEX idx_pv_day ON page_views(day);
   CREATE INDEX idx_pv_country ON page_views(country);`,
];

function migrate(db: Db) {
  const v = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
  }
}

/** One-time: seed the starter blog posts and import data from the old JSON-file store, if present. */
function bootstrap(db: Db) {
  if (db.prepare("SELECT value FROM meta WHERE key='bootstrapped'").get()) return;
  const ins = db.prepare("INSERT INTO records (id, collection, created_at, data) VALUES (?,?,?,?)");
  const legacy = path.join(DATA_DIR, "db.json");
  let imported = false;
  try {
    const old = JSON.parse(fs.readFileSync(legacy, "utf8"));
    for (const col of ["messages", "bookings", "leads", "posts", "videos"]) {
      for (const row of [...(old[col] ?? [])].reverse()) {
        const { id, createdAt, ...rest } = row;
        ins.run(id || randomUUID(), col, createdAt || new Date().toISOString(), JSON.stringify(rest));
        imported = true;
      }
    }
  } catch { /* no legacy file */ }
  if (!imported) for (const p of seedPosts) ins.run("seed-" + p.slug, "posts", p.date, JSON.stringify({ ...p, published: true }));
  db.prepare("INSERT INTO meta (key, value) VALUES ('bootstrapped', '1')").run();
}

const g = globalThis as unknown as { __taxtraxDb?: Db };
export function db(): Db {
  if (!g.__taxtraxDb) { const d = open(); migrate(d); bootstrap(d); g.__taxtraxDb = d; }
  return g.__taxtraxDb;
}

/** Runs fn inside a transaction (rolls back on throw). */
export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  try { const r = fn(); d.exec("COMMIT"); return r; } catch (e) { d.exec("ROLLBACK"); throw e; }
}
