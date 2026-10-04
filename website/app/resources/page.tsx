import { pageMeta, SITE_URL } from "@/lib/seo";
import { getPublishedVideos, type VideoRow } from "@/lib/content";
import JsonLd from "@/components/JsonLd";

export const dynamic = "force-dynamic";
export const metadata = pageMeta({ title: "Tax Resources, Guides & Videos", description: "Free tax explainer videos and guides for individuals and businesses in Pakistan, the USA, the UK and the UAE.", path: "/resources" });

const thumb = (v: VideoRow) => (v.kind === "youtube" ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : `${SITE_URL}/opengraph-image`);

export default async function ResourcesPage() {
  const videos = await getPublishedVideos();
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-16">
      <span className="mb-4 block h-1 w-12 rounded-full bg-signal" aria-hidden />
      <h1 className="font-serif text-3xl text-paper sm:text-4xl">Videos &amp; Resources</h1>
      <p className="mt-3 max-w-xl text-sm text-smoke">Short explainers on filing, registration and compliance, updated regularly by our team.</p>

      {videos.length === 0 ? (
        <div className="card-flat mt-10 p-12 text-center">
          <p className="font-serif text-xl text-paper">Videos are coming soon</p>
          <p className="mt-2 text-sm text-smoke">Meanwhile, browse our written guides in Insights.</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
          <JsonLd data={videos.map((v) => ({
            "@context": "https://schema.org", "@type": "VideoObject", name: v.title, description: v.description || v.title,
            thumbnailUrl: thumb(v), uploadDate: String(v.createdAt),
            ...(v.kind === "youtube" ? { embedUrl: `https://www.youtube-nocookie.com/embed/${v.youtubeId}` } : { contentUrl: `${SITE_URL}/api/media/${v.file}` }),
          }))} />
          {videos.map((v) => (
            <div key={v.id} className="card-flat card-lift overflow-hidden">
              <div className="aspect-video w-full bg-night">
                {v.kind === "youtube" ? (
                  <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${v.youtubeId}`} title={v.title} loading="lazy" allowFullScreen />
                ) : (
                  <video className="h-full w-full" controls preload="metadata" src={`/api/media/${v.file}`} aria-label={v.title} />
                )}
              </div>
              <div className="p-5">
                <span className="rounded-full bg-signal/10 px-3 py-1 text-xs font-medium text-signal">{v.category}</span>
                <h2 className="mt-3 font-serif text-base text-paper">{v.title}</h2>
                {v.description && <p className="mt-1 text-sm text-smoke">{v.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
