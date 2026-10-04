import { getPublishedPosts } from "@/lib/content";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));

export async function GET() {
  const posts = await getPublishedPosts();
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${SITE_URL}/blog/${p.slug}</link><guid>${SITE_URL}/blog/${p.slug}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate><category>${esc(p.category)}</category><description>${esc(p.excerpt)}</description></item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>TaxTrax Consulting Insights</title><link>${SITE_URL}/blog</link><description>Tax insights for Pakistan, USA, UK and UAE</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
