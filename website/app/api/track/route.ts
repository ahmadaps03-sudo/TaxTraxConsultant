import { recordView } from "@/lib/analytics";
import { readJson, sameOrigin, clientIp } from "@/lib/http";
import { takeSiteRateLimit } from "@/lib/site-persistence/client";

export const dynamic = "force-dynamic";

/** Page-view beacon. Always answers 204 so tracking can never break or slow a page. */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req) || !(await takeSiteRateLimit(`track:${clientIp(req)}`, 120, 60)).ok) return new Response(null, { status: 204 });
    const b = await readJson(req, 2000);
    if (b) await recordView(req, { path: b.path, ref: b.ref });
  } catch { /* analytics must never throw */ }
  return new Response(null, { status: 204 });
}
