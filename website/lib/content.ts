import { list, type Row } from "./store";

export type PostRow = Row & { slug: string; title: string; category: string; excerpt: string; author: string; date: string; content: string[]; published: boolean };
export type VideoRow = Row & { kind: "youtube" | "file"; youtubeId?: string; file?: string; title: string; category: string; description: string; published: boolean };

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const slugify = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
export const parseYoutubeId = (input: string) => {
  const v = input.trim();
  return (v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/) || v.match(/^([A-Za-z0-9_-]{11})$/))?.[1] ?? null;
};
const paragraphs = (v: unknown) =>
  (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/\n\s*\n/) : []).map((x) => x.trim()).filter(Boolean).slice(0, 80).map((x) => x.slice(0, 6000));

export async function getPublishedPosts() {
  return ((await list("posts")) as PostRow[]).filter((p) => p.published !== false).sort((a, b) => b.date.localeCompare(a.date));
}
export async function getPost(slug: string) { return (await getPublishedPosts()).find((p) => p.slug === slug) ?? null; }
export async function getPublishedVideos() {
  return ((await list("videos")) as VideoRow[]).filter((v) => v.published !== false).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

type Built = { error: string; data?: undefined } | { error?: undefined; data: Record<string, unknown> };

/** Validates admin input. partial=true (PATCH) only touches fields that were sent. */
export async function buildPost(b: Record<string, unknown>, partial: boolean, id?: string): Promise<Built> {
  const d: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("title")) { const t = s(b.title, 200); if (!t) return { error: "Title is required" }; d.title = t; }
  for (const [k, max] of [["category", 60], ["excerpt", 400], ["author", 80]] as const) if (has(k)) d[k] = s(b[k], max) || (k === "author" ? "TaxTrax Team" : k === "category" ? "General" : "");
  if (has("content")) { const c = paragraphs(b.content); if (!c.length) return { error: "Write at least one paragraph of content" }; d.content = c; }
  if (has("date")) d.date = /^\d{4}-\d{2}-\d{2}$/.test(s(b.date, 10)) ? s(b.date, 10) : new Date().toISOString().slice(0, 10);
  if (has("published")) d.published = b.published !== false;
  if (!partial || "slug" in b || "title" in b) {
    if (!partial || "slug" in b) {
      const base = slugify(s(b.slug, 80) || String(d.title ?? ""));
      const taken = new Set(((await list("posts")) as PostRow[]).filter((p) => p.id !== id).map((p) => p.slug));
      let slug = base, n = 2;
      while (taken.has(slug)) slug = `${base}-${n++}`;
      d.slug = slug;
    }
  }
  return { data: d };
}

export function buildVideo(b: Record<string, unknown>, partial: boolean): Built {
  const d: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("title")) { const t = s(b.title, 160); if (!t) return { error: "Title is required" }; d.title = t; }
  if (has("category")) d.category = s(b.category, 60) || "General";
  if (has("description")) d.description = s(b.description, 600);
  if (has("published")) d.published = b.published !== false;
  if (!partial) {
    if (b.kind === "file") {
      const f = s(b.file, 80);
      if (!/^[a-f0-9-]{36}\.(mp4|webm|mov)$/.test(f)) return { error: "Invalid uploaded file" };
      d.kind = "file"; d.file = f;
    } else {
      const yt = parseYoutubeId(s(b.youtube ?? b.youtubeId, 200));
      if (!yt) return { error: "Enter a valid YouTube link" };
      d.kind = "youtube"; d.youtubeId = yt;
    }
  }
  return { data: d };
}
