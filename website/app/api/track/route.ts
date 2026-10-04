import { recordView } from "@/lib/analytics";
import { readJson, sameOrigin, clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/auth/ratelimit";

export const dynamic = "force-dynamic";

/** Page-view beacon. Always answers 204 so tracking can never break or slow a page. */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req) || !rateLimit(`track:${clientIp(req)}`, 120, 60).ok) return new Response(null, { status: 204 });
    const b = await readJson(req, 2000);
    if (b) recordView(req, { path: b.path, ref: b.ref });
  } catch { /* analytics must never throw */ }
  return new Response(null, { status: 204 });
}
