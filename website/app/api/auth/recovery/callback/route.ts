import { recoveryCallback } from "@/lib/auth/recovery";
import { rejectAuthMethod } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = recoveryCallback;
export const HEAD = rejectAuthMethod;
