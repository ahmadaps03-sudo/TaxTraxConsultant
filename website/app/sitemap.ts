import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { tools } from "@/lib/data";
import { getPublishedPosts } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const posts = await getPublishedPosts();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" = "monthly", lastModified: Date = now) =>
    ({ url: `${SITE_URL}${path}`, lastModified, changeFrequency, priority });
  return [
    page("", 1, "weekly"), page("/services", 0.9), page("/book-consultation", 0.9), page("/tools", 0.8),
    ...tools.map((t) => page(`/tools/${t.slug}`, 0.8)),
    page("/about", 0.6), page("/blog", 0.7, "weekly", posts[0] ? new Date(posts[0].date) : now),
    ...posts.map((p) => page(`/blog/${p.slug}`, 0.7, "monthly", new Date(p.date))),
    page("/resources", 0.5), page("/contact", 0.6),
  ];
}
