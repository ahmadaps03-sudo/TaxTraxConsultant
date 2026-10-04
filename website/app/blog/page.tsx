import Link from "next/link";
import { getPublishedPosts } from "@/lib/content";
import { waLink } from "@/lib/contact";

export const dynamic = "force-dynamic";

export default async function BlogPage({ searchParams }: { searchParams: { category?: string } }) {
  const all = await getPublishedPosts();
  const categories = ["All", ...Array.from(new Set(all.map((p) => p.category)))];
  const active = categories.includes(searchParams.category ?? "") ? searchParams.category! : "All";
  const posts = active === "All" ? all : all.filter((p) => p.category === active);
  const [lead, ...rest] = posts;

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-16">
      <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">Insights &amp; Guides</h1>
      <p className="mt-3 max-w-xl text-sm text-smoke">Notes on FBR, SECP, US, UK and UAE tax practice, written by the team that files them.</p>

      <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
        {categories.map((c) => (
          <Link key={c} href={c === "All" ? "/blog" : `/blog?category=${encodeURIComponent(c)}`} scroll={false}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors focus-ring ${active === c ? "bg-signal text-white" : "border border-line text-smoke hover:border-signal hover:text-paper"}`}>
            {c}
          </Link>
        ))}
      </nav>

      {!lead ? (
        <p className="card-flat mt-10 p-7 text-center text-sm text-smoke">No articles in this category yet.</p>
      ) : (
        <>
          <Link href={`/blog/${lead.slug}`} className="card-flat card-lift group mt-10 grid overflow-hidden focus-ring md:grid-cols-5">
            <div className="relative flex min-h-[12rem] items-end bg-graphite p-6 md:col-span-2">
              <div className="bg-dots-light absolute inset-0" aria-hidden />
              <span className="relative rounded-full bg-signal px-3 py-1 text-xs font-medium text-white">{lead.category}</span>
            </div>
            <div className="p-6 md:col-span-3">
              <p className="text-xs text-smoke"><time dateTime={lead.date}>{new Date(lead.date).toLocaleDateString("en-US", { dateStyle: "long" })}</time> · By {lead.author}</p>
              <h2 className="mt-3 font-serif text-2xl text-paper transition-colors group-hover:text-signal">{lead.title}</h2>
              <p className="mt-3 text-sm text-smoke">{lead.excerpt}</p>
              <span className="mt-5 inline-block text-sm font-medium text-signal">Read article →</span>
            </div>
          </Link>
          <div className="mt-7 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="card-flat card-lift group flex flex-col overflow-hidden focus-ring">
                <div className="relative h-28 bg-gradient-to-br from-graphite to-charcoal"><div className="bg-dots absolute inset-0" aria-hidden /><span className="absolute bottom-3 left-5 rounded-full bg-signal px-3 py-1 text-xs font-medium text-white">{p.category}</span></div>
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="font-serif text-lg text-paper transition-colors group-hover:text-signal">{p.title}</h2>
                  <p className="mt-2 flex-1 text-sm text-smoke">{p.excerpt}</p>
                  <p className="mt-4 text-xs text-smoke"><time dateTime={p.date}>{new Date(p.date).toLocaleDateString("en-US", { dateStyle: "medium" })}</time> · {p.author}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-graphite p-6 text-white">
        <p className="font-serif text-xl">Have a question about your own situation?</p>
        <a href={waLink("Hi TaxTrax, I read your blog and have a question.")} target="_blank" rel="noopener noreferrer" className="rounded-full bg-signal px-6 py-3 text-sm font-medium hover:bg-ember focus-ring">Ask on WhatsApp</a>
      </div>
    </div>
  );
}
