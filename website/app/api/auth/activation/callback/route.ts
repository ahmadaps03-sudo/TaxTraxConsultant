import { activationCallback } from "@/lib/auth/activation";
import { rejectAuthMethod } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = activationCallback;
export const HEAD = rejectAuthMethod;
