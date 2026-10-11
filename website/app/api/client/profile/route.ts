import { withClient, jsonBody } from "@/lib/portal/guard";
import { saveProfile } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = (request: Request) => withClient(request, true, async (ctx) => ctx.json(await saveProfile(ctx.db, await jsonBody(request))));
