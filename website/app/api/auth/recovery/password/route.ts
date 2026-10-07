import { updateRecoveredPassword } from "@/lib/auth/recovery";
import { rejectAuthMethod } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const POST = updateRecoveredPassword;
export const GET = rejectAuthMethod;
export const HEAD = rejectAuthMethod;
export const OPTIONS = rejectAuthMethod;
export const PUT = rejectAuthMethod;
export const PATCH = rejectAuthMethod;
export const DELETE = rejectAuthMethod;
