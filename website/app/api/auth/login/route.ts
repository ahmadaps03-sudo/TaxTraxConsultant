import { login, rejectAuthMethod } from "@/lib/auth/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = login;
export const GET = rejectAuthMethod;
export const HEAD = rejectAuthMethod;
export const PUT = rejectAuthMethod;
export const PATCH = rejectAuthMethod;
export const DELETE = rejectAuthMethod;
export const OPTIONS = rejectAuthMethod;
