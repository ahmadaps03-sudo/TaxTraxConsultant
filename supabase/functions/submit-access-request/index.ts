import { submitAccessRequest } from "./core.mjs";

const devUrl = "https://dbcakdqthnamgjfkkxzn.supabase.co";

Deno.serve(async (request: Request) => {
  return submitAccessRequest(request, { secret: Deno.env.get("ACCESS_REQUEST_SUBMISSION_SECRET") }, async (input) => {
    if (Deno.env.get("SUPABASE_URL") !== devUrl) throw new Error("Development target required.");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!key) throw new Error("Submission unavailable.");
    const result = await fetch(`${devUrl}/rest/v1/rpc/submit_client_access_request`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_name: input.name, p_email: input.email, p_phone: input.phone, p_company: input.company, p_contact_consent: input.contact_consent }),
    });
    if (!result.ok) throw new Error("Submission unavailable.");
  });
});
