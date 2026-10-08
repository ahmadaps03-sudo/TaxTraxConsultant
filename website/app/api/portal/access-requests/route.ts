import { requestPortalAccess } from "@/lib/access-requests/handler";
import { rejectAuthMethod } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = requestPortalAccess;
export const GET = rejectAuthMethod;
export const HEAD = rejectAuthMethod;
export const OPTIONS = rejectAuthMethod;
export const PUT = rejectAuthMethod;
export const PATCH = rejectAuthMethod;
export const DELETE = rejectAuthMethod;
