import { headers } from "next/headers";
import { ActivationForm } from "@/components/portal/ActivationForm";
import { authorizeActivation } from "@/lib/auth/activation";
import { createRequestSupabaseClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default async function ActivationPage({ searchParams }: { searchParams?: { invalid?: string } }) {
  let mode: "verify" | "password" = "verify";
  try {
    const result = await authorizeActivation(createRequestSupabaseClient(headers().get("cookie"), undefined, process.env, undefined, "activation"));
    if (result.status === "authorized") mode = "password";
  } catch {}
  return <ActivationForm mode={mode} invalid={searchParams?.invalid === "1"} />;
}
