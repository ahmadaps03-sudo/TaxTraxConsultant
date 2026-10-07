import { headers } from "next/headers";
import { RecoveryForm } from "@/components/portal/RecoveryForm";
import { authorizePortalClient } from "@/lib/auth/authorize";
import { createRequestSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: { invalid?: string } }) {
  let mode: "verify" | "password" = "verify";
  try {
    const result = await authorizePortalClient(createRequestSupabaseClient(headers().get("cookie"), undefined, process.env, undefined, "recovery"));
    if (result.status === "authorized") mode = "password";
  } catch {}
  return <RecoveryForm mode={mode} invalid={searchParams?.invalid === "1"} />;
}
