const devUrl = "https://dbcakdqthnamgjfkkxzn.supabase.co";
const redirect = "http://localhost:3000/api/auth/activation/callback";

export function devReviewProvider(url, key, transport = fetch) {
  const call = async (route, body) => {
    if (url !== devUrl || !key) throw new Error("Development review unavailable.");
    return transport(`${devUrl}${route}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  };
  return {
    async rpc(action, id, operation, userId) {
      const compatible = ["list_all", "set_approved", "suspend"].includes(action);
      const route = action === "reject_pending" ? "admin_client_reject_pending" : compatible ? "admin_client_account" : "admin_client_access_request";
      const result = await call(`/rest/v1/rpc/${route}`, { p_action: action, p_id: id ?? null, p_operation: operation ?? null, p_user_id: userId ?? null });
      if (!result.ok) throw new Error("Review unavailable.");
      return result.json();
    },
    async createUser(fields) {
      const result = await call("/auth/v1/admin/users", fields);
      if (!result.ok) throw new Error("Provisioning unavailable.");
      const body = await result.json();
      return body.user ?? body;
    },
    async invite(email) {
      try {
        const result = await call(`/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`, { email });
        if (!result.ok) return { outcome: "failed" };
        const body = await result.json();
        return { outcome: "sent", userId: (body.user ?? body).id };
      } catch { return { outcome: "unknown" }; }
    },
  };
}
