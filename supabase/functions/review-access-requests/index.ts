import { reviewAccessRequests } from "./core.mjs";
import { devReviewProvider } from "./provider.mjs";

Deno.serve((request: Request) => {
  const secret = Deno.env.get("ADMIN_ACCESS_REQUEST_SECRET");
  return reviewAccessRequests(request, secret === Deno.env.get("ACCESS_REQUEST_SUBMISSION_SECRET") ? undefined : secret,
    devReviewProvider(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")));
});
