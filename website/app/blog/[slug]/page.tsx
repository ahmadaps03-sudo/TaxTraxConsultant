import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost, getPublishedPosts } from "@/lib/content";
import { pageMeta, breadcrumbLd, SITE_URL, LOGO_URL } from "@/lib/seo";
import { waLink } from "@/lib/contact";
import JsonLd from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return { title: "Article not found", robots: { index: false } };
  return {
    ...pageMeta({ title: post.title, description: post.excerpt || post.content[0].slice(0, 155), path: `/blog/${post.slug}`, type: "article", keywords: [post.category] }),
    authors: [{ name: post.author }],
    openGraph: { type: "article", title: post.title, description: post.excerpt, url: `/blog/${post.slug}`, publishedTime: post.date, authors: [post.author], section: post.category },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();
  const related = (await getPublishedPosts()).filter((p) => p.slug !== post.slug).slice(0, 2);
  const words = post.content.join(" ").split(/\s+/).length;

  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <JsonLd data={[
        breadcrumbLd([{ name: "Home", path: "/" }, { name: "Insights", path: "/blog" }, { name: post.title, path: `/blog/${post.slug}` }]),
        {
          "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.excerpt,
          datePublished: post.date, dateModified: post.date, articleSection: post.category, wordCount: words,
          author: { "@type": "Person", name: post.author },
          publisher: { "@type": "Organization", name: "TaxTrax Consulting", logo: { "@type": "ImageObject", url: LOGO_URL } },
          mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`, image: `${SITE_URL}/opengraph-image`,
        },
      ]} />
      <Link href="/blog" className="text-sm text-smoke hover:text-signal">← All insights</Link>
      <span className="mt-8 inline-block rounded-full bg-signal/10 px-3 py-1 text-xs font-medium text-signal">{post.category}</span>
      <h1 className="mt-4 font-serif text-3xl leading-tight text-paper sm:text-4xl">{post.title}</h1>
      <p className="mt-4 text-sm text-smoke">
        By {post.author} · <time dateTime={post.date}>{new Date(post.date).toLocaleDateString("en-US", { dateStyle: "long" })}</time> · {Math.max(1, Math.round(words / 200))} min read
      </p>
      {post.excerpt && <p className="mt-8 border-l-4 border-signal pl-5 font-serif text-lg text-paper/90">{post.excerpt}</p>}
      <div className="mt-8 space-y-5 text-base leading-relaxed text-paper/85">
        {post.content.map((para, i) => <p key={i}>{para}</p>)}
      </div>

      <div className="mt-12 rounded-3xl bg-graphite p-6 text-white">
        <p className="font-serif text-xl">Need help with this?</p>
        <p className="mt-1 text-sm text-white/70">Talk to a TaxTrax specialist about your situation.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/book-consultation" className="rounded-full bg-signal px-6 py-3 text-sm font-medium hover:bg-ember focus-ring">Book a consultation</Link>
          <a href={waLink(`Hi TaxTrax, I read "${post.title}" and need help.`)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/30 px-6 py-3 text-sm hover:border-signal focus-ring">Ask on WhatsApp</a>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-10">
          <h2 className="font-serif text-xl text-paper">Keep reading</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {related.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="card-flat card-lift p-5 focus-ring">
                <p className="text-xs text-signal">{p.category}</p>
                <p className="mt-2 font-serif text-base text-paper">{p.title}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
