import { listPublishedSiteContent, signSiteVideoPlayback } from "@/lib/site-persistence/client";
import { getSupabaseConfiguration } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
const FILE = /^[a-f0-9-]{36}\.(mp4|webm|mov)$/;
const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, { params }: { params: { file: string } }) {
  const file = params.file;
  if (!FILE.test(file)) return new Response("Not found", { status: 404, headers: HEADERS });
  try {
    const published = (await listPublishedSiteContent("videos"))
      .some((video) => video.published === true && video.kind === "file" && video.file === file);
    if (!published) return new Response("Not found", { status: 404, headers: HEADERS });
    const signed = await signSiteVideoPlayback(file);
    const { url } = getSupabaseConfiguration();
    const target = new URL(signed.url);
    if (target.origin !== url || target.pathname !== `/storage/v1/object/sign/site-videos/${file}` || !target.searchParams.has("token")) throw new Error();
    return new Response(null, { status: 307, headers: { ...HEADERS, Location: target.toString() } });
  } catch { return new Response("Media is temporarily unavailable", { status: 503, headers: HEADERS }); }
}
