import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { emailConfiguration, sendRecoveryEmail, sendWelcomeEmail } from "./core.mjs";

Deno.serve(async (request: Request) => {
  try {
    const config = emailConfiguration(name => Deno.env.get(name));
    return request.headers.get("x-taxtrax-email-action") === "welcome"
      ? await sendWelcomeEmail(request, config)
      : await sendRecoveryEmail(request, config, Webhook);
  } catch {
    return new Response('{"error":{"http_code":503,"message":"Recovery email unavailable."}}', { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
});
