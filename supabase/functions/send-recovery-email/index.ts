import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { emailConfiguration, sendRecoveryEmail } from "./core.mjs";

Deno.serve(async (request: Request) => {
  try {
    return await sendRecoveryEmail(request, emailConfiguration(name => Deno.env.get(name)), Webhook);
  } catch {
    return new Response('{"error":{"http_code":503,"message":"Recovery email unavailable."}}', { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
});
