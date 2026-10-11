import { withClient, jsonBody } from "@/lib/portal/guard";
import { setChecklistDone } from "@/lib/portal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body: { done: boolean }. Only self-service tasks can be changed by the client. */
export const PATCH = (request: Request, { params }: { params: { id: string } }) =>
  withClient(request, true, async (ctx) => { await setChecklistDone(ctx.db, params.id, (await jsonBody(request)).done); return ctx.json({}); });
