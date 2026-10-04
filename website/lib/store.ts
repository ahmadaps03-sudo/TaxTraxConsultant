import path from "path";
import { randomUUID } from "crypto";
import { db, DATA_DIR } from "./db";

/**
 * Content collections (contact messages, bookings, calculator leads, blog posts, videos) live in the
 * `records` table of the SQLite database. The API below is unchanged from the previous JSON-file
 * store, so the website pages and the desktop admin app keep working as before.
 */
export type Collection = "messages" | "bookings" | "leads" | "posts" | "videos";
export type Row = Record<string, unknown> & { id: string };
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const toRow = (r: { id: string; created_at: string; data: string }): Row => ({ ...JSON.parse(r.data), id: r.id, createdAt: r.created_at });

export async function add(col: Collection, data: Record<string, unknown>) {
  const id = randomUUID(), createdAt = new Date().toISOString();
  db().prepare("INSERT INTO records (id, collection, created_at, data) VALUES (?,?,?,?)").run(id, col, createdAt, JSON.stringify(data));
  return { ...data, id, createdAt } as Row;
}
export async function list(col: Collection) {
  return db().prepare("SELECT id, created_at, data FROM records WHERE collection=? ORDER BY created_at DESC, rowid DESC").all(col).map(toRow);
}
export async function update(col: Collection, id: string, patch: Record<string, unknown>) {
  const r = db().prepare("SELECT id, created_at, data FROM records WHERE collection=? AND id=?").get(col, id);
  if (!r) return null;
  const { id: _i, createdAt: _c, ...cur } = toRow(r);
  const next = { ...cur, ...patch };
  db().prepare("UPDATE records SET data=? WHERE id=?").run(JSON.stringify(next), id);
  return { ...next, id, createdAt: r.created_at } as Row;
}
export async function remove(col: Collection, id: string) {
  const r = db().prepare("SELECT id, created_at, data FROM records WHERE collection=? AND id=?").get(col, id);
  if (!r) return null;
  db().prepare("DELETE FROM records WHERE id=?").run(id);
  return toRow(r);
}
export async function summary() {
  const [messages, bookings, leads, posts, videos] = await Promise.all((["messages", "bookings", "leads", "posts", "videos"] as Collection[]).map(list));
  return {
    unreadMessages: messages.filter((m) => !m.read).length,
    pendingBookings: bookings.filter((b) => b.status === "pending").length,
    leads: leads.length, totalMessages: messages.length, totalBookings: bookings.length,
    posts: posts.length, videos: videos.length,
    clients: Number(db().prepare("SELECT COUNT(*) AS n FROM users").get().n),
  };
}
