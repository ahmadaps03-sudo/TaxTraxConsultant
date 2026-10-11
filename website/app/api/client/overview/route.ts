import { withClient } from "@/lib/portal/guard";
import { getOverview } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the portal tabs need, in one call. */
export const GET = (request: Request) => withClient(request, false, async (ctx) => ctx.json(await getOverview(ctx.db, ctx.user)));
