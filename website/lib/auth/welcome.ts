import "server-only";
import { getSupabaseConfiguration } from "../supabase/config";

export async function sendCompletedWelcomeEmail(email: string) {
  try {
    const { url, key } = getSupabaseConfiguration();
    const secret = process.env.WELCOME_EMAIL_SECRET;
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret ?? "")) return false;
    const result = await fetch(`${url}/functions/v1/send-recovery-email`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6000),
      headers: { "Content-Type": "application/json", "x-taxtrax-email-action": "welcome", apikey: key,
        Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ to_email: email }),
    });
    return result.ok;
  } catch { return false; }
}
