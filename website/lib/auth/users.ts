import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { db, tx, DATA_DIR } from "../db";
import { hashPassword, verifyPassword } from "./password";

export const FILES_DIR = path.join(DATA_DIR, "client-files");
export const TAX_YEAR = new Date().getFullYear();

export type Profile = { id: string; email: string; name: string; phone: string; company: string; country: string; createdAt: string };

export const findByEmail = (email: string) => db().prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email.trim().toLowerCase());

export async function createUser(i: { name: string; email: string; password: string; phone?: string }) {
  const id = randomUUID(), now = new Date().toISOString(), hash = await hashPassword(i.password);
  tx(() => {
    db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)").run(id, i.email, i.name, hash, now);
    db().prepare("INSERT INTO profiles (user_id, phone, updated_at) VALUES (?,?,?)").run(id, i.phone ?? "", now);
    const items: [string, string][] = [
      ["upload-docs", "Upload your tax documents (W-2 / salary certificate, etc.)"],
      ["sign-engagement", "Review & sign the engagement letter"],
      ["review-draft", "Review your draft return once the team shares it"],
    ];
    items.forEach(([key, label], n) => db().prepare("INSERT INTO checklist_items (id, user_id, key, label, status, tax_year, sort, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(randomUUID(), id, key, label, "Pending", TAX_YEAR, n, now));
  });
  return id;
}

export const markLogin = (id: string) => void db().prepare("UPDATE users SET last_login_at=? WHERE id=?").run(new Date().toISOString(), id);

export function getProfile(id: string): Profile | null {
  const r = db().prepare("SELECT u.id, u.email, u.name, u.created_at, p.phone, p.company, p.country FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?").get(id);
  return r ? { id: r.id, email: r.email, name: r.name, phone: r.phone ?? "", company: r.company ?? "", country: r.country ?? "", createdAt: r.created_at } : null;
}

export function updateProfile(id: string, p: { name: string; phone: string; company: string; country: string }) {
  tx(() => {
    db().prepare("UPDATE users SET name=? WHERE id=?").run(p.name, id);
    db().prepare("UPDATE profiles SET phone=?, company=?, country=?, updated_at=? WHERE user_id=?").run(p.phone, p.company, p.country, new Date().toISOString(), id);
  });
}

export async function changePassword(id: string, current: string, next: string) {
  const u = db().prepare("SELECT password_hash FROM users WHERE id=?").get(id);
  if (!u || !(await verifyPassword(current, u.password_hash)).ok) return false;
  db().prepare("UPDATE users SET password_hash=? WHERE id=?").run(await hashPassword(next), id);
  return true;
}

export async function deleteAccount(id: string, password: string) {
  const u = db().prepare("SELECT password_hash FROM users WHERE id=?").get(id);
  if (!u || !(await verifyPassword(password, u.password_hash)).ok) return false;
  db().prepare("DELETE FROM users WHERE id=?").run(id); // cascades to profile, sessions, documents, checklist, signatures
  fs.rmSync(path.join(FILES_DIR, id), { recursive: true, force: true });
  return true;
}

/** Read-only client list for the desktop admin app. Never includes password hashes. */
export const listClients = () =>
  db().prepare(`SELECT u.id, u.name, u.email, u.created_at AS createdAt, u.last_login_at AS lastLoginAt, p.phone, p.company,
      (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id) AS documents
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created_at DESC`).all();
